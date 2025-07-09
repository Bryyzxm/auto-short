// Simple Express backend for YouTube video download & segment cut
import express from "express";
import cors from "cors";
import { execFile, execFileSync } from "child_process";
import { v4 as uuidv4 } from "uuid";

// Transcript statistics for monitoring
const transcriptStats = {
  youtubeDataAPI: { success: 0, total: 0 },
  timedText: { success: 0, total: 0 },
  lemnosLife: { success: 0, total: 0 },
  ytdlp: { success: 0, total: 0 },
  whisper: { success: 0, total: 0 },
  totalRequests: 0,
  successfulRequests: 0,
  errors: []
};

// Error categorization
const ERROR_TYPES = {
  VIDEO_UNAVAILABLE: 'video_unavailable',
  NO_TRANSCRIPT: 'no_transcript',
  RATE_LIMITED: 'rate_limited',
  NETWORK_ERROR: 'network_error',
  AUTH_REQUIRED: 'auth_required'
};

// Utility function for retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
      console.log(`🔄 Retry ${i + 1}/${maxRetries} after ${Math.round(delay)}ms: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Video validation function
async function validateVideoAvailability(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      return { available: true, title: data.title, author: data.author_name };
    }
    return { available: false, error: 'Video not found or private' };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

// Error categorization function
function categorizeError(error) {
  const errorMsg = error.toString().toLowerCase();
  if (errorMsg.includes('video unavailable') || errorMsg.includes('private video')) {
    return ERROR_TYPES.VIDEO_UNAVAILABLE;
  }
  if (errorMsg.includes('sign in to confirm') || errorMsg.includes('bot')) {
    return ERROR_TYPES.RATE_LIMITED;
  }
  if (errorMsg.includes('no transcript') || errorMsg.includes('no subtitles')) {
    return ERROR_TYPES.NO_TRANSCRIPT;
  }
  if (errorMsg.includes('network') || errorMsg.includes('timeout')) {
    return ERROR_TYPES.NETWORK_ERROR;
  }
  return ERROR_TYPES.AUTH_REQUIRED;
}

// YouTube Data API v3 function
async function fetchYouTubeDataAPI(videoId) {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) {
    console.log('⚠️ YouTube Data API key not configured');
    return null;
  }

  try {
    transcriptStats.youtubeDataAPI.total++;
    console.log(`🔍 Trying YouTube Data API v3 for videoId: ${videoId}`);
    
    // First, get available captions
    const captionsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${API_KEY}`
    );
    
    if (!captionsResponse.ok) {
      throw new Error(`YouTube Data API error: ${captionsResponse.status}`);
    }
    
    const captionsData = await captionsResponse.json();
    
    if (!captionsData.items || captionsData.items.length === 0) {
      console.log('❌ No captions available via YouTube Data API');
      return null;
    }
    
    // Find the best caption track (prefer Indonesian, then English)
    const preferredLangs = ['id', 'en'];
    let selectedCaption = null;
    
    for (const lang of preferredLangs) {
      selectedCaption = captionsData.items.find(item => 
        item.snippet.language === lang
      );
      if (selectedCaption) break;
    }
    
    if (!selectedCaption) {
      selectedCaption = captionsData.items[0]; // Use first available
    }
    
    console.log(`✅ Found caption track: ${selectedCaption.snippet.language} (${selectedCaption.snippet.trackKind})`);
    
    // Download the caption content
    const captionResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/captions/${selectedCaption.id}?key=${API_KEY}`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );
    
    if (captionResponse.ok) {
      const captionText = await captionResponse.text();
      // Parse caption format (usually SRT or VTT)
      const segments = parseCaptionText(captionText);
      if (segments.length > 0) {
        transcriptStats.youtubeDataAPI.success++;
        console.log(`✅ YouTube Data API returned ${segments.length} segments`);
        return segments;
      }
    }
    
    return null;
  } catch (err) {
    console.warn(`❌ YouTube Data API failed: ${err.message}`);
    return null;
  }
}

// Parse caption text (SRT/VTT format)
function parseCaptionText(text) {
  const segments = [];
  
  // Try VTT format first
  if (text.includes('-->')) {
    const vttRegex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]*?)(?=\n\d|$)/g;
    let match;
    while ((match = vttRegex.exec(text)) !== null) {
      const cleanText = match[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanText) {
        segments.push({
          start: match[1],
          end: match[2],
          text: cleanText
        });
      }
    }
  }
  
  // Try SRT format
  if (segments.length === 0) {
    const srtRegex = /\d+\s+(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s+([\s\S]*?)(?=\n\n|\n\d+\s+|$)/g;
    let match;
    while ((match = srtRegex.exec(text)) !== null) {
      const cleanText = match[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanText) {
        segments.push({
          start: match[1].replace(',', '.'),
          end: match[2].replace(',', '.'),
          text: cleanText
        });
      }
    }
  }
  
  return segments;
}

// Parse VTT content
function parseVTT(vttContent) {
  const segments = [];
  
  // Clean VTT content
  const cleaned = vttContent
    .replace(/WEBVTT[^\n]*\n/gi, "")
    .replace(/NOTE[^\n]*\n/gi, "")
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
    .replace(/<c>|<\/c>/g, "")
    .replace(/align:[^\n]+/g, "")
    .replace(/position:[^\n]+/g, "")
    .replace(/\n{2,}/g, "\n");

  const regex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]*?)(?=\n\d|$)/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    const text = match[3]
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      segments.push({ 
        start: match[1], 
        end: match[2], 
        text 
      });
    }
  }
  
  return segments;
}

// Enhanced LemnosLife API function
async function fetchLemnosLifeTranscript(videoId) {
  try {
    transcriptStats.lemnosLife.total++;
    console.log(`🔍 Trying LemnosLife API for videoId: ${videoId}`);
    
    const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`LemnosLife API error: ${response.status}`);
    }
    
    const data = await response.json();
    
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
      
      transcriptStats.lemnosLife.success++;
      console.log(`✅ LemnosLife API returned ${segments.length} segments`);
      return segments;
    }
    
    return null;
  } catch (err) {
    console.warn(`❌ LemnosLife API failed: ${err.message}`);
    return null;
  }
}

// Download audio for whisper fallback
async function downloadAudio(videoId) {
  try {
    const audioPath = path.join(process.cwd(), `temp_${videoId}.m4a`);
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    await runYtDlp([
      ytUrl,
      "-f",
      "bestaudio[ext=m4a]/bestaudio",
      "--max-filesize",
      "20M",
      "-o",
      audioPath,
    ]);
    
    return audioPath;
  } catch (error) {
    console.error(`❌ Audio download failed: ${error.message}`);
    return null;
  }
}

// Enhanced function to get transcript segments with comprehensive fallbacks
async function getTranscriptSegments(videoId, refresh = false) {
  console.log(`🔍 Getting transcript for video: ${videoId}, refresh: ${refresh}`);
  
  // Update transcript stats
  transcriptStats.totalRequests++;
  
  // Method 1: Try TimedText API first (fastest) - unless refresh is requested
  if (!refresh) {
    console.log('🎯 Trying enhanced TimedText API...');
    const timedTextSegments = await retryWithBackoff(
      () => fetchTimedTextSegments(videoId),
      3,
      1000
    );
    if (timedTextSegments && timedTextSegments.length > 0) {
      transcriptStats.successfulRequests++;
      console.log(`✅ TimedText API success: ${timedTextSegments.length} segments`);
      return cleanSegments(timedTextSegments);
    }
    console.log('⚠️ TimedText API failed or returned empty');
  }
  
  // Method 2: Try enhanced yt-dlp with cookies and anti-detection
  console.log('🔄 Trying enhanced yt-dlp...');
  const maxYtDlpRetries = 3;
  for (let attempt = 1; attempt <= maxYtDlpRetries; attempt++) {
    try {
      console.log(`🔄 yt-dlp attempt ${attempt}/${maxYtDlpRetries}`);
      
      // Validate video first
      const validation = await validateVideoAvailability(videoId);
      if (!validation.available) {
        console.log(`❌ Video not available: ${validation.error}`);
        break;
      }
      
      const proxy = getNextProxy();
      const proxyArgs = proxy ? ['--proxy', proxy] : [];
      
      // Try to get subtitles with yt-dlp
      const subtitleArgs = [
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang", "id,en",
        "--sub-format", "vtt",
        "--skip-download",
        "-o", `./temp/%(title)s.%(ext)s`,
        ...proxyArgs,
        `https://www.youtube.com/watch?v=${videoId}`
      ];
      
      await runYtDlp(subtitleArgs, { timeout: 90000 });
      
      // Find and parse VTT file
      const tempDir = './temp';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const files = fs.readdirSync(tempDir);
      const vttFile = files.find(file => file.endsWith('.vtt'));
      
      if (vttFile) {
        const vttPath = path.join(tempDir, vttFile);
        const vttContent = fs.readFileSync(vttPath, 'utf8');
        const segments = parseVTT(vttContent);
        
        // Clean up
        try {
          fs.unlinkSync(vttPath);
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup VTT file: ${cleanupError.message}`);
        }
        
        if (segments && segments.length > 0) {
          transcriptStats.successfulRequests++;
          transcriptStats.ytdlp.success++;
          console.log(`✅ yt-dlp success: ${segments.length} segments`);
          return cleanSegments(segments);
        }
      }
      
    } catch (error) {
      const errorType = categorizeError(error.message);
      console.error(`❌ yt-dlp attempt ${attempt} failed (${errorType}): ${error.message}`);
      
      if (attempt < maxYtDlpRetries) {
        const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // Method 3: Fallback to LemnosLife API with retry
  console.log('🔄 Trying LemnosLife API with retry...');
  const lemnosSegments = await retryWithBackoff(
    () => fetchLemnosLifeTranscript(videoId),
    3,
    2000
  );
  if (lemnosSegments && lemnosSegments.length > 0) {
    transcriptStats.successfulRequests++;
    console.log(`✅ LemnosLife API success: ${lemnosSegments.length} segments`);
    return cleanSegments(lemnosSegments);
  }
  console.log('⚠️ LemnosLife API failed or returned empty');
  
  // Method 4: Final fallback to yt-dlp + whisper
  console.log('🔄 Trying yt-dlp + whisper fallback...');
  try {
    const audioPath = await downloadAudio(videoId);
    if (audioPath) {
      const whisperSegments = await runWhisperCpp(audioPath);
      // Clean up audio file
      try {
        fs.unlinkSync(audioPath);
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to cleanup audio file: ${cleanupError.message}`);
      }
      
      if (whisperSegments && whisperSegments.length > 0) {
        transcriptStats.successfulRequests++;
        transcriptStats.whisper.success++;
        console.log(`✅ Whisper fallback success: ${whisperSegments.length} segments`);
        return cleanSegments(whisperSegments);
      }
    }
  } catch (error) {
    console.error(`❌ Whisper fallback failed: ${error.message}`);
    transcriptStats.errors.push({ videoId, error: error.message, timestamp: new Date() });
  }
  
  console.log('❌ All transcript methods failed');
  transcriptStats.errors.push({ videoId, error: 'All methods failed', timestamp: new Date() });
  return [];
}
// Helper function to run yt-dlp and return a Promise with enhanced features
function runYtDlp(args, options = {}) {
  return new Promise((resolve, reject) => {
    if (!YT_DLP_PATH) {
      return reject(new Error("yt-dlp not found. Please check installation."));
    }

    // Add cookies support if available
    const YOUTUBE_COOKIES = process.env.YOUTUBE_COOKIES;
    const cookieArgs = [];
    
    if (YOUTUBE_COOKIES) {
      if (YOUTUBE_COOKIES.startsWith('http')) {
        // If it's a URL, use cookies-from-browser
        cookieArgs.push('--cookies-from-browser', 'chrome');
      } else if (fs.existsSync(YOUTUBE_COOKIES)) {
        // If it's a file path
        cookieArgs.push('--cookies', YOUTUBE_COOKIES);
      }
    }
    
    // Add user agent to avoid detection
    const userAgentArgs = [
      '--user-agent', 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    // Add additional anti-detection measures
    const antiDetectionArgs = [
      '--sleep-interval', '1',
      '--max-sleep-interval', '3',
      '--sleep-subtitles', '1'
    ];
    
    const finalArgs = [...cookieArgs, ...userAgentArgs, ...antiDetectionArgs, ...args];
    
    console.log(`🔧 Running yt-dlp with enhanced args (${finalArgs.length} total)`);
    console.log(`🔧 Using binary: ${YT_DLP_PATH}`);
    if (cookieArgs.length > 0) {
      console.log(`🍪 Using cookies: ${cookieArgs.join(' ')}`);
    }

    execFile(
      YT_DLP_PATH,
      finalArgs,
      { 
        timeout: options.timeout || 300000,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      },
      (error, stdout, stderr) => {
        if (error) {
          const errorType = categorizeError(error.message);
          console.error(`❌ yt-dlp error (${errorType}): ${error.message}`);
          console.error(`❌ yt-dlp stderr: ${stderr}`);
          
          // Enhanced error handling
          if (errorType === ERROR_TYPES.RATE_LIMITED) {
            console.log('🚫 Rate limited - consider using cookies or proxy');
          }
          
          return reject(Object.assign(error, { errorType }));
        }
        console.log(`✅ yt-dlp success: ${stdout.substring(0, 100)}...`);
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
    if (!WHISPER_PATH) {
      return reject(new Error("whisper.cpp not found. Please check installation."));
    }

    const jsonOut = `${audioPath}.json`;
    console.log(`🔧 Running whisper.cpp on: ${audioPath}`);
    console.log(`🔧 Using whisper binary: ${WHISPER_PATH}`);
    console.log(`🔧 Output will be: ${jsonOut}`);

    // Try multiple model paths
    const MODEL_PATHS = [
      "/app/models/ggml-tiny.bin",
      "/app/bin/ggml-tiny.bin",
      "./models/ggml-tiny.bin",
      "ggml-tiny.bin"
    ];

    let modelPath = null;
    for (const path of MODEL_PATHS) {
      if (fs.existsSync(path)) {
        modelPath = path;
        break;
      }
    }

    if (!modelPath) {
      return reject(new Error(`Whisper model not found in any of these locations: ${MODEL_PATHS.join(", ")}`));
    }

    console.log(`🔧 Using model: ${modelPath}`);

    execFile(
      WHISPER_PATH,
      [
        "-m",
        modelPath,
        "-f",
        audioPath,
        "-of",
        jsonOut,
        "-oj",
      ],
      { timeout: 300000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error("❌ whisper.cpp error", err.message);
          console.error("❌ whisper.cpp stderr:", stderr);
          return reject(err);
        }
        console.log("✅ whisper.cpp success, parsing output...");
        try {
          const raw = fs.readFileSync(jsonOut, "utf-8");
          fs.unlinkSync(jsonOut);
          const obj = JSON.parse(raw);
          if (!obj.segments || !Array.isArray(obj.segments)) {
            console.log("❌ No segments found in whisper output");
            return resolve([]);
          }
          const segments = obj.segments.map((s) => ({
            start: secondsToHMS(s.start),
            end: secondsToHMS(s.end),
            text: s.text.trim(),
          }));
          console.log(`✅ whisper.cpp generated ${segments.length} segments`);
          resolve(segments);
        } catch (e) {
          console.error("❌ Error parsing whisper output:", e.message);
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

// Proxy rotation for avoiding rate limits
const PROXY_LIST = (process.env.PROXY_LIST || '').split(',').filter(p => p.trim());
let currentProxyIndex = 0;

function getNextProxy() {
  if (PROXY_LIST.length === 0) return null;
  const proxy = PROXY_LIST[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
  return proxy;
}

// Enhanced fetch subtitles via official TimedText API with retry and fallbacks
async function fetchTimedTextSegments(videoId, langOrder = ["id", "en"]) {
  console.log(`🔍 Starting comprehensive transcript fetch for video: ${videoId}`);
  
  // Update transcript stats
  transcriptStats.timedText.total++;
  
  // Method 1: Try YouTube Data API first (if available)
  if (process.env.YOUTUBE_API_KEY) {
    try {
      console.log('🎯 Attempting YouTube Data API...');
      const apiSegments = await fetchYouTubeDataAPI(videoId);
      if (apiSegments && apiSegments.length > 0) {
        transcriptStats.timedText.success++;
        console.log(`✅ YouTube Data API success: ${apiSegments.length} segments`);
        return apiSegments;
      }
    } catch (error) {
      console.log(`⚠️ YouTube Data API failed: ${error.message}`);
    }
  }
  
  // Method 2: Enhanced TimedText API with retry
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 TimedText API attempt ${attempt}/${maxRetries}`);
      
      let tracks = [];
      try {
        const listRes = await fetch(
          `https://video.google.com/timedtext?type=list&v=${videoId}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
          }
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
      } catch (listError) {
        console.log(`⚠️ Track list fetch failed: ${listError.message}`);
      }

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
            const res = await fetch(captionUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              },
              timeout: 15000
            });
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
              if (segments.length) {
                transcriptStats.timedText.success++;
                console.log(`✅ TimedText API success: ${segments.length} segments`);
                return segments;
              }
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
              if (segments.length) {
                transcriptStats.timedText.success++;
                console.log(`✅ TimedText API success: ${segments.length} segments`);
                return segments;
              }
            }
          } catch (fetchError) {
            console.log(`⚠️ Caption fetch failed for ${captionUrl}: ${fetchError.message}`);
          }
        }
      }
      
      // If this attempt failed, wait before retry
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
    } catch (err) {
      console.warn(`TimedText attempt ${attempt} failed:`, err.message);
    }
  }
  
  console.log(`❌ All TimedText attempts failed for video: ${videoId}`);
  return [];
}

console.log("🚀 Starting server initialization...");
console.log("📁 Current working directory:", process.cwd());
console.log("🌍 Environment variables:");
console.log("  - NODE_ENV:", process.env.NODE_ENV);
console.log("  - PORT:", process.env.PORT);
console.log("  - PATH:", process.env.PATH);
console.log(
  "  - GEMINI_API_KEY:",
  process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Missing"
);

// Debug: Check if directories exist
console.log("📂 Checking critical directories:");
const criticalDirs = ["/app/bin", "/app/models", "/usr/local/bin", "/usr/bin"];
criticalDirs.forEach(dir => {
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      console.log(`  - ${dir}: ✅ (${files.length} files: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""})`);
    } else {
      console.log(`  - ${dir}: ❌ Not found`);
    }
  } catch (err) {
    console.log(`  - ${dir}: ❌ Error: ${err.message}`);
  }
});

try {
  console.log("📦 Loading dependencies...");
  console.log("✅ All dependencies loaded successfully");
} catch (error) {
  console.error("❌ Failed to load dependencies:", error);
  process.exit(1);
}

// Deteksi path binary berdasarkan environment
const isProduction = process.env.NODE_ENV === "production";
const FFMPEG_PATH = "ffmpeg";

function binaryExists(cmd) {
  try {
    // Use 'where' on Windows, 'which' on Unix-like systems
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCmd, [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Check for yt-dlp in multiple possible locations
const YT_DLP_PATHS = [
  "/usr/local/bin/yt-dlp",
  "/usr/bin/yt-dlp",
  "yt-dlp",
  "yt-dlp.exe"
];

let YT_DLP_PATH = null;
try {
  // First try to use yt-dlp from PATH (most reliable in Docker)
  try {
    execFileSync("which", ["yt-dlp"], { stdio: "ignore" });
    YT_DLP_PATH = "yt-dlp";
    console.log(`✅ yt-dlp found in PATH`);
  } catch {
    // If not in PATH, try specific locations
    for (const path of YT_DLP_PATHS) {
      if (fs.existsSync(path) || binaryExists(path.split('/').pop())) {
        YT_DLP_PATH = path;
        console.log(`✅ yt-dlp found at: ${path}`);
        break;
      }
    }
    if (!YT_DLP_PATH) {
      console.log(`❌ yt-dlp NOT found in any of these locations: ${YT_DLP_PATHS.join(", ")}`);
      console.log(`❌ yt-dlp also not found in PATH`);
    }
  }
} catch (err) {
  console.log(`❌ Error checking yt-dlp: ${err.message}`);
}

// Debug: log path yang digunakan
console.log(`🔧 Environment: ${isProduction ? "production" : "development"}`);
console.log(`🔧 YT_DLP_PATH: ${YT_DLP_PATH}`);
console.log(`🔧 FFMPEG_PATH: ${FFMPEG_PATH}`);

// Check if whisper.cpp exists (multiple possible locations)
const WHISPER_PATHS = [
  "/app/bin/main",
  "/app/bin/whisper",
  "/app/whisper.cpp/main",
  "/usr/local/bin/whisper",
  "whisper",
  "main"
];

let WHISPER_PATH = null;
try {
  for (const path of WHISPER_PATHS) {
    if (fs.existsSync(path)) {
      WHISPER_PATH = path;
      console.log(`✅ whisper.cpp found at: ${path}`);
      break;
    }
  }
  if (!WHISPER_PATH) {
    console.log(`❌ whisper.cpp NOT found in any of these locations: ${WHISPER_PATHS.join(", ")}`);
    // Try to find whisper in PATH
    try {
      execFileSync("which", ["whisper"], { stdio: "ignore" });
      WHISPER_PATH = "whisper";
      console.log(`✅ whisper found in PATH`);
    } catch {
      console.log(`❌ whisper also not found in PATH`);
    }
  }
} catch (err) {
  console.log(`❌ Error checking whisper.cpp: ${err.message}`);
}

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

// Endpoint: GET /api/yt-transcript?videoId=... (Enhanced with comprehensive fallback)
app.get("/api/yt-transcript", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { videoId, lang, refresh } = req.query;
  if (!videoId) return res.status(400).json({ error: "videoId required" });

  const startTime = Date.now();
  console.log(`🔍 Processing transcript request for videoId: ${videoId}`);
  console.log(`📊 Current stats - Total: ${transcriptStats.totalRequests}, Success: ${transcriptStats.successfulRequests}`);
  
  // Update transcript stats
  transcriptStats.totalRequests++;

  // Check if refresh is requested
  if (refresh === 'true' && transcriptCache.has(videoId)) {
    console.log(`🔄 Refresh requested, clearing cache for videoId: ${videoId}`);
    transcriptCache.delete(videoId);
  }

  // Serve from cache if available
  if (transcriptCache.has(videoId)) {
    const duration = Date.now() - startTime;
    console.log(`✅ Serving from cache for videoId: ${videoId} (took ${duration}ms)`);
    const cachedData = transcriptCache.get(videoId);
    return res.json({
      ...cachedData,
      metadata: {
        videoId,
        segmentCount: cachedData.segments?.length || 0,
        processingTime: duration,
        source: 'cache',
        timestamp: new Date().toISOString()
      }
    });
  }

  const id = uuidv4();
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const subLang = lang ? String(lang) : "id,en";

  console.log(`🔍 Step 0: Trying comprehensive transcript fetch for videoId: ${videoId}`);
  
  try {
    // Use the enhanced getTranscriptSegments function
    const segments = await getTranscriptSegments(videoId, refresh === 'true');
    
    if (segments && segments.length > 0) {
      transcriptStats.successfulRequests++;
      const duration = Date.now() - startTime;
      console.log(`✅ Transcript fetch successful: ${segments.length} segments (took ${duration}ms)`);
      
      const payload = {
        segments,
        metadata: {
          videoId,
          segmentCount: segments.length,
          processingTime: duration,
          source: 'enhanced_fetch',
          timestamp: new Date().toISOString()
        }
      };
      
      transcriptCache.set(videoId, payload);
      return res.json(payload);
    }
    
    console.log(`❌ Enhanced transcript fetch returned no segments for videoId: ${videoId}`);
  } catch (enhancedError) {
    console.error(`❌ Enhanced transcript fetch failed for ${videoId}:`, enhancedError.message);
    transcriptStats.errors.push({ 
      videoId, 
      error: enhancedError.message, 
      timestamp: new Date(),
      source: 'enhanced_fetch'
    });
  }
  
  // Debug: Test TimedText API directly
  try {
    const testUrl = `https://video.google.com/timedtext?type=list&v=${videoId}`;
    console.log(`🔍 Debug: Testing TimedText list URL: ${testUrl}`);
    const testRes = await fetch(testUrl);
    console.log(`🔍 Debug: TimedText list response status: ${testRes.status}`);
    if (testRes.ok) {
      const testText = await testRes.text();
      console.log(`🔍 Debug: TimedText list response (first 200 chars): ${testText.substring(0, 200)}`);
    }
  } catch (debugErr) {
    console.log(`🔍 Debug: TimedText list test failed: ${debugErr.message}`);
  }

  try {
    console.log(`🔍 Step 1: Trying LemnosLife API for videoId: ${videoId}`);
    // 1️⃣ Try LemnosLife API first (no quota, usually works)
    try {
      const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
      console.log(`🔍 Debug: LemnosLife API URL: ${apiUrl}`);
      const apiRes = await fetch(apiUrl);
      console.log(`🔍 Debug: LemnosLife API response status: ${apiRes.status}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        console.log(`🔍 Debug: LemnosLife API response structure:`, {
          hasTranscript: !!data?.transcript,
          hasSegments: !!data?.transcript?.segments,
          segmentCount: data?.transcript?.segments?.length || 0,
          firstSegment: data?.transcript?.segments?.[0] || null
        });
        if (data?.transcript?.segments?.length) {
          console.log(
            `✅ LemnosLife API returned ${data.transcript.segments.length} segments`
          );
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
      } else {
        const errorText = await apiRes.text();
        console.log(`🔍 Debug: LemnosLife API error response: ${errorText.substring(0, 200)}`);
      }
      console.log(`❌ LemnosLife API returned no segments`);
    } catch (lemErr) {
      console.warn("❌ LemnosLife transcript fetch failed", lemErr.message);
    }

    console.log(`🔍 Step 2: Trying yt-dlp for videoId: ${videoId}`);
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
      console.warn("❌ No VTT found – attempting local Whisper fallback...");

      try {
        console.log(`🔍 Step 3: Downloading audio for Whisper fallback`);
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

        console.log(`🔍 Step 4: Running Whisper on downloaded audio`);
        const whisperSegs = await runWhisperCpp(audioPath);
        try {
          fs.unlinkSync(audioPath);
        } catch {}

        if (whisperSegs.length) {
          transcriptStats.successfulRequests++;
          transcriptStats.whisper.success++;
          const duration = Date.now() - startTime;
          console.log(
            `✅ Whisper fallback returned ${whisperSegs.length} segments (took ${duration}ms)`
          );
          const payload = {
            segments: whisperSegs,
            metadata: {
              videoId,
              segmentCount: whisperSegs.length,
              processingTime: duration,
              source: 'whisper_fallback',
              timestamp: new Date().toISOString()
            }
          };
          transcriptCache.set(videoId, payload);
          return res.json(payload);
        }
        console.log(`❌ Whisper fallback returned no segments`);
        transcriptStats.whisper.total++;
      } catch (e) {
        console.error("❌ Whisper fallback failed", e.message);
        transcriptStats.whisper.total++;
        transcriptStats.errors.push({ 
          videoId, 
          error: e.message, 
          timestamp: new Date(),
          source: 'whisper_fallback'
        });
      }

      const duration = Date.now() - startTime;
      console.log(`❌ All methods failed, returning empty segments (took ${duration}ms)`);
      const emptyPayload = {
        segments: [],
        metadata: {
          videoId,
          segmentCount: 0,
          processingTime: duration,
          source: 'failed_all_methods',
          timestamp: new Date().toISOString()
        }
      };
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
    const duration = Date.now() - startTime;
    console.error(
      `❌ Legacy yt-dlp subtitle fetch failed for ${videoId} (took ${duration}ms):`,
      err.message
    );
    transcriptStats.errors.push({ 
      videoId, 
      error: err.message, 
      timestamp: new Date(),
      source: 'legacy_ytdlp'
    });
    const emptyPayload = {
      segments: [],
      metadata: {
        videoId,
        segmentCount: 0,
        processingTime: duration,
        source: 'error_fallback',
        timestamp: new Date().toISOString(),
        error: err.message
      }
    };
    transcriptCache.set(videoId, emptyPayload);
    return res.status(200).json(emptyPayload);
  }
});

// Endpoint: Get transcript statistics
app.get("/api/transcript-stats", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const successRate = transcriptStats.totalRequests > 0 
    ? (transcriptStats.successfulRequests / transcriptStats.totalRequests * 100).toFixed(2)
    : 0;
    
  const recentErrors = transcriptStats.errors
    .slice(-10)
    .map(err => ({
      videoId: err.videoId,
      error: err.error,
      source: err.source,
      timestamp: err.timestamp
    }));
    
  const methodStats = {
    youtubeDataAPI: {
      ...transcriptStats.youtubeDataAPI,
      successRate: transcriptStats.youtubeDataAPI.total > 0 
        ? (transcriptStats.youtubeDataAPI.success / transcriptStats.youtubeDataAPI.total * 100).toFixed(2) + '%'
        : '0%'
    },
    timedText: {
      ...transcriptStats.timedText,
      successRate: transcriptStats.timedText.total > 0 
        ? (transcriptStats.timedText.success / transcriptStats.timedText.total * 100).toFixed(2) + '%'
        : '0%'
    },
    lemnosLife: {
      ...transcriptStats.lemnosLife,
      successRate: transcriptStats.lemnosLife.total > 0 
        ? (transcriptStats.lemnosLife.success / transcriptStats.lemnosLife.total * 100).toFixed(2) + '%'
        : '0%'
    },
    ytdlp: {
      ...transcriptStats.ytdlp,
      successRate: transcriptStats.ytdlp.total > 0 
        ? (transcriptStats.ytdlp.success / transcriptStats.ytdlp.total * 100).toFixed(2) + '%'
        : '0%'
    },
    whisper: {
      ...transcriptStats.whisper,
      successRate: transcriptStats.whisper.total > 0 
        ? (transcriptStats.whisper.success / transcriptStats.whisper.total * 100).toFixed(2) + '%'
        : '0%'
    }
  };
    
  res.json({
    totalRequests: transcriptStats.totalRequests,
    successfulRequests: transcriptStats.successfulRequests,
    overallSuccessRate: `${successRate}%`,
    methodStats,
    recentErrors,
    errorCount: transcriptStats.errors.length,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Reset transcript statistics
app.post("/api/transcript-stats/reset", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  transcriptStats.youtubeDataAPI = { success: 0, total: 0 };
  transcriptStats.timedText = { success: 0, total: 0 };
  transcriptStats.lemnosLife = { success: 0, total: 0 };
  transcriptStats.ytdlp = { success: 0, total: 0 };
  transcriptStats.whisper = { success: 0, total: 0 };
  transcriptStats.totalRequests = 0;
  transcriptStats.successfulRequests = 0;
  transcriptStats.errors = [];
  
  console.log('📊 Transcript statistics reset');
  res.json({ message: 'Statistics reset successfully', timestamp: new Date().toISOString() });
});

// Endpoint: Get detailed transcript method performance
app.get("/api/transcript-performance", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const performance = {
    methodRanking: [
      { method: 'YouTube Data API', ...transcriptStats.youtubeDataAPI },
      { method: 'TimedText API', ...transcriptStats.timedText },
      { method: 'LemnosLife API', ...transcriptStats.lemnosLife },
      { method: 'yt-dlp', ...transcriptStats.ytdlp },
      { method: 'Whisper', ...transcriptStats.whisper }
    ].map(method => ({
      ...method,
      successRate: method.total > 0 ? (method.success / method.total * 100).toFixed(2) : 0
    })).sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate)),
    
    errorAnalysis: {
      totalErrors: transcriptStats.errors.length,
      errorsBySource: transcriptStats.errors.reduce((acc, err) => {
        acc[err.source] = (acc[err.source] || 0) + 1;
        return acc;
      }, {}),
      commonErrors: transcriptStats.errors.reduce((acc, err) => {
        const errorKey = err.error.substring(0, 50); // First 50 chars
        acc[errorKey] = (acc[errorKey] || 0) + 1;
        return acc;
      }, {})
    },
    
    recommendations: [
      transcriptStats.youtubeDataAPI.total === 0 ? 'Consider setting up YouTube Data API v3 for better reliability' : null,
      transcriptStats.timedText.success / Math.max(transcriptStats.timedText.total, 1) < 0.5 ? 'TimedText API success rate is low, check for IP restrictions' : null,
      transcriptStats.lemnosLife.success / Math.max(transcriptStats.lemnosLife.total, 1) < 0.3 ? 'LemnosLife API may be experiencing issues' : null,
      transcriptStats.errors.length > 50 ? 'High error count detected, consider implementing additional fallback methods' : null
    ].filter(Boolean),
    
    timestamp: new Date().toISOString()
  };
  
  res.json(performance);
});

// Endpoint untuk menghapus cache transcript
app.delete("/api/yt-transcript/cache/:videoId", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { videoId } = req.params;
  if (!videoId) return res.status(400).json({ error: "videoId required" });

  if (transcriptCache.has(videoId)) {
    transcriptCache.delete(videoId);
    console.log(`🗑️ Cache cleared for videoId: ${videoId}`);
    return res.json({ message: `Cache cleared for videoId: ${videoId}` });
  } else {
    return res.json({ message: `No cache found for videoId: ${videoId}` });
  }
});

// Endpoint untuk melihat semua cache
app.get("/api/yt-transcript/cache", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const cacheEntries = Array.from(transcriptCache.entries()).map(([videoId, data]) => ({
    videoId,
    segmentCount: data.segments ? data.segments.length : 0,
    hasSegments: data.segments && data.segments.length > 0
  }));
  return res.json({ cacheEntries, totalCached: cacheEntries.length });
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
