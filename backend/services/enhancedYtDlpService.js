const ytDlpExec = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const AdvancedBotBypass = require('./advancedBotBypass');
const AzureCookieManager = require('./azureCookieManager');
const EnhancedRateLimiter = require('./enhancedRateLimiter');

/**
 * Enhanced YT-DLP Wrapper with Comprehensive Azure Production Support
 *
 * This service provides sophisticated bot detection bypass, intelligent rate limiting,
 * and comprehensive cookie management to handle YouTube's aggressive anti-bot measures
 * in Azure production environment.
 */
class EnhancedYtDlpService {
 constructor() {
  this.botBypass = new AdvancedBotBypass();
  this.cookieManager = new AzureCookieManager();
  this.rateLimiter = new EnhancedRateLimiter();

  this.cookiesPath = path.join(__dirname, '..', 'cookies.txt');
  this.tempDir = path.join(__dirname, '..', 'temp');

  // Ensure temp directory exists
  if (!fs.existsSync(this.tempDir)) {
   fs.mkdirSync(this.tempDir, {recursive: true});
  }

  // Initialize cookie management
  this.initializeCookieManagement();
 }

 /**
  * Initialize cookie management for Azure environment
  */
 async initializeCookieManagement() {
  try {
   console.log('[ENHANCED-YTDLP] 🍪 Initializing Azure cookie management...');

   // Validate existing cookies
   if (fs.existsSync(this.cookiesPath)) {
    const isValid = await this.cookieManager.validateCookies(this.cookiesPath);
    if (!isValid) {
     console.log('[ENHANCED-YTDLP] ⚠️  Invalid cookies detected, attempting refresh...');
     await this.cookieManager.refreshCookies(this.cookiesPath);
    } else {
     console.log('[ENHANCED-YTDLP] ✅ Cookie validation passed');
    }
   } else {
    console.log('[ENHANCED-YTDLP] ⚠️  No cookies file found, will use cookieless mode');
   }
  } catch (error) {
   console.log('[ENHANCED-YTDLP] ❌ Cookie initialization failed:', error.message);
  }
 }

 /**
  * Extract transcript with comprehensive production-ready protection
  */
 async extractTranscript(videoId, options = {}) {
  const {language = 'en', maxAttempts = 4, useAdvancedBypass = true, preferredFormat = 'vtt'} = options;

  console.log(`[ENHANCED-YTDLP] 🚀 Starting comprehensive extraction for ${videoId}`);

  // Check rate limiting first
  const rateLimitCheck = await this.rateLimiter.checkRateLimit(videoId, 'transcript');
  if (!rateLimitCheck.allowed) {
   throw new Error(`Rate limit exceeded: ${rateLimitCheck.message}. Wait ${Math.ceil(rateLimitCheck.waitTime / 1000)} seconds.`);
  }

  if (!useAdvancedBypass) {
   return this.standardExtraction(videoId, language, preferredFormat);
  }

  // Validate and refresh cookies if needed
  await this.ensureValidCookies();

  // Generate multiple bypass configurations with cookie integration
  const configs = this.botBypass.generateFallbackConfigs({
   cookiesPath: this.cookiesPath,
   useCookies: fs.existsSync(this.cookiesPath),
  });

  // Enhance configs with anti-detection measures
  const enhancedConfigs = configs.map((config) => ({
   ...config,
   ...this.cookieManager.getAntiDetectionArgs(),
   userAgent: this.cookieManager.getUserAgent(),
  }));

  let lastError = null;
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
   const configIndex = (attempt - 1) % enhancedConfigs.length;
   const config = enhancedConfigs[configIndex];

   try {
    console.log(`[ENHANCED-YTDLP] 🔄 Attempt ${attempt}/${maxAttempts} using ${config.clientConfig}`);

    const result = await this.attemptExtraction(videoId, language, preferredFormat, config, attempt);

    // Log successful attempt
    const logEntry = this.botBypass.logBypassAttempt(config, attempt, true);
    attempts.push(logEntry);

    // Record success in rate limiter
    this.rateLimiter.recordSuccess(videoId);

    console.log(`[ENHANCED-YTDLP] ✅ Success with ${config.clientConfig} on attempt ${attempt}`);

    return {
     ...result,
     bypassMethod: config.clientConfig,
     attemptNumber: attempt,
     totalAttempts: attempts.length,
     rateLimiterStats: this.rateLimiter.getStats(),
    };
   } catch (error) {
    lastError = error;

    // Log failed attempt
    const logEntry = this.botBypass.logBypassAttempt(config, attempt, false, error);
    attempts.push(logEntry);

    // Record failure in rate limiter
    this.rateLimiter.recordFailure(videoId, error);

    if (this.botBypass.isBotDetectionError(error)) {
     console.log(`[ENHANCED-YTDLP] 🤖 Bot detection on attempt ${attempt}, trying next config...`);

     // Try to refresh cookies on bot detection
     if (attempt === Math.floor(maxAttempts / 2)) {
      console.log('[ENHANCED-YTDLP] 🍪 Mid-attempt cookie refresh...');
      await this.cookieManager.smartRefresh(this.cookiesPath);
     }

     // Wait before next attempt (with exponential backoff)
     if (attempt < maxAttempts) {
      const delay = this.botBypass.getRetryDelay(attempt);
      console.log(`[ENHANCED-YTDLP] ⏰ Waiting ${Math.round(delay / 1000)}s before next attempt...`);
      await this.sleep(delay);
     }
    } else {
     console.log(`[ENHANCED-YTDLP] ❌ Non-bot error on attempt ${attempt}:`, error.message);
    }
   }
  }

  // All attempts failed
  console.log(`[ENHANCED-YTDLP] ❌ All ${maxAttempts} attempts failed`);
  console.log('[ENHANCED-YTDLP] 📊 Final rate limiter stats:', this.rateLimiter.getStats());

  throw new Error(`Comprehensive extraction failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
 }

 /**
  * Ensure cookies are valid and refresh if needed
  */
 async ensureValidCookies() {
  try {
   if (!fs.existsSync(this.cookiesPath)) {
    console.log('[ENHANCED-YTDLP] ⚠️  No cookies file found, proceeding without cookies');
    return;
   }

   const isValid = await this.cookieManager.validateCookies(this.cookiesPath);
   if (!isValid) {
    console.log('[ENHANCED-YTDLP] 🔄 Refreshing invalid cookies...');
    await this.cookieManager.smartRefresh(this.cookiesPath);
   }
  } catch (error) {
   console.log('[ENHANCED-YTDLP] ⚠️  Cookie validation failed:', error.message);
  }
 }

 /**
  * Attempt transcript extraction with enhanced Azure-compatible configuration
  */
 async attemptExtraction(videoId, language, format, config, attemptNumber) {
  const outputPath = path.join(this.tempDir, `${videoId}_${attemptNumber}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Build comprehensive yt-dlp options with Azure optimizations
  const options = {
   writeAutoSub: true,
   subFormat: format,
   subLang: language,
   skipDownload: true,
   output: outputPath,
   userAgent: config.userAgent,
   retries: 2, // Reduced for faster failover
   fragmentRetries: 3, // Reduced for faster failover
   extractorRetries: 2, // Reduced for faster failover
   sleepInterval: 2, // Reduced for faster processing
   maxSleepInterval: 5, // Reduced for faster processing
   sleepSubtitles: 1, // Reduced for faster processing
   socketTimeout: 20, // Reduced for Azure timeout constraints
   sourceAddress: '0.0.0.0',
   geoBypass: true,
   geoBypassCountry: 'US',
   forceIpv4: true,
   noCheckCertificate: true,
   noWarnings: true,
   preferFreeFormats: true, // Prioritize accessible formats
   noPlaylist: true, // Prevent playlist expansion
   ignoreErrors: false, // We want to catch errors
   ...config.additionalArgs, // Spread additional anti-detection args
  };

  // Parse extractor args from config
  if (config.extractorArgs) {
   options.extractorArgs = config.extractorArgs;
  }

  // Add cookies if supported and available
  if (config.supportsCookies && fs.existsSync(this.cookiesPath)) {
   options.cookies = this.cookiesPath;
   console.log(`[ENHANCED-YTDLP] 🍪 Using cookies for attempt ${attemptNumber}`);
  }

  console.log(`[ENHANCED-YTDLP] 🔧 Executing with config: ${config.clientConfig}, UA: ${config.userAgent.substring(0, 50)}...`);

  // Execute yt-dlp with comprehensive error handling
  try {
   await ytDlpExec(url, options);
  } catch (ytdlpError) {
   // Enhanced error analysis for Azure environment
   const errorMessage = ytdlpError.message || ytdlpError.toString();

   if (errorMessage.includes('Sign in to confirm')) {
    throw new Error(`Bot detection triggered: ${errorMessage}`);
   } else if (errorMessage.includes('rate limit')) {
    throw new Error(`Rate limiting detected: ${errorMessage}`);
   } else if (errorMessage.includes('No video formats found')) {
    throw new Error(`Video access denied: ${errorMessage}`);
   } else {
    throw new Error(`yt-dlp execution failed: ${errorMessage}`);
   }
  }

  // Look for generated subtitle files with enhanced search
  const possibleFiles = [
   path.join(this.tempDir, `${videoId}_${attemptNumber}.${language}.${format}`),
   path.join(this.tempDir, `${videoId}_${attemptNumber}.${format}`),
   path.join(this.tempDir, `${videoId}.${language}.${format}`),
   path.join(this.tempDir, `${videoId}.${format}`),
   // Additional patterns for auto-generated subtitles
   path.join(this.tempDir, `${videoId}_${attemptNumber}.${language}.live_chat.${format}`),
   path.join(this.tempDir, `${videoId}_${attemptNumber}.live_chat.${format}`),
  ];

  let subtitleContent = null;

  for (const filePath of possibleFiles) {
   if (fs.existsSync(filePath)) {
    subtitleContent = fs.readFileSync(filePath, 'utf-8');

    // Clean up the file immediately
    try {
     fs.unlinkSync(filePath);
    } catch (cleanupError) {
     console.log(`[ENHANCED-YTDLP] ⚠️  Could not clean up ${filePath}:`, cleanupError.message);
    }
    break;
   }
  }

  if (!subtitleContent) {
   throw new Error(`No subtitle file found. Expected one of: ${possibleFiles.join(', ')}`);
  }

  // Validate subtitle content quality
  if (subtitleContent.length < 50) {
   throw new Error(`Subtitle content too short (${subtitleContent.length} chars), likely invalid`);
  }

  // Parse the subtitle content
  const segments = this.parseSubtitleContent(subtitleContent, format);

  if (segments.length === 0) {
   throw new Error('No valid segments found in subtitle content');
  }

  return {
   segments,
   language,
   format,
   source: 'enhanced-ytdlp-azure',
   extractionMethod: config.clientConfig,
   segmentCount: segments.length,
   rawContentPreview: subtitleContent.substring(0, 200) + '...', // First 200 chars for debugging
  };
 }

 /**
  * Standard extraction (fallback method)
  */
 async standardExtraction(videoId, language, format) {
  console.log(`[ENHANCED-YTDLP] 🔧 Using standard extraction for ${videoId}`);

  const outputPath = path.join(this.tempDir, `${videoId}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const args = {
   writeAutoSub: true,
   subFormat: format,
   subLang: language,
   skipDownload: true,
   output: outputPath,
  };

  // Add cookies if available
  if (fs.existsSync(this.cookiesPath)) {
   args.cookies = this.cookiesPath;
  }

  await ytDlpExec(url, args);

  // Read the subtitle file
  const subtitleFile = path.join(this.tempDir, `${videoId}.${language}.${format}`);
  if (!fs.existsSync(subtitleFile)) {
   throw new Error(`Subtitle file not found: ${subtitleFile}`);
  }

  const subtitleContent = fs.readFileSync(subtitleFile, 'utf-8');

  // Clean up
  try {
   fs.unlinkSync(subtitleFile);
  } catch (error) {
   console.log(`[ENHANCED-YTDLP] ⚠️  Could not clean up ${subtitleFile}:`, error.message);
  }

  const segments = this.parseSubtitleContent(subtitleContent, format);

  return {
   segments,
   language,
   format,
   source: 'enhanced-ytdlp-standard',
   extractionMethod: 'standard',
  };
 }

 /**
  * Parse subtitle content based on format
  */
 parseSubtitleContent(content, format) {
  if (format === 'vtt') {
   return this.parseVTT(content);
  } else if (format === 'srt') {
   return this.parseSRT(content);
  } else {
   throw new Error(`Unsupported subtitle format: ${format}`);
  }
 }

 /**
  * Parse VTT subtitle format
  */
 parseVTT(content) {
  const segments = [];
  const lines = content.split('\n');

  let currentSegment = null;

  for (let i = 0; i < lines.length; i++) {
   const line = lines[i].trim();

   // Skip empty lines and VTT headers
   if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
    continue;
   }

   // Check if line contains timestamp
   if (line.includes('-->')) {
    const [startTime, endTime] = line.split('-->').map((t) => t.trim());

    currentSegment = {
     start: this.parseTimestamp(startTime),
     end: this.parseTimestamp(endTime),
     text: '',
    };
   } else if (currentSegment && line) {
    // This is subtitle text
    if (currentSegment.text) {
     currentSegment.text += ' ';
    }
    currentSegment.text += line;

    // Check if this is the end of the segment (next line is empty or timestamp)
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    if (!nextLine || nextLine.includes('-->')) {
     segments.push(currentSegment);
     currentSegment = null;
    }
   }
  }

  return segments;
 }

 /**
  * Parse SRT subtitle format
  */
 parseSRT(content) {
  const segments = [];
  const blocks = content.split('\n\n').filter((block) => block.trim());

  for (const block of blocks) {
   const lines = block.trim().split('\n');
   if (lines.length >= 3) {
    const timeLine = lines[1];
    const textLines = lines.slice(2);

    if (timeLine.includes('-->')) {
     const [startTime, endTime] = timeLine.split('-->').map((t) => t.trim());

     segments.push({
      start: this.parseTimestamp(startTime.replace(',', '.')),
      end: this.parseTimestamp(endTime.replace(',', '.')),
      text: textLines.join(' '),
     });
    }
   }
  }

  return segments;
 }

 /**
  * Parse timestamp to seconds
  */
 parseTimestamp(timestamp) {
  const parts = timestamp.split(':');
  if (parts.length === 3) {
   const hours = parseInt(parts[0]);
   const minutes = parseInt(parts[1]);
   const seconds = parseFloat(parts[2]);
   return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
   const minutes = parseInt(parts[0]);
   const seconds = parseFloat(parts[1]);
   return minutes * 60 + seconds;
  }
  return 0;
 }

 /**
  * Sleep utility
  */
 sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
 }

 /**
  * Check if video exists and is accessible with comprehensive diagnostics
  */
 async checkVideoAccess(videoId) {
  try {
   // Check rate limiting first
   const rateLimitCheck = await this.rateLimiter.checkRateLimit(videoId, 'access_check');
   if (!rateLimitCheck.allowed) {
    return {
     accessible: false,
     error: `Rate limited: ${rateLimitCheck.message}`,
     rateLimited: true,
     waitTime: rateLimitCheck.waitTime,
    };
   }

   const url = `https://www.youtube.com/watch?v=${videoId}`;
   const options = {
    dumpSingleJson: true,
    noWarnings: true,
    skipDownload: true,
    userAgent: this.cookieManager.getUserAgent(),
    socketTimeout: 30,
    retries: 1,
    geoBypass: true,
    geoBypassCountry: 'US',
   };

   // Add cookies if available
   if (fs.existsSync(this.cookiesPath)) {
    options.cookies = this.cookiesPath;
   }

   const result = await ytDlpExec(url, options);

   // Record success
   this.rateLimiter.recordSuccess(videoId);

   return {
    accessible: true,
    title: result.title,
    duration: result.duration,
    hasSubtitles: result.subtitles ? Object.keys(result.subtitles).length > 0 : false,
    availableLanguages: result.subtitles ? Object.keys(result.subtitles) : [],
    videoQuality: result.formats
     ? result.formats
        .map((f) => f.height)
        .filter((h) => h)
        .sort((a, b) => b - a)
     : [],
    uploader: result.uploader,
    uploadDate: result.upload_date,
   };
  } catch (error) {
   // Record failure
   this.rateLimiter.recordFailure(videoId, error);

   return {
    accessible: false,
    error: error.message,
    isBotDetection: this.botBypass.isBotDetectionError(error),
    errorType: this.classifyError(error),
   };
  }
 }

 /**
  * Classify error types for better diagnostics
  */
 classifyError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('sign in to confirm')) return 'bot_detection';
  if (message.includes('rate limit')) return 'rate_limit';
  if (message.includes('private') || message.includes('unavailable')) return 'access_denied';
  if (message.includes('network') || message.includes('timeout')) return 'network_error';
  if (message.includes('no video formats')) return 'format_unavailable';

  return 'unknown';
 }

 /**
  * Get comprehensive service diagnostics for Azure monitoring
  */
 getDiagnostics() {
  return {
   rateLimiter: this.rateLimiter.getStats(),
   cookieManager: {
    hasCookies: fs.existsSync(this.cookiesPath),
    cookieFileSize: fs.existsSync(this.cookiesPath) ? fs.statSync(this.cookiesPath).size : 0,
    lastModified: fs.existsSync(this.cookiesPath) ? fs.statSync(this.cookiesPath).mtime : null,
   },
   tempDirectory: {
    exists: fs.existsSync(this.tempDir),
    files: fs.existsSync(this.tempDir) ? fs.readdirSync(this.tempDir).length : 0,
   },
   timestamp: new Date().toISOString(),
   environment: process.env.NODE_ENV || 'development',
  };
 }

 /**
  * Force refresh cookies and reset rate limiting (admin function)
  */
 async resetService() {
  try {
   console.log('[ENHANCED-YTDLP] 🔄 Resetting service...');

   // Reset rate limiting
   this.rateLimiter.resetAll();

   // Refresh cookies
   if (fs.existsSync(this.cookiesPath)) {
    await this.cookieManager.smartRefresh(this.cookiesPath);
   }

   // Clean temp directory
   if (fs.existsSync(this.tempDir)) {
    const files = fs.readdirSync(this.tempDir);
    for (const file of files) {
     try {
      fs.unlinkSync(path.join(this.tempDir, file));
     } catch (error) {
      console.log(`[ENHANCED-YTDLP] ⚠️  Could not clean ${file}:`, error.message);
     }
    }
   }

   console.log('[ENHANCED-YTDLP] ✅ Service reset completed');
   return {success: true, message: 'Service reset completed'};
  } catch (error) {
   console.log('[ENHANCED-YTDLP] ❌ Service reset failed:', error.message);
   return {success: false, error: error.message};
  }
 }
}

module.exports = EnhancedYtDlpService;
