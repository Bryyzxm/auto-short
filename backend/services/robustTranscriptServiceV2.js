const {YoutubeTranscript} = require('youtube-transcript');
const {executeYtDlpSecurely} = require('./ytdlpSecureExecutor');
const fs = require('fs');
const path = require('path');
const AdvancedTranscriptExtractor = require('./advancedTranscriptExtractor');
const OfficialYtDlpFixService = require('./officialYtDlpFixService');
const OfficialPoTokenService = require('./officialPoTokenService');
const EnhancedOfficialPoTokenService = require('./enhancedOfficialPoTokenService');

/**
 * Robust Transcript Service V2 - Multiple extraction strategies
 *
 * This service implements multiple fallback strategies:
 * 1. YT-DLP with enhanced anti-detection (PRIMARY - uses configured cookies)
 * 2. YouTube Transcript API (FALLBACK - no auth required but may be rate limited)
 * 3. Multiple language fallbacks
 */

const stats = {
 totalRequests: 0,
 successfulRequests: 0,
 failedRequests: 0,
 avgResponseTime: 0,
 lastRequestTime: null,
 errors: [],
 strategyStats: {
  youtubeTranscript: {success: 0, fail: 0},
  ytdlp: {success: 0, fail: 0},
  multilang: {success: 0, fail: 0},
 },
};

/**
 * Strategy 3: YouTube Transcript API (SMART LANGUAGE DETECTION)
 */
async function extractWithYouTubeTranscript(videoId) {
 console.log(`[ROBUST-V2] Strategy 3: YouTube Transcript API with Smart Language Detection for ${videoId}`);

 // 🧠 SMART DETECTION: Try Indonesian first, but fall back quickly if not available
 const primaryLanguages = ['id']; // Indonesian first
 const fallbackLanguages = ['en', 'en-US', 'en-GB', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh'];

 // Phase 1: Quick Indonesian check (single attempt, short timeout)
 for (const lang of primaryLanguages) {
  try {
   console.log(`[ROBUST-V2] 🇮🇩 Phase 1: Quick Indonesian check for ${videoId}`);

   const transcript = await Promise.race([
    YoutubeTranscript.fetchTranscript(videoId, {
     lang: lang,
     country: 'ID',
     headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
     },
    }),
    // Quick timeout for Indonesian - if not available, don't waste time
    new Promise((_, reject) => setTimeout(() => reject(new Error('Indonesian timeout')), 3000)),
   ]);

   if (transcript && transcript.length > 0) {
    console.log(`[ROBUST-V2] ✅ Indonesian transcript found: ${transcript.length} segments`);
    stats.strategyStats.youtubeTranscript.success++;
    return transcript;
   }
  } catch (error) {
   console.log(`[ROBUST-V2] 🇮🇩 Indonesian not available (${error.message}), switching to English priority`);
   // Don't log as error - this is expected for English videos
  }
 }

 // Phase 2: English priority fallback (if Indonesian failed/unavailable)
 console.log(`[ROBUST-V2] 🇺🇸 Phase 2: English priority fallback for ${videoId}`);
 for (const lang of fallbackLanguages) {
  try {
   console.log(`[ROBUST-V2] Trying YouTube Transcript API with language: ${lang}`);

   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: lang,
    country: 'US',
    // Railway-style configuration for better compatibility
    headers: {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
     'Accept-Language': 'en-US,en;q=0.9',
     Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
   });

   if (transcript && transcript.length > 0) {
    console.log(`[ROBUST-V2] ✅ YouTube Transcript API success with ${lang}: ${transcript.length} segments`);

    stats.strategyStats.youtubeTranscript.success++;

    return {
     segments: transcript.map((item) => ({
      text: item.text,
      start: parseFloat((item.offset / 1000).toFixed(3)),
      duration: parseFloat((item.duration / 1000).toFixed(3)),
     })),
     language: lang,
     source: 'youtube-transcript-api',
     method: 'youtube-transcript',
    };
   }
  } catch (error) {
   console.log(`[ROBUST-V2] YouTube Transcript API failed for ${lang}: ${error.message}`);
   // Continue to next language
  }
 }

 stats.strategyStats.youtubeTranscript.fail++;
 throw new Error('YouTube Transcript API failed for all languages');
}

/**
 * Strategy 0: Official PO Token Strategy (HIGHEST PRIORITY - for PO token required videos)
 */
async function extractWithPoToken(videoId) {
 console.log(`[ROBUST-V2] Strategy 0: Official PO Token Strategy for ${videoId}`);
 console.log(`[ROBUST-V2] 🏆 Using official PO token methods from: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide`);

 try {
  // 🚨 CRITICAL FIX: Use enhanced PO token service with HTTP 429 recovery
  const poTokenService = new EnhancedOfficialPoTokenService();
  const result = await poTokenService.extractWithPoToken(videoId);

  if (result && result.segments && result.segments.length > 0) {
   console.log(`[ROBUST-V2] ✅ PO Token strategy success: ${result.segments.length} segments`);

   return {
    segments: result.segments.map((seg) => ({
     text: seg.text,
     start: seg.start,
     duration: seg.duration,
    })),
    language: result.language || 'en',
    source: result.source,
    method: 'po-token-official',
    extractionStrategy: result.extractionStrategy,
    totalSegments: result.totalSegments,
    totalDuration: result.totalDuration,
   };
  }

  throw new Error('No segments from PO token extraction');
 } catch (error) {
  console.log(`[ROBUST-V2] ❌ PO Token strategy failed: ${error.message}`);
  throw error;
 }
}

/**
 * Strategy 1: Official YT-DLP Fix (HIGH PRIORITY - based on issue #13930)
 */
async function extractWithOfficialFix(videoId) {
 console.log(`[ROBUST-V2] Strategy 0: Official YT-DLP Fix for ${videoId}`);
 console.log(`[ROBUST-V2] 🏆 Using official solution from: https://github.com/yt-dlp/yt-dlp/issues/13930`);
 console.log(`[ROBUST-V2] ✅ Fixed by PR: https://github.com/yt-dlp/yt-dlp/pull/14081`);

 try {
  const officialService = new OfficialYtDlpFixService();
  const result = await officialService.extractTranscript(videoId);

  if (result && result.segments && result.segments.length > 0) {
   console.log(`[ROBUST-V2] ✅ Official fix success: ${result.segments.length} segments`);

   return {
    segments: result.segments.map((seg) => ({
     text: seg.text,
     start: seg.start,
     duration: seg.end - seg.start,
    })),
    language: result.language || 'en',
    source: result.source,
    method: 'official-ytdlp-fix',
    extractionStrategy: result.extractionMethod,
    totalSegments: result.segments.length,
    success: result.success,
   };
  }

  throw new Error('No segments from official fix');
 } catch (error) {
  console.log(`[ROBUST-V2] ❌ Official fix failed: ${error.message}`);
  throw error;
 }
}

/**
 * Strategy 1: YT-DLP Enhanced Extraction (FALLBACK)
 */
async function extractWithYtDlp(videoId) {
 console.log(`[ROBUST-V2] Strategy 1: YT-DLP Enhanced for ${videoId}`);

 try {
  // Initialize advanced transcript extractor
  const advancedExtractor = new AdvancedTranscriptExtractor({
   tempDir: path.join(process.cwd(), 'temp'),
   cleanup: true,
   maxRetries: 3,
  });

  // Use the advanced extractor which handles all the file parsing
  const result = await advancedExtractor.extractTranscript(videoId, {
   useCookies: true,
   timeout: 30000,
  });

  if (result && result.segments && result.segments.length > 0) {
   console.log(`[ROBUST-V2] ✅ Advanced extraction success: ${result.segments.length} segments`);
   console.log(`[ROBUST-V2] 📊 Strategy used: ${result.extractionStrategy}`);
   console.log(`[ROBUST-V2] 📊 Total duration: ${result.totalDuration}s`);

   stats.strategyStats.ytdlp.success++;

   // Convert to expected format
   return {
    segments: result.segments.map((seg) => ({
     text: seg.text,
     start: seg.start,
     duration: seg.duration,
    })),
    language: result.language || 'en',
    source: result.source,
    method: 'yt-dlp-advanced',
    extractionStrategy: result.extractionStrategy,
    totalSegments: result.totalSegments,
    totalDuration: result.totalDuration,
   };
  } else {
   throw new Error('No segments extracted from advanced extractor');
  }
 } catch (error) {
  console.log(`[ROBUST-V2] ❌ Advanced YT-DLP extraction failed: ${error.message}`);
  stats.strategyStats.ytdlp.fail++;

  // Fallback to legacy extraction for compatibility
  return await extractWithYtDlpLegacy(videoId);
 }
}

/**
 * Legacy YT-DLP extraction (kept as fallback) - FIXED VERSION
 */
async function extractWithYtDlpLegacy(videoId) {
 console.log(`[ROBUST-V2] 🔄 Falling back to legacy YT-DLP with Smart Detection for ${videoId}`);

 try {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = path.join(process.cwd(), 'temp');

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
   fs.mkdirSync(tempDir, {recursive: true});
  }

  // 🧠 SMART DETECTION: Try Indonesian first, then English priority
  const primaryLanguages = ['id']; // Indonesian first
  const fallbackLanguages = ['en', 'en-US', 'en-GB'];

  // Phase 1: Quick Indonesian attempt
  for (const lang of primaryLanguages) {
   try {
    console.log(`[ROBUST-V2] 🇮🇩 Phase 1: Quick Indonesian extraction attempt`);

    const outputPath = path.join(tempDir, `${videoId}_legacy_${lang}.%(ext)s`);
    const extractArgs = ['--write-auto-sub', '--sub-format', 'vtt', '--sub-lang', lang, '--skip-download', '--output', outputPath, videoUrl];

    // Quick timeout for Indonesian - don't waste time if not available
    const result = await Promise.race([executeYtDlpSecurely(extractArgs, {timeout: 5000, useCookies: true}), new Promise((_, reject) => setTimeout(() => reject(new Error('Indonesian timeout')), 5000))]);

    // Check if subtitle file was created
    const vttFilePath = path.join(tempDir, `${videoId}_legacy_${lang}.${lang}.vtt`);
    if (fs.existsSync(vttFilePath)) {
     console.log(`[ROBUST-V2] ✅ Indonesian subtitles found and extracted successfully`);
     const content = fs.readFileSync(vttFilePath, 'utf8');
     const segments = parseVttContent(content);

     // Cleanup
     try {
      fs.unlinkSync(vttFilePath);
     } catch {}

     if (segments.length > 0) {
      return {segments, language: lang, source: 'yt-dlp-legacy'};
     }
    }
   } catch (error) {
    console.log(`[ROBUST-V2] 🇮🇩 Indonesian not available (${error.message}), switching to English priority`);
    // Don't log as error - expected for English videos
   }
  }

  // Phase 2: English priority fallback
  console.log(`[ROBUST-V2] 🇺🇸 Phase 2: English priority fallback`);
  for (const lang of fallbackLanguages) {
   try {
    console.log(`[ROBUST-V2] Attempting legacy YT-DLP extraction with language: ${lang}`);

    // FIXED: Properly download subtitle files to temp directory
    const extractArgs = ['--write-auto-sub', '--write-sub', '--sub-format', 'vtt', '--sub-lang', lang, '--skip-download', '--output', path.join(tempDir, `${videoId}_legacy.%(ext)s`), videoUrl];

    const result = await executeYtDlpSecurely(extractArgs, {
     timeout: 25000,
     useCookies: true,
    });

    console.log(`[ROBUST-V2] ✅ Legacy YT-DLP subtitle download completed for ${lang}`);

    // FIXED: Find and parse the downloaded VTT files
    const subtitleFiles = findSubtitleFiles(videoId, tempDir, '_legacy');

    if (subtitleFiles.length > 0) {
     console.log(`[ROBUST-V2] 📄 Found ${subtitleFiles.length} subtitle files`);

     for (const file of subtitleFiles) {
      const segments = parseVttFile(file);

      if (segments && segments.length > 0) {
       console.log(`[ROBUST-V2] ✅ Successfully parsed ${segments.length} transcript segments`);

       // FIXED: Return proper segments with correct format for AI processing
       return {
        segments: segments.map((seg) => ({
         text: seg.text,
         start: seg.start,
         duration: seg.end - seg.start,
        })),
        language: lang,
        source: 'yt-dlp-legacy-fixed',
        method: 'yt-dlp-legacy',
        totalSegments: segments.length,
        totalDuration: segments[segments.length - 1]?.end || 0,
       };
      }
     }
    }

    console.log(`[ROBUST-V2] ⚠️  No valid subtitle content found for ${lang}`);
   } catch (error) {
    console.log(`[ROBUST-V2] YT-DLP failed for ${lang}: ${error.message}`);
    continue;
   }
  }

  stats.strategyStats.ytdlp.fail++;
  throw new Error('YT-DLP extraction failed for all languages');
 } catch (error) {
  stats.strategyStats.ytdlp.fail++;
  throw error;
 }
}

/**
 * Helper function to find subtitle files
 */
function findSubtitleFiles(videoId, tempDir, suffix = '') {
 const possibleFiles = [path.join(tempDir, `${videoId}${suffix}.en.vtt`), path.join(tempDir, `${videoId}${suffix}.vtt`), path.join(tempDir, `${videoId}.en.vtt`), path.join(tempDir, `${videoId}.vtt`)];

 const foundFiles = [];
 for (const file of possibleFiles) {
  if (fs.existsSync(file)) {
   console.log(`[ROBUST-V2] 📄 Found subtitle file: ${path.basename(file)}`);
   foundFiles.push(file);
  }
 }

 return foundFiles;
}

/**
 * Helper function to parse VTT files
 */
function parseVttFile(vttFilePath) {
 try {
  const content = fs.readFileSync(vttFilePath, 'utf8');
  console.log(`[ROBUST-V2] 📖 Parsing VTT file: ${path.basename(vttFilePath)} (${content.length} chars)`);

  // Clean up the file after reading
  try {
   fs.unlinkSync(vttFilePath);
   console.log(`[ROBUST-V2] 🧹 Cleaned up: ${path.basename(vttFilePath)}`);
  } catch (cleanupError) {
   console.log(`[ROBUST-V2] ⚠️  Could not clean up ${path.basename(vttFilePath)}`);
  }

  const segments = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
   const line = lines[i].trim();

   // Look for timestamp lines (format: 00:00:00.000 --> 00:00:00.000)
   if (line.includes('-->')) {
    const [startTime, endTime] = line.split(' --> ');
    const textLines = [];

    // Collect text lines until empty line or next timestamp
    for (let j = i + 1; j < lines.length; j++) {
     const textLine = lines[j].trim();
     if (!textLine || textLine.includes('-->') || textLine.startsWith('WEBVTT')) {
      break;
     }
     textLines.push(textLine);
    }

    if (textLines.length > 0) {
     const start = parseVttTime(startTime);
     const end = parseVttTime(endTime);
     segments.push({
      start: start,
      end: end,
      duration: end - start,
      text: textLines.join(' ').replace(/<[^>]*>/g, ''), // Remove HTML tags
     });
    }
   }
  }

  console.log(`[ROBUST-V2] ✅ Parsed ${segments.length} segments from VTT file`);
  return segments;
 } catch (error) {
  console.log(`[ROBUST-V2] ❌ Error parsing VTT file: ${error.message}`);
  return [];
 }
}

/**
 * Helper function to parse VTT time format
 */
function parseVttTime(timeStr) {
 const parts = timeStr.split(':');
 if (parts.length === 3) {
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const seconds = parseFloat(parts[2].replace(',', '.'));
  return hours * 3600 + minutes * 60 + seconds;
 }
 return 0;
}

/**
 * Strategy 2: Direct Advanced Transcript Extraction
 */
async function extractWithAdvancedExtractor(videoId) {
 console.log(`[ROBUST-V2] Strategy 2: Direct Advanced Extractor for ${videoId}`);

 try {
  const advancedExtractor = new AdvancedTranscriptExtractor({
   tempDir: path.join(process.cwd(), 'temp'),
   cleanup: true,
   maxRetries: 2,
  });

  const result = await advancedExtractor.extractTranscript(videoId, {
   useCookies: true,
   timeout: 25000,
  });

  if (result && result.segments && result.segments.length > 0) {
   console.log(`[ROBUST-V2] ✅ Direct advanced extraction success: ${result.segments.length} segments`);

   return {
    segments: result.segments,
    language: result.language || 'en',
    source: result.source,
    method: 'advanced-direct',
    extractionStrategy: result.extractionStrategy,
    totalSegments: result.totalSegments,
    totalDuration: result.totalDuration,
   };
  }

  throw new Error('No segments from direct advanced extraction');
 } catch (error) {
  console.log(`[ROBUST-V2] ❌ Direct advanced extraction failed: ${error.message}`);
  throw error;
 }
}

/**
 * Main extraction function with multiple strategies
 */
async function extract(videoId, options = {}) {
 const startTime = Date.now();
 stats.totalRequests++;
 stats.lastRequestTime = new Date().toISOString();

 console.log(`[ROBUST-V2] 🚀 Starting robust extraction for ${videoId}`);

 // Build strategies array based on configuration
 const strategies = [
  {name: 'Official PO Token Strategy', func: extractWithPoToken},
  {name: 'Official YT-DLP Fix (PR #14081)', func: extractWithOfficialFix},
  {name: 'YT-DLP Enhanced', func: extractWithYtDlp},
  {name: 'Advanced Direct Extraction', func: extractWithAdvancedExtractor},
 ];

 console.log(`[ROBUST-V2] 🎯 PO Token strategy added as highest priority for videos requiring Proof of Origin tokens`);

 // Only add YouTube Transcript API if not disabled via environment variable
 const disableYouTubeAPI = process.env.DISABLE_YOUTUBE_TRANSCRIPT_API === 'true';
 if (!disableYouTubeAPI) {
  strategies.push({name: 'YouTube Transcript API', func: extractWithYouTubeTranscript});
  console.log(`[ROBUST-V2] 📋 Using ${strategies.length} strategies (including YouTube API fallback)`);
 } else {
  console.log(`[ROBUST-V2] 📋 Using ${strategies.length} strategies (YouTube API disabled)`);
 }

 let lastError = null;

 for (const strategy of strategies) {
  try {
   console.log(`[ROBUST-V2] Trying strategy: ${strategy.name}`);

   const result = await strategy.func(videoId);

   if (result && result.segments && result.segments.length > 0) {
    console.log(`[ROBUST-V2] ✅ Success with ${strategy.name}`);

    stats.successfulRequests++;
    stats.avgResponseTime = (stats.avgResponseTime * (stats.totalRequests - 1) + (Date.now() - startTime)) / stats.totalRequests;

    return {
     ...result,
     strategyUsed: strategy.name,
     extractionTime: Date.now() - startTime,
    };
   }
  } catch (error) {
   console.log(`[ROBUST-V2] ❌ Strategy ${strategy.name} failed: ${error.message}`);
   lastError = error;
   continue;
  }
 }

 stats.failedRequests++;
 stats.errors.push({
  videoId,
  timestamp: new Date().toISOString(),
  error: lastError ? lastError.message : 'All strategies failed',
 });

 console.error(`[ROBUST-V2] 💀 All strategies failed for ${videoId}`);
 throw new Error(`All robust transcript strategies failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
}

function getStats() {
 return {
  ...stats,
  successRate: stats.totalRequests > 0 ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) : '0.00',
 };
}

module.exports = {extract, getStats};
