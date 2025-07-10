// Simple Express backend for YouTube video download & segment cut
import express from "express";
import cors from "cors";
import { execFile, execFileSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Transcript statistics for monitoring (simplified to yt-dlp and whisper.cpp only)
const transcriptStats = {
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

// YouTube Data API function removed - using only yt-dlp and whisper.cpp

// parseCaptionText function removed - using only yt-dlp and whisper.cpp

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

// LemnosLife API function removed - using only yt-dlp and whisper.cpp

// Download audio for whisper fallback
async function downloadAudio(videoId) {
  if (!YT_DLP_PATH) {
    console.log('❌ yt-dlp not found, skipping audio download');
    return null;
  }
  
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
  
  // Method 1: Try yt-dlp subtitle extraction (PRIMARY METHOD)
  if (YT_DLP_PATH) {
    console.log('🎯 Trying yt-dlp subtitle extraction (PRIMARY METHOD)...');
    const ytdlpSegments = await retryWithBackoff(
      () => fetchYtDlpTranscript(videoId),
      5, // Multiple retries for yt-dlp
      1500
    );
    if (ytdlpSegments && ytdlpSegments.length > 0) {
      transcriptStats.successfulRequests++;
      transcriptStats.ytdlp.success++;
      console.log(`✅ yt-dlp SUCCESS: ${ytdlpSegments.length} segments`);
      return cleanSegments(ytdlpSegments);
    }
    console.log('⚠️ yt-dlp subtitle extraction failed, trying enhanced options...');
    
    // Enhanced yt-dlp attempt with more aggressive options
    const enhancedYtdlpSegments = await retryWithBackoff(
      () => fetchYtDlpTranscriptEnhanced(videoId),
      3,
      2000
    );
    if (enhancedYtdlpSegments && enhancedYtdlpSegments.length > 0) {
      transcriptStats.successfulRequests++;
      transcriptStats.ytdlp.success++;
      console.log(`✅ yt-dlp ENHANCED SUCCESS: ${enhancedYtdlpSegments.length} segments`);
      return cleanSegments(enhancedYtdlpSegments);
    }
    console.log('⚠️ yt-dlp enhanced method also failed');
  } else {
    console.log('❌ yt-dlp not available!');
  }
  
  // Method 2: Final fallback - yt-dlp + whisper.cpp for audio transcription
  if (YT_DLP_PATH && WHISPER_PATH) {
    console.log('🔄 Trying yt-dlp + whisper.cpp audio transcription...');
    try {
      transcriptStats.ytdlp.total++;
      transcriptStats.whisper.total++;
      
      const audioPath = await downloadAudio(videoId);
      if (audioPath) {
        const whisperSegments = await runWhisperCpp(audioPath);
        if (whisperSegments && whisperSegments.length > 0) {
          transcriptStats.successfulRequests++;
          transcriptStats.ytdlp.success++;
          transcriptStats.whisper.success++;
          console.log(`✅ yt-dlp + whisper.cpp success: ${whisperSegments.length} segments`);
          
          // Clean up audio file
          try {
            fs.unlinkSync(audioPath);
          } catch (e) {
            console.warn(`⚠️ Failed to clean up audio file: ${e.message}`);
          }
          
          return cleanSegments(whisperSegments);
        }
      }
    } catch (error) {
      console.warn(`⚠️ yt-dlp + whisper.cpp failed: ${error.message}`);
    }
  } else {
    console.log('❌ whisper.cpp not available for audio transcription');
  }
  
  console.log('❌ All transcript methods failed - only yt-dlp and whisper.cpp are available');
  transcriptStats.errors.push({ videoId, error: 'yt-dlp and whisper.cpp failed', timestamp: new Date() });
  return [];
}
// Enhanced yt-dlp transcript extraction function
async function fetchYtDlpTranscript(videoId) {
  if (!YT_DLP_PATH) {
    throw new Error('yt-dlp not found');
  }

  try {
    transcriptStats.ytdlp.total++;
    console.log(`🔍 Trying yt-dlp subtitle extraction for videoId: ${videoId}`);
    
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Try to get subtitles with multiple language preferences
    const subtitleArgs = [
      ytUrl,
      '--write-auto-subs',
      '--write-subs',
      '--sub-langs', 'id,en,en-US,en-GB,auto',
      '--sub-format', 'vtt',
      '--skip-download',
      '--output', `temp_${videoId}.%(ext)s`,
      '--no-warnings'
    ];
    
    console.log(`🔧 Running yt-dlp subtitle extraction...`);
    const stdout = await runYtDlp(subtitleArgs, { timeout: 90000 });
    
    // Look for generated subtitle files
    const possibleFiles = [
      `temp_${videoId}.id.vtt`,
      `temp_${videoId}.en.vtt`,
      `temp_${videoId}.en-US.vtt`,
      `temp_${videoId}.en-GB.vtt`
    ];
    
    let subtitleContent = null;
    let usedFile = null;
    
    for (const file of possibleFiles) {
      if (fs.existsSync(file)) {
        console.log(`✅ Found subtitle file: ${file}`);
        subtitleContent = fs.readFileSync(file, 'utf-8');
        usedFile = file;
        break;
      }
    }
    
    // Clean up subtitle files
    for (const file of possibleFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (e) {
        console.warn(`⚠️ Failed to clean up subtitle file ${file}: ${e.message}`);
      }
    }
    
    if (!subtitleContent) {
      console.log('❌ No subtitle files found after yt-dlp extraction');
      return null;
    }
    
    console.log(`✅ Successfully extracted subtitles from ${usedFile}`);
    
    // Parse VTT content
    const segments = parseVTT(subtitleContent);
    
    if (segments.length > 0) {
      console.log(`✅ yt-dlp extracted ${segments.length} subtitle segments`);
      return segments;
    } else {
      console.log('❌ No segments found in subtitle content');
      return null;
    }
    
  } catch (error) {
    console.error(`❌ yt-dlp subtitle extraction failed: ${error.message}`);
    return null;
  }
}

// Enhanced yt-dlp transcript extraction with more aggressive options
async function fetchYtDlpTranscriptEnhanced(videoId) {
  if (!YT_DLP_PATH) {
    throw new Error('yt-dlp not found');
  }

  try {
    console.log(`🔍 Trying ENHANCED yt-dlp subtitle extraction for videoId: ${videoId}`);
    
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // More aggressive subtitle extraction with all possible options
    const enhancedSubtitleArgs = [
      ytUrl,
      '--write-auto-subs',
      '--write-subs',
      '--all-subs', // Download all available subtitles
      '--sub-langs', 'all', // Try all available languages
      '--sub-format', 'vtt/srt/best',
      '--skip-download',
      '--output', `enhanced_${videoId}.%(ext)s`,
      '--no-warnings',
      '--ignore-errors',
      '--force-overwrites'
    ];
    
    console.log(`🔧 Running ENHANCED yt-dlp subtitle extraction with aggressive options...`);
    const stdout = await runYtDlp(enhancedSubtitleArgs, { timeout: 120000 });
    
    // Look for any generated subtitle files with broader search
    const files = fs.readdirSync('.').filter(file => 
      file.startsWith(`enhanced_${videoId}.`) && 
      (file.endsWith('.vtt') || file.endsWith('.srt'))
    );
    
    let subtitleContent = null;
    let usedFile = null;
    
    // Prioritize files by language preference
    const languagePriority = ['id', 'en', 'en-US', 'en-GB'];
    
    for (const lang of languagePriority) {
      const preferredFile = files.find(file => file.includes(`.${lang}.`));
      if (preferredFile) {
        console.log(`✅ Found preferred subtitle file: ${preferredFile}`);
        subtitleContent = fs.readFileSync(preferredFile, 'utf-8');
        usedFile = preferredFile;
        break;
      }
    }
    
    // If no preferred language found, use any available file
    if (!subtitleContent && files.length > 0) {
      usedFile = files[0];
      console.log(`✅ Found subtitle file: ${usedFile}`);
      subtitleContent = fs.readFileSync(usedFile, 'utf-8');
    }
    
    // Clean up all subtitle files
    for (const file of files) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        console.warn(`⚠️ Failed to clean up subtitle file ${file}: ${e.message}`);
      }
    }
    
    if (!subtitleContent) {
      console.log('❌ No subtitle files found after enhanced yt-dlp extraction');
      return null;
    }
    
    console.log(`✅ Successfully extracted subtitles from ${usedFile} using enhanced method`);
    
    // Parse content (VTT format only - using yt-dlp with --sub-format vtt)
    const segments = parseVTT(subtitleContent);
    
    if (segments.length > 0) {
      console.log(`✅ Enhanced yt-dlp extracted ${segments.length} subtitle segments`);
      return segments;
    } else {
      console.log('❌ No segments found in enhanced subtitle content');
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Enhanced yt-dlp subtitle extraction failed: ${error.message}`);
    return null;
  }
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

    const execArgs = USE_PYTHON_YT_DLP ? ["-m", "yt_dlp", ...finalArgs] : finalArgs;
    const execPath = USE_PYTHON_YT_DLP ? "python" : YT_DLP_PATH;
    
    execFile(
      execPath,
      execArgs,
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
      "./models/ggml-tiny.bin",
      "/app/models/ggml-tiny.bin",
      "/app/bin/ggml-tiny.bin",
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

// Using only yt-dlp and whisper.cpp for transcript extraction

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

// Check for yt-dlp in multiple possible locations (Railway/Docker optimized)
const YT_DLP_PATHS = [
  "/usr/local/bin/yt-dlp",
  "/usr/bin/yt-dlp", 
  "./bin/yt-dlp",
  "yt-dlp",
  "yt-dlp.exe"
];

let YT_DLP_PATH = null;
let USE_PYTHON_YT_DLP = false;

// Enhanced yt-dlp detection with priority for Railway/Docker environments
try {
  console.log('🔍 Detecting yt-dlp installation (PRIMARY TRANSCRIPT METHOD)...');
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Platform: ${process.platform}`);
  
  // For production environments (Railway/Docker), prioritize Python module first
  if (isProduction) {
    console.log('🐳 Production environment detected, trying Python module first...');
    
    // Try python3 -m yt_dlp first (most reliable in Docker)
    try {
      execFileSync("python3", ["-m", "yt_dlp", "--version"], { stdio: "ignore" });
      YT_DLP_PATH = "python3";
      USE_PYTHON_YT_DLP = true;
      console.log(`✅ yt-dlp found via python3 -m yt_dlp (PRODUCTION OPTIMIZED)`);
    } catch {
      // Try python -m yt_dlp
      try {
        execFileSync("python", ["-m", "yt_dlp", "--version"], { stdio: "ignore" });
        YT_DLP_PATH = "python";
        USE_PYTHON_YT_DLP = true;
        console.log(`✅ yt-dlp found via python -m yt_dlp`);
      } catch {
        console.log('⚠️ Python module not working, trying binary paths...');
      }
    }
  }
  
  // If not found via Python or in development, try binary paths
  if (!YT_DLP_PATH) {
    // Try to use yt-dlp from PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(whichCmd, ["yt-dlp"], { stdio: "ignore" });
      YT_DLP_PATH = "yt-dlp";
      console.log(`✅ yt-dlp found in PATH`);
    } catch {
      console.log('⚠️ yt-dlp not in PATH, checking specific locations...');
      
      // If not in PATH, try specific locations
      for (const path of YT_DLP_PATHS) {
        if (fs.existsSync(path) || binaryExists(path.split('/').pop())) {
          YT_DLP_PATH = path;
          console.log(`✅ yt-dlp found at: ${path}`);
          break;
        }
      }
      
      // Final fallback for development environments
      if (!YT_DLP_PATH && !isProduction) {
        console.log('⚠️ Development environment: trying Python module fallback...');
        try {
          execFileSync("python3", ["-m", "yt_dlp", "--version"], { stdio: "ignore" });
          YT_DLP_PATH = "python3";
          USE_PYTHON_YT_DLP = true;
          console.log(`✅ yt-dlp found via python3 -m yt_dlp`);
        } catch {
          try {
            execFileSync("python", ["-m", "yt_dlp", "--version"], { stdio: "ignore" });
            YT_DLP_PATH = "python";
            USE_PYTHON_YT_DLP = true;
            console.log(`✅ yt-dlp found via python -m yt_dlp`);
          } catch {
            console.log(`❌ CRITICAL: yt-dlp NOT found in any location!`);
            console.log(`❌ Checked locations: ${YT_DLP_PATHS.join(", ")}`);
            console.log(`❌ Also checked: PATH, python -m yt_dlp, python3 -m yt_dlp`);
            console.log(`❌ This will severely impact transcript extraction capability!`);
          }
        }
      }
    }
  }
  
  // Test yt-dlp functionality if found
  if (YT_DLP_PATH) {
    try {
      const testCmd = USE_PYTHON_YT_DLP ? [YT_DLP_PATH, "-m", "yt_dlp", "--version"] : [YT_DLP_PATH, "--version"];
      const result = execFileSync(testCmd[0], testCmd.slice(1), { encoding: 'utf8', timeout: 10000 });
      console.log(`✅ yt-dlp version test successful: ${result.trim().split('\n')[0]}`);
    } catch (testErr) {
      console.log(`⚠️ yt-dlp found but version test failed: ${testErr.message}`);
    }
  }
  
} catch (err) {
  console.log(`❌ Error during yt-dlp detection: ${err.message}`);
}

// Debug: log configuration yang digunakan
console.log(`🔧 Environment: ${isProduction ? "production" : "development"}`);
console.log(`🔧 YT_DLP_PATH: ${YT_DLP_PATH}`);
console.log(`🔧 USE_PYTHON_YT_DLP: ${USE_PYTHON_YT_DLP}`);
console.log(`🔧 FFMPEG_PATH: ${FFMPEG_PATH}`);

// yt-dlp configuration status
if (YT_DLP_PATH) {
  console.log(`🎯 yt-dlp is ACTIVE as PRIMARY transcript method`);
  console.log(`🎯 Enhanced yt-dlp options enabled for maximum success rate`);
  if (process.env.YOUTUBE_COOKIES) {
    console.log(`🍪 YouTube cookies configured for enhanced access`);
  }
} else {
  console.log(`❌ WARNING: yt-dlp not available - transcript quality will be significantly reduced!`);
  console.log(`❌ Please install yt-dlp for optimal transcript extraction`);
}

// Check if whisper.cpp exists (Railway/Docker optimized paths)
const WHISPER_PATHS = [
  "/app/bin/main",
  "/app/bin/whisper",
  "./bin/whisper",
  "./bin/main",
  "/app/whisper.cpp/main",
  "/usr/local/bin/whisper",
  "whisper",
  "main"
];

let WHISPER_PATH = null;
try {
  console.log('🔍 Detecting whisper.cpp installation...');
  console.log(`🔧 Checking paths: ${WHISPER_PATHS.join(", ")}`);
  
  for (const path of WHISPER_PATHS) {
    if (fs.existsSync(path)) {
      // Verify the binary is executable
      try {
        execFileSync(path, ["--help"], { stdio: "ignore", timeout: 5000 });
        WHISPER_PATH = path;
        console.log(`✅ whisper.cpp found and verified at: ${path}`);
        break;
      } catch (execErr) {
        console.log(`⚠️ Found ${path} but execution test failed: ${execErr.message}`);
      }
    }
  }
  
  if (!WHISPER_PATH) {
    console.log(`❌ whisper.cpp NOT found in any of these locations: ${WHISPER_PATHS.join(", ")}`);
    // Try to find whisper in PATH
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(whichCmd, ["whisper"], { stdio: "ignore" });
      // Test if it's actually whisper.cpp
      try {
        execFileSync("whisper", ["--help"], { stdio: "ignore", timeout: 5000 });
        WHISPER_PATH = "whisper";
        console.log(`✅ whisper found and verified in PATH`);
      } catch {
        console.log(`⚠️ Found 'whisper' in PATH but it's not whisper.cpp`);
      }
    } catch {
      console.log(`❌ whisper also not found in PATH`);
    }
  }
  
  // Additional verification for production environment
  if (WHISPER_PATH && isProduction) {
    console.log(`🔧 Production verification for whisper.cpp at: ${WHISPER_PATH}`);
    try {
      const result = execFileSync(WHISPER_PATH, ["--help"], { encoding: 'utf8', timeout: 5000 });
      if (result.includes('whisper.cpp') || result.includes('usage:')) {
        console.log(`✅ whisper.cpp production verification successful`);
      } else {
        console.log(`⚠️ whisper.cpp verification unclear, but proceeding...`);
      }
    } catch (verifyErr) {
      console.log(`⚠️ whisper.cpp verification failed: ${verifyErr.message}`);
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
  console.warn(
    "⚠️ Gemini API Key is not configured. AI segment generation will be disabled. Set GEMINI_API_KEY environment variable to enable this feature."
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
    return res.status(503).json({
      error: "AI segment generation is currently unavailable. Please configure GEMINI_API_KEY environment variable to enable this feature.",
      feature: "ai_segments",
      status: "disabled"
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

// Proxy endpoint removed - using only yt-dlp and whisper.cpp

// Simple in-memory cache to avoid repeated fetches during container lifetime
const transcriptCache = new Map();

// Endpoint: GET /api/yt-transcript?videoId=... (Using only yt-dlp and whisper.cpp)
app.get("/api/yt-transcript", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { videoId, refresh } = req.query;
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

  // Use only yt-dlp and whisper.cpp for transcript extraction
  console.log(`🔍 Using yt-dlp and whisper.cpp for videoId: ${videoId}`);
  
  try {
    const segments = await getTranscriptSegments(videoId, refresh === 'true');
    
    if (segments && segments.length > 0) {
      transcriptStats.successfulRequests++;
      const duration = Date.now() - startTime;
      console.log(`✅ yt-dlp/whisper.cpp transcript successful: ${segments.length} segments (took ${duration}ms)`);
      
      const payload = {
        segments,
        metadata: {
          videoId,
          segmentCount: segments.length,
          processingTime: duration,
          source: 'yt-dlp_whisper',
          timestamp: new Date().toISOString()
        }
      };
      
      transcriptCache.set(videoId, payload);
      return res.json(payload);
    }
    
    console.log(`⚠️ yt-dlp/whisper.cpp returned no segments for videoId: ${videoId}`);
  } catch (error) {
    console.error(`❌ yt-dlp/whisper.cpp failed for ${videoId}:`, error.message);
    transcriptStats.errors.push({ 
      videoId, 
      error: error.message, 
      timestamp: new Date(),
      source: 'yt-dlp_whisper'
    });
  }

  // If all methods fail, return empty result
  const duration = Date.now() - startTime;
  console.log(`❌ yt-dlp and whisper.cpp failed, returning empty segments (took ${duration}ms)`);
  const emptyPayload = {
    segments: [],
    metadata: {
      videoId,
      segmentCount: 0,
      processingTime: duration,
      source: 'failed_yt_dlp_whisper',
      timestamp: new Date().toISOString(),
      error: 'No transcript available through yt-dlp or whisper.cpp'
    }
  };
  transcriptCache.set(videoId, emptyPayload);
  return res.status(200).json(emptyPayload);
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
      transcriptStats.ytdlp.success / Math.max(transcriptStats.ytdlp.total, 1) < 0.5 ? 'yt-dlp success rate is low, check installation and network' : null,
      transcriptStats.whisper.success / Math.max(transcriptStats.whisper.total, 1) < 0.3 ? 'Whisper.cpp may be experiencing issues, check model files' : null,
      transcriptStats.errors.length > 50 ? 'High error count detected, consider checking yt-dlp and whisper.cpp configuration' : null
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

// Endpoint baru: Mendapatkan durasi video dari transkrip atau YouTube API
app.get("/api/video-meta", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const videoId = req.query.videoId;
  if (!videoId) return res.status(400).json({ error: "videoId is required" });
  
  console.log(`🔍 Getting video metadata for videoId: ${videoId}`);
  
  try {
    // Method 1: Check if we have transcript data in cache
    if (transcriptCache.has(videoId)) {
      const cachedData = transcriptCache.get(videoId);
      if (cachedData.segments && cachedData.segments.length > 0) {
        // Get duration from last segment
        const lastSegment = cachedData.segments[cachedData.segments.length - 1];
        if (lastSegment.end) {
          const duration = parseTimeToSeconds(lastSegment.end);
          console.log(`✅ Got duration from cached transcript: ${duration}s`);
          return res.json({ duration: Math.round(duration) });
        }
      }
    }
    
    // Method 2: Try to get transcript first to extract duration
    console.log(`🔍 Fetching transcript to extract duration...`);
    const segments = await getTranscriptSegments(videoId, false);
    
    if (segments && segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment.end) {
        const duration = parseTimeToSeconds(lastSegment.end);
        console.log(`✅ Got duration from transcript: ${duration}s`);
        return res.json({ duration: Math.round(duration) });
      }
    }
    
    // Method 3: Try YouTube Data API if available
    if (process.env.YOUTUBE_API_KEY) {
      console.log(`🔍 Trying YouTube Data API for video duration...`);
      try {
        const apiResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
        );
        
        if (apiResponse.ok) {
          const data = await apiResponse.json();
          if (data.items && data.items.length > 0) {
            const duration = parseYouTubeDuration(data.items[0].contentDetails.duration);
            console.log(`✅ Got duration from YouTube API: ${duration}s`);
            return res.json({ duration: Math.round(duration) });
          }
        }
      } catch (apiError) {
        console.log(`⚠️ YouTube API failed: ${apiError.message}`);
      }
    }
    
    // Method 4: Fallback - return default duration
    console.log(`⚠️ Could not determine video duration, using default`);
    return res.json({ duration: 600 }); // Default 10 minutes
    
  } catch (error) {
    console.error(`❌ Error getting video metadata: ${error.message}`);
    res.status(500).json({ error: "Failed to get video metadata", details: error.message });
  }
});

// Helper function to parse time string to seconds
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }
  return 0;
}

// Helper function to parse YouTube duration format (PT1H2M3S)
function parseYouTubeDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// Debug endpoint untuk memeriksa konfigurasi
app.get("/api/debug-config", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const config = {
    hasYouTubeApiKey: !!process.env.YOUTUBE_API_KEY,
    apiKeyLength: process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.length : 0,
    apiKeyPrefix: process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.substring(0, 10) + '...' : 'Not set',
    hasYouTubeCookies: !!process.env.YOUTUBE_COOKIES,
    hasProxyList: !!process.env.PROXY_LIST,
    nodeEnv: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  };
  res.json(config);
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
