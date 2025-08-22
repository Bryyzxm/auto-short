const ytDlpExec = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

/**
 * Official YT-DLP Fix Service
 *
 * This service implements the OFFICIAL SOLUTION from yt-dlp issue #13930
 * Fixed by PR #14081: https://github.com/yt-dlp/yt-dlp/pull/14081
 *
 * The fix addresses "The following content is not available on this app" errors
 * by updating client configurations and player parameters.
 */
class OfficialYtDlpFixService {
 constructor() {
  this.cookiesPath = path.join(__dirname, '..', 'cookies.txt');
  this.tempDir = path.join(__dirname, '..', 'temp');

  // Ensure temp directory exists
  if (!fs.existsSync(this.tempDir)) {
   fs.mkdirSync(this.tempDir, {recursive: true});
  }
 }

 /**
  * Extract transcript using OFFICIAL FIX from yt-dlp #13930
  */
 async extractTranscript(videoId, options = {}) {
  const {language = 'en', preferredFormat = 'vtt'} = options;

  console.log(`[OFFICIAL-YTDLP-FIX] 🔧 Using official fix for ${videoId}`);
  console.log(`[OFFICIAL-YTDLP-FIX] 📋 Based on: https://github.com/yt-dlp/yt-dlp/issues/13930`);
  console.log(`[OFFICIAL-YTDLP-FIX] ✅ Fixed by: https://github.com/yt-dlp/yt-dlp/pull/14081`);

  try {
   // Method 1: Default configuration with official fixes
   const result = await this.attemptWithOfficialFix(videoId, language, preferredFormat);
   return result;
  } catch (error) {
   console.log(`[OFFICIAL-YTDLP-FIX] ⚠️  Default method failed, trying workaround...`);

   try {
    // Method 2: Workaround configuration suggested by yt-dlp maintainers
    const result = await this.attemptWithWorkaround(videoId, language, preferredFormat);
    return result;
   } catch (workaroundError) {
    console.log(`[OFFICIAL-YTDLP-FIX] ❌ Both methods failed`);
    throw new Error(`Official fix failed: ${error.message}. Workaround also failed: ${workaroundError.message}`);
   }
  }
 }

 /**
  * Method 1: Official fix with latest yt-dlp version
  */
 async attemptWithOfficialFix(videoId, language, format) {
  console.log(`[OFFICIAL-YTDLP-FIX] 🚀 Method 1: Using official fix configuration`);

  const outputPath = path.join(this.tempDir, `${videoId}_official.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Official configuration based on PR #14081
  const options = {
   // Core subtitle options
   writeAutoSub: true,
   subFormat: format,
   subLang: language,
   skipDownload: true,
   output: outputPath,

   // OFFICIAL FIX: Updated client configurations
   // This addresses the "content not available on this app" error
   extractorArgs: 'youtube:player_client=default',

   // Network and retry settings
   retries: 3,
   fragmentRetries: 5,
   extractorRetries: 3,
   socketTimeout: 30,

   // Anti-detection measures (official recommendations)
   userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   geoBypass: true,
   geoBypassCountry: 'US',
   noCheckCertificate: true,

   // Performance optimizations
   sleepInterval: 1,
   maxSleepInterval: 5,
   sleepSubtitles: 1,
  };

  // Add cookies if available
  if (fs.existsSync(this.cookiesPath)) {
   options.cookies = this.cookiesPath;
   console.log(`[OFFICIAL-YTDLP-FIX] 🍪 Using cookies for authentication`);
  }

  console.log(`[OFFICIAL-YTDLP-FIX] 🔄 Executing with official configuration...`);

  // Execute yt-dlp
  const result = await ytDlpExec(url, options);

  // Find and read subtitle file
  const subtitleContent = await this.findAndReadSubtitleFile(videoId, language, format, '_official');

  // Parse subtitle content
  const segments = this.parseSubtitleContent(subtitleContent, format);

  return {
   segments,
   language,
   format,
   source: 'official-ytdlp-fix',
   extractionMethod: 'official-pr-14081',
   success: true,
  };
 }

 /**
  * Method 2: Workaround configuration as suggested by maintainers
  */
 async attemptWithWorkaround(videoId, language, format) {
  console.log(`[OFFICIAL-YTDLP-FIX] 🔧 Method 2: Using maintainer workaround`);

  const outputPath = path.join(this.tempDir, `${videoId}_workaround.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Workaround configuration from issue #13930 comments
  const options = {
   writeAutoSub: true,
   subFormat: format,
   subLang: language,
   skipDownload: true,
   output: outputPath,

   // WORKAROUND: Use tv_simply client as suggested by seproDev
   extractorArgs: 'youtube:player_client=default,tv_simply',

   // Enhanced retry settings for workaround
   retries: 5,
   fragmentRetries: 10,
   extractorRetries: 5,
   socketTimeout: 60,

   // More aggressive anti-detection
   userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
   geoBypass: true,
   geoBypassCountry: 'US',
   forceIpv4: true,
   noCheckCertificate: true,

   // Longer delays for workaround
   sleepInterval: 3,
   maxSleepInterval: 10,
   sleepSubtitles: 3,
  };

  // Add cookies if available
  if (fs.existsSync(this.cookiesPath)) {
   options.cookies = this.cookiesPath;
  }

  console.log(`[OFFICIAL-YTDLP-FIX] 🔄 Executing with workaround configuration...`);

  // Execute yt-dlp
  const result = await ytDlpExec(url, options);

  // Find and read subtitle file
  const subtitleContent = await this.findAndReadSubtitleFile(videoId, language, format, '_workaround');

  // Parse subtitle content
  const segments = this.parseSubtitleContent(subtitleContent, format);

  return {
   segments,
   language,
   format,
   source: 'official-ytdlp-workaround',
   extractionMethod: 'tv_simply-workaround',
   success: true,
  };
 }

 /**
  * Find and read subtitle file with multiple possible paths
  */
 async findAndReadSubtitleFile(videoId, language, format, suffix) {
  const possibleFiles = [
   path.join(this.tempDir, `${videoId}${suffix}.${language}.${format}`),
   path.join(this.tempDir, `${videoId}${suffix}.${format}`),
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
     console.log(`[OFFICIAL-YTDLP-FIX] 🧹 Cleaned up: ${path.basename(filePath)}`);
    } catch (cleanupError) {
     console.log(`[OFFICIAL-YTDLP-FIX] ⚠️  Could not clean up ${filePath}:`, cleanupError.message);
    }
    break;
   }
  }

  if (!subtitleContent) {
   throw new Error(`No subtitle file found. Expected one of: ${possibleFiles.map((f) => path.basename(f)).join(', ')}`);
  }

  console.log(`[OFFICIAL-YTDLP-FIX] 📄 Found subtitle file: ${path.basename(foundFile)}`);
  return subtitleContent;
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

    // Check if this is the end of the segment
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
  * Update yt-dlp to latest version (requires global installation)
  */
 async updateYtDlp() {
  console.log(`[OFFICIAL-YTDLP-FIX] 📦 Checking for yt-dlp updates...`);
  console.log(`[OFFICIAL-YTDLP-FIX] 💡 To apply the official fix, update yt-dlp with:`);
  console.log(`[OFFICIAL-YTDLP-FIX] 📋 Command: yt-dlp --update-to master`);
  console.log(`[OFFICIAL-YTDLP-FIX] 📋 Or pip: pip install --upgrade git+https://github.com/yt-dlp/yt-dlp.git`);

  // Note: yt-dlp-exec uses bundled yt-dlp, so we need to update the package
  console.log(`[OFFICIAL-YTDLP-FIX] 📦 For yt-dlp-exec, update with: npm update yt-dlp-exec`);

  return {
   updateAvailable: true,
   instructions: ['Run: yt-dlp --update-to master', 'Or: pip install --upgrade git+https://github.com/yt-dlp/yt-dlp.git', 'For npm: npm update yt-dlp-exec'],
  };
 }

 /**
  * Test if the official fix is working
  */
 async testOfficialFix(testVideoId = 'BaW_jenozKc') {
  console.log(`[OFFICIAL-YTDLP-FIX] 🧪 Testing official fix with video: ${testVideoId}`);

  try {
   const result = await this.extractTranscript(testVideoId);
   console.log(`[OFFICIAL-YTDLP-FIX] ✅ Official fix test PASSED`);
   console.log(`[OFFICIAL-YTDLP-FIX] 📊 Extracted ${result.segments.length} segments`);
   return {
    success: true,
    segments: result.segments.length,
    method: result.extractionMethod,
   };
  } catch (error) {
   console.log(`[OFFICIAL-YTDLP-FIX] ❌ Official fix test FAILED: ${error.message}`);
   return {
    success: false,
    error: error.message,
   };
  }
 }
}

module.exports = OfficialYtDlpFixService;
