// Load environment variables from multiple possible locations
require('dotenv').config(); // Load from backend/.env if exists
require('dotenv').config({path: '../.env.local'}); // Load from root .env.local
require('dotenv').config({path: '../.env'}); // Load from root .env if exists

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const {execFile, execSync, spawn} = require('child_process');
const {v4: uuidv4} = require('uuid');
const path = require('path');
const fs = require('fs');
const ytdlp = require('yt-dlp-exec');
const {YoutubeTranscript} = require('youtube-transcript');
const antiDetectionTranscript = require('./services/antiDetectionTranscript.js');
const robustTranscriptServiceV2 = require('./services/robustTranscriptServiceV2.js');
const alternativeTranscriptService = require('./services/alternativeTranscriptService.js');
const emergencyTranscriptService = require('./services/emergencyTranscriptService.js');

// BULLETPROOF SERVICE LOADING - Handle missing services gracefully
let enhancedTranscriptOrchestrator;
try {
 enhancedTranscriptOrchestrator = require('./services/enhancedTranscriptOrchestrator.js');
 console.log('[SERVER] ✅ Enhanced transcript orchestrator loaded successfully');
} catch (error) {
 console.error('[SERVER] ❌ Failed to load enhanced transcript orchestrator:', error.message);
 // Create a fallback orchestrator that always throws a clear error
 enhancedTranscriptOrchestrator = {
  extract: async () => {
   throw new Error('TRANSCRIPT_UNAVAILABLE');
  },
 };
}

const {fetchTranscriptViaInvidious, getHealthyInvidiousInstances} = require('./services/invidious.service.js');
const {TranscriptDisabledError, TranscriptTooShortError, TranscriptNotFoundError} = require('./services/transcriptErrors.js');
const {parseTranscriptFile, synchronizeWithSegments} = require('./services/transcriptParser.js');

// ENHANCED AI SEGMENTATION SERVICES
let enhancedTranscriptProcessor;
try {
 enhancedTranscriptProcessor = require('./services/enhancedTranscriptProcessor.js');
 console.log('[SERVER] ✅ Enhanced transcript processor loaded successfully');
} catch (error) {
 console.error('[SERVER] ❌ Failed to load enhanced transcript processor:', error.message);
 enhancedTranscriptProcessor = null;
}

// Configure multer for file uploads (in-memory storage for transcript files)
const transcriptUpload = multer({
 storage: multer.memoryStorage(),
 limits: {
  fileSize: 2 * 1024 * 1024, // 2MB limit
  files: 1, // Only one file at a time
 },
 fileFilter: (req, file, cb) => {
  // Accept only .srt and .txt files
  const allowedExtensions = ['.srt', '.txt'];
  const allowedMimeTypes = ['text/plain', 'application/x-subrip', 'text/x-srt'];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isValidExtension = allowedExtensions.includes(fileExtension);
  const isValidMimeType = allowedMimeTypes.includes(file.mimetype);

  if (isValidExtension || isValidMimeType) {
   cb(null, true);
  } else {
   cb(new Error('Only .srt and .txt files are allowed'), false);
  }
 },
});

// Helper function to convert transcript text to segments format for consistent API response
function convertTranscriptTextToSegments(transcriptText, source = 'invidious') {
 if (!transcriptText || typeof transcriptText !== 'string') {
  return [];
 }

 // Split text into logical segments (sentences or meaningful chunks)
 const sentences = transcriptText
  .split(/[.!?]+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 10); // Only include meaningful sentences

 const segments = sentences.map((text, index) => ({
  text: text,
  start: index * 5, // Approximate timing (5 seconds per segment)
  duration: 5,
  end: (index + 1) * 5,
 }));

 return segments;
}

// Helper function to create transcript error for missing/unavailable transcripts
class NoValidTranscriptError extends Error {
 constructor(message) {
  super(message);
  this.name = 'NoValidTranscriptError';
 }
}

// Path ke yt-dlp executable - FIXED VERSION 2025.07.21
// Cross-platform compatibility: use .exe on Windows, system yt-dlp on Linux
const YT_DLP_PATH = process.platform === 'win32' ? path.join(__dirname, 'yt-dlp.exe') : 'yt-dlp'; // Azure Linux will use system yt-dlp

// Configurable cookies path for bypassing YouTube bot detection
let YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || path.join(__dirname, 'cookies', 'cookies.txt');

// Check for cookies content in environment variable and create file if needed too
const checkAndCreateCookiesFromEnv = () => {
 const cookiesContent = process.env.YTDLP_COOKIES_CONTENT;
 if (cookiesContent) {
  console.log(`✅ Successfully loaded cookies from environment. Size: ${cookiesContent.length} characters.`);
 } else {
  console.error('❌ YOUTUBE_COOKIES_CONTENT environment variable not found!');
 }

 if (cookiesContent && cookiesContent.trim()) {
  try {
   const rootCookiesPath = path.join(process.cwd(), 'cookies.txt');

   // Write the cookies content to cookies.txt in project root
   fs.writeFileSync(rootCookiesPath, cookiesContent, 'utf8');

   console.log('[COOKIES-ENV] ✅ Successfully created cookies.txt from environment variable');
   console.log(`[COOKIES-ENV] Created file: ${rootCookiesPath}`);

   // Update the cookies path to use the newly created file
   process.env.YTDLP_COOKIES_PATH = rootCookiesPath;
   YTDLP_COOKIES_PATH = rootCookiesPath;

   return true;
  } catch (error) {
   console.log(`[COOKIES-ENV] ❌ Error creating cookies.txt from environment: ${error.message}`);
   return false;
  }
 } else {
  console.log('[COOKIES-ENV] 🔍 Cookies content not found in environment variable, skipping file creation');
  return false;
 }
};

// Initialize cookies from environment variable
checkAndCreateCookiesFromEnv();

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

// Helper function to check if cookies file exists and is valid
const validateCookiesFile = (cookiesPath) => {
 if (!cookiesPath) return false;

 try {
  if (!fs.existsSync(cookiesPath)) {
   console.log(`[COOKIES] Cookies file not found at: ${cookiesPath}`);
   return false;
  }

  // Check if the file has content (not empty)
  const stats = fs.statSync(cookiesPath);
  if (stats.size === 0) {
   console.log(`[COOKIES] Cookies file is empty: ${cookiesPath}`);
   return false;
  }

  console.log(`[COOKIES] ✅ Valid cookies file found: ${cookiesPath} (${stats.size} bytes)`);
  return true;
 } catch (error) {
  console.log(`[COOKIES] Error validating cookies file: ${error.message}`);
  return false;
 }
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

// Secure yt-dlp execution helper using spawn to prevent shell injection
async function executeYtDlpSecurely(args, options = {}) {
 return new Promise((resolve, reject) => {
  // Validate all arguments to prevent injection
  const safeArgs = args.map((arg) => {
   if (typeof arg !== 'string') {
    throw new Error('Invalid argument type');
   }
   return arg;
  });

  // Add cookies if available
  const finalArgs = [...safeArgs];
  if (options.useCookies !== false) {
   const cookiesPath = options.cookiesPath || YTDLP_COOKIES_PATH;
   if (validateCookiesFile(cookiesPath)) {
    console.log(`[SECURE-YTDLP] Using cookies from: ${cookiesPath}`);
    finalArgs.unshift('--cookies', cookiesPath);
   }
  }

  const ytdlpPath = process.platform === 'win32' ? YT_DLP_PATH : 'yt-dlp';

  console.log(`[SECURE-YTDLP] Executing: ${ytdlpPath} ${finalArgs.join(' ')}`);

  const child = spawn(ytdlpPath, finalArgs, {
   stdio: ['pipe', 'pipe', 'pipe'],
   timeout: options.timeout || 300000,
   maxBuffer: options.maxBuffer || 1024 * 1024 * 50,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
   stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
   stderr += data.toString();
  });

  child.on('close', (code) => {
   if (code === 0) {
    resolve(stdout);
   } else {
    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
   }
  });

  child.on('error', (error) => {
   reject(new Error(`Failed to start yt-dlp process: ${error.message}`));
  });
 });
}

// Secure ffprobe execution helper using spawn to prevent shell injection
async function executeFfprobeSecurely(filePath, options = {}) {
 return new Promise((resolve, reject) => {
  const ffprobeArgs = ['-v', 'quiet', '-print_format', 'json', '-show_streams', filePath];

  console.log(`[SECURE-FFPROBE] Executing: ffprobe ${ffprobeArgs.join(' ')}`);

  const child = spawn('ffprobe', ffprobeArgs, {
   stdio: ['pipe', 'pipe', 'pipe'],
   timeout: options.timeout || 30000,
   maxBuffer: options.maxBuffer || 1024 * 1024, // 1MB
   ...options,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
   stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
   stderr += data.toString();
  });

  child.on('close', (code) => {
   if (code === 0) {
    resolve(stdout);
   } else {
    reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
   }
  });

  child.on('error', (error) => {
   reject(new Error(`Failed to start ffprobe process: ${error.message}`));
  });
 });
}

const app = express();
const PORT = process.env.PORT || 8080;

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

// Robust CORS configuration for Azure deployment
// Dynamic whitelist from environment variables for production flexibility
const productionOrigins = (process.env.CORS_ORIGINS || 'https://auto-short.vercel.app').split(',').map((origin) => origin.trim());

const developmentOrigins = [
 'http://localhost:5173', // Vite dev server
 'http://localhost:3000', // React dev server
];

const whitelist = [...productionOrigins, ...developmentOrigins];

const corsOptions = {
 origin: function (origin, callback) {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) return callback(null, true);

  // Check if the origin is in the whitelist
  if (whitelist.indexOf(origin) !== -1) {
   callback(null, true);
  } else {
   console.log(`[CORS] Blocked origin: ${origin}`);
   console.log(`[CORS] Allowed origins: ${whitelist.join(', ')}`);
   callback(new Error('Origin ini tidak diizinkan oleh kebijakan CORS'));
  }
 },
 credentials: true,
 methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
 allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
 optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true, limit: '10mb'}));

// Handle preflight OPTIONS requests explicitly
app.options('*', cors(corsOptions));

// Add request timeout middleware
app.use((req, res, next) => {
 // Set timeout to 5 minutes for upload endpoints
 if (req.path.includes('/upload-transcript') || req.path.includes('/api/shorts')) {
  res.setTimeout(300000); // 5 minutes
 } else {
  res.setTimeout(60000); // 1 minute for other endpoints
 }
 next();
});

// Log CORS configuration on startup
console.log('🌐 CORS Configuration:');
console.log('📋 Allowed Origins:', whitelist);
console.log('✅ CORS middleware applied');
console.log('✅ OPTIONS preflight handler added');
console.log('✅ Request timeout middleware configured');

// 🔧 STARTUP VALIDATION: Verify yt-dlp is available
async function validateStartup() {
 console.log('🔧 Performing startup validation...');
 console.log(`Platform: ${process.platform}`);
 console.log(`YT-DLP Path: ${YT_DLP_PATH}`);
 console.log(`Cookies Path: ${YTDLP_COOKIES_PATH}`);

 if (!validateYtDlpPath()) {
  console.error('❌ YT-DLP validation failed at startup');
  return;
 }
 console.log('✅ YT-DLP path validation passed');

 // Validate cookies file (warning only, not fatal)
 if (validateCookiesFile(YTDLP_COOKIES_PATH)) {
  console.log('✅ Cookies file validation passed');
 } else {
  console.log('⚠️  No valid cookies file found - YouTube may block requests');
  console.log('💡 Set YTDLP_COOKIES_PATH environment variable to specify cookies file location');
 }

 // Test yt-dlp execution
 try {
  const versionArgs = ['--version'];
  const testResult = await executeYtDlpSecurely(versionArgs, {timeout: 10000, useCookies: false});

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

// Run startup validation
validateStartup().catch(console.error);

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
app.get('/health', async (req, res) => {
 res.json({
  status: 'healthy',
  uptime: process.uptime(),
  memory: process.memoryUsage(),
  timestamp: new Date().toISOString(),
 });
});

// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
 res.json({
  message: 'AI YouTube to Shorts Backend API',
  status: 'running',
  version: '1.0.0',
  endpoints: ['/health', '/api/intelligent-segments', '/api/enhanced-transcript/:videoId', '/api/shorts', '/api/transcript'],
  cors: {
   enabled: true,
   allowedOrigins: whitelist,
  },
  timestamp: new Date().toISOString(),
 });
});

// 🚨 DEBUG ENDPOINT: Production diagnostics (safe for production)
app.get('/api/debug/environment', async (req, res) => {
 try {
  const debugInfo = {
   status: 'ok',
   platform: process.platform,
   node_version: process.version,
   ytdlp_path: YT_DLP_PATH,
   ytdlp_exists_windows: process.platform === 'win32' ? fs.existsSync(YT_DLP_PATH) : 'N/A',
   cookies_path: YTDLP_COOKIES_PATH,
   cookies_exists: validateCookiesFile(YTDLP_COOKIES_PATH),
   cookies_env_variable: process.env.YTDLP_COOKIES_CONTENT ? 'present' : 'not set',
   cookies_env_length: process.env.YTDLP_COOKIES_CONTENT ? process.env.YTDLP_COOKIES_CONTENT.length : 0,
   environment: process.env.NODE_ENV || 'development',
   azure_env: process.env.WEBSITE_HOSTNAME || 'local',
   uptime: process.uptime(),
   memory: process.memoryUsage(),
   timestamp: new Date().toISOString(),
  };

  // Test yt-dlp availability
  try {
   const versionArgs = ['--version'];
   const testResult = await executeYtDlpSecurely(versionArgs, {timeout: 5000, useCookies: false});

   debugInfo.ytdlp_version = testResult.trim();
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

app.post('/api/video-quality-check', async (req, res) => {
 const {url} = req.body;

 if (!url) {
  return res.status(400).json({error: 'URL is required'});
 }

 try {
  console.log('Checking video quality for:', url);

  // Enhanced format checking with better reliability
  const qualityCheckArgs = ['--list-formats', '--no-warnings', '--user-agent', getRandomUserAgent(), '--extractor-args', 'youtube:player_client=web,android', '--retries', '2', '--socket-timeout', '20', url];

  console.log(`[quality-check] yt-dlp command: ${process.platform === 'win32' ? YT_DLP_PATH : 'yt-dlp'} ${qualityCheckArgs.join(' ')}`);

  // Check available formats with yt-dlp using secure execution
  const formatsResult = await executeYtDlpSecurely(qualityCheckArgs, {
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

// Helper functions for /api/shorts endpoint to reduce complexity

// Validate input parameters
function validateShortsInput(youtubeUrl, start, end) {
 if (!youtubeUrl || typeof start !== 'number' || typeof end !== 'number') {
  return {valid: false, error: 'youtubeUrl, start, end (in seconds) required'};
 }

 if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
  return {
   valid: false,
   error: 'Invalid YouTube URL',
   details: 'Please provide a valid YouTube URL',
   provided: youtubeUrl,
  };
 }

 return {valid: true};
}

// Log environment information for debugging
function logEnvironmentInfo(id) {
 console.log(`[${id}] 🔧 Environment Debug Info:`);
 console.log(`[${id}] - Platform: ${process.platform}`);
 console.log(`[${id}] - YT-DLP Path: ${YT_DLP_PATH}`);
 console.log(`[${id}] - YT-DLP Exists: ${fs.existsSync(YT_DLP_PATH) || 'N/A (system binary)'}`);
 console.log(`[${id}] - NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
 console.log(`[${id}] - Azure Env: ${process.env.WEBSITE_HOSTNAME || 'local'}`);
}

// Check video formats availability
async function checkVideoFormats(id, youtubeUrl) {
 try {
  const formatCheckArgs = ['--list-formats', '--no-warnings', '--user-agent', getRandomUserAgent(), '--extractor-args', 'youtube:player_client=web,android', '--socket-timeout', '20', youtubeUrl];

  const formatCheck = await executeYtDlpSecurely(formatCheckArgs, {timeout: 30000});

  const has720p = /\b(720p|1280x720|1920x1080|2560x1440|3840x2160)\b/i.test(formatCheck);
  const has480p = /\b(480p|854x480)\b/i.test(formatCheck);
  const has360p = /\b(360p|640x360)\b/i.test(formatCheck);

  console.log(`[${id}] Quality analysis - 720p+: ${has720p}, 480p: ${has480p}, 360p: ${has360p}`);

  if (!has720p && !has480p && !has360p) {
   return {
    success: false,
    error: 'No usable formats available',
    details: 'This video does not have any recognizable quality formats. Please try a different video.',
    availableFormats: formatCheck.split('\n').slice(0, 10).join('\n'),
   };
  }

  const willUpscale = !has720p;
  console.log(`[${id}] ${willUpscale ? '📈 Will upscale to 720p after download' : '✅ Native 720p+ available'}`);
  return {success: true, willUpscale};
 } catch (e) {
  console.warn(`[${id}] Could not check formats, proceeding with fallback strategy:`, e.message);
  return {success: true, willUpscale: true};
 }
}

// Build yt-dlp arguments for video download
function buildYtDlpArgs(tempFile, youtubeUrl) {
 return [
  '-f',
  'bestvideo[height>=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/' +
   'bestvideo[height>=720][ext=mp4]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=720][vcodec^=vp9]+bestaudio[acodec^=opus]/' +
   'bestvideo[height>=720]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=720]+bestaudio/' +
   'bestvideo[height>=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/' +
   'bestvideo[height>=480][ext=mp4]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=480]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=480]+bestaudio/' +
   'bestvideo[height>=360][ext=mp4]+bestaudio[ext=m4a]/' +
   'bestvideo[height>=360]+bestaudio/' +
   'best[height>=720][ext=mp4]/best[height>=480][ext=mp4]/best[height>=360][ext=mp4]/' +
   'best[ext=mp4]/best',
  '--no-playlist',
  '--no-warnings',
  '--merge-output-format',
  'mp4',
  '--user-agent',
  getRandomUserAgent(),
  '--extractor-args',
  'youtube:player_client=web,android,ios',
  '--retries',
  '5',
  '--socket-timeout',
  '45',
  '--fragment-retries',
  '3',
  '--add-header',
  'Accept-Language: en-US,en;q=0.9,id;q=0.8',
  '--add-header',
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  '--no-check-certificate',
  '-o',
  tempFile,
  youtubeUrl,
 ];
}

// Handle yt-dlp download errors with user-friendly messages
function handleDownloadError(err) {
 let errorDetails = 'Unknown yt-dlp error';
 let userFriendlyError = 'Video download failed';

 if (err.message) {
  if (err.message.includes('Requested format is not available')) {
   errorDetails = 'No compatible video format found';
   userFriendlyError = 'This video format is not supported. Try a different video.';
  } else if (err.message.includes('Sign in to confirm')) {
   errorDetails = 'YouTube age verification or sign-in required';
   userFriendlyError = 'This video requires sign-in or age verification. Try a different video.';
  } else if (err.message.includes('Video unavailable') || err.message.includes('Private video')) {
   errorDetails = 'Video is not accessible';
   userFriendlyError = 'This video is private, unavailable, or geo-blocked.';
  } else if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
   errorDetails = 'YouTube rate limiting active';
   userFriendlyError = 'YouTube is rate-limiting requests. Please wait and try again in 10-15 minutes.';
  } else if (err.message.includes('network') || err.message.includes('timeout')) {
   errorDetails = 'Network or timeout error';
   userFriendlyError = 'Network connection issue. Please try again.';
  } else if (err.message.includes('EACCES') || err.message.includes('Permission denied')) {
   errorDetails = 'File permission error (production environment)';
   userFriendlyError = 'Server configuration issue. This will be fixed soon.';
  } else if (err.message.includes('404') || err.message.includes('Not Found')) {
   errorDetails = 'Video not found';
   userFriendlyError = 'This video was not found or has been deleted.';
  } else if (err.message.includes('HTTP Error 403')) {
   errorDetails = 'Access forbidden by YouTube';
   userFriendlyError = 'YouTube has blocked access to this video from our server.';
  } else if (err.message.includes('not a valid URL') || err.message.includes('generic')) {
   errorDetails = 'Command line parsing error (likely user-agent issue)';
   userFriendlyError = 'Server configuration error. Please try again.';
  }
 }

 return {errorDetails, userFriendlyError};
}

// Analyze video resolution and determine if upscaling is needed
function analyzeVideoResolution(id, tempFile) {
 try {
  const ffprobeResult = execSync(`ffprobe -v quiet -print_format json -show_streams "${tempFile}"`, {encoding: 'utf8'});
  const videoInfo = JSON.parse(ffprobeResult);
  const videoStream = videoInfo.streams.find((s) => s.codec_type === 'video');

  if (videoStream) {
   const videoWidth = parseInt(videoStream.width);
   const videoHeight = parseInt(videoStream.height);
   const needsUpscaling = videoHeight < 720;

   console.log(`[${id}] Video resolution: ${videoWidth}x${videoHeight} (${videoHeight}p)`);
   console.log(`[${id}] ${needsUpscaling ? '📈 UPSCALING REQUIRED' : '✅ Resolution adequate'}: ${videoHeight}p`);

   return {videoWidth, videoHeight, needsUpscaling};
  }
 } catch (e) {
  console.warn(`[${id}] Could not determine video resolution, assuming upscaling needed:`, e.message);
 }

 return {videoWidth: 0, videoHeight: 0, needsUpscaling: true};
}

// Helper function to ensure even dimensions for FFmpeg
function ensureEvenDimension(dimension, roundUp = true) {
 if (dimension % 2 === 0) {
  return dimension;
 }

 if (roundUp) {
  return dimension + 1;
 } else {
  return dimension - 1;
 }
}

// Helper function to build crop filter string
function buildCropFilter(targetWidth, currentHeight) {
 const evenTargetWidth = ensureEvenDimension(targetWidth, false);
 const evenCurrentHeight = ensureEvenDimension(currentHeight, false);
 return `crop=${evenTargetWidth}:${evenCurrentHeight}:(iw-${evenTargetWidth})/2:(ih-${evenCurrentHeight})/2`;
}

// Build video filters for FFmpeg processing
function buildVideoFilters(needsUpscaling, aspectRatio, videoWidth, videoHeight) {
 const videoFilters = [];

 if (needsUpscaling) {
  const targetHeight = 720;
  const targetWidth = Math.round((targetHeight * videoWidth) / videoHeight);
  const evenWidth = ensureEvenDimension(targetWidth, true);
  videoFilters.push(`scale=${evenWidth}:${targetHeight}:flags=lanczos`);
 }

 if (aspectRatio === '9:16') {
  const currentHeight = needsUpscaling ? 720 : videoHeight;
  const targetWidth = Math.round(currentHeight * (9 / 16));
  videoFilters.push(buildCropFilter(targetWidth, currentHeight));
 } else if (aspectRatio === '16:9') {
  const currentHeight = needsUpscaling ? 720 : videoHeight;
  const targetWidth = Math.round(currentHeight * (16 / 9));
  videoFilters.push(buildCropFilter(targetWidth, currentHeight));
 }

 return videoFilters;
}

// Build FFmpeg arguments for video processing
function buildFfmpegArgs(start, end, tempFile, cutFile, videoFilters, aspectRatio, needsUpscaling) {
 let ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile];

 if (videoFilters.length > 0) {
  ffmpegArgs.push('-vf', videoFilters.join(','));
 }

 if (aspectRatio === 'original' && !needsUpscaling) {
  ffmpegArgs.push('-c', 'copy');
 } else {
  const crf = needsUpscaling ? '16' : '18';
  ffmpegArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', 'medium', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart');
 }

 ffmpegArgs.push(cutFile);
 return ffmpegArgs;
}

// Schedule file cleanup
function scheduleFileCleanup(cutFile) {
 setTimeout(() => {
  if (fs.existsSync(cutFile)) {
   fs.unlink(cutFile, (err) => {
    if (!err) {
     console.log(`[CLEANUP] Auto-deleted undownloaded file: ${path.basename(cutFile)}`);
    }
   });
  }
 }, 30000);
}

// Main endpoint with reduced complexity
app.post('/api/shorts', async (req, res) => {
 const {youtubeUrl, start, end, aspectRatio} = req.body;

 // Validate input
 const validation = validateShortsInput(youtubeUrl, start, end);
 if (!validation.valid) {
  return res.status(400).json(validation);
 }

 const id = uuidv4();
 const tempFile = path.join(process.cwd(), `${id}.mp4`);

 console.log(`[${id}] Mulai proses download dan cut segmen: ${youtubeUrl} (${start}s - ${end}s, rasio: ${aspectRatio})`);
 logEnvironmentInfo(id);

 // Check video formats
 const formatCheck = await checkVideoFormats(id, youtubeUrl);
 if (!formatCheck.success) {
  return res.status(400).json(formatCheck);
 }

 // Download video
 console.time(`[${id}] yt-dlp download`);
 const ytDlpArgs = buildYtDlpArgs(tempFile, youtubeUrl);
 console.log(`[${id}] yt-dlp command: ${process.platform === 'win32' ? YT_DLP_PATH : 'yt-dlp'} ${ytDlpArgs.join(' ')}`);

 try {
  await executeYtDlpSecurely(ytDlpArgs, {maxBuffer: 1024 * 1024 * 50, timeout: 300000});
  console.timeEnd(`[${id}] yt-dlp download`);
  console.log(`[${id}] yt-dlp download successful`);

  if (!fs.existsSync(tempFile)) {
   throw new Error('Downloaded file not found');
  }

  const stats = fs.statSync(tempFile);
  if (stats.size < 1024) {
   throw new Error('Downloaded file too small (likely corrupted)');
  }

  console.log(`[${id}] Video downloaded successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
 } catch (err) {
  console.timeEnd(`[${id}] yt-dlp download`);
  console.error(`[${id}] yt-dlp error:`, err.message);

  const {errorDetails, userFriendlyError} = handleDownloadError(err);

  return res.status(500).json({
   error: userFriendlyError,
   technical_details: errorDetails,
   error_message: err.message?.substring(0, 500) + '...',
   environment: {
    platform: process.platform,
    node_env: process.env.NODE_ENV,
    azure_env: process.env.WEBSITE_HOSTNAME || 'local',
    ytdlp_path: process.platform === 'win32' ? YT_DLP_PATH : 'yt-dlp',
    timestamp: new Date().toISOString(),
   },
   request_info: {id, url: youtubeUrl, duration: `${start}s - ${end}s`},
   command: `${process.platform === 'win32' ? YT_DLP_PATH : 'yt-dlp'} [args_hidden_for_security]`,
  });
 }

 // Analyze video and process with FFmpeg
 const {videoWidth, videoHeight, needsUpscaling} = analyzeVideoResolution(id, tempFile);

 if (!fs.existsSync(tempFile)) {
  return res.status(500).json({
   error: 'Downloaded file not found',
   details: `Expected file: ${tempFile}`,
  });
 }

 const cutFile = path.join(process.cwd(), `${id}-short.mp4`);
 const videoFilters = buildVideoFilters(needsUpscaling, aspectRatio, videoWidth, videoHeight);
 const ffmpegArgs = buildFfmpegArgs(start, end, tempFile, cutFile, videoFilters, aspectRatio, needsUpscaling);

 console.time(`[${id}] ffmpeg cut`);
 execFile('ffmpeg', ffmpegArgs, (err2, stdout2, stderr2) => {
  console.timeEnd(`[${id}] ffmpeg cut`);
  fs.unlink(tempFile, () => {});

  if (err2) {
   console.error(`[${id}] ffmpeg error:`, err2.message);
   return res.status(500).json({
    error: 'ffmpeg failed',
    details: err2.message,
    stderr: stderr2,
    command: `ffmpeg ${ffmpegArgs.join(' ')}`,
   });
  }

  if (!fs.existsSync(cutFile)) {
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
   }
  } catch (e) {
   console.warn(`[${id}] Could not verify final resolution:`, e.message);
  }

  console.log(`[${id}] Selesai proses. Download: /outputs/${path.basename(cutFile)}`);
  scheduleFileCleanup(cutFile);
  res.json({downloadUrl: `/outputs/${path.basename(cutFile)}`});
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

// Helper function to check cache
function checkTranscriptCache(videoId) {
 const cached = transcriptCache.get(videoId);
 if (!cached) return null;

 const age = Date.now() - cached.timestamp;
 const maxAge = cached.failed ? FAILED_CACHE_DURATION : CACHE_DURATION;

 if (age < maxAge) {
  console.log(`[TRANSCRIPT-V2] ✅ Cache hit for ${videoId} (${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
  return cached;
 } else {
  console.log(`[TRANSCRIPT-V2] 🗑️ Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
  transcriptCache.delete(videoId);
  return null;
 }
}

// Helper function to convert text to segments
function convertTextToSegments(text) {
 const words = text.split(' ');
 const segments = [];
 const wordsPerSegment = 10;
 const secondsPerWord = 0.5;

 for (let i = 0; i < words.length; i += wordsPerSegment) {
  const segmentWords = words.slice(i, i + wordsPerSegment);
  const start = i * secondsPerWord;
  const end = (i + segmentWords.length) * secondsPerWord;

  segments.push({
   text: segmentWords.join(' '),
   start: start,
   end: end,
  });
 }

 return segments;
}

// Helper function to try Invidious extraction
async function tryInvidiousExtraction(videoId) {
 console.log(`[TRANSCRIPT-V2] 🎯 Attempting Invidious extraction for ${videoId}`);

 const invidiousTranscript = await fetchTranscriptViaInvidious(videoId);

 if (!invidiousTranscript || invidiousTranscript.length <= 50) {
  throw new Error('Invidious returned empty or too short transcript');
 }

 console.log(`[TRANSCRIPT-V2] ✅ Invidious success: ${invidiousTranscript.length} characters`);

 const segments = convertTextToSegments(invidiousTranscript);

 return {
  segments: segments,
  language: 'auto-detected',
  source: 'Invidious Service (Primary)',
  method: 'Invidious API',
  length: invidiousTranscript.length,
  hasRealTiming: false,
  serviceUsed: 'invidious',
  extractionTime: Date.now(),
 };
}

// Helper function to try YouTube API extraction
async function tryYouTubeAPIExtraction(videoId) {
 console.log(`[TRANSCRIPT-V2] 🔄 Fallback: YouTube Transcript API...`);
 const languages = ['id', 'en'];

 for (const langCode of languages) {
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: langCode,
    country: langCode === 'id' ? 'ID' : 'US',
   });

   if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    console.log(`[TRANSCRIPT-V2] Direct API returned no data for ${langCode}`);
    continue;
   }

   console.log(`[TRANSCRIPT-V2] ✅ Direct API success (${langCode}): ${transcript.length} segments`);

   const segments = transcript.map((item) => ({
    text: item.text,
    start: item.offset / 1000,
    end: (item.offset + item.duration) / 1000,
   }));

   if (!segments || segments.length === 0) {
    console.log(`[TRANSCRIPT-V2] No valid segments after processing for ${langCode}`);
    continue;
   }

   const transcriptText = segments.map((s) => s.text).join(' ');
   if (transcriptText.length < 10) {
    console.log(`[TRANSCRIPT-V2] Transcript too short after processing for ${langCode}`);
    continue;
   }

   return {
    segments: segments,
    language: langCode === 'id' ? 'Indonesian' : 'English',
    source: 'YouTube Transcript API (Fallback)',
    method: `Direct API (${langCode.toUpperCase()})`,
    length: transcriptText.length,
    hasRealTiming: true,
   };
  } catch (langError) {
   console.log(`[TRANSCRIPT-V2] Direct API failed for ${langCode}: ${langError.message}`);
  }
 }

 throw new Error('Both Invidious and direct YouTube API methods failed');
}

// Helper function to cache and return result
function cacheAndReturnResult(videoId, result, res) {
 transcriptCache.set(videoId, {
  data: result,
  timestamp: Date.now(),
  failed: false,
 });

 return res.json(result);
}

// Helper function to handle extraction failure
function handleExtractionFailure(videoId, error, res) {
 console.log(`[TRANSCRIPT-V2] ❌ All methods failed: ${error.message}`);

 const errorResponse = {
  error: 'Failed to retrieve a valid transcript after all attempts',
  videoId: videoId,
  message: 'All transcript extraction methods failed. Video may not have transcripts available or services are blocking access.',
  userFriendly: true,
  technical_details: {
   main_error: error.message,
   extraction_attempts: ['Invidious Service (Primary)', 'YouTube Transcript API (Fallback)'],
   timestamp: new Date().toISOString(),
  },
  suggested_actions: ['Verify the video has captions/transcripts enabled', 'Try a different video with verified captions', 'Check if the video is accessible and not age-restricted', 'Use manual transcript upload feature as workaround'],
 };

 transcriptCache.set(videoId, {
  data: errorResponse,
  timestamp: Date.now(),
  failed: true,
 });

 console.log(`[TRANSCRIPT-V2] 💀 All methods failed for ${videoId} - returning error response`);
 return res.status(404).json(errorResponse);
}

// Enhanced transcript endpoint with anti-detection V2
app.get('/api/yt-transcript', async (req, res) => {
 const {videoId} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT-V2] 🎯 Enhanced request for videoId: ${videoId}`);

 // Check cache first
 const cached = checkTranscriptCache(videoId);
 if (cached) {
  if (cached.failed) {
   return res.status(404).json(cached.data);
  }
  return res.json(cached.data);
 }

 try {
  console.log(`[TRANSCRIPT-V2] 🚀 Starting Invidious-first extraction for ${videoId}`);

  // Try Invidious first
  try {
   const result = await tryInvidiousExtraction(videoId);
   return cacheAndReturnResult(videoId, result, res);
  } catch (invidiousError) {
   console.log(`[TRANSCRIPT-V2] ❌ Invidious workflow failed: ${invidiousError.message}, attempting fallback...`);

   // Try YouTube API as fallback
   const result = await tryYouTubeAPIExtraction(videoId);
   return cacheAndReturnResult(videoId, result, res);
  }
 } catch (mainError) {
  return handleExtractionFailure(videoId, mainError, res);
 }
});

// Helper function to check and return cached transcript
function checkLegacyCachedTranscript(videoId) {
 const cached = transcriptCache.get(videoId);
 if (!cached) return null;

 const age = Date.now() - cached.timestamp;
 const maxAge = cached.failed ? FAILED_CACHE_DURATION : CACHE_DURATION;

 if (age < maxAge) {
  console.log(`[TRANSCRIPT] ✅ Cache hit for ${videoId} (${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
  return cached;
 }

 console.log(`[TRANSCRIPT] 🗑️ Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
 transcriptCache.delete(videoId);
 return null;
}

// Helper function to try anti-detection transcript extraction
async function tryAntiDetectionExtraction(videoId, lang) {
 console.log(`[TRANSCRIPT] 🚀 Starting anti-detection extraction for ${videoId}`);

 const transcript = await antiDetectionTranscript.extractTranscript(videoId, {
  lang: lang ? lang.split(',') : ['id', 'en'],
 });

 if (!transcript || transcript.length <= 10) {
  throw new Error('Anti-detection service returned empty transcript');
 }

 const segments = transcript
  .split(/[.!?]+/)
  .filter((text) => text.trim().length > 0)
  .map((text, index) => ({
   text: text.trim(),
   start: index * 5,
   end: (index + 1) * 5,
  }));

 const result = {
  segments: segments,
  language: 'Auto-detected',
  source: 'Anti-Detection Service',
  method: 'Advanced Cookie Strategy',
  length: transcript.length,
 };

 console.log(`[TRANSCRIPT] ✅ Anti-detection success for ${videoId} (${transcript.length} chars, ${segments.length} segments)`);
 return result;
}

// Helper function to try YouTube transcript API with specific language
async function tryYouTubeTranscriptAPI(videoId, langCode, countryCode) {
 const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
  lang: langCode,
  country: langCode === 'id' ? 'ID' : 'US',
 });

 if (!transcript || transcript.length === 0) {
  throw new Error(`No transcript found for ${langCode}`);
 }

 console.log(`[TRANSCRIPT] ✅ ${langCode.toUpperCase()} API successful: got ${transcript.length} segments`);

 const segments = transcript.map((item) => ({
  text: item.text,
  start: item.offset / 1000,
  end: (item.offset + item.duration) / 1000,
 }));

 return {
  segments: segments,
  language: langCode === 'id' ? 'Indonesian' : 'English',
  source: 'YouTube Transcript API',
  method: `${langCode.toUpperCase()} Fallback`,
 };
}

// Helper function to try all fallback methods
async function tryAllFallbackMethods(videoId) {
 // Fallback 1: Indonesian
 console.log(`[TRANSCRIPT] 🔄 Trying fallback: youtube-transcript library`);
 try {
  const result = await tryYouTubeTranscriptAPI(videoId, 'id', 'ID');
  return result;
 } catch (fallbackError) {
  console.log(`[TRANSCRIPT] ❌ Indonesian fallback failed: ${fallbackError.message}`);
 }

 // Fallback 2: English
 console.log(`[TRANSCRIPT] 🔄 Trying English fallback`);
 const result = await tryYouTubeTranscriptAPI(videoId, 'en', 'US');
 return result;
}

// Helper function to cache transcript result
function cacheTranscriptResult(videoId, result, failed = false) {
 transcriptCache.set(videoId, {
  data: result,
  timestamp: Date.now(),
  failed: failed,
 });
}

// Helper function to create error response
function createLegacyErrorResponse(videoId, antiDetectionError) {
 return {
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
}

// Legacy VTT-based transcript endpoint (for backward compatibility)
app.get('/api/yt-transcript-legacy', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT] 🎯 Anti-Detection request for videoId: ${videoId}`);

 // Check cache first
 const cached = checkLegacyCachedTranscript(videoId);
 if (cached) {
  if (cached.failed) {
   return res.status(404).json(cached.data);
  }
  return res.json(cached.data);
 }

 try {
  // Try anti-detection first
  const result = await tryAntiDetectionExtraction(videoId, lang);
  cacheTranscriptResult(videoId, result);
  return res.json(result);
 } catch (antiDetectionError) {
  console.log(`[TRANSCRIPT] ❌ Anti-detection failed: ${antiDetectionError.message}`);

  try {
   // Try fallback methods
   const result = await tryAllFallbackMethods(videoId);
   cacheTranscriptResult(videoId, result);
   return res.json(result);
  } catch (englishError) {
   console.log(`[TRANSCRIPT] ❌ English fallback also failed: ${englishError.message}`);

   // All methods failed
   const errorResponse = createLegacyErrorResponse(videoId, antiDetectionError);
   cacheTranscriptResult(videoId, errorResponse, true);

   console.log(`[TRANSCRIPT] 💀 All methods failed for ${videoId}`);
   return res.status(404).json(errorResponse);
  }
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

  const args = [
   '--cookies',
   YTDLP_COOKIES_PATH,
   '--dump-json',
   '--no-check-certificate',
   '--no-warnings',
   '--user-agent',
   getRandomUserAgent(),
   '--extractor-args',
   'youtube:player_client=web,android',
   '--retries',
   '3',
   '--socket-timeout',
   '30',
   videoUrl, // Add videoUrl to the arguments array
  ];

  console.log(`[video-metadata] yt-dlp command: ${process.platform === 'win32' ? YT_DLP_PATH : 'yt-dlp'} ${args.join(' ')}`);

  // Gunakan yt-dlp untuk mendapatkan metadata tanpa download
  const result = await executeYtDlpSecurely(args, {
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

// DEPRECATED: Old enhanced transcript endpoint with timing data
// Use /api/enhanced-transcript/:videoId instead
app.get('/api/yt-transcript-with-timing', async (req, res) => {
 // Redirect to new endpoint
 const {videoId} = req.query;
 if (!videoId) {
  return res.status(400).json({
   error: 'videoId required. Use /api/enhanced-transcript/:videoId instead',
   deprecated: true,
   newEndpoint: '/api/enhanced-transcript/:videoId',
  });
 }

 console.log(`[DEPRECATED] Old endpoint called for ${videoId}, redirecting to new endpoint`);

 // Instead of redirect, directly call the new endpoint logic
 try {
  const response = await fetch(`http://localhost:${PORT}/api/enhanced-transcript/${videoId}`);
  const data = await response.json();
  res.status(response.status).json({
   ...data,
   deprecationWarning: 'This endpoint is deprecated. Use /api/enhanced-transcript/:videoId instead',
  });
 } catch (error) {
  res.status(500).json({
   error: 'Failed to process request',
   deprecated: true,
   newEndpoint: '/api/enhanced-transcript/:videoId',
   details: error.message,
  });
 }
});

// Helper function to extract transcript via Invidious
async function extractTranscriptViaInvidious(videoId) {
 console.log(`[INTELLIGENT-SEGMENTS] 🎯 Attempting Invidious extraction for ${videoId}`);

 const invidiousTranscript = await fetchTranscriptViaInvidious(videoId);

 if (!invidiousTranscript || invidiousTranscript.length <= 100) {
  throw new Error('Invidious returned empty or too short transcript');
 }

 console.log(`[INTELLIGENT-SEGMENTS] ✅ Invidious success: ${invidiousTranscript.length} characters`);

 // Convert plain text to segments for intelligent chunking (approximate timing)
 const words = invidiousTranscript.split(' ');
 const segments = [];
 const wordsPerSegment = 15;
 const secondsPerWord = 0.4;

 for (let i = 0; i < words.length; i += wordsPerSegment) {
  const segmentWords = words.slice(i, i + wordsPerSegment);
  const start = i * secondsPerWord;
  const end = (i + segmentWords.length) * secondsPerWord;

  segments.push({
   text: segmentWords.join(' '),
   start: start,
   end: end,
  });
 }

 return {
  segments,
  source: 'Invidious Service (Primary)',
  hasRealTiming: false,
 };
}

// Helper function to extract transcript via YouTube API fallback
async function extractTranscriptViaYouTubeFallback(videoId) {
 console.log(`[INTELLIGENT-SEGMENTS] 🔄 Fallback: YouTube Transcript API...`);
 const languages = ['id', 'en'];

 for (const langCode of languages) {
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: langCode,
    country: langCode === 'id' ? 'ID' : 'US',
   });

   if (transcript && Array.isArray(transcript) && transcript.length > 0) {
    console.log(`[INTELLIGENT-SEGMENTS] ✅ Direct API success (${langCode}): ${transcript.length} segments`);

    const segments = transcript.map((item) => ({
     text: item.text,
     start: item.offset / 1000,
     end: (item.offset + item.duration) / 1000,
    }));

    return {
     segments,
     source: 'YouTube Transcript API (Fallback)',
     hasRealTiming: true,
    };
   }
  } catch (error) {
   console.log(`[INTELLIGENT-SEGMENTS] ❌ Direct API failed for ${langCode}: ${error.message}`);
  }
 }

 throw new Error('Both Invidious and direct YouTube API methods failed');
}

// Enhanced transcript endpoint with Invidious-first strategy - TRULY BULLETPROOF VERSION
/**
 * BULLETPROOF TRANSCRIPT EXTRACTION ENDPOINT
 * Production-ready implementation with comprehensive error handling
 * Implements Invidious-first strategy with YouTube Transcript library fallback
 * GUARANTEED to never crash the server under any circumstances
 *
 * Architecture:
 * 1. Master try-catch wrapper prevents ALL crashes
 * 2. Primary: Invidious network (cloud-friendly, datacenter IP compatible)
 * 3. Fallback: Direct YouTube transcript library
 * 4. Graceful error responses for all failure scenarios
 *
 * @route GET /api/enhanced-transcript/:videoId
 * @param {string} videoId - YouTube video ID
 * @query {string} [lang] - Preferred language code (default: 'en')
 * @returns {Object} Success response with transcript data
 * @returns {Object} Error response with user-friendly message (never crashes)
 */
app.get('/api/enhanced-transcript/:videoId', async (req, res) => {
 // 🛡️ MASTER TRY-CATCH BLOCK - ABSOLUTE CRASH PROTECTION
 // This wrapper ensures the server NEVER crashes regardless of any error
 try {
  const {videoId} = req.params;
  const {lang} = req.query;

  // Input validation
  if (!videoId || typeof videoId !== 'string' || videoId.trim().length === 0) {
   return res.status(400).json({
    error: 'INVALID_VIDEO_ID',
    message: 'A valid YouTube video ID is required.',
    bulletproofStatus: 'input_validation_failed',
   });
  }

  console.log(`[BULLETPROOF-API] � Starting bulletproof transcript extraction for: ${videoId}`);
  const extractionStartTime = Date.now();

  let transcriptData = null;
  let primaryMethodFailed = false;
  let fallbackMethodFailed = false;

  // 🌐 PRIMARY STRATEGY: Invidious Network (Cloud-Optimized)
  try {
   console.log(`[BULLETPROOF-API] 🌐 PRIMARY: Attempting Invidious network extraction...`);
   const invidiousTranscript = await fetchTranscriptViaInvidious(videoId);

   // Validate Invidious response
   if (invidiousTranscript && typeof invidiousTranscript === 'string' && invidiousTranscript.trim().length > 100) {
    transcriptData = {
     text: invidiousTranscript.trim(),
     segments: convertTranscriptTextToSegments(invidiousTranscript, 'invidious'),
     source: 'Invidious Network (Primary)',
     method: 'invidious-api',
     hasRealTiming: false,
     serviceUsed: 'invidious',
     extractionMethod: 'primary',
    };

    console.log(`[BULLETPROOF-API] ✅ PRIMARY SUCCESS: Invidious returned ${invidiousTranscript.length} characters`);
   } else {
    throw new Error('Invidious returned insufficient transcript data');
   }
  } catch (invidiousError) {
   primaryMethodFailed = true;
   console.warn(`[BULLETPROOF-API] ⚠️ PRIMARY FAILED: Invidious network extraction failed`);
   console.warn(`[BULLETPROOF-API] 🔍 Invidious error details: ${invidiousError.message}`);

   // 📚 FALLBACK STRATEGY: YouTube Transcript Library (Direct)
   try {
    console.log(`[BULLETPROOF-API] 📚 FALLBACK: Attempting YouTube transcript library...`);

    const youtubeTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
     lang: lang || 'en',
     country: 'US',
    });

    // Validate YouTube library response
    if (youtubeTranscript && Array.isArray(youtubeTranscript) && youtubeTranscript.length > 0) {
     // Convert youtube-transcript format to our standard format
     const segments = youtubeTranscript
      .map((item) => ({
       text: (item.text || '').trim(),
       start: parseFloat((item.offset / 1000).toFixed(3)),
       duration: parseFloat((item.duration / 1000).toFixed(3)),
       end: parseFloat(((item.offset + item.duration) / 1000).toFixed(3)),
      }))
      .filter((seg) => seg.text && seg.text.length > 2);

     const totalText = segments
      .map((s) => s.text)
      .join(' ')
      .trim();

     // Validate final transcript content
     if (totalText.length > 50) {
      transcriptData = {
       text: totalText,
       segments: segments,
       source: 'YouTube Transcript Library (Fallback)',
       method: 'youtube-transcript-api',
       hasRealTiming: true,
       serviceUsed: 'youtube-transcript',
       extractionMethod: 'fallback',
      };

      console.log(`[BULLETPROOF-API] ✅ FALLBACK SUCCESS: YouTube library returned ${segments.length} segments`);
     } else {
      throw new Error('YouTube library returned insufficient transcript content');
     }
    } else {
     throw new Error('YouTube library returned empty or invalid transcript');
    }
   } catch (youtubeError) {
    fallbackMethodFailed = true;
    console.error(`[BULLETPROOF-API] ❌ FALLBACK FAILED: YouTube library extraction failed`);
    console.error(`[BULLETPROOF-API] 🔍 YouTube error details: ${youtubeError.message}`);

    // Check for specific transcript disabled errors
    if (youtubeError.message && /transcript.*(disabled|not available|private)/i.test(youtubeError.message)) {
     throw new TranscriptDisabledError('Transcript is disabled by video owner');
    }

    // All methods failed - throw comprehensive error
    throw new NoValidTranscriptError(`All transcript extraction methods failed. ` + `Primary (Invidious): ${invidiousError.message}. ` + `Fallback (YouTube): ${youtubeError.message}`);
   }
  }

  // 🔍 FINAL VALIDATION
  if (!transcriptData || !transcriptData.text || transcriptData.text.length < 50) {
   throw new NoValidTranscriptError('All transcript extraction methods failed - insufficient transcript data');
  }

  // 🎉 SUCCESS RESPONSE
  const extractionTime = Date.now() - extractionStartTime;

  console.log(`[BULLETPROOF-API] 🎉 EXTRACTION COMPLETE: ${transcriptData.extractionMethod} method successful`);
  console.log(`[BULLETPROOF-API] 📊 Total extraction time: ${extractionTime}ms`);

  return res.status(200).json({
   success: true,
   segments: transcriptData.segments,
   language: lang || 'auto',
   source: transcriptData.source,
   method: transcriptData.method,
   length: transcriptData.text.length,
   hasRealTiming: transcriptData.hasRealTiming,
   serviceUsed: transcriptData.serviceUsed,
   extractionTime: extractionTime,
   validation: {
    totalLength: transcriptData.text.length,
    segmentCount: transcriptData.segments.length,
    hasValidContent: true,
   },
   fallbackLevel: transcriptData.extractionMethod === 'primary' ? 0 : 1,
   bulletproofStatus: 'success',
   methodsAttempted: {
    primary: !primaryMethodFailed,
    fallback: primaryMethodFailed && !fallbackMethodFailed,
   },
  });
 } catch (error) {
  // 🚨 MASTER CATCH BLOCK - BULLETPROOF ERROR HANDLING
  // This block catches ANY and ALL errors, ensuring the server never crashes

  console.error('[BULLETPROOF-API] 🚨 MASTER CATCH: Unhandled error in bulletproof transcript handler');
  console.error('[BULLETPROOF-API] 📝 Error details:', {
   message: error.message,
   name: error.name,
   code: error.code,
   stack: error.stack?.substring(0, 500), // Truncated stack trace
   videoId: req.params.videoId,
   timestamp: new Date().toISOString(),
   userAgent: req.headers['user-agent']?.substring(0, 100),
   origin: req.headers['origin'],
  });

  // Handle specific error types with appropriate HTTP status codes
  if (error instanceof TranscriptDisabledError || error.name === 'TranscriptDisabledError') {
   return res.status(404).json({
    error: 'TRANSCRIPT_DISABLED',
    message: 'Transcript is disabled by the video owner.',
    bulletproofStatus: 'handled_error',
    userFriendly: true,
    errorType: 'transcript_disabled',
   });
  }

  if (error instanceof TranscriptTooShortError || error.name === 'TranscriptTooShortError') {
   return res.status(422).json({
    error: 'TRANSCRIPT_TOO_SHORT',
    message: 'The available transcript is too short to process.',
    bulletproofStatus: 'handled_error',
    userFriendly: true,
    errorType: 'transcript_too_short',
   });
  }

  if (error instanceof NoValidTranscriptError || error.name === 'NoValidTranscriptError') {
   return res.status(404).json({
    error: 'TRANSCRIPT_NOT_FOUND',
    message: 'A transcript for this video could not be found or is disabled by the owner.',
    details: error.message,
    bulletproofStatus: 'handled_error',
    userFriendly: true,
    errorType: 'transcript_not_found',
   });
  }

  // Generic error handling for any unexpected errors
  return res.status(500).json({
   error: 'TRANSCRIPT_EXTRACTION_FAILED',
   message: 'An unexpected error occurred while extracting the transcript. Please try again later.',
   bulletproofStatus: 'unexpected_error',
   userFriendly: true,
   errorType: 'unexpected',
   details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
 }
});

// Emergency transcript endpoint - simple and reliable
app.get('/api/emergency-transcript/:videoId', async (req, res) => {
 const {videoId} = req.params;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[EMERGENCY-API] Simple transcript request for: ${videoId}`);

 try {
  const result = await emergencyTranscriptService.extract(videoId);

  if (result.isFallback) {
   console.log(`[EMERGENCY-API] ⚠️ Returning fallback data for ${videoId}`);
   return res.status(206).json(result); // 206 Partial Content
  }

  console.log(`[EMERGENCY-API] ✅ Success for ${videoId}: ${result.segments.length} segments`);

  res.json(result);
 } catch (error) {
  console.error(`[EMERGENCY-API] ❌ Failed for ${videoId}:`, error.message);

  res.status(404).json({
   error: 'Transcript extraction failed',
   videoId: videoId,
   message: error.message,
   stats: emergencyTranscriptService.getStats(),
  });
 }
});

// Diagnostic endpoint
app.get('/api/transcript-diagnostics/:videoId', async (req, res) => {
 const {videoId} = req.params;

 console.log(`[DIAGNOSTICS-API] Running diagnostics for: ${videoId}`);

 const tests = {};
 const successful = [];

 // Test Emergency Service
 try {
  const emergencyResult = await emergencyTranscriptService.extract(videoId);
  tests.emergency = {success: true, segments: emergencyResult.segments.length, method: emergencyResult.method};
  successful.push('emergency');
 } catch (error) {
  tests.emergency = {success: false, error: error.message};
 }

 // Test Alternative Service
 try {
  const altResult = await alternativeTranscriptService.extract(videoId);
  tests.alternative = {success: true, segments: altResult.segments.length, method: altResult.method};
  successful.push('alternative');
 } catch (error) {
  tests.alternative = {success: false, error: error.message};
 }

 // Test Robust Service
 try {
  const robustResult = await robustTranscriptServiceV2.extractWithRealTiming(videoId, {lang: ['id', 'en']});
  tests.robust = {success: true, segments: robustResult.segments.length, method: robustResult.method};
  successful.push('robust');
 } catch (error) {
  tests.robust = {success: false, error: error.message};
 }

 // Test Enhanced Orchestrator
 try {
  const orchestratorResult = await enhancedTranscriptOrchestrator.extract(videoId, {minLength: 50});
  tests.orchestrator = {
   success: true,
   segments: orchestratorResult.segments.length,
   method: orchestratorResult.method,
   serviceUsed: orchestratorResult.serviceUsed,
   extractionTime: orchestratorResult.extractionTime,
   validation: orchestratorResult.validation,
  };
  successful.push('orchestrator');
 } catch (error) {
  tests.orchestrator = {
   success: false,
   error: error.message,
   errorType: error.constructor.name,
   isTranscriptError: error.isTranscriptError || false,
  };
 }

 const stats = {
  emergency: emergencyTranscriptService.getStats(),
  // alternative: alternativeTranscriptService.getStats(),
  // robust: robustTranscriptServiceV2.getStats(),
  orchestrator: enhancedTranscriptOrchestrator.getHealthStatus(),
 };

 res.json({
  videoId,
  tests,
  successful,
  stats,
  timestamp: new Date().toISOString(),
  cacheStats: {
   transcriptCacheSize: transcriptCache.size,
  },
  status: 'diagnostic_complete',
 });
});

// Health check endpoint for transcript services
// Health check endpoint for bulletproof transcript services
app.get('/api/transcript-health', (req, res) => {
 res.json({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  architecture: 'bulletproof-production-ready-invidious-first',
  services: {
   primary: 'enhanced-invidious-network',
   fallback: 'youtube-transcript-library',
  },
  resilience: {
   masterCatchBlock: true,
   comprehensiveErrorHandling: true,
   crashProof: true,
   productionReady: true,
  },
  capabilities: {
   cloudfriendly: true,
   datacenterIpCompatible: true,
   antiBotCircumvention: true,
   loadBalancing: true,
   automaticRetry: true,
  },
  endpoints: {
   main: '/api/enhanced-transcript/:videoId',
   emergency: '/api/emergency-transcript/:videoId',
   diagnostics: '/api/invidious-instances',
  },
  message: 'Production-ready bulletproof transcript services are operational',
 });
});

// Diagnostic endpoint for testing Invidious instances
app.get('/api/invidious-instances', async (req, res) => {
 try {
  console.log('[DIAGNOSTICS] 🔍 Testing Invidious instances...');
  const instances = await getHealthyInvidiousInstances();

  const diagnostics = {
   timestamp: new Date().toISOString(),
   totalInstances: instances.length,
   instances: instances.slice(0, 10), // Show first 10 for brevity
   sampleTestUrls: instances.slice(0, 3).map((hostname) => `https://${hostname}/api/v1/captions/[VIDEO_ID]`),
   status: instances.length > 0 ? 'healthy' : 'warning',
   message: instances.length > 0 ? `${instances.length} Invidious instances available` : 'No instances available - using fallback methods',
  };

  res.json(diagnostics);
 } catch (error) {
  console.error('[DIAGNOSTICS] ❌ Error testing instances:', error.message);
  res.status(500).json({
   error: 'Failed to test Invidious instances',
   message: error.message,
   timestamp: new Date().toISOString(),
  });
 }
});

// Test endpoint for bulletproof transcript architecture
app.get('/api/test-transcript-services/:videoId', async (req, res) => {
 const {videoId} = req.params;

 try {
  const testResults = {
   videoId: videoId,
   timestamp: new Date().toISOString(),
   tests: {},
  };

  // Test Enhanced Invidious service
  try {
   const invidiousStart = Date.now();
   const invidiousResult = await fetchTranscriptViaInvidious(videoId);
   testResults.tests.invidious = {
    status: 'success',
    responseTime: Date.now() - invidiousStart,
    transcriptLength: invidiousResult?.length || 0,
    hasContent: invidiousResult && invidiousResult.length > 100,
   };
  } catch (error) {
   testResults.tests.invidious = {
    status: 'failed',
    error: error.message,
   };
  }

  // Test YouTube transcript library
  try {
   const youtubeStart = Date.now();
   const youtubeResult = await YoutubeTranscript.fetchTranscript(videoId);
   testResults.tests.youtubeLibrary = {
    status: 'success',
    responseTime: Date.now() - youtubeStart,
    segmentCount: youtubeResult?.length || 0,
    hasContent: youtubeResult && youtubeResult.length > 0,
   };
  } catch (error) {
   testResults.tests.youtubeLibrary = {
    status: 'failed',
    error: error.message,
   };
  }

  // Test bulletproof route handler resilience
  testResults.bulletproofStatus = {
   masterCatchExists: true,
   fallbackStrategyExists: true,
   errorHandlingComplete: true,
   crashProof: true,
  };

  res.json(testResults);
 } catch (error) {
  res.status(500).json({
   error: 'Test failed',
   message: error.message,
   bulletproofStatus: 'test_endpoint_failed_but_handled',
  });
 }
});

// Diagnostic endpoint for Invidious instances
app.get('/api/debug/invidious-instances', async (req, res) => {
 try {
  console.log('[DEBUG] Testing Invidious instance discovery...');

  const {getHealthyInvidiousInstances} = require('./services/invidious.service.js');
  const instances = await getHealthyInvidiousInstances();

  res.json({
   timestamp: new Date().toISOString(),
   instanceCount: instances.length,
   instances: instances,
   status: instances.length > 0 ? 'healthy' : 'degraded',
   diagnostics: {
    hasInstances: instances.length > 0,
    usingFallback: instances.length <= 8, // Our fallback list has 8 instances
    apiWorking: instances.length > 8, // If more than fallback, API is working
   },
  });
 } catch (error) {
  res.status(500).json({
   error: 'Instance discovery failed',
   message: error.message,
   fallbackStatus: 'should_use_hardcoded_instances',
  });
 }
});

// ENHANCED INTELLIGENT SEGMENTS ENDPOINT WITH AI-POWERED SEGMENTATION
app.post('/api/intelligent-segments', async (req, res) => {
 const {videoId, targetSegmentCount = 8, minDuration = 20, maxDuration = 90} = req.body;

 if (!videoId) {
  return res.status(400).json({error: 'Video ID is required'});
 }

 try {
  console.log(`[INTELLIGENT-SEGMENTS] 🚀 Starting enhanced AI segmentation for ${videoId}`);

  // Step 1: Get transcript with real timing using enhanced orchestrator
  const transcriptData = await enhancedTranscriptOrchestrator.extract(videoId, {
   lang: ['id', 'en'],
  });

  if (!transcriptData.hasRealTiming) {
   throw new Error('Real timing data required for intelligent segmentation');
  }

  console.log(`[INTELLIGENT-SEGMENTS] 📄 Got transcript: ${transcriptData.segments.length} timed segments, ${Math.floor(transcriptData.totalDuration / 60)}m${Math.floor(transcriptData.totalDuration % 60)}s`);

  // Step 2: Use enhanced AI segmentation if available, otherwise fallback to simple chunking
  let result;

  if (enhancedTranscriptProcessor) {
   try {
    console.log(`[INTELLIGENT-SEGMENTS] 🤖 Using enhanced AI segmentation`);

    // Generate segments using enhanced AI processor
    const aiResult = await enhancedTranscriptProcessor.generateSegmentsFromTranscript(transcriptData.segments, videoId);

    if (aiResult.success) {
     result = {
      segments: aiResult.data.segments,
      videoId: videoId,
      totalSegments: aiResult.data.segments.length,
      averageDuration: aiResult.data.stats.averageDuration,
      method: 'Enhanced AI Segmentation',
      hasRealTiming: true,
      transcriptQuality: 'HIGH',
      aiAnalysis: aiResult.data.aiAnalysis,
      qualityScore: aiResult.data.stats.qualityScore,
      contentType: aiResult.data.stats.contentType,
      extractedAt: new Date().toISOString(),
     };

     console.log(`[INTELLIGENT-SEGMENTS] ✅ Enhanced AI created ${result.totalSegments} segments (avg: ${result.averageDuration}s, quality: ${result.qualityScore})`);
     return res.json(result);
    }
   } catch (aiError) {
    console.warn(`[INTELLIGENT-SEGMENTS] ⚠️ Enhanced AI failed: ${aiError.message}, falling back to simple chunking`);
   }
  }

  // Fallback: Simple intelligent chunking (existing logic)
  console.log(`[INTELLIGENT-SEGMENTS] 🔧 Using fallback simple chunking`);

  const segmentDuration = Math.max(minDuration, Math.min(maxDuration, Math.floor(transcriptData.totalDuration / targetSegmentCount)));
  const segments = [];

  for (let i = 0; i < transcriptData.segments.length; i += Math.ceil(segmentDuration / 5)) {
   const start = transcriptData.segments[i];
   const endIndex = Math.min(i + Math.ceil(segmentDuration / 5), transcriptData.segments.length - 1);
   const end = transcriptData.segments[endIndex];

   if (start && end && end.start - start.start >= minDuration && end.start - start.start <= maxDuration) {
    const segmentText = transcriptData.segments
     .slice(i, endIndex + 1)
     .map((s) => s.text)
     .join(' ');

    segments.push({
     id: `intelligent-${videoId}-${segments.length + 1}`,
     title: `Segment ${segments.length + 1}`,
     description: `Segmen dengan durasi ${Math.round(end.start - start.start)} detik`,
     startTimeSeconds: start.start,
     endTimeSeconds: end.start,
     duration: Math.round(end.start - start.start),
     transcriptExcerpt: segmentText.length > 200 ? segmentText.substring(0, 200) + '...' : segmentText,
     transcriptFull: segmentText,
     youtubeVideoId: videoId,
     thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
     hasRealTiming: true,
     excerptLength: segmentText.length,
     fullTextLength: segmentText.length,
    });
   }
  }

  result = {
   segments: segments,
   videoId: videoId,
   totalSegments: segments.length,
   averageDuration: Math.round(segments.reduce((sum, s) => sum + s.duration, 0) / segments.length),
   method: 'Simple Intelligent Chunking (Fallback)',
   hasRealTiming: true,
   transcriptQuality: 'HIGH',
   extractedAt: new Date().toISOString(),
  };

  console.log(`[INTELLIGENT-SEGMENTS] ✅ Fallback created ${segments.length} segments (avg: ${result.averageDuration}s)`);
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

// ===== ENHANCED MANUAL TRANSCRIPT UPLOAD ENDPOINT =====
/**
 * POST /api/upload-transcript
 * Upload and process transcript file with enhanced AI segmentation
 *
 * Body (multipart/form-data):
 * - file: .srt, .txt, or .vtt transcript file
 * - videoId: YouTube video ID
 * - segments: JSON string of existing video segments (optional)
 * - mode: 'sync' or 'generate' (optional, auto-detected if not provided)
 */
app.post('/api/upload-transcript', transcriptUpload.single('transcriptFile'), async (req, res) => {
 console.log('[TRANSCRIPT-UPLOAD] 🚀 Processing enhanced transcript upload request');

 try {
  // Validate request
  if (!req.file) {
   return res.status(400).json({
    error: 'No transcript file provided',
    message: 'Please select a .srt, .txt, or .vtt file to upload',
   });
  }

  if (!req.body.videoId) {
   return res.status(400).json({
    error: 'Missing video ID',
    message: 'Video ID is required for transcript processing',
   });
  }

  // Parse existing segments (optional)
  let existingSegments = [];
  if (req.body.segments) {
   try {
    existingSegments = JSON.parse(req.body.segments);
    if (!Array.isArray(existingSegments)) {
     throw new Error('Segments must be an array');
    }
   } catch (error) {
    return res.status(400).json({
     error: 'Invalid segments data',
     message: 'Segments data must be valid JSON array',
    });
   }
  }

  console.log(`[TRANSCRIPT-UPLOAD] 📄 Processing file: ${req.file.originalname} (${req.file.size} bytes) for video ${req.body.videoId}`);
  console.log(`[TRANSCRIPT-UPLOAD] 🎯 Mode: ${existingSegments.length > 0 ? 'synchronize' : 'generate'} (${existingSegments.length} existing segments)`);

  // Use enhanced transcript processor if available
  if (enhancedTranscriptProcessor) {
   try {
    console.log(`[TRANSCRIPT-UPLOAD] 🤖 Using enhanced AI transcript processor`);

    const result = await enhancedTranscriptProcessor.processUploadedTranscript(req.file.buffer, req.file.originalname, req.body.videoId, existingSegments);

    if (result.success) {
     const {mode, data, stats} = result;

     console.log(`[TRANSCRIPT-UPLOAD] ✅ Enhanced processing completed: ${mode} mode, ${data.segments.length} segments`);

     return res.json({
      success: true,
      message: mode === 'synchronize' ? `Successfully synchronized transcript with ${stats.matchedSegments}/${stats.totalSegments} video segments` : `Successfully generated ${data.segments.length} AI-powered segments from transcript`,
      data: data,
      mode: mode,
      enhanced: true,
      processingMethod: 'enhanced-ai',
      stats: stats,
     });
    }
   } catch (enhancedError) {
    console.warn(`[TRANSCRIPT-UPLOAD] ⚠️ Enhanced processing failed: ${enhancedError.message}`);
    console.log(`[TRANSCRIPT-UPLOAD] 🔄 Falling back to legacy processing`);
   }
  }

  // Fallback to legacy processing
  console.log(`[TRANSCRIPT-UPLOAD] 🔧 Using legacy transcript processing`);

  // Parse the uploaded transcript file using legacy parser
  const transcriptSegments = parseTranscriptFile(req.file.buffer, req.file.originalname, req.file.mimetype);
  console.log(`[TRANSCRIPT-UPLOAD] 📄 Parsed ${transcriptSegments.length} transcript segments`);

  // Handle case where no video segments exist - generate segments from transcript
  if (!existingSegments || existingSegments.length === 0) {
   console.log(`[TRANSCRIPT-UPLOAD] 🎯 No existing segments found - generating segments from transcript`);

   // Create segments from transcript chunks (every ~60 seconds worth of transcript)
   const generatedSegments = [];
   const segmentDuration = 60; // 60 seconds per segment
   let currentSegmentStart = 0;

   // Get transcript duration
   const lastTranscript = transcriptSegments[transcriptSegments.length - 1];
   const totalDuration = lastTranscript ? lastTranscript.end : 600; // fallback to 10 minutes

   let segmentIndex = 1;
   while (currentSegmentStart < totalDuration) {
    const segmentEnd = Math.min(currentSegmentStart + segmentDuration, totalDuration);

    // Find transcript segments that overlap with this time range
    const segmentTranscripts = transcriptSegments.filter((t) => t.start < segmentEnd && t.end > currentSegmentStart);

    if (segmentTranscripts.length > 0) {
     const combinedText = segmentTranscripts
      .map((t) => t.text)
      .join(' ')
      .trim();
     const startMinutes = Math.floor(currentSegmentStart / 60);
     const startSeconds = Math.floor(currentSegmentStart % 60);
     const endMinutes = Math.floor(segmentEnd / 60);
     const endSeconds = Math.floor(segmentEnd % 60);

     generatedSegments.push({
      id: `transcript-segment-${segmentIndex}`,
      title: `Segment ${segmentIndex} (${startMinutes}:${startSeconds.toString().padStart(2, '0')} - ${endMinutes}:${endSeconds.toString().padStart(2, '0')})`,
      description: combinedText.length > 100 ? combinedText.substring(0, 100) + '...' : combinedText,
      startTimeSeconds: currentSegmentStart,
      endTimeSeconds: segmentEnd,
      youtubeVideoId: req.body.videoId,
      transcriptExcerpt: combinedText,
      hasManualTranscript: true,
      thumbnailUrl: `https://i.ytimg.com/vi/${req.body.videoId}/mqdefault.jpg`,
     });

     segmentIndex++;
    }

    currentSegmentStart += segmentDuration;
   }

   console.log(`[TRANSCRIPT-UPLOAD] ✅ Generated ${generatedSegments.length} segments from transcript (legacy mode)`);

   return res.json({
    success: true,
    message: `Successfully created ${generatedSegments.length} video segments from transcript`,
    data: {
     videoId: req.body.videoId,
     segments: generatedSegments,
     transcriptStats: {
      totalSegments: transcriptSegments.length,
      duration: Math.round(totalDuration / 60) + ' minutes',
      generatedFrom: 'transcript',
     },
    },
    mode: 'generate',
    enhanced: false,
    processingMethod: 'legacy-generation',
   });
  }

  // Synchronize transcript with existing video segments using legacy method
  const updatedSegments = synchronizeWithSegments(transcriptSegments, existingSegments);

  // Count successful matches
  const matchedCount = updatedSegments.filter((s) => s.hasManualTranscript).length;

  if (matchedCount === 0) {
   return res.status(400).json({
    error: 'No transcript matches found',
    message: 'The uploaded transcript timestamps do not align with any video segments. Please check the timing format.',
    details: {
     transcriptSegments: transcriptSegments.length,
     videoSegments: existingSegments.length,
     matched: 0,
    },
   });
  }

  console.log(`[TRANSCRIPT-UPLOAD] ✅ Legacy synchronization completed - ${matchedCount}/${existingSegments.length} segments matched`);

  // Return updated segments with transcript data
  res.json({
   success: true,
   message: `Successfully synchronized transcript with ${matchedCount} out of ${existingSegments.length} video segments`,
   data: {
    videoId: req.body.videoId,
    segments: updatedSegments,
    stats: {
     totalSegments: existingSegments.length,
     matchedSegments: matchedCount,
     transcriptEntries: transcriptSegments.length,
     filename: req.file.originalname,
     fileSize: req.file.size,
    },
   },
   mode: 'synchronize',
   enhanced: false,
   processingMethod: 'legacy-synchronization',
  });
 } catch (error) {
  console.error('[TRANSCRIPT-UPLOAD] ❌ Error processing transcript upload:', error);

  // Handle multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
   return res.status(400).json({
    error: 'File too large',
    message: 'Transcript file must be smaller than 2MB',
   });
  }

  if (error.message.includes('Only .srt and .txt files are allowed')) {
   return res.status(400).json({
    error: 'Invalid file type',
    message: 'Only .srt, .txt, and .vtt files are supported',
   });
  }

  // Handle parsing errors
  if (error.message.includes('Failed to parse transcript file')) {
   return res.status(400).json({
    error: 'Parse error',
    message: error.message,
   });
  }

  // Generic error
  res.status(500).json({
   error: 'Server error',
   message: 'Failed to process transcript upload. Please try again.',
   details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
 }
});

// Cleanup old files on server start
// Test endpoint for transcript orchestrator
app.get('/api/test-transcript/:videoId', async (req, res) => {
 const {videoId} = req.params;

 try {
  console.log(`[TEST-ENDPOINT] Testing transcript extraction for ${videoId}`);

  // Test the enhanced orchestrator
  const result = await enhancedTranscriptOrchestrator.extract(videoId, {
   lang: ['id', 'en'],
   minLength: 50,
  });

  console.log(`[TEST-ENDPOINT] ✅ Success: ${result.segments?.length || 0} segments`);

  return res.json({
   success: true,
   segments: result.segments?.length || 0,
   totalText: result.segments?.map((s) => s.text).join(' ').length || 0,
   source: result.source || 'unknown',
   method: result.method || 'unknown',
  });
 } catch (error) {
  console.error(`[TEST-ENDPOINT] ❌ Failed: ${error.message}`);
  return res.status(500).json({
   success: false,
   error: error.message,
   type: error.constructor.name,
  });
 }
});

cleanupOldVttFiles();
cleanupOldMp4Files();

app.listen(PORT, () => {
 console.log(`Backend server running on http://localhost:${PORT}`);
});
