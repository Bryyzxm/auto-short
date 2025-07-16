// Simple Express backend for YouTube video download & segment cut
import express from 'express';
import cors from 'cors';
import {execFile} from 'child_process';
import {v4 as uuidv4} from 'uuid';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

// Polyfill __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path ke yt-dlp executable
const YT_DLP_PATH = path.join(__dirname, 'yt-dlp.exe');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Endpoint: POST /api/shorts
// Body: { youtubeUrl, start, end }
app.post('/api/shorts', async (req, res) => {
 const {youtubeUrl, start, end, aspectRatio} = req.body;
 if (!youtubeUrl || typeof start !== 'number' || typeof end !== 'number') {
  return res.status(400).json({error: 'youtubeUrl, start, end (in seconds) required'});
 }
 const id = uuidv4();
 const tempFile = path.join(process.cwd(), `${id}.mp4`);

 // Logging waktu
 console.log(`[${id}] Mulai proses download dan cut segmen: ${youtubeUrl} (${start}s - ${end}s, rasio: ${aspectRatio})`);
 console.time(`[${id}] yt-dlp download`);

 // Compose yt-dlp command (download full video)
 const ytDlpArgs = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '-o', tempFile, youtubeUrl];

 execFile(YT_DLP_PATH, ytDlpArgs, (err) => {
  console.timeEnd(`[${id}] yt-dlp download`);
  if (err) {
   return res.status(500).json({error: 'yt-dlp failed', details: err.message});
  }
  // After download, cut segment
  const cutFile = path.join(process.cwd(), `${id}-short.mp4`);
  let ffmpegArgs;
  if (aspectRatio === 'original') {
   ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile, '-c', 'copy', cutFile];
  } else {
   ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile, '-vf', 'crop=in_h*9/16:in_h', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', cutFile];
  }
  console.time(`[${id}] ffmpeg cut`);
  execFile('ffmpeg', ffmpegArgs, (err2) => {
   console.timeEnd(`[${id}] ffmpeg cut`);
   fs.unlink(tempFile, () => {});
   if (err2) {
    return res.status(500).json({error: 'ffmpeg failed', details: err2.message});
   }
   console.log(`[${id}] Selesai proses. Download: /outputs/${path.basename(cutFile)}`);
   res.json({downloadUrl: `/outputs/${path.basename(cutFile)}`});
  });
 });
});

// Proxy endpoint for transcript (to avoid CORS)
app.get('/api/transcript', async (req, res) => {
 const {videoId} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});
 try {
  const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
  const apiRes = await fetch(apiUrl);
  if (!apiRes.ok) {
   return res.status(apiRes.status).json({error: 'Failed to fetch transcript', status: apiRes.status});
  }
  const data = await apiRes.json();
  res.json(data);
 } catch (err) {
  res.status(500).json({error: 'Proxy transcript error', details: err.message});
 }
});

// Cache untuk menyimpan transkrip yang sudah diunduh
const transcriptCache = new Map();

// Helper function untuk membersihkan file VTT lama
function cleanupOldVttFiles() {
 try {
  const files = fs.readdirSync(process.cwd());
  const vttFiles = files.filter((file) => file.endsWith('.vtt'));
  vttFiles.forEach((file) => {
   try {
    fs.unlinkSync(path.join(process.cwd(), file));
    console.log(`Cleaned up old VTT file: ${file}`);
   } catch (e) {
    console.warn(`Failed to cleanup VTT file ${file}:`, e.message);
   }
  });
 } catch (e) {
  console.warn('Failed to cleanup old VTT files:', e.message);
 }
}

// Helper function untuk parse VTT content
function parseVttContent(vttContent) {
 console.log('[PARSE VTT] Starting to parse VTT content...');
 console.log(`[PARSE VTT] Original content length: ${vttContent.length}`);
 console.log(`[PARSE VTT] Content preview (first 1000 chars):\n${vttContent.substring(0, 1000)}`);

 // Bersihkan metadata WebVTT dan tag HTML
 let cleanContent = vttContent
  .replace(/WEBVTT[^\n]*\n/g, '')
  .replace(/NOTE[^\n]*\n/g, '')
  .replace(/Kind:[^\n]*\n/g, '')
  .replace(/Language:[^\n]*\n/g, '');

 console.log(`[PARSE VTT] Clean content length: ${cleanContent.length}`);
 console.log(`[PARSE VTT] Clean content preview (first 500 chars):\n${cleanContent.substring(0, 500)}`);

 // Parse VTT ke array segmen {start, end, text}
 const segments = [];
 // Gunakan set untuk mendeteksi teks identik
 const seenNormalizedTexts = new Set();
 // Helper Jaccard similarity untuk fuzzy duplikasi
 const jaccard = (a, b) => {
  const sa = new Set(a.split(' '));
  const sb = new Set(b.split(' '));
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / Math.max(sa.size, sb.size || 1);
 };
 // Helper konversi timestamp HH:MM:SS.mmm → detik
 const toSec = (ts) => {
  const [h, m, s] = ts.split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
 };

 // Split berdasarkan baris kosong untuk mendapatkan blok-blok subtitle
 const blocks = cleanContent.split(/\n\s*\n/).filter((block) => block.trim());
 console.log(`[PARSE VTT] Found ${blocks.length} blocks`);

 for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
  const block = blocks[blockIndex];
  const lines = block.trim().split('\n');
  console.log(`[PARSE VTT] Processing block ${blockIndex + 1}/${blocks.length} with ${lines.length} lines`);
  console.log(`[PARSE VTT] Block content: ${JSON.stringify(lines)}`);

  // Cari baris yang mengandung timestamp (format: 00:00:00.000 --> 00:00:00.000)
  let timestampLine = null;
  let timestampIndex = -1;

  for (let i = 0; i < lines.length; i++) {
   if (lines[i].includes(' --> ')) {
    timestampLine = lines[i];
    timestampIndex = i;
    console.log(`[PARSE VTT] Found timestamp line at index ${i}: ${timestampLine}`);
    break;
   }
  }

  if (timestampLine) {
   // Extract timestamp dari baris yang mungkin mengandung align/position
   const timestampMatch = timestampLine.match(/([0-9:.]+)\s+-->\s+([0-9:.]+)/);
   console.log(`[PARSE VTT] Timestamp match result:`, timestampMatch);

   if (timestampMatch) {
    // Ambil semua baris setelah timestamp sebagai teks
    const textLines = lines.slice(timestampIndex + 1);
    console.log(`[PARSE VTT] Text lines:`, textLines);

    // Gabungkan semua baris teks dan bersihkan tag HTML
    let text = textLines.join(' ');
    console.log(`[PARSE VTT] Raw text: ${text}`);

    // Hapus tag HTML timing seperti <00:00:00.320>
    text = text.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');

    // Hapus tag <c> dan </c>
    text = text.replace(/<\/?c[^>]*>/g, '');

    // Bersihkan spasi ekstra dan trim
    text = text.replace(/\s+/g, ' ').trim();
    console.log(`[PARSE VTT] Cleaned text: ${text}`);

    // Normalized text untuk dedup fuzzy
    const normalized = text.toLowerCase();

    // Skip jika mirip (≥85%) dengan salah satu 3 segmen terakhir
    let isDuplicate = false;
    for (let i = Math.max(0, segments.length - 3); i < segments.length; i++) {
     const prevNorm = segments[i].text.toLowerCase();
     if (jaccard(prevNorm, normalized) > 0.85) {
      isDuplicate = true;
      console.log(`[PARSE VTT] Skipping duplicate text: ${text}`);
      break;
     }
    }
    if (isDuplicate) continue;

    // Skip jika teks kosong atau hanya berisi spasi
    if (text && text.length > 0) {
     const segment = {
      start: timestampMatch[1],
      end: timestampMatch[2],
      text: text,
     };
     segments.push(segment);
     console.log(`[PARSE VTT] Added segment ${segments.length}: ${JSON.stringify(segment)}`);
    } else {
     console.log(`[PARSE VTT] Skipping empty text`);
    }
   } else {
    console.log(`[PARSE VTT] No timestamp match found for line: ${timestampLine}`);
   }
  } else {
   console.log(`[PARSE VTT] No timestamp line found in block ${blockIndex + 1}`);
  }
 }

 console.log(`[PARSE VTT] Parsed ${segments.length} segments`);
 if (segments.length > 0) {
  console.log(`[PARSE VTT] First segment: ${segments[0].start} --> ${segments[0].end}: "${segments[0].text}"`);
 } else {
  console.log(`[PARSE VTT] WARNING: No segments were parsed!`);
 }

 return segments;
}

// Endpoint: GET /api/yt-transcript?videoId=...
app.get('/api/yt-transcript', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT] Request for videoId: ${videoId}`);

 // Check cache first
 if (transcriptCache.has(videoId)) {
  console.log(`[TRANSCRIPT] Serving from cache for videoId: ${videoId}`);
  return res.json(transcriptCache.get(videoId));
 }

 // Cek apakah sudah ada file VTT untuk video ini
 const files = fs.readdirSync(process.cwd());
 let existingVttFile = null;

 // Cari file VTT yang sudah ada berdasarkan videoId (bukan UUID)
 for (const file of files) {
  if (file.includes(videoId) && file.endsWith('.vtt')) {
   existingVttFile = path.join(process.cwd(), file);
   console.log(`[TRANSCRIPT] Found existing VTT file: ${file}`);
   break;
  }
 }

 if (existingVttFile && fs.existsSync(existingVttFile)) {
  try {
   const vttContent = fs.readFileSync(existingVttFile, 'utf-8');
   const segments = parseVttContent(vttContent);

   // Deteksi bahasa dari nama file existing
   let detectedLanguage = 'unknown';
   const fileName = path.basename(existingVttFile);
   if (fileName.includes('.id.')) {
    detectedLanguage = 'Indonesian';
   } else if (fileName.includes('.en.')) {
    detectedLanguage = 'English';
   }

   const result = {
    segments,
    language: detectedLanguage,
    sourceFile: fileName,
   };
   transcriptCache.set(videoId, result);
   console.log(`[TRANSCRIPT] Served existing VTT for videoId: ${videoId}, language: ${detectedLanguage}`);
   return res.json(result);
  } catch (e) {
   console.warn(`[TRANSCRIPT] Failed to read existing VTT file: ${e.message}`);
  }
 }

 // Download new transcript
 const id = `${videoId}-${uuidv4().slice(0, 8)}`;
 const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
 const subLang = lang ? String(lang) : 'id,en';
 const ytDlpArgs = [
  '--write-auto-subs',
  '--write-subs',
  '--sub-lang',
  subLang, // Gunakan parameter lang yang sudah disiapkan
  '--skip-download',
  '--user-agent',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  '--extractor-args',
  'youtube:player_client=android',
  '-o',
  path.join(process.cwd(), `${id}`),
  ytUrl,
 ];

 console.log(`[TRANSCRIPT] Downloading new transcript for videoId: ${videoId}, preferred languages: ${subLang}`);

 execFile(YT_DLP_PATH, ytDlpArgs, async (err, stdout, stderr) => {
  if (err) {
   console.error(`[TRANSCRIPT] yt-dlp failed for videoId ${videoId}:`, err.message);
   console.error(`[TRANSCRIPT] stderr:`, stderr);
   console.error(`[TRANSCRIPT] stdout:`, stdout);
   console.error(`[TRANSCRIPT] yt-dlp path:`, YT_DLP_PATH);
   console.error(`[TRANSCRIPT] yt-dlp args:`, ytDlpArgs);
   return res.status(500).json({
    error: 'yt-dlp subtitle fetch failed',
    details: err.message,
    stderr: stderr,
    videoId: videoId,
   });
  }

  // Cari file subtitle dengan prioritas: .id.vtt (Indonesia) > .en.vtt (English) > auto-generated
  let vttFile = null;
  const newFiles = fs.readdirSync(process.cwd());

  // Prioritas 1: Manual Indonesian subtitles (.id.vtt)
  for (const file of newFiles) {
   if (file.startsWith(id) && file.endsWith('.id.vtt') && !file.includes('auto-generated')) {
    vttFile = path.join(process.cwd(), file);
    console.log(`[TRANSCRIPT] Using manual Indonesian subtitles: ${file}`);
    break;
   }
  }

  // Prioritas 2: Auto-generated Indonesian subtitles (.id.vtt)
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.id.vtt')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using auto-generated Indonesian subtitles: ${file}`);
     break;
    }
   }
  }

  // Prioritas 3: Manual English subtitles (.en.vtt)
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.en.vtt') && !file.includes('auto-generated')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using manual English subtitles: ${file}`);
     break;
    }
   }
  }

  // Prioritas 4: Auto-generated English subtitles (.en.vtt)
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.en.vtt')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using auto-generated English subtitles: ${file}`);
     break;
    }
   }
  }

  // Prioritas 5: Any other subtitle file
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.vtt')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using fallback subtitle file: ${file}`);
     break;
    }
   }
  }

  if (!vttFile) {
   console.error(
    `[TRANSCRIPT] No VTT file found for videoId: ${videoId}. Available files:`,
    newFiles.filter((f) => f.startsWith(id))
   );
   return res.status(404).json({
    error: 'Subtitle file not found. Video might not have subtitles in Indonesian or English.',
    videoId: videoId,
    availableFiles: newFiles.filter((f) => f.startsWith(id)),
   });
  }

  // Baca dan parse VTT
  try {
   const vttContent = fs.readFileSync(vttFile, 'utf-8');
   console.log(`[TRANSCRIPT] VTT file size: ${vttContent.length} characters`);
   console.log(`[TRANSCRIPT] VTT file preview (first 500 chars):\n${vttContent.substring(0, 500)}`);

   const segments = parseVttContent(vttContent);

   if (segments.length === 0) {
    console.warn(`[TRANSCRIPT] No segments parsed from VTT file for videoId: ${videoId}`);
    return res.status(404).json({
     error: 'No transcript segments found in VTT file',
     videoId: videoId,
    });
   }

   // Deteksi bahasa dari nama file
   let detectedLanguage = 'unknown';
   const fileName = path.basename(vttFile);
   if (fileName.includes('.id.')) {
    detectedLanguage = 'Indonesian';
   } else if (fileName.includes('.en.')) {
    detectedLanguage = 'English';
   }

   const result = {
    segments,
    language: detectedLanguage,
    sourceFile: fileName,
   };

   // Cache the result
   transcriptCache.set(videoId, result);

   // Hapus file setelah dibaca
   fs.unlinkSync(vttFile);

   console.log(`[TRANSCRIPT] Successfully processed transcript for videoId: ${videoId}, segments: ${segments.length}`);
   res.json(result);
  } catch (e) {
   console.error(`[TRANSCRIPT] Failed to parse VTT for videoId ${videoId}:`, e.message);
   return res.status(500).json({
    error: 'Failed to parse VTT',
    details: e.message,
    videoId: videoId,
   });
  }
 });
});

// Endpoint: GET /api/video-metadata?videoId=...
// Mendapatkan metadata video (durasi, judul, dll) menggunakan yt-dlp
app.get('/api/video-metadata', async (req, res) => {
 const {videoId} = req.query;

 if (!videoId) {
  return res.status(400).json({error: 'videoId parameter is required'});
 }

 const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
 console.log(`[video-metadata] Fetching metadata for video: ${videoId}`);

 try {
  // Cek apakah yt-dlp.exe ada dan dapat diakses
  if (!fs.existsSync(YT_DLP_PATH)) {
   throw new Error(`yt-dlp.exe not found at path: ${YT_DLP_PATH}`);
  }

  console.log(`[video-metadata] Using yt-dlp at: ${YT_DLP_PATH}`);

  // Gunakan yt-dlp untuk mendapatkan metadata tanpa download
  const result = execSync(
   `"${YT_DLP_PATH}" --dump-json --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --extractor-args "youtube:player_client=web" "${videoUrl}"`,
   {
    encoding: 'utf8',
    timeout: 60000, // Increase timeout to 60 seconds
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
   }
  );

  if (!result || result.trim().length === 0) {
   throw new Error('Empty response from yt-dlp');
  }

  const metadata = JSON.parse(result.trim());

  // Extract informasi yang dibutuhkan
  const response = {
   videoId: metadata.id,
   title: metadata.title,
   duration: metadata.duration, // dalam detik
   uploader: metadata.uploader,
   upload_date: metadata.upload_date,
   view_count: metadata.view_count,
   description: metadata.description?.substring(0, 500), // Batasi deskripsi
  };

  console.log(`[video-metadata] Successfully fetched metadata for ${videoId}: ${response.title} (${response.duration}s)`);
  res.json(response);
 } catch (error) {
  console.error(`[video-metadata] Error fetching metadata for ${videoId}:`, error.message);

  // Log more detailed error information
  if (error.stderr) {
   console.error(`[video-metadata] stderr:`, error.stderr);
  }
  if (error.stdout) {
   console.error(`[video-metadata] stdout:`, error.stdout);
  }

  res.status(500).json({
   error: 'Failed to fetch video metadata',
   details: error.message,
   videoId: videoId,
  });
 }
});

// Cleanup old VTT files on server start
cleanupOldVttFiles();

app.listen(PORT, () => {
 console.log(`Backend server running on http://localhost:${PORT}`);
});
