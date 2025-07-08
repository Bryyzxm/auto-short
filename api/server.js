// Simple Express backend for YouTube video download & segment cut
import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import { v4 as uuidv4 } from "uuid";
// Helper function to run yt-dlp and return a Promise
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(
      YT_DLP_PATH,
      args,
      { timeout: 300000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`yt-dlp error: ${error.message}`);
          console.error(`yt-dlp stderr: ${stderr}`);
          return reject(error);
        }
        resolve(stdout);
      }
    );
  });
}
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

// Helper: run whisper.cpp on an audio file and return segments [{start,end,text}]
function runWhisperCpp(audioPath) {
  return new Promise((resolve, reject) => {
    const jsonOut = `${audioPath}.json`;
    execFile(
      "/app/whisper.cpp/main",
      [
        "-m",
        "/app/models/ggml-tiny.bin",
        "-f",
        audioPath,
        "-of",
        jsonOut,
        "-oj",
      ],
      { timeout: 300000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error("whisper.cpp error", err.message);
          return reject(err);
        }
        try {
          const raw = fs.readFileSync(jsonOut, "utf-8");
          fs.unlinkSync(jsonOut);
          const obj = JSON.parse(raw);
          if (!obj.segments || !Array.isArray(obj.segments)) return resolve([]);
          const segments = obj.segments.map((s) => ({
            start: secondsToHMS(s.start),
            end: secondsToHMS(s.end),
            text: s.text.trim(),
          }));
          resolve(segments);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// Helper: convert seconds(float) to HH:MM:SS.mmm string
function secondsToHMS(sec) {
  const h = Math.floor(sec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${s}`;
}

// Fetch subtitles via official TimedText API (XML or VTT). Returns [] if none.
async function fetchTimedTextSegments(videoId, langOrder = ["id", "en"]) {
  try {
    let tracks = [];
    try {
      const listRes = await fetch(
        `https://video.google.com/timedtext?type=list&v=${videoId}`
      );
      if (listRes.ok) {
        const listXml = await listRes.text();
        const trackRegex = /<track\s+([^>]+)\/>/g;
        let m;
        while ((m = trackRegex.exec(listXml)) !== null) {
          const attrStr = m[1];
          const attrs = {};
          attrStr.replace(/(\w+)="([^"]*)"/g, (_, k, v) => {
            attrs[k] = v;
          });
          tracks.push(attrs);
        }
      }
    } catch {}

    // If no tracks detected, create pseudo-tracks from langOrder so we still attempt direct fetch
    if (tracks.length === 0) {
      tracks = langOrder.map((l) => ({ lang_code: l, kind: "asr" }));
    }

    const orderedTracks = langOrder
      .flatMap((lang) => tracks.filter((t) => t.lang_code?.startsWith(lang)))
      .concat(tracks);

    for (const t of orderedTracks) {
      const lang = t.lang_code;
      const isAsr = t.kind === undefined || t.kind === "asr";
      const name = t.name ? `&name=${encodeURIComponent(t.name)}` : "";

      // Build candidate URL list: prefer asr VTT, then manual VTT, then XML
      const urlVariants = [];
      if (isAsr)
        urlVariants.push(
          `https://video.google.com/timedtext?lang=${lang}&v=${videoId}&kind=asr${name}&fmt=vtt`
        );
      urlVariants.push(
        `https://video.google.com/timedtext?lang=${lang}&v=${videoId}${
          isAsr ? "&kind=asr" : ""
        }${name}&fmt=vtt`
      );
      if (isAsr)
        urlVariants.push(
          `https://video.google.com/timedtext?lang=${lang}&v=${videoId}&kind=asr${name}`
        );
      urlVariants.push(
        `https://video.google.com/timedtext?lang=${lang}&v=${videoId}${
          isAsr ? "&kind=asr" : ""
        }${name}`
      );

      for (const captionUrl of urlVariants) {
        try {
          const res = await fetch(captionUrl);
          if (!res.ok) continue;

          const bodyText = await res.text();
          if (!bodyText || bodyText.trim().length === 0) continue;

          // If VTT (contains "-->") parse with regex method
          if (bodyText.includes("-->")) {
            const cleaned = bodyText
              .replace(/WEBVTT[^\n]*\n/gi, "")
              .replace(/NOTE[^\n]*\n/gi, "")
              .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
              .replace(/<c>|<\/c>/g, "")
              .replace(/align:[^\n]+/g, "")
              .replace(/position:[^\n]+/g, "")
              .replace(/\n{2,}/g, "\n");

            const regex =
              /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]*?)(?=\n\d|$)/g;
            const segments = [];
            let match;
            while ((match = regex.exec(cleaned)) !== null) {
              const text = match[3]
                .replace(/\n/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (text) segments.push({ start: match[1], end: match[2], text });
            }
            if (segments.length) return segments;
          } else if (bodyText.includes("<text")) {
            // XML
            const textRegex =
              /<text start="([0-9.]+)" dur="([0-9.]+)">([\s\S]*?)<\/text>/g;
            const segments = [];
            let mm;
            while ((mm = textRegex.exec(bodyText)) !== null) {
              const startSec = parseFloat(mm[1]);
              const dur = parseFloat(mm[2]);
              const endSec = startSec + dur;
              const text = mm[3]
                .replace(/&amp;/g, "&")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/\s+/g, " ")
                .trim();
              if (text)
                segments.push({
                  start: secondsToHMS(startSec),
                  end: secondsToHMS(endSec),
                  text,
                });
            }
            if (segments.length) return segments;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("TimedText fetch failed", err.message);
  }
  return [];
}

console.log("🚀 Starting server initialization...");
console.log("📁 Current working directory:", process.cwd());
console.log("🌍 Environment variables:");
console.log("  - NODE_ENV:", process.env.NODE_ENV);
console.log("  - PORT:", process.env.PORT);
console.log(
  "  - GEMINI_API_KEY:",
  process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Missing"
);

try {
  console.log("📦 Loading dependencies...");
  console.log("✅ All dependencies loaded successfully");
} catch (error) {
  console.error("❌ Failed to load dependencies:", error);
  process.exit(1);
}

// Deteksi path binary berdasarkan environment
const isProduction = process.env.NODE_ENV === "production";
const YT_DLP_PATH = isProduction ? "yt-dlp" : "/usr/local/bin/yt-dlp";
const FFMPEG_PATH = isProduction ? "ffmpeg" : "/usr/local/bin/ffmpeg";

// Polyfill __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

console.log("🔧 Setting up Express app...");
console.log("📂 Checking file structure...");
try {
  console.log("  - Files in current directory:", fs.readdirSync("."));
  if (fs.existsSync("./api")) {
    console.log("  - Files in api directory:", fs.readdirSync("./api"));
  }
  if (fs.existsSync("./outputs")) {
    console.log("  - Outputs directory exists: ✅");
  } else {
    console.log("  - Creating outputs directory...");
    fs.mkdirSync("./outputs", { recursive: true });
  }
} catch (err) {
  console.error("❌ File system check failed:", err);
}

// Middleware is configured FIRST to apply to all subsequent routes.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
app.use(cors());
app.use(express.json());

// Health check endpoint for deployment platforms like Railway.
app.get("/", (req, res) => {
  res
    .status(200)
    .json({ status: "ok", message: "Backend is healthy and running." });
});

import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error(
    "Gemini API Key is not configured. Please set the GEMINI_API_KEY environment variable."
  );
}
const ai = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const generatePrompt = (videoUrlHint, transcript) => {
  const videoContext = videoUrlHint
    ? `Video ini berasal dari URL berikut (gunakan untuk konteks topik secara umum jika memungkinkan): ${videoUrlHint}`
    : "Video ini bertopik umum yang populer seperti vlog, tutorial, atau ulasan produk.";

  let transcriptContext = "";
  if (transcript && transcript.length > 100) {
    transcriptContext = `\n\nBerikut adalah transkrip otomatis video (gunakan untuk memahami isi dan membagi segmen):\n"""${transcript.slice(
      0,
      12000
    )}${transcript.length > 12000 ? "... (transkrip dipotong)" : ""}"""\n`;
  }

  // IMPORTANT: Switched to single quotes and string concatenation to avoid nested backtick errors.
  const promptBody =
    "Anda adalah asisten AI yang sangat ahli dalam membagi video YouTube berdurasi panjang menjadi segmen/klip pendek yang PALING MENARIK, VIRAL, atau PUNCAK EMOSI, dengan kualitas highlight terbaik.\n" +
    `${videoContext}\n` +
    `${transcriptContext}\n\n` +
    "INSTRUKSI PENTING:\n" +
    "- Bagi video menjadi SEBANYAK MUNGKIN segmen menarik, dengan durasi SETIAP SEGMEN antara 30 hingga 120 detik (2 menit).\n" +
    "- Untuk video berdurasi lebih dari 10 menit, USAHAKAN membagi menjadi minimal 10 segmen.\n" +
    "- Pilih dan bagi video menjadi highlight yang PALING MENARIK, dramatis, lucu, informatif, atau viral, utamakan momen yang benar-benar menonjol dan berpotensi viral.\n" +
    "  BUAT variasi durasi segmen! Jangan semua segmen berdurasi 30 detik. Usahakan ada segmen berdurasi 60–120 detik jika memungkinkan.\n" +
    "- Jangan buat segmen terlalu pendek (<30 detik) atau terlalu panjang (>120 detik).\n" +
    "- Jika highlight cukup panjang, bagi menjadi beberapa segmen yang tetap menarik dan tidak tumpang tindih berlebihan.\n" +
    "- Jika highlight panjang, bagi menjadi beberapa segmen yang tetap menarik dan tidak tumpang tindih berlebihan.\n" +
    "- Hindari bagian intro, outro, atau bagian yang tidak penting.\n" +
    "- Segmen boleh sedikit overlap jika memang momen menarik berdekatan, tapi jangan duplikat.\n" +
    "- Gaya bahasa santai, tidak perlu emoji/hashtag/call-to-action.\n" +
    "- Output HARUS dalam bahasa Indonesia.\n" +
    "- Judul dan deskripsi HARUS relevan dengan isi segmen pada transkrip.\n" +
    "- Pastikan setiap segmen unik, tidak tumpang tindih berlebihan, dan benar-benar menarik.\n\n" +
    "Contoh variasi durasi output:\n" +
    "\n" +
    '  {"title": "Momen Lucu Banget", "description": "Bagian paling lucu dari video.", "startTimeString": "0m35s", "endTimeString": "1m10s"}\n' +
    '  {"title": "Puncak Emosi", "description": "Bagian paling dramatis.", "startTimeString": "2m00s", "endTimeString": "3m55s"}\n' +
    '  {"title": "Fakta Mengejutkan", "description": "Fakta menarik yang diungkap.", "startTimeString": "4m10s", "endTimeString": "5m30s"}\n' +
    "\n\n" +
    "Untuk setiap segmen, berikan detail berikut (semua dalam bahasa Indonesia!):\n" +
    "1. `title`: Judul singkat dan menarik (maksimal 10 kata, HARUS sesuai isi segmen pada transkrip).\n" +
    "2. `description`: Deskripsi singkat (1-2 kalimat) yang menjelaskan mengapa segmen ini menarik.\n" +
    '3. `startTimeString`: Waktu mulai segmen (misal: "0m35s", "1m20s", "12s").\n' +
    '4. `endTimeString`: Waktu selesai segmen (misal: "1m5s", "2m45s", "1m30s").\n\n' +
    "Kembalikan HASIL AKHIR HANYA berupa array JSON valid, TANPA penjelasan, catatan, atau teks lain di luar array JSON.\n\n" +
    "Format output yang DIHARUSKAN:\n" +
    "\n" +
    "  {\n" +
    '    "title": "string",\n' +
    '    "description": "string",\n' +
    '    "startTimeString": "string",\n' +
    '    "endTimeString": "string"\n' +
    "  }\n" +
    "\n\n" +
    "Bagi video ini menjadi highlight paling menarik dan konsisten sesuai instruksi di atas.\n";

  return promptBody;
};

app.post("/api/generate-segments", async (req, res) => {
  if (!ai) {
    return res.status(500).json({
      error: "Gemini API client is not initialized. API_KEY might be missing.",
    });
  }

  const { videoUrl, transcript } = req.body;
  const prompt = generatePrompt(videoUrl, transcript);

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract only the first valid JSON array substring
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    let jsonStrToParse = text;
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      jsonStrToParse = text.substring(firstBracket, lastBracket + 1);
    } else {
      throw new Error(
        "Tidak ditemukan array JSON di respons AI. Cek output Gemini."
      );
    }

    let suggestions;
    try {
      suggestions = JSON.parse(jsonStrToParse);
    } catch (parseError) {
      console.error(
        "Failed to parse JSON response from Gemini. Original full text:",
        text,
        "Attempted to parse this substring:",
        jsonStrToParse,
        "Parse error:",
        parseError
      );
      throw new Error(
        "AI response was not valid JSON. The content might be incomplete or malformed. Please check the console for more details on the problematic response."
      );
    }

    res.json(suggestions);
  } catch (error) {
    console.error("Error calling Gemini API or processing response:", error);
    if (error.message) {
      if (error.message.toLowerCase().includes("api key not valid")) {
        return res.status(401).json({
          error:
            "Invalid Gemini API Key. Please check your configuration and ensure it's correctly set.",
        });
      }
      if (error.message.toLowerCase().includes("quota")) {
        return res.status(429).json({
          error:
            "API quota exceeded. Please check your Gemini API usage and limits.",
        });
      }
      // Forward Gemini 503 / model overloaded to client so front-end can show proper message
      if (
        error.status === 503 ||
        (typeof error.code === "number" && error.code === 503) ||
        (error.message && error.message.toLowerCase().includes("overload")) ||
        (error.message && error.message.includes("503"))
      ) {
        return res.status(503).json({
          error:
            "Service Unavailable: Gemini model sedang sibuk/overloaded. Silakan coba lagi nanti.",
        });
      }
      // Re-throw specific parsing errors with more context if they weren't caught above
      if (error.message.includes("AI response was not valid JSON")) {
        return res.status(500).json({ error: error.message });
      }
    }
    res.status(500).json({
      error: `Failed to get suggestions from AI: ${
        error.message || "Unknown error occurred"
      }`,
    });
  }
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json());

// Serve static files from the 'outputs' directory with CORS headers
app.use(
  "/outputs",
  cors(),
  express.static(path.join(process.cwd(), "outputs"))
);

// Serve static files from the 'outputs' directory with CORS headers
app.use(
  "/outputs",
  cors(),
  express.static(path.join(process.cwd(), "outputs"))
);

// Fallback: tambahkan header CORS manual untuk semua response
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Fungsi untuk menghapus duplikasi frasa antar segmen subtitle
function cleanSegments(segments) {
  const seen = new Set();
  return segments.filter((seg) => {
    const norm = seg.text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/gi, "")
      .replace(/\s+/g, " ");
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

// Endpoint: POST /api/shorts
app.post("/api/shorts", async (req, res) => {
  const { youtubeUrl, start, end, aspectRatio } = req.body;
  if (!youtubeUrl || typeof start !== "number" || typeof end !== "number") {
    return res
      .status(400)
      .json({ error: "youtubeUrl, start, end (in seconds) required" });
  }
  const id = uuidv4();
  const tempFile = path.join(process.cwd(), `${id}.mp4`);

  // Logging waktu
  console.log(
    `[${id}] Mulai proses download dan cut segmen: ${youtubeUrl} (${start}s - ${end}s, rasio: ${aspectRatio})`
  );
  console.time(`[${id}] yt-dlp download`);

  try {
    await runYtDlp([
      youtubeUrl,
      "-f",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
      "-o",
      tempFile,
    ]);
    console.timeEnd(`[${id}] yt-dlp download`);

    // After download, cut segment
    const cutFile = path.join(process.cwd(), `${id}-short.mp4`);
    let ffmpegArgs;
    if (aspectRatio === "original") {
      ffmpegArgs = [
        "-y",
        "-ss",
        String(start),
        "-to",
        String(end),
        "-i",
        tempFile,
        "-c",
        "copy",
        cutFile,
      ];
    } else {
      ffmpegArgs = [
        "-y",
        "-ss",
        String(start),
        "-to",
        String(end),
        "-i",
        tempFile,
        "-vf",
        "crop=in_h*9/16:in_h",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-preset",
        "fast",
        cutFile,
      ];
    }
    console.time(`[${id}] ffmpeg cut`);
    execFile(FFMPEG_PATH, ffmpegArgs, { timeout: 180000 }, (err2) => {
      console.timeEnd(`[${id}] ffmpeg cut`);
      fs.unlink(tempFile, () => {});
      if (err2) {
        console.error("FFmpeg error:", err2.message);
        return res
          .status(500)
          .json({ error: "ffmpeg failed", details: err2.message });
      }
      console.log(
        `[${id}] Selesai proses. Download: /outputs/${path.basename(cutFile)}`
      );
      res.json({ downloadUrl: `/outputs/${path.basename(cutFile)}` });
    });
  } catch (err) {
    console.timeEnd(`[${id}] yt-dlp download`);
    console.error("yt-dlp failed", err);
    return res
      .status(500)
      .json({ error: "yt-dlp failed", details: err.message });
  }
});

// Proxy endpoint for transcript (to avoid CORS)
app.get("/api/transcript", async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: "videoId required" });
  try {
    const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) {
      return res
        .status(apiRes.status)
        .json({ error: "Failed to fetch transcript", status: apiRes.status });
    }
    const data = await apiRes.json();
    res.json(data);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Proxy transcript error", details: err.message });
  }
});

// Simple in-memory cache to avoid repeated fetches during container lifetime
const transcriptCache = new Map();

// Endpoint: GET /api/yt-transcript?videoId=...
app.get("/api/yt-transcript", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { videoId, lang } = req.query;
  if (!videoId) return res.status(400).json({ error: "videoId required" });

  // Serve from cache if available
  if (transcriptCache.has(videoId)) {
    return res.json(transcriptCache.get(videoId));
  }

  const id = uuidv4();
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const subLang = lang ? String(lang) : "id,en";

  // 0️⃣ Try official TimedText API first
  const timedSegs = await fetchTimedTextSegments(videoId, subLang.split(","));
  if (timedSegs.length) {
    const payload = { segments: timedSegs };
    transcriptCache.set(videoId, payload);
    return res.json(payload);
  }

  try {
    // 1️⃣ Try LemnosLife API first (no quota, usually works)
    try {
      const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
      const apiRes = await fetch(apiUrl);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data?.transcript?.segments?.length) {
          const segments = data.transcript.segments.map((seg) => ({
            start: new Date(seg.startMs)
              .toISOString()
              .substr(11, 12)
              .replace("Z", ""),
            end: new Date(seg.startMs + seg.durationMs)
              .toISOString()
              .substr(11, 12)
              .replace("Z", ""),
            text: seg.text,
          }));
          const payload = { segments };
          transcriptCache.set(videoId, payload);
          return res.json(payload);
        }
      }
    } catch (lemErr) {
      console.warn("LemnosLife transcript fetch failed", lemErr.message);
    }

    // 2️⃣ Fallback to yt-dlp if LemnosLife didn't return segments
    await runYtDlp([
      ytUrl,
      "--write-auto-subs",
      "--sub-lang",
      subLang,
      "--skip-download",
      "-o",
      path.join(process.cwd(), `${id}`),
    ]);

    // Cari file .id.vtt (Indonesia) lebih dulu, jika tidak ada baru cari .en.vtt
    let vttFile = null;
    const files = fs.readdirSync(process.cwd());
    for (const file of files) {
      if (file.startsWith(id) && file.endsWith(".id.vtt")) {
        vttFile = path.join(process.cwd(), file);
        break;
      }
    }
    if (!vttFile) {
      for (const file of files) {
        if (file.startsWith(id) && file.endsWith(".en.vtt")) {
          vttFile = path.join(process.cwd(), file);
          break;
        }
      }
    }
    if (!vttFile) {
      console.warn("No VTT found – attempting local Whisper fallback...");

      try {
        const audioPath = path.join(process.cwd(), `${id}.m4a`);
        await runYtDlp([
          ytUrl,
          "-f",
          "bestaudio[ext=m4a]/bestaudio",
          "--max-filesize",
          "20M",
          "-o",
          audioPath,
        ]);

        const whisperSegs = await runWhisperCpp(audioPath);
        try {
          fs.unlinkSync(audioPath);
        } catch {}

        if (whisperSegs.length) {
          const payload = { segments: whisperSegs };
          transcriptCache.set(videoId, payload);
          return res.json(payload);
        }
      } catch (e) {
        console.error("Whisper fallback failed", e.message);
      }

      const emptyPayload = { segments: [] };
      transcriptCache.set(videoId, emptyPayload);
      return res.status(200).json(emptyPayload);
    }
    // Baca dan parse VTT
    let vttContent = fs.readFileSync(vttFile, "utf-8");
    fs.unlinkSync(vttFile);
    vttContent = vttContent
      .replace(/align:[^\n]+/g, "")
      .replace(/position:[^\n]+/g, "")
      .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
      .replace(/<c>|<\/c>/g, "")
      .replace(/WEBVTT[^\n]*\n/g, "")
      .replace(/NOTE[^\n]*\n/g, "")
      .replace(/\n{2,}/g, "\n");
    const segments = [];
    const regex = /([0-9:.]+) --> ([0-9:.]+)\s+([\s\S]*?)(?=\n\d|$)/g;
    let match;
    while ((match = regex.exec(vttContent)) !== null) {
      const cleanText = match[3]
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleanText) {
        segments.push({
          start: match[1],
          end: match[2],
          text: cleanText,
        });
      }
    }
    const payload = { segments };
    transcriptCache.set(videoId, payload);
    return res.json(payload);
  } catch (err) {
    console.warn(
      "yt-dlp subtitle fetch failed, falling back to Lemnoslife API",
      err.message
    );
    const emptyPayload = { segments: [] };
    transcriptCache.set(videoId, emptyPayload);
    return res.status(200).json(emptyPayload);
  }
});

// Endpoint baru: Mendapatkan durasi video dari file .vtt
app.get("/api/video-meta", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const id = req.query.videoId;
  if (!id) return res.status(400).json({ error: "videoId is required" });
  // Cari file .id.vtt atau .en.vtt
  let vttFile = null;
  const files = fs.readdirSync(process.cwd());
  for (const file of files) {
    if (
      file.startsWith(id) &&
      (file.endsWith(".id.vtt") || file.endsWith(".en.vtt"))
    ) {
      vttFile = path.join(process.cwd(), file);
      break;
    }
  }
  if (!vttFile) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res
      .status(404)
      .json({ error: "Subtitle file not found for this videoId" });
  }
  try {
    const vttContent = fs.readFileSync(vttFile, "utf-8");
    // Cari timestamp terakhir di file VTT
    const matches = [
      ...vttContent.matchAll(
        /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g
      ),
    ];
    if (matches.length === 0)
      return res.status(400).json({ error: "No segments found in VTT" });
    const last = matches[matches.length - 1][2]; // ambil end time segmen terakhir
    // Konversi ke detik
    const [h, m, s] = last.split(":");
    const duration = Math.round(
      parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)
    );
    res.json({ duration });
  } catch (e) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: "Failed to read VTT", details: e.message });
  }
});

// Handler 404 (Not Found) - harus di bawah semua route
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(404).json({ error: "Not found" });
});

// Handler error global - harus di bawah semua route dan handler 404
app.use((err, req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

// Error handling untuk process
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
  console.error("Stack trace:", err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise);
  console.error("Reason:", reason);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("🎉 Server successfully started!");
  console.log(`🌐 Backend server running on http://0.0.0.0:${PORT}`);
  console.log("🔗 Health check: http://0.0.0.0:" + PORT + "/");
});

server.on("error", (error) => {
  console.error("❌ Server failed to start:", error);
  process.exit(1);
});

console.log("✅ Server.js loaded completely");
