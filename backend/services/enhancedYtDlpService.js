const ytDlpExec = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const AdvancedBotBypass = require('./advancedBotBypass');

/**
 * Enhanced YT-DLP Wrapper with Advanced Bot Detection Bypass
 *
 * This service provides sophisticated bot detection bypass capabilities
 * to handle YouTube's aggressive anti-bot measures.
 */
class EnhancedYtDlpService {
 constructor() {
  this.botBypass = new AdvancedBotBypass();
  this.cookiesPath = path.join(__dirname, '..', 'cookies.txt');
  this.tempDir = path.join(__dirname, '..', 'temp');

  // Ensure temp directory exists
  if (!fs.existsSync(this.tempDir)) {
   fs.mkdirSync(this.tempDir, {recursive: true});
  }
 }

 /**
  * Extract transcript with advanced bot detection bypass
  */
 async extractTranscript(videoId, options = {}) {
  const {language = 'en', maxAttempts = 4, useAdvancedBypass = true, preferredFormat = 'vtt'} = options;

  console.log(`[ENHANCED-YTDLP] 🚀 Starting advanced extraction for ${videoId}`);

  if (!useAdvancedBypass) {
   return this.standardExtraction(videoId, language, preferredFormat);
  }

  // Generate multiple bypass configurations
  const configs = this.botBypass.generateFallbackConfigs({
   cookiesPath: this.cookiesPath,
   useCookies: fs.existsSync(this.cookiesPath),
  });

  let lastError = null;
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
   const configIndex = (attempt - 1) % configs.length;
   const config = configs[configIndex];

   try {
    console.log(`[ENHANCED-YTDLP] 🔄 Attempt ${attempt}/${maxAttempts} using ${config.clientConfig}`);

    const result = await this.attemptExtraction(videoId, language, preferredFormat, config, attempt);

    // Log successful attempt
    const logEntry = this.botBypass.logBypassAttempt(config, attempt, true);
    attempts.push(logEntry);

    console.log(`[ENHANCED-YTDLP] ✅ Success with ${config.clientConfig} on attempt ${attempt}`);

    return {
     ...result,
     bypassMethod: config.clientConfig,
     attemptNumber: attempt,
     totalAttempts: attempts.length,
    };
   } catch (error) {
    lastError = error;

    // Log failed attempt
    const logEntry = this.botBypass.logBypassAttempt(config, attempt, false, error);
    attempts.push(logEntry);

    if (this.botBypass.isBotDetectionError(error)) {
     console.log(`[ENHANCED-YTDLP] 🤖 Bot detection on attempt ${attempt}, trying next config...`);

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
  throw new Error(`Advanced bot bypass failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
 }

 /**
  * Attempt transcript extraction with specific configuration
  */
 async attemptExtraction(videoId, language, format, config, attemptNumber) {
  const outputPath = path.join(this.tempDir, `${videoId}_${attemptNumber}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Build yt-dlp options object (correct format for yt-dlp-exec)
  const options = {
   writeAutoSub: true,
   subFormat: format,
   subLang: language,
   skipDownload: true,
   output: outputPath,
   userAgent: config.userAgent,
   retries: 3,
   fragmentRetries: 5,
   extractorRetries: 3,
   sleepInterval: 3,
   maxSleepInterval: 8,
   sleepSubtitles: 2,
   socketTimeout: 30,
   sourceAddress: '0.0.0.0',
   geoBypass: true,
   geoBypassCountry: 'US',
   forceIpv4: true,
   noCheckCertificate: true,
   noWarnings: true,
  };

  // Parse extractor args from config
  if (config.extractorArgs) {
   options.extractorArgs = config.extractorArgs;
  }

  // Add cookies if supported
  if (config.supportsCookies && fs.existsSync(this.cookiesPath)) {
   options.cookies = this.cookiesPath;
  }

  console.log(`[ENHANCED-YTDLP] 🔧 Executing with config: ${config.clientConfig}, UA: ${config.userAgent.substring(0, 50)}...`);

  // Execute yt-dlp
  const result = await ytDlpExec(url, options);

  // Look for generated subtitle files
  const possibleFiles = [
   path.join(this.tempDir, `${videoId}_${attemptNumber}.${language}.${format}`),
   path.join(this.tempDir, `${videoId}_${attemptNumber}.${format}`),
   path.join(this.tempDir, `${videoId}.${language}.${format}`),
   path.join(this.tempDir, `${videoId}.${format}`),
  ];

  let subtitleContent = null;
  let foundFile = null;

  for (const filePath of possibleFiles) {
   if (fs.existsSync(filePath)) {
    subtitleContent = fs.readFileSync(filePath, 'utf-8');
    foundFile = filePath;

    // Clean up the file
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

  // Parse the subtitle content
  const segments = this.parseSubtitleContent(subtitleContent, format);

  return {
   segments,
   language,
   format,
   source: 'enhanced-ytdlp',
   extractionMethod: config.clientConfig,
   rawContent: subtitleContent.substring(0, 500) + '...', // First 500 chars for debugging
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
  * Check if video exists and is accessible
  */
 async checkVideoAccess(videoId) {
  try {
   const url = `https://www.youtube.com/watch?v=${videoId}`;
   const result = await ytDlpExec(url, {
    dumpSingleJson: true,
    noWarnings: true,
    skipDownload: true,
   });

   return {
    accessible: true,
    title: result.title,
    duration: result.duration,
    hasSubtitles: result.subtitles ? Object.keys(result.subtitles).length > 0 : false,
   };
  } catch (error) {
   return {
    accessible: false,
    error: error.message,
   };
  }
 }
}

module.exports = EnhancedYtDlpService;
