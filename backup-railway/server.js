import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {execFile, execSync} from 'child_process';
import {v4 as uuidv4} from 'uuid';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import {fileURLToPath} from 'url';
import {YoutubeTranscript} from 'youtube-transcript';
import antiDetectionTranscript from './services/antiDetectionTranscript.js';
import robustTranscriptService from './services/robustTranscriptService.js';
import intelligentChunker from './services/intelligentChunker.js';
import aiTitleGenerator from './services/aiTitleGenerator.js';
import smartExcerptFormatter from './services/smartExcerptFormatter.js';

// Polyfill __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path ke yt-dlp executable - FIXED VERSION 2025.07.21
// Cross-platform compatibility: use .exe on Windows, system yt-dlp on Linux
const YT_DLP_PATH = process.platform === 'win32' ? path.join(__dirname, 'yt-dlp.exe') : 'yt-dlp'; // Railway Linux will use system yt-dlp

// Enhanced validation for yt-dlp executable availability
const validateYtDlpPath = () => {
 if (process.platform === 'win32') {
  // Windows: check if yt-dlp.exe exists in current directory
  if (!fs.existsSync(YT_DLP_PATH)) {
   console.error(`❌ yt-dlp.exe not found at: ${YT_DLP_PATH}`);
   return false;
  }
 }
 // Linux production will rely on system yt-dlp installed via pip
 return true;
};

// Enhanced user agent rotation to avoid YouTube bot detection
const USER_AGENTS = [
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
];

function getRandomUserAgent() {
 return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const app = express();
const PORT = process.env.PORT || 5001;

// Helper function to parse time string to seconds
function parseTimeToSeconds(timeString) {
 if (typeof timeString === 'number') return timeString;

 try {
  const [time, milliseconds] = timeString.split('.');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + parseInt(milliseconds || '0') / 1000;
 } catch (error) {
  console.error('[TIME-PARSER] Error parsing time string:', timeString, error);
  return 0;
 }
}

// Enhanced CORS configuration untuk production
const corsOptions = {
 origin: function (origin, callback) {
  // Allow requests with no origin (mobile apps, curl, Postman, etc.)
  if (!origin) return callback(null, true);

  // Parse CORS_ORIGINS from environment variable
  const allowedOrigins = process.env.CORS_ORIGINS
   ? process.env.CORS_ORIGINS.split(',').map((url) => url.trim())
   : [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // React dev server
      'https://auto-short.vercel.app', // Production Vercel
      'https://auto-short-git-main-bryyzxms-projects.vercel.app', // Preview deployments
     ];

  console.log(`[CORS] Request from origin: ${origin}`);
  console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);

  if (allowedOrigins.some((allowedOrigin) => origin === allowedOrigin || origin.includes('.vercel.app') || origin.includes('localhost'))) {
   callback(null, true);
  } else {
   console.warn(`[CORS] Blocked origin: ${origin}`);
   callback(new Error('Not allowed by CORS'));
  }
 },
 credentials: true,
 methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
 allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true, limit: '10mb'}));

// 🔧 STARTUP VALIDATION: Verify yt-dlp is available
console.log('🔧 Performing startup validation...');
console.log(`Platform: ${process.platform}`);
console.log(`YT-DLP Path: ${YT_DLP_PATH}`);

if (!validateYtDlpPath()) {
 console.error('❌ YT-DLP validation failed at startup');
} else {
 console.log('✅ YT-DLP path validation passed');

 // Test yt-dlp execution
 try {
  const testResult = process.platform === 'win32' ? execSync(`"${YT_DLP_PATH}" --version`, {timeout: 10000, encoding: 'utf8'}) : execSync('yt-dlp --version', {timeout: 10000, encoding: 'utf8'});

  console.log(`✅ YT-DLP executable test passed: ${testResult.trim()}`);

  if (testResult.trim() === '2025.07.21') {
   console.log('🎉 Running latest yt-dlp version (2025.07.21)');
  } else {
   console.warn(`⚠️  Not running latest version. Current: ${testResult.trim()}, Latest: 2025.07.21`);
  }
 } catch (testError) {
  console.error('❌ YT-DLP executable test failed:', testError.message);
  console.warn('🔄 This may cause download failures. Check deployment configuration.');
 }
}

// Root endpoint
app.get('/', (req, res) => {
 res.json({
  message: '🚀 AI YouTube to Shorts Backend is running!',
  version: '1.0.0',
  status: 'healthy',
  endpoints: {
   transcript: '/api/yt-transcript?videoId=VIDEO_ID',
   metadata: '/api/video-metadata?videoId=VIDEO_ID',
   health: '/health',
  },
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString(),
 });
});

// Health check endpoint
app.get('/health', (req, res) => {
 res.json({
  status: 'healthy',
  uptime: process.uptime(),
  memory: process.memoryUsage(),
  timestamp: new Date().toISOString(),
 });
});

// 🚨 DEBUG ENDPOINT: Production diagnostics (safe for production)
app.get('/api/debug/environment', (req, res) => {
 try {
  const debugInfo = {
   status: 'ok',
   platform: process.platform,
   node_version: process.version,
   ytdlp_path: YT_DLP_PATH,
   ytdlp_exists_windows: process.platform === 'win32' ? fs.existsSync(YT_DLP_PATH) : 'N/A',
   environment: process.env.NODE_ENV || 'development',
   railway_env: process.env.RAILWAY_ENVIRONMENT_NAME || 'none',
   uptime: process.uptime(),
   memory: process.memoryUsage(),
   timestamp: new Date().toISOString(),
  };

  // Test yt-dlp availability
  try {
   const testCommand = process.platform === 'win32' ? `"${YT_DLP_PATH}" --version` : 'yt-dlp --version';

   const version = execSync(testCommand, {timeout: 5000, encoding: 'utf8'});
   debugInfo.ytdlp_version = version.trim();
   debugInfo.ytdlp_status = 'available';
  } catch (e) {
   debugInfo.ytdlp_status = 'error';
   debugInfo.ytdlp_error = e.message.substring(0, 200);
  }

  res.json(debugInfo);
 } catch (error) {
  res.status(500).json({
   status: 'error',
   message: error.message,
   timestamp: new Date().toISOString(),
  });
 }
});

// Serve static files from current directory (for video outputs)
app.use(
 '/outputs',
 express.static(process.cwd(), {
  setHeaders: (res, filePath) => {
   if (filePath.endsWith('.mp4')) {
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment');

    // Auto-delete file after serving
    res.on('finish', () => {
     setTimeout(() => {
      fs.unlink(filePath, (err) => {
       if (!err) {
        console.log(`[CLEANUP] Auto-deleted file: ${path.basename(filePath)}`);
       }
      });
     }, 1000); // Delete after 1 second
    });
   }
  },
 })
);

app.post('/api/video-quality-check', (req, res) => {
 const {url} = req.body;

 if (!url) {
  return res.status(400).json({error: 'URL is required'});
 }

 try {
  console.log('Checking video quality for:', url);

  // Enhanced format checking with better reliability
  const qualityCheckArgs = ['--list-formats', '--no-warnings', '--user-agent', getRandomUserAgent(), '--extractor-args', 'youtube:player_client=web,android', '--retries', '2', '--socket-timeout', '20', url];

  console.log(`[quality-check] yt-dlp command: ${YT_DLP_PATH} ${qualityCheckArgs.join(' ')}`);

  // Check available formats with yt-dlp
  const formatsResult = execSync(`"${YT_DLP_PATH}" ${qualityCheckArgs.join(' ')}`, {
   encoding: 'utf8',
   timeout: 30000, // 30 second timeout
  });
  console.log('Available formats:', formatsResult);

  // Parse for quality levels with better detection
  const has720p = /\b(720p|1280x720|1920x1080|2560x1440|3840x2160)\b/i.test(formatsResult);
  const has480p = /\b(480p|854x480)\b/i.test(formatsResult);

  let maxQuality;
  let upscalingNeeded;

  if (has720p) {
   maxQuality = '720p+';
   upscalingNeeded = false;
  } else if (has480p) {
   maxQuality = '480p';
   upscalingNeeded = true;
  } else {
   maxQuality = '360p';
   upscalingNeeded = true;
  }

  res.json({
   success: true,
   maxQuality,
   upscalingNeeded,
   message: upscalingNeeded ? `Source is ${maxQuality}, will upscale to 720p` : `Source is ${maxQuality}, no upscaling needed`,
  });
 } catch (error) {
  console.error('Error checking video quality:', error.message);
  res.status(500).json({
   error: 'Failed to check video quality',
   details: error.message,
  });
 }
});

// Endpoint: POST /api/shorts
app.post('/api/shorts', async (req, res) => {
 const {youtubeUrl, start, end, aspectRatio} = req.body;
 if (!youtubeUrl || typeof start !== 'number' || typeof end !== 'number') {
  return res.status(400).json({error: 'youtubeUrl, start, end (in seconds) required'});
 }
 const id = uuidv4();
 const tempFile = path.join(process.cwd(), `${id}.mp4`);

 // Logging waktu
 console.log(`[${id}] Mulai proses download dan cut segmen: ${youtubeUrl} (${start}s - ${end}s, rasio: ${aspectRatio})`);

 // 🚨 PRODUCTION DEBUGGING: Add detailed environment info for error tracking
 console.log(`[${id}] 🔧 Environment Debug Info:`);
 console.log(`[${id}] - Platform: ${process.platform}`);
 console.log(`[${id}] - YT-DLP Path: ${YT_DLP_PATH}`);
 console.log(`[${id}] - YT-DLP Exists: ${fs.existsSync(YT_DLP_PATH) || 'N/A (system binary)'}`);
 console.log(`[${id}] - NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
 console.log(`[${id}] - Railway Env: ${process.env.RAILWAY_ENVIRONMENT_NAME || 'none'}`);

 // Enhanced input validation
 if (!youtubeUrl || (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be'))) {
  console.error(`[${id}] ❌ Invalid YouTube URL: ${youtubeUrl}`);
  return res.status(400).json({
   error: 'Invalid YouTube URL',
   details: 'Please provide a valid YouTube URL',
   provided: youtubeUrl,
  });
 }

 // Pre-check: List available formats to ensure compatibility
 console.log(`[${id}] Checking available formats...`);
 try {
  const formatCheckArgs = [
   '--list-formats',
   '--no-warnings',
   '--user-agent',
   `"${getRandomUserAgent()}"`, // FIXED: Quote user agent properly
   '--extractor-args',
   'youtube:player_client=web,android',
   '--socket-timeout',
   '20',
   youtubeUrl,
  ];

  const formatCheck = execSync(`"${YT_DLP_PATH}" ${formatCheckArgs.join(' ')}`, {
   encoding: 'utf8',
   timeout: 30000,
  });

  // Enhanced quality detection
  const has720p = /\b(720p|1280x720|1920x1080|2560x1440|3840x2160)\b/i.test(formatCheck);
  const has480p = /\b(480p|854x480)\b/i.test(formatCheck);
  const has360p = /\b(360p|640x360)\b/i.test(formatCheck);

  console.log(`[${id}] Quality analysis - 720p+: ${has720p}, 480p: ${has480p}, 360p: ${has360p}`);

  // We'll accept any quality and upscale if needed
  if (!has720p && !has480p && !has360p) {
   console.error(`[${id}] No detectable quality formats available for this video`);
   return res.status(400).json({
    error: 'No usable formats available',
    details: 'This video does not have any recognizable quality formats. Please try a different video.',
    availableFormats: formatCheck.split('\n').slice(0, 10).join('\n'),
   });
  }

  const willUpscale = !has720p;
  console.log(`[${id}] ${willUpscale ? '📈 Will upscale to 720p after download' : '✅ Native 720p+ available'}`);
 } catch (e) {
  console.warn(`[${id}] Could not check formats, proceeding with fallback strategy:`, e.message);
 }

 console.time(`[${id}] yt-dlp download`);

 // Enhanced format selection with 2025.07.21 yt-dlp compatibility
 const ytDlpArgs = [
  '-f',
  // NEW: 2025.07.21 optimized format selection for YouTube's latest changes
  // Priority 1: 720p+ DASH streams (YouTube's preferred method as of July 2025)
  'bestvideo[height>=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/' + // H.264 + AAC (most compatible)
   'bestvideo[height>=720][ext=mp4]+bestaudio[ext=m4a]/' + // Standard MP4/M4A combo
   'bestvideo[height>=720][vcodec^=vp9]+bestaudio[acodec^=opus]/' + // VP9 + Opus (modern)
   'bestvideo[height>=720]+bestaudio[ext=m4a]/' + // Any 720p video + M4A audio
   'bestvideo[height>=720]+bestaudio/' + // Any 720p video + best audio
   // Priority 2: 480p for upscaling (better than 360p)
   'bestvideo[height>=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/' +
   'bestvideo[height>=480][ext=mp4]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=480]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=480]+bestaudio/' +
   // Priority 3: 360p minimum acceptable quality
   'bestvideo[height>=360][ext=mp4]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=360]+bestaudio/' +
   // Priority 4: Progressive formats as last resort
   'best[height>=720][ext=mp4]/best[height>=480][ext=mp4]/best[height>=360][ext=mp4]/' +
   // Final fallback: anything that works
   'best[ext=mp4]/best',
  '--no-playlist',
  '--no-warnings',
  '--merge-output-format',
  'mp4',
  // Enhanced reliability parameters for 2025.07.21
  '--user-agent',
  getRandomUserAgent(),
  '--extractor-args',
  'youtube:player_client=web,android,ios', // Multi-client strategy for better success rate
  '--retries',
  '5', // Increased from 3 to handle YouTube's stricter rate limits
  '--socket-timeout',
  '45', // Increased timeout for complex DASH resolution
  '--fragment-retries',
  '3', // Retry failed fragments
  '--add-header',
  'Accept-Language: en-US,en;q=0.9,id;q=0.8',
  '--add-header',
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  // Better cookie handling
  '--no-check-certificate',
  '-o',
  tempFile,
  youtubeUrl,
 ];

 const commandDisplay = ytDlpArgs.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ');
 console.log(`[${id}] yt-dlp command: ${YT_DLP_PATH} ${commandDisplay}`);

 execFile(YT_DLP_PATH, ytDlpArgs, {maxBuffer: 1024 * 1024 * 50}, (err, stdout, stderr) => {
  console.timeEnd(`[${id}] yt-dlp download`);
  if (err) {
   console.error(`[${id}] yt-dlp error:`, err.message);
   console.error(`[${id}] yt-dlp stderr:`, stderr);
   console.error(`[${id}] yt-dlp stdout:`, stdout);

   // Enhanced error analysis with 2025.07.21 improvements
   let errorDetails = 'Unknown yt-dlp error';
   let userFriendlyError = 'Video download failed';

   if (stderr) {
    if (stderr.includes('Requested format is not available')) {
     errorDetails = 'No compatible video format found';
     userFriendlyError = 'This video format is not supported. Try a different video.';
    } else if (stderr.includes('Sign in to confirm') || stderr.includes('Sign in to confirm your age')) {
     errorDetails = 'YouTube age verification or sign-in required';
     userFriendlyError = 'This video requires sign-in or age verification. Try a different video.';
    } else if (stderr.includes('Video unavailable') || stderr.includes('Private video')) {
     errorDetails = 'Video is not accessible';
     userFriendlyError = 'This video is private, unavailable, or geo-blocked.';
    } else if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
     errorDetails = 'YouTube rate limiting active';
     userFriendlyError = 'YouTube is rate-limiting requests. Please wait and try again in 10-15 minutes.';
    } else if (stderr.includes('network') || stderr.includes('timeout')) {
     errorDetails = 'Network or timeout error';
     userFriendlyError = 'Network connection issue. Please try again.';
    } else if (stderr.includes('EACCES') || stderr.includes('Permission denied')) {
     errorDetails = 'File permission error (production environment)';
     userFriendlyError = 'Server configuration issue. This will be fixed soon.';
    } else if (stderr.includes('404') || stderr.includes('Not Found')) {
     errorDetails = 'Video not found';
     userFriendlyError = 'This video was not found or has been deleted.';
    } else if (stderr.includes('HTTP Error 403')) {
     errorDetails = 'Access forbidden by YouTube';
     userFriendlyError = 'YouTube has blocked access to this video from our server.';
    } else if (stderr.includes('not a valid URL') || stderr.includes('generic')) {
     errorDetails = 'Command line parsing error (likely user-agent issue)';
     userFriendlyError = 'Server configuration error. Please try again.';
    }
   }

   if (err.message) {
    if (err.message.includes('EACCES')) {
     errorDetails = 'yt-dlp executable permission denied (Linux production)';
     userFriendlyError = 'Server is updating YouTube downloader. Please try again in a few minutes.';
    } else if (err.message.includes('Command failed')) {
     // Extract more specific error from command failure
     if (stderr && stderr.includes('not a valid URL')) {
      errorDetails = 'User-agent or command line parsing error';
      userFriendlyError = 'Server configuration error. Development team has been notified.';
     }
    }
   }
   return res.status(500).json({
    error: userFriendlyError,
    technical_details: errorDetails,
    stderr: stderr?.substring(0, 500) + '...',
    environment: {
     platform: process.platform,
     node_env: process.env.NODE_ENV,
     railway_env: process.env.RAILWAY_ENVIRONMENT_NAME || 'none',
     ytdlp_path: YT_DLP_PATH,
     timestamp: new Date().toISOString(),
    },
    request_info: {
     id: id,
     url: youtubeUrl,
     duration: `${start}s - ${end}s`,
    },
    command: `${YT_DLP_PATH} [args_hidden_for_security]`,
   });
  }
  console.log(`[${id}] yt-dlp success. Downloaded to: ${tempFile}`);

  // Analyze video resolution for upscaling decisions
  let videoWidth = 0;
  let videoHeight = 0;
  let needsUpscaling = false;

  try {
   const ffprobeResult = execSync(`ffprobe -v quiet -print_format json -show_streams "${tempFile}"`, {encoding: 'utf8'});
   const videoInfo = JSON.parse(ffprobeResult);
   const videoStream = videoInfo.streams.find((s) => s.codec_type === 'video');
   if (videoStream) {
    videoWidth = parseInt(videoStream.width);
    videoHeight = parseInt(videoStream.height);
    needsUpscaling = videoHeight < 720;

    console.log(`[${id}] Video resolution: ${videoWidth}x${videoHeight} (${videoHeight}p)`);

    if (needsUpscaling) {
     console.log(`[${id}] 📈 UPSCALING REQUIRED: ${videoHeight}p → 720p`);
    } else {
     console.log(`[${id}] ✅ Resolution adequate: ${videoHeight}p ≥ 720p`);
    }
   } else {
    console.warn(`[${id}] Could not detect video stream, assuming upscaling needed`);
    needsUpscaling = true;
   }
  } catch (e) {
   console.warn(`[${id}] Could not determine video resolution, assuming upscaling needed:`, e.message);
   needsUpscaling = true;
  }

  // Check if file actually exists
  if (!fs.existsSync(tempFile)) {
   console.error(`[${id}] Downloaded file not found: ${tempFile}`);
   return res.status(500).json({
    error: 'Downloaded file not found',
    details: `Expected file: ${tempFile}`,
   });
  }
  // Enhanced FFmpeg processing with smart upscaling and aspect ratio handling
  const cutFile = path.join(process.cwd(), `${id}-short.mp4`);
  let ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile];

  // Build video filter chain
  const videoFilters = [];

  // Step 1: Upscaling if needed (before aspect ratio changes)
  if (needsUpscaling) {
   const targetHeight = 720;
   const targetWidth = Math.round((targetHeight * videoWidth) / videoHeight);
   // Ensure width is even (required for most codecs)
   const evenWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;

   videoFilters.push(`scale=${evenWidth}:${targetHeight}:flags=lanczos`);
   console.log(`[${id}] 📈 Upscaling: ${videoWidth}x${videoHeight} → ${evenWidth}x${targetHeight}`);
  }

  // Step 2: Aspect ratio cropping
  if (aspectRatio === '9:16') {
   // Calculate dimensions for 9:16 aspect ratio
   const currentHeight = needsUpscaling ? 720 : videoHeight;
   const targetWidth = Math.round(currentHeight * (9 / 16));

   // Ensure even dimensions
   const evenTargetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
   const evenCurrentHeight = currentHeight % 2 === 0 ? currentHeight : currentHeight - 1;

   videoFilters.push(`crop=${evenTargetWidth}:${evenCurrentHeight}:(iw-${evenTargetWidth})/2:(ih-${evenCurrentHeight})/2`);
   console.log(`[${id}] 📱 Cropping to 9:16: ${evenTargetWidth}x${evenCurrentHeight}`);
  } else if (aspectRatio === '16:9') {
   // Calculate dimensions for 16:9 aspect ratio
   const currentHeight = needsUpscaling ? 720 : videoHeight;
   const targetWidth = Math.round(currentHeight * (16 / 9));

   // Ensure even dimensions
   const evenTargetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
   const evenCurrentHeight = currentHeight % 2 === 0 ? currentHeight : currentHeight - 1;

   videoFilters.push(`crop=${evenTargetWidth}:${evenCurrentHeight}:(iw-${evenTargetWidth})/2:(ih-${evenCurrentHeight})/2`);
   console.log(`[${id}] 🖥️ Cropping to 16:9: ${evenTargetWidth}x${evenCurrentHeight}`);
  }

  // Apply video filters if any
  if (videoFilters.length > 0) {
   ffmpegArgs.push('-vf', videoFilters.join(','));
  }

  // Enhanced encoding settings
  if (aspectRatio === 'original' && !needsUpscaling) {
   // Keep original quality with copy streams if no processing needed
   ffmpegArgs.push('-c', 'copy');
   console.log(`[${id}] 🚀 Using stream copy (no quality loss)`);
  } else {
   // High quality encoding for processed videos
   const crf = needsUpscaling ? '16' : '18'; // Higher quality for upscaled content
   ffmpegArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', 'medium', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart');
   console.log(`[${id}] 🎬 Using high quality encoding (CRF ${crf})`);
  }

  ffmpegArgs.push(cutFile);
  console.time(`[${id}] ffmpeg cut`);
  execFile('ffmpeg', ffmpegArgs, (err2, stdout2, stderr2) => {
   console.timeEnd(`[${id}] ffmpeg cut`);
   fs.unlink(tempFile, () => {});
   if (err2) {
    console.error(`[${id}] ffmpeg error:`, err2.message);
    console.error(`[${id}] ffmpeg stderr:`, stderr2);
    console.error(`[${id}] ffmpeg stdout:`, stdout2);
    return res.status(500).json({
     error: 'ffmpeg failed',
     details: err2.message,
     stderr: stderr2,
     command: `ffmpeg ${ffmpegArgs.join(' ')}`,
    });
   }

   // Check if output file exists and verify quality
   if (!fs.existsSync(cutFile)) {
    console.error(`[${id}] Cut file not found: ${cutFile}`);
    return res.status(500).json({
     error: 'Cut file not found',
     details: `Expected file: ${cutFile}`,
    });
   }

   // Verify final output resolution
   try {
    const finalProbeResult = execSync(`ffprobe -v quiet -print_format json -show_streams "${cutFile}"`, {encoding: 'utf8'});
    const finalVideoInfo = JSON.parse(finalProbeResult);
    const finalVideoStream = finalVideoInfo.streams.find((s) => s.codec_type === 'video');

    if (finalVideoStream) {
     const finalWidth = parseInt(finalVideoStream.width);
     const finalHeight = parseInt(finalVideoStream.height);
     console.log(`[${id}] ✅ Final output resolution: ${finalWidth}x${finalHeight} (${finalHeight}p)`);

     if (finalHeight >= 720) {
      console.log(`[${id}] 🎉 SUCCESS: Output meets 720p+ requirement!`);
     } else {
      console.warn(`[${id}] ⚠️ WARNING: Output resolution ${finalHeight}p is still below 720p`);
     }
    }
   } catch (e) {
    console.warn(`[${id}] Could not verify final resolution:`, e.message);
   }

   console.log(`[${id}] Selesai proses. Download: /outputs/${path.basename(cutFile)}`);

   // Schedule auto-cleanup after 30 seconds if file is not downloaded
   setTimeout(() => {
    if (fs.existsSync(cutFile)) {
     fs.unlink(cutFile, (err) => {
      if (!err) {
       console.log(`[CLEANUP] Auto-deleted undownloaded file: ${path.basename(cutFile)}`);
      }
     });
    }
   }, 30000); // 30 seconds timeout

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
// Enhanced transcript cache with anti-detection support
const transcriptCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const FAILED_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for failed attempts

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

// Helper function untuk membersihkan file MP4 lama
function cleanupOldMp4Files() {
 try {
  const files = fs.readdirSync(process.cwd());
  const mp4Files = files.filter((file) => file.endsWith('.mp4') && file.includes('-'));
  mp4Files.forEach((file) => {
   try {
    const filePath = path.join(process.cwd(), file);
    const stats = fs.statSync(filePath);
    const now = new Date();
    const fileAge = now - stats.mtime;

    // Delete files older than 1 hour
    if (fileAge > 60 * 60 * 1000) {
     fs.unlinkSync(filePath);
     console.log(`Cleaned up old MP4 file: ${file}`);
    }
   } catch (e) {
    console.warn(`Failed to cleanup MP4 file ${file}:`, e.message);
   }
  });
 } catch (e) {
  console.warn('Failed to cleanup old MP4 files:', e.message);
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

// Add anti-detection debug endpoint
app.get('/api/transcript-stats', (req, res) => {
 try {
  const stats = antiDetectionTranscript.getStats();
  res.json(stats);
 } catch (error) {
  res.status(500).json({error: 'Failed to get transcript stats', details: error.message});
 }
});

// Clear anti-detection cache endpoint
app.post('/api/clear-transcript-cache', (req, res) => {
 try {
  antiDetectionTranscript.clearCache();
  transcriptCache.clear();
  res.json({message: 'All transcript caches cleared successfully'});
 } catch (error) {
  res.status(500).json({error: 'Failed to clear cache', details: error.message});
 }
});

// Enhanced transcript endpoint with anti-detection
app.get('/api/yt-transcript', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT] 🎯 Anti-Detection request for videoId: ${videoId}`);

 // Check cache first
 const cached = transcriptCache.get(videoId);
 if (cached) {
  const age = Date.now() - cached.timestamp;
  const maxAge = cached.failed ? FAILED_CACHE_DURATION : CACHE_DURATION;

  if (age < maxAge) {
   console.log(`[TRANSCRIPT] ✅ Cache hit for ${videoId} (${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
   if (cached.failed) {
    return res.status(404).json(cached.data);
   }
   return res.json(cached.data);
  } else {
   console.log(`[TRANSCRIPT] 🗑️ Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
   transcriptCache.delete(videoId);
  }
 }

 try {
  console.log(`[TRANSCRIPT] 🚀 Starting anti-detection extraction for ${videoId}`);

  // Use anti-detection service as primary method
  const transcript = await antiDetectionTranscript.extractTranscript(videoId, {
   lang: lang ? lang.split(',') : ['id', 'en'],
  });

  if (transcript && transcript.length > 10) {
   // Parse transcript into segments (simple splitting for now)
   const segments = transcript
    .split(/[.!?]+/)
    .filter((text) => text.trim().length > 0)
    .map((text, index) => ({
     text: text.trim(),
     start: index * 5, // Approximate timing
     end: (index + 1) * 5,
    }));

   const result = {
    segments: segments,
    language: 'Auto-detected',
    source: 'Anti-Detection Service',
    method: 'Advanced Cookie Strategy',
    length: transcript.length,
   };

   // Cache successful result
   transcriptCache.set(videoId, {
    data: result,
    timestamp: Date.now(),
    failed: false,
   });

   console.log(`[TRANSCRIPT] ✅ Anti-detection success for ${videoId} (${transcript.length} chars, ${segments.length} segments)`);
   return res.json(result);
  } else {
   throw new Error('Anti-detection service returned empty transcript');
  }
 } catch (antiDetectionError) {
  console.log(`[TRANSCRIPT] ❌ Anti-detection failed: ${antiDetectionError.message}`);

  // Fallback 1: Try youtube-transcript library
  console.log(`[TRANSCRIPT] 🔄 Trying fallback: youtube-transcript library`);
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'id',
    country: 'ID',
   });

   if (transcript && transcript.length > 0) {
    console.log(`[TRANSCRIPT] ✅ Fallback successful: got ${transcript.length} segments`);
    const segments = transcript.map((item) => ({
     text: item.text,
     start: item.offset / 1000,
     end: (item.offset + item.duration) / 1000,
    }));

    const result = {
     segments: segments,
     language: 'Indonesian',
     source: 'YouTube Transcript API',
     method: 'Fallback Library',
    };

    // Cache fallback result
    transcriptCache.set(videoId, {
     data: result,
     timestamp: Date.now(),
     failed: false,
    });

    return res.json(result);
   }
  } catch (fallbackError) {
   console.log(`[TRANSCRIPT] ❌ Fallback also failed: ${fallbackError.message}`);
  }

  // Fallback 2: Try English
  console.log(`[TRANSCRIPT] 🔄 Trying English fallback`);
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'en',
    country: 'US',
   });

   if (transcript && transcript.length > 0) {
    console.log(`[TRANSCRIPT] ✅ English fallback successful: got ${transcript.length} segments`);
    const segments = transcript.map((item) => ({
     text: item.text,
     start: item.offset / 1000,
     end: (item.offset + item.duration) / 1000,
    }));

    const result = {
     segments: segments,
     language: 'English',
     source: 'YouTube Transcript API',
     method: 'English Fallback',
    };

    // Cache English result
    transcriptCache.set(videoId, {
     data: result,
     timestamp: Date.now(),
     failed: false,
    });

    return res.json(result);
   }
  } catch (englishError) {
   console.log(`[TRANSCRIPT] ❌ English fallback also failed: ${englishError.message}`);
  }

  // All methods failed
  const errorResponse = {
   error: 'All transcript extraction methods failed',
   videoId: videoId,
   message: 'YouTube bot detection is blocking all access methods',
   technical_details: {
    anti_detection_error: antiDetectionError.message,
    timestamp: new Date().toISOString(),
   },
   attempted_methods: ['Anti-Detection Cookie Strategy (Primary)', 'YouTube Transcript API Indonesian (Fallback 1)', 'YouTube Transcript API English (Fallback 2)'],
   suggestions: ['Video may not have transcripts available', 'YouTube may be actively blocking server IP', 'Try again in a few minutes', 'Consider using manual transcript extraction'],
  };

  // Cache failure
  transcriptCache.set(videoId, {
   data: errorResponse,
   timestamp: Date.now(),
   failed: true,
  });

  console.log(`[TRANSCRIPT] 💀 All methods failed for ${videoId}`);
  return res.status(404).json(errorResponse);
 }
});

// Legacy VTT-based transcript endpoint (for backward compatibility)
app.get('/api/yt-transcript-legacy', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT] 🎯 Anti-Detection request for videoId: ${videoId}`);

 // Check cache first
 const cached = transcriptCache.get(videoId);
 if (cached) {
  const age = Date.now() - cached.timestamp;
  const maxAge = cached.failed ? FAILED_CACHE_DURATION : CACHE_DURATION;

  if (age < maxAge) {
   console.log(`[TRANSCRIPT] ✅ Cache hit for ${videoId} (${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
   if (cached.failed) {
    return res.status(404).json(cached.data);
   }
   return res.json(cached.data);
  } else {
   console.log(`[TRANSCRIPT] 🗑️ Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
   transcriptCache.delete(videoId);
  }
 }

 try {
  console.log(`[TRANSCRIPT] 🚀 Starting anti-detection extraction for ${videoId}`);

  // Use anti-detection service as primary method
  const transcript = await antiDetectionTranscript.extractTranscript(videoId, {
   lang: lang ? lang.split(',') : ['id', 'en'],
  });

  if (transcript && transcript.length > 10) {
   // Parse transcript into segments (simple splitting for now)
   const segments = transcript
    .split(/[.!?]+/)
    .filter((text) => text.trim().length > 0)
    .map((text, index) => ({
     text: text.trim(),
     start: index * 5, // Approximate timing
     end: (index + 1) * 5,
    }));

   const result = {
    segments: segments,
    language: 'Auto-detected',
    source: 'Anti-Detection Service',
    method: 'Advanced Cookie Strategy',
    length: transcript.length,
   };

   // Cache successful result
   transcriptCache.set(videoId, {
    data: result,
    timestamp: Date.now(),
    failed: false,
   });

   console.log(`[TRANSCRIPT] ✅ Anti-detection success for ${videoId} (${transcript.length} chars, ${segments.length} segments)`);
   return res.json(result);
  } else {
   throw new Error('Anti-detection service returned empty transcript');
  }
 } catch (antiDetectionError) {
  console.log(`[TRANSCRIPT] ❌ Anti-detection failed: ${antiDetectionError.message}`);

  // Fallback 1: Try youtube-transcript library
  console.log(`[TRANSCRIPT] 🔄 Trying fallback: youtube-transcript library`);
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'id',
    country: 'ID',
   });

   if (transcript && transcript.length > 0) {
    console.log(`[TRANSCRIPT] ✅ Fallback successful: got ${transcript.length} segments`);
    const segments = transcript.map((item) => ({
     text: item.text,
     start: item.offset / 1000,
     end: (item.offset + item.duration) / 1000,
    }));

    const result = {
     segments: segments,
     language: 'Indonesian',
     source: 'YouTube Transcript API',
     method: 'Fallback Library',
    };

    // Cache fallback result
    transcriptCache.set(videoId, {
     data: result,
     timestamp: Date.now(),
     failed: false,
    });

    return res.json(result);
   }
  } catch (fallbackError) {
   console.log(`[TRANSCRIPT] ❌ Fallback also failed: ${fallbackError.message}`);
  }

  // Fallback 2: Try English
  console.log(`[TRANSCRIPT] 🔄 Trying English fallback`);
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'en',
    country: 'US',
   });

   if (transcript && transcript.length > 0) {
    console.log(`[TRANSCRIPT] ✅ English fallback successful: got ${transcript.length} segments`);
    const segments = transcript.map((item) => ({
     text: item.text,
     start: item.offset / 1000,
     end: (item.offset + item.duration) / 1000,
    }));

    const result = {
     segments: segments,
     language: 'English',
     source: 'YouTube Transcript API',
     method: 'English Fallback',
    };

    // Cache English result
    transcriptCache.set(videoId, {
     data: result,
     timestamp: Date.now(),
     failed: false,
    });

    return res.json(result);
   }
  } catch (englishError) {
   console.log(`[TRANSCRIPT] ❌ English fallback also failed: ${englishError.message}`);
  }

  // All methods failed
  const errorResponse = {
   error: 'All transcript extraction methods failed',
   videoId: videoId,
   message: 'YouTube bot detection is blocking all access methods',
   technical_details: {
    anti_detection_error: antiDetectionError.message,
    timestamp: new Date().toISOString(),
   },
   attempted_methods: ['Anti-Detection Cookie Strategy (Primary)', 'YouTube Transcript API Indonesian (Fallback 1)', 'YouTube Transcript API English (Fallback 2)'],
   suggestions: ['Video may not have transcripts available', 'YouTube may be actively blocking server IP', 'Try again in a few minutes', 'Consider using manual transcript extraction'],
  };

  // Cache failure
  transcriptCache.set(videoId, {
   data: errorResponse,
   timestamp: Date.now(),
   failed: true,
  });

  console.log(`[TRANSCRIPT] 💀 All methods failed for ${videoId}`);
  return res.status(404).json(errorResponse);
 }
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
  // Check if yt-dlp exists (only for Windows file path)
  if (process.platform === 'win32' && !fs.existsSync(YT_DLP_PATH)) {
   throw new Error(`yt-dlp.exe not found at path: ${YT_DLP_PATH}`);
  }

  console.log(`[video-metadata] Using yt-dlp at: ${YT_DLP_PATH}`);

  // Enhanced yt-dlp command with better reliability
  const ytDlpMetadataArgs = ['--dump-json', '--no-check-certificate', '--no-warnings', '--user-agent', getRandomUserAgent(), '--extractor-args', 'youtube:player_client=web,android', '--retries', '3', '--socket-timeout', '30', videoUrl];

  console.log(`[video-metadata] yt-dlp command: ${YT_DLP_PATH} ${ytDlpMetadataArgs.join(' ')}`);

  // Gunakan yt-dlp untuk mendapatkan metadata tanpa download
  const result = execSync(`"${YT_DLP_PATH}" ${ytDlpMetadataArgs.join(' ')}`, {
   encoding: 'utf8',
   timeout: 60000, // Increase timeout to 60 seconds
   maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  });

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

  // Try fallback: YouTube oEmbed API (no API key required)
  console.log(`[video-metadata] Trying fallback method for videoId: ${videoId}`);
  try {
   const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
   const oembedResponse = await fetch(oembedUrl);

   if (oembedResponse.ok) {
    const oembedData = await oembedResponse.json();
    console.log(`[video-metadata] Fallback successful for ${videoId}: ${oembedData.title}`);

    const fallbackResponse = {
     videoId: videoId,
     title: oembedData.title,
     duration: 600, // Default fallback duration (10 minutes)
     uploader: oembedData.author_name,
     upload_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
     view_count: null,
     description: `Video by ${oembedData.author_name}`,
     thumbnail_url: oembedData.thumbnail_url,
     fallback: true,
    };

    return res.json(fallbackResponse);
   }
  } catch (fallbackError) {
   console.error(`[video-metadata] Fallback also failed:`, fallbackError.message);
  }

  res.status(500).json({
   error: 'Failed to fetch video metadata',
   details: error.message,
   videoId: videoId,
  });
 }
});

// Enhanced transcript endpoint with timing data for AI segmentation
app.get('/api/yt-transcript-with-timing', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT-TIMING] 🎯 Enhanced request for videoId: ${videoId}`);

 // Check cache first
 const cacheKey = `${videoId}_timing`;
 const cached = transcriptCache.get(cacheKey);
 if (cached) {
  const age = Date.now() - cached.timestamp;
  const maxAge = cached.failed ? FAILED_CACHE_DURATION : CACHE_DURATION;

  if (age < maxAge) {
   console.log(`[TRANSCRIPT-TIMING] ✅ Cache hit for ${videoId} (${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
   if (cached.failed) {
    return res.status(404).json(cached.data);
   }
   return res.json(cached.data);
  } else {
   console.log(`[TRANSCRIPT-TIMING] 🗑️ Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
   transcriptCache.delete(cacheKey);
  }
 }

 try {
  console.log(`[TRANSCRIPT-TIMING] 🚀 Starting ROBUST extraction with real timing for ${videoId}`);

  // NEW APPROACH: Use Robust Transcript Service for real timing
  let transcriptData = null;
  let method = 'Unknown';

  try {
   console.log(`[TRANSCRIPT-TIMING] Using Robust Transcript Service...`);

   transcriptData = await robustTranscriptService.extractWithRealTiming(videoId, {
    lang: lang ? lang.split(',') : ['id', 'en'],
   });

   if (transcriptData && transcriptData.hasRealTiming && transcriptData.segments.length > 0) {
    console.log(`[TRANSCRIPT-TIMING] ✅ ROBUST service success: ${transcriptData.segments.length} timed segments, ${transcriptData.totalDuration}s total`);

    method = transcriptData.method + ' (Real Timing)';

    const result = {
     transcript: transcriptData.transcript,
     segments: transcriptData.segments,
     language: transcriptData.language,
     source: 'Robust Transcript Service',
     method: method,
     length: transcriptData.transcript.length,
     segmentCount: transcriptData.segments.length,
     hasRealTiming: true,
     totalDuration: transcriptData.totalDuration,
     extractedAt: new Date().toISOString(),
    };

    // Cache successful result
    transcriptCache.set(cacheKey, {
     data: result,
     timestamp: Date.now(),
     failed: false,
    });

    console.log(`[TRANSCRIPT-TIMING] ✅ ROBUST success with REAL timing: ${transcriptData.transcript.length} chars, ${transcriptData.segments.length} segments`);
    return res.json(result);
   }
  } catch (robustError) {
   console.log(`[TRANSCRIPT-TIMING] ❌ ROBUST service failed: ${robustError.message}`);
  }

  console.log(`[TRANSCRIPT-TIMING] 🔄 ROBUST failed, trying legacy anti-detection...`);

  // FALLBACK: Try legacy anti-detection method
  let segments = null;
  let transcript = '';

  try {
   console.log(`[TRANSCRIPT-TIMING] Attempting legacy segments with timing...`);

   // Use the enhanced method if available
   if (typeof antiDetectionTranscript.extractTranscriptWithSegments === 'function') {
    segments = await antiDetectionTranscript.extractTranscriptWithSegments(videoId, {
     lang: lang ? lang.split(',') : ['id', 'en'],
    });

    if (segments && segments.length > 0) {
     console.log(`[TRANSCRIPT-TIMING] ✅ Got ${segments.length} timed segments from anti-detection service`);

     // Enhanced segment processing with quality validation
     const validSegments = segments.filter((s) => s.text && s.text.length > 10 && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start && s.end - s.start >= 0.5);

     if (validSegments.length > 0) {
      // Extract full transcript from segments with proper spacing
      transcript = validSegments.map((s) => s.text.trim()).join(' ');
      method = 'Anti-Detection Service (Enhanced Timed Segments)';

      // Convert timing format to consistent seconds format
      const processedSegments = validSegments.map((s) => ({
       text: s.text,
       start: parseTimeToSeconds(s.start),
       end: parseTimeToSeconds(s.end),
       duration: parseTimeToSeconds(s.end) - parseTimeToSeconds(s.start),
      }));

      const result = {
       transcript: transcript,
       segments: processedSegments,
       language: 'Auto-detected',
       source: 'Anti-Detection Service (Enhanced)',
       method: method,
       length: transcript.length,
       segmentCount: processedSegments.length,
       hasRealTiming: true,
       extractedAt: new Date().toISOString(),
      };

      // Cache successful result
      transcriptCache.set(cacheKey, {
       data: result,
       timestamp: Date.now(),
       failed: false,
      });

      console.log(`[TRANSCRIPT-TIMING] ✅ Enhanced success with real timing: ${transcript.length} chars, ${processedSegments.length} segments`);
      return res.json(result);
     }
    }
   }
  } catch (segmentError) {
   console.log(`[TRANSCRIPT-TIMING] ⚠️ Timed segments extraction failed: ${segmentError.message}`);
  }

  // Fallback: Try to get plain transcript and create estimated timing
  console.log(`[TRANSCRIPT-TIMING] 🔄 Falling back to plain transcript with estimated timing...`);

  transcript = await antiDetectionTranscript.extractTranscript(videoId, {
   lang: lang ? lang.split(',') : ['id', 'en'],
  });

  if (transcript && transcript.length > 10) {
   console.log(`[TRANSCRIPT-TIMING] ✅ Got plain transcript: ${transcript.length} chars`);

   // Create estimated timing segments from plain transcript
   const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim().length > 0);
   const estimatedSegments = sentences.map((sentence, index) => {
    const averageWordsPerMinute = 150; // Average speaking rate
    const words = sentence.trim().split(' ').length;
    const durationInSeconds = Math.max(3, (words / averageWordsPerMinute) * 60);
    const startTime = index > 0 ? sentences.slice(0, index).reduce((acc, s) => acc + Math.max(3, (s.trim().split(' ').length / averageWordsPerMinute) * 60), 0) : 0;

    return {
     start: parseFloat(startTime.toFixed(3)),
     end: parseFloat((startTime + durationInSeconds).toFixed(3)),
     text: sentence.trim(),
    };
   });

   method = 'Anti-Detection Service (Estimated Timing)';

   const result = {
    transcript: transcript,
    segments: estimatedSegments,
    language: 'Auto-detected',
    source: 'Anti-Detection Service (Plain Text + Estimated Timing)',
    method: method,
    length: transcript.length,
    segmentCount: estimatedSegments.length,
    extractedAt: new Date().toISOString(),
   };

   // Cache successful result
   transcriptCache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
    failed: false,
   });

   console.log(`[TRANSCRIPT-TIMING] ✅ Success with estimated timing: ${transcript.length} chars, ${estimatedSegments.length} segments`);
   return res.json(result);
  } else {
   throw new Error('Enhanced anti-detection service returned empty transcript');
  }
 } catch (enhancedError) {
  console.log(`[TRANSCRIPT-TIMING] ❌ Enhanced extraction failed: ${enhancedError.message}`);

  // Final fallback to original transcript endpoint
  try {
   console.log(`[TRANSCRIPT-TIMING] 🔄 Final fallback to original transcript service...`);
   const response = await fetch(`http://127.0.0.1:${PORT}/api/yt-transcript?videoId=${videoId}`);
   if (response.ok) {
    const fallbackData = await response.json();
    console.log(`[TRANSCRIPT-TIMING] ✅ Fallback success: ${fallbackData.segments?.length || 0} segments`);
    return res.json({
     ...fallbackData,
     method: 'Fallback to Original Service',
     source: 'Fallback Anti-Detection Service',
    });
   }
  } catch (fallbackError) {
   console.log(`[TRANSCRIPT-TIMING] ❌ Fallback also failed: ${fallbackError.message}`);
  }

  // Cache failure
  const errorResult = {
   error: 'Enhanced transcript extraction failed',
   videoId: videoId,
   details: enhancedError.message,
   timestamp: new Date().toISOString(),
  };

  transcriptCache.set(cacheKey, {
   data: errorResult,
   timestamp: Date.now(),
   failed: true,
  });

  console.log(`[TRANSCRIPT-TIMING] ❌ All methods failed for ${videoId}: ${enhancedError.message}`);
  return res.status(404).json(errorResult);
 }
});

// Enhanced API endpoint for intelligent segmentation
app.post('/api/intelligent-segments', async (req, res) => {
 const {videoId, targetSegmentCount = 8} = req.body;

 if (!videoId) {
  return res.status(400).json({error: 'Video ID is required'});
 }

 try {
  console.log(`[INTELLIGENT-SEGMENTS] Starting intelligent segmentation for ${videoId}`);

  // Step 1: Get transcript with real timing
  const transcriptData = await robustTranscriptService.extractWithRealTiming(videoId, {
   lang: ['id', 'en'],
  });

  if (!transcriptData.hasRealTiming) {
   throw new Error('Real timing data required for intelligent segmentation');
  }

  console.log(`[INTELLIGENT-SEGMENTS] Got transcript: ${transcriptData.segments.length} timed segments, ${Math.floor(transcriptData.totalDuration / 60)}m${Math.floor(transcriptData.totalDuration % 60)}s`);

  // Step 2: Create intelligent segments
  const intelligentSegments = intelligentChunker.createIntelligentSegments(transcriptData, targetSegmentCount);

  // Step 3: Generate AI titles and descriptions
  console.log(`[INTELLIGENT-SEGMENTS] Generating AI titles for ${intelligentSegments.length} segments...`);
  const segmentsWithTitles = await aiTitleGenerator.generateSegmentTitles(intelligentSegments, `YouTube video: ${videoId}`);

  // Step 4: Format for frontend with smart excerpts
  const formattedSegments = segmentsWithTitles.map((segment, index) => {
   // Use full text for transcript, smart excerpt only for preview
   const smartExcerpt = smartExcerptFormatter.formatExcerpt(segment.text, 800);

   return {
    id: `intelligent-${videoId}-${index + 1}`,
    title: segment.title || `Pembahasan Bagian ${index + 1}`,
    description: segment.description || `Segmen menarik dengan durasi ${segment.duration} detik`,
    startTimeSeconds: segment.start,
    endTimeSeconds: segment.end,
    duration: segment.duration,
    transcriptExcerpt: segment.text, // USE FULL TEXT INSTEAD OF TRUNCATED
    transcriptFull: segment.text, // Full transcript for reference
    transcriptPreview: smartExcerpt, // Shortened version for preview only
    youtubeVideoId: videoId,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    hasRealTiming: true,
    segmentCount: segment.segmentCount,
    excerptLength: segment.text.length, // Full text length
    fullTextLength: segment.text.length,
   };
  });

  // SERVER-SIDE FINAL VALIDATION: Ensure no segments exceed 120s
  const validSegments = formattedSegments.filter((seg) => {
   const isValid = seg.duration >= 30 && seg.duration <= 120;
   if (!isValid) {
    console.log(`[SERVER] ❌ FINAL VALIDATION: Filtering out invalid segment "${seg.title}" (${seg.duration}s)`);
   }
   return isValid;
  });

  if (validSegments.length !== formattedSegments.length) {
   console.log(`[SERVER] ⚠️ Filtered ${formattedSegments.length - validSegments.length} invalid segments`);
  }

  const result = {
   segments: validSegments, // Use filtered segments
   videoId: videoId,
   totalSegments: validSegments.length,
   averageDuration: Math.round(validSegments.reduce((sum, s) => sum + s.duration, 0) / validSegments.length),
   method: 'Intelligent Chunking with AI Titles & Smart Excerpts',
   hasRealTiming: true,
   transcriptQuality: 'HIGH',
   aiTitlesEnabled: true,
   smartExcerptsEnabled: true,
   extractedAt: new Date().toISOString(),
  };

  console.log(`[INTELLIGENT-SEGMENTS] ✅ Created ${validSegments.length} intelligent segments with AI titles (avg: ${result.averageDuration}s)`);

  // DURATION VALIDATION LOG - Show all segment durations
  validSegments.forEach((seg, i) => {
   console.log(`[DURATION-CHECK] Segment ${i + 1}: "${seg.title}" = ${seg.duration}s`);
  });

  // Log sample titles for debugging
  validSegments.slice(0, 3).forEach((seg, i) => {
   console.log(`[AI-TITLE] Sample ${i + 1}: "${seg.title}" (${seg.excerptLength}/${seg.fullTextLength} chars)`);
  });

  res.json(result);
 } catch (error) {
  console.error(`[INTELLIGENT-SEGMENTS] ❌ Error for ${videoId}:`, error);
  res.status(500).json({
   error: 'Intelligent segmentation failed',
   message: error.message,
   videoId: videoId,
  });
 }
});

// Cleanup old files on server start
cleanupOldVttFiles();
cleanupOldMp4Files();

app.listen(PORT, () => {
 console.log(`Backend server running on http://localhost:${PORT}`);
});
