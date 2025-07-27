/**
 * ROBUST YOUTUBE TRANSCRIPT SERVICE v2.0
 * Advanced multi-strategy transcript extraction with 2025 bot protection
 */

import {YoutubeTranscript} from 'youtube-transcript';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import youtubedl from 'youtube-dl-exec';
import {fileURLToPath} from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RobustYouTubeTranscriptV2 {
 constructor() {
  this.requestCount = 0;
  this.lastRequestTime = 0;
  this.failureCount = 0;
  this.sessionId = Math.random().toString(36).substring(7);

  // Rate limiting
  this.minRequestInterval = 2000; // 2 seconds between requests
  this.maxRequestsPerMinute = 15;
  this.requestTimes = [];

  // Configurable cookies path for bypassing YouTube bot detection
  this.cookiesPath = process.env.YTDLP_COOKIES_PATH || path.join(__dirname, '../cookies/cookies.txt');

  console.log(`[ROBUST-V2] Initialized with session: ${this.sessionId}`);
  console.log(`[ROBUST-V2] Cookies path: ${this.cookiesPath}`);
 }

 // Helper function to check if cookies file exists and is valid
 validateCookiesFile() {
  try {
   if (!fs.existsSync(this.cookiesPath)) {
    console.log(`[ROBUST-V2] Cookies file not found at: ${this.cookiesPath}`);
    return false;
   }

   const stats = fs.statSync(this.cookiesPath);
   if (stats.size === 0) {
    console.log(`[ROBUST-V2] Cookies file is empty: ${this.cookiesPath}`);
    return false;
   }

   console.log(`[ROBUST-V2] ✅ Valid cookies file found: ${this.cookiesPath} (${stats.size} bytes)`);
   return true;
  } catch (error) {
   console.log(`[ROBUST-V2] Error validating cookies file: ${error.message}`);
   return false;
  }
 }

 // Enhanced rate limiting
 async respectRateLimit() {
  const now = Date.now();

  // Remove requests older than 1 minute
  this.requestTimes = this.requestTimes.filter((time) => now - time < 60000);

  // Check if we've exceeded rate limit
  if (this.requestTimes.length >= this.maxRequestsPerMinute) {
   const oldestRequest = Math.min(...this.requestTimes);
   const waitTime = 60000 - (now - oldestRequest);
   console.log(`[ROBUST-V2] Rate limit hit, waiting ${waitTime}ms`);
   await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  // Ensure minimum interval between requests
  const timeSinceLastRequest = now - this.lastRequestTime;
  if (timeSinceLastRequest < this.minRequestInterval) {
   const waitTime = this.minRequestInterval - timeSinceLastRequest;
   await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  this.requestTimes.push(Date.now());
  this.lastRequestTime = Date.now();
 }

 // Strategy 1: Latest youtube-transcript with enhanced error handling
 async strategyYouTubeTranscriptAPI(videoId, options = {}) {
  console.log(`[ROBUST-V2] Strategy 1: YouTube Transcript API for ${videoId}`);

  await this.respectRateLimit();

  const languages = options.lang || ['id', 'en', 'auto'];

  for (const lang of languages) {
   try {
    console.log(`[ROBUST-V2] Trying language: ${lang}`);

    const config = {
     lang: lang === 'auto' ? undefined : lang,
    };

    if (lang !== 'auto') {
     config.country = lang === 'id' ? 'ID' : 'US';
    }

    const transcript = await YoutubeTranscript.fetchTranscript(videoId, config);

    if (transcript && transcript.length > 0) {
     console.log(`[ROBUST-V2] ✅ YouTube API success for ${lang}: ${transcript.length} segments`);

     const segments = transcript
      .map((item) => ({
       text: this.cleanText(item.text),
       start: parseFloat((item.offset / 1000).toFixed(3)),
       end: parseFloat(((item.offset + item.duration) / 1000).toFixed(3)),
       duration: parseFloat((item.duration / 1000).toFixed(3)),
      }))
      .filter((seg) => seg.text.length > 2 && seg.duration > 0.3);

     return {
      transcript: segments.map((s) => s.text).join(' '),
      segments: segments,
      language: lang,
      method: `YouTube Transcript API (${lang.toUpperCase()})`,
      hasRealTiming: true,
      totalSegments: segments.length,
      totalDuration: segments[segments.length - 1]?.end || 0,
      sessionId: this.sessionId,
     };
    }
   } catch (error) {
    console.log(`[ROBUST-V2] YouTube API failed for ${lang}:`, error.message);
    this.failureCount++;
   }
  }

  throw new Error('YouTube Transcript API failed for all languages');
 }

 // Strategy 2: Direct subtitle API with user-agent rotation
 async strategyDirectSubtitleAPI(videoId, options = {}) {
  console.log(`[ROBUST-V2] Strategy 2: Direct Subtitle API for ${videoId}`);

  await this.respectRateLimit();

  const userAgents = [
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  const userAgent = userAgents[this.requestCount % userAgents.length];

  const endpoints = [
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=srv3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=srv3`,
  ];

  for (const endpoint of endpoints) {
   try {
    console.log(`[ROBUST-V2] Trying endpoint: ${endpoint.substring(0, 80)}...`);

    const response = await fetch(endpoint, {
     headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept: 'application/json, text/xml, text/plain, */*',
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      Origin: 'https://www.youtube.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
     },
     timeout: 15000,
    });

    if (response.ok) {
     const data = await response.text();

     if (endpoint.includes('json3')) {
      const result = this.parseJSON3Format(data);
      if (result) {
       console.log(`[ROBUST-V2] ✅ Direct API success (JSON3): ${result.segments.length} segments`);
       return result;
      }
     } else {
      const result = this.parseSRV3Format(data);
      if (result) {
       console.log(`[ROBUST-V2] ✅ Direct API success (SRV3): ${result.segments.length} segments`);
       return result;
      }
     }
    }
   } catch (error) {
    console.log(`[ROBUST-V2] Direct API failed for endpoint:`, error.message);
   }
  }

  throw new Error('Direct Subtitle API calls failed');
 }

 // Strategy 3: Enhanced yt-dlp with latest extractor args
 async strategyEnhancedYtDlp(videoId, options = {}) {
  console.log(`[ROBUST-V2] Strategy 3: Enhanced yt-dlp for ${videoId}`);

  await this.respectRateLimit();

  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
   fs.mkdirSync(tempDir, {recursive: true});
  }

  const timestamp = Date.now();

  // Check if cookies are available
  const hasCookies = this.validateCookiesFile();
  const baseArgs = {
   // PART 1: IMPROVED TRANSCRIPT SOURCE QUALITY
   writeSubs: true, // Prioritize manual subtitles
   writeAutoSubs: true, // Fallback to auto-generated
   subLang: ['id', 'en'], // Indonesian first, then English
   subFormat: 'srv3/ttml/vtt', // High-quality subtitle formats
   skipDownload: true,
   output: path.join(tempDir, `${videoId}-${timestamp}-%(title)s.%(ext)s`),
  };

  // Add cookies if available
  if (hasCookies) {
   baseArgs.cookies = this.cookiesPath;
   console.log(`[ROBUST-V2] Using cookies from: ${this.cookiesPath}`);
  } else {
   console.log(`[ROBUST-V2] No cookies available, proceeding without cookies`);
  }

  const strategies = [
   {
    name: 'web_embedded',
    args: {
     ...baseArgs,
     extractorArgs: 'youtube:player_client=web_embedded',
     userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
     addHeader: ['Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
    },
   },
   {
    name: 'android',
    args: {
     ...baseArgs,
     extractorArgs: 'youtube:player_client=android',
     userAgent: 'com.google.android.youtube/17.36.4 (Linux; U; Android 11; SM-G973F Build/RP1A.200720.012) gzip',
     addHeader: ['X-YouTube-Client-Name: 3', 'X-YouTube-Client-Version: 17.36.4'],
    },
   },
   {
    name: 'ios',
    args: {
     ...baseArgs,
     extractorArgs: 'youtube:player_client=ios',
     userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
   },
  ];

  for (const strategy of strategies) {
   try {
    console.log(`[ROBUST-V2] Trying yt-dlp strategy: ${strategy.name}`);

    await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, strategy.args);

    // Look for subtitle files
    const files = fs.readdirSync(tempDir);
    const subtitleFiles = files.filter((file) => file.includes(videoId) && file.includes(timestamp.toString()) && (file.endsWith('.vtt') || file.endsWith('.srt')));

    if (subtitleFiles.length > 0) {
     const preferredFile = this.selectBestSubtitleFile(subtitleFiles);
     const subtitlePath = path.join(tempDir, preferredFile);
     const content = fs.readFileSync(subtitlePath, 'utf8');

     const segments = this.parseSubtitleContent(content);

     // Cleanup
     this.cleanupTempFiles(tempDir, videoId, timestamp);

     if (segments && segments.length > 0) {
      console.log(`[ROBUST-V2] ✅ yt-dlp success (${strategy.name}): ${segments.length} segments`);

      return {
       transcript: segments.map((s) => s.text).join(' '),
       segments: segments,
       language: 'Auto-detected',
       method: `yt-dlp (${strategy.name})`,
       hasRealTiming: true,
       totalSegments: segments.length,
       totalDuration: segments[segments.length - 1]?.end || 0,
       sessionId: this.sessionId,
      };
     }
    }
   } catch (error) {
    console.log(`[ROBUST-V2] yt-dlp strategy ${strategy.name} failed:`, error.message);
    this.cleanupTempFiles(tempDir, videoId, timestamp);
   }
  }

  throw new Error('All yt-dlp strategies failed');
 }

 // Main extraction method
 async extractWithRealTiming(videoId, options = {}) {
  console.log(`[ROBUST-V2] Starting extraction for ${videoId}, session: ${this.sessionId}`);

  const strategies = [() => this.strategyYouTubeTranscriptAPI(videoId, options), () => this.strategyDirectSubtitleAPI(videoId, options), () => this.strategyEnhancedYtDlp(videoId, options)];

  for (let i = 0; i < strategies.length; i++) {
   try {
    const result = await strategies[i]();
    if (this.validateResult(result)) {
     console.log(`[ROBUST-V2] ✅ Strategy ${i + 1} succeeded with ${result.segments.length} segments`);
     this.requestCount++;
     return result;
    }
   } catch (error) {
    console.log(`[ROBUST-V2] ❌ Strategy ${i + 1} failed:`, error.message);
    this.failureCount++;
   }
  }

  throw new Error(`All robust extraction strategies failed. Session: ${this.sessionId}, Attempts: ${this.requestCount}, Failures: ${this.failureCount}`);
 }

 // Utility methods
 parseJSON3Format(data) {
  try {
   const parsed = JSON.parse(data);
   if (!parsed.events || !Array.isArray(parsed.events)) {
    return null;
   }

   const segments = [];

   for (const event of parsed.events) {
    if (event.segs && Array.isArray(event.segs)) {
     const startTime = event.tStartMs ? parseFloat(event.tStartMs / 1000) : 0;
     const duration = event.dDurationMs ? parseFloat(event.dDurationMs / 1000) : 0;
     const endTime = startTime + duration;

     const text = event.segs
      .map((seg) => seg.utf8 || '')
      .join('')
      .trim();

     if (text && text.length > 2 && duration > 0.3) {
      segments.push({
       text: this.cleanText(text),
       start: parseFloat(startTime.toFixed(3)),
       end: parseFloat(endTime.toFixed(3)),
       duration: parseFloat(duration.toFixed(3)),
      });
     }
    }
   }

   if (segments.length > 0) {
    return {
     transcript: segments.map((s) => s.text).join(' '),
     segments: segments,
     language: 'Auto-detected',
     method: 'Direct Subtitle API (JSON3)',
     hasRealTiming: true,
     totalSegments: segments.length,
     totalDuration: segments[segments.length - 1]?.end || 0,
     sessionId: this.sessionId,
    };
   }
  } catch (error) {
   console.log('[ROBUST-V2] Error parsing JSON3:', error.message);
  }

  return null;
 }

 parseSRV3Format(data) {
  try {
   // Parse XML-like SRV3 format
   const timeRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]+)<\/text>/g;
   const segments = [];
   let match;

   while ((match = timeRegex.exec(data)) !== null) {
    const startTime = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const text = match[3]
     .replace(/&lt;/g, '<')
     .replace(/&gt;/g, '>')
     .replace(/&amp;/g, '&')
     .replace(/&quot;/g, '"')
     .replace(/&#39;/g, "'")
     .trim();

    if (text && text.length > 2 && duration > 0.3) {
     segments.push({
      text: this.cleanText(text),
      start: parseFloat(startTime.toFixed(3)),
      end: parseFloat((startTime + duration).toFixed(3)),
      duration: parseFloat(duration.toFixed(3)),
     });
    }
   }

   if (segments.length > 0) {
    return {
     transcript: segments.map((s) => s.text).join(' '),
     segments: segments,
     language: 'Auto-detected',
     method: 'Direct Subtitle API (SRV3)',
     hasRealTiming: true,
     totalSegments: segments.length,
     totalDuration: segments[segments.length - 1]?.end || 0,
     sessionId: this.sessionId,
    };
   }
  } catch (error) {
   console.log('[ROBUST-V2] Error parsing SRV3:', error.message);
  }

  return null;
 }

 parseSubtitleContent(content) {
  try {
   const lines = content.split('\n');
   const segments = [];

   for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // WebVTT format: 00:00:10.500 --> 00:00:13.250
    const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timeMatch) {
     const startTime = this.parseTimeToSeconds(timeMatch[1]);
     const endTime = this.parseTimeToSeconds(timeMatch[2]);

     // Get text content
     let textContent = '';
     let j = i + 1;
     while (j < lines.length && lines[j].trim() && !lines[j].includes('-->')) {
      const textLine = lines[j].trim();
      if (textLine) {
       const cleaned = textLine
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&[^;]+;/g, ' ') // Remove HTML entities
        .replace(/\[.*?\]/g, '') // Remove annotations
        .trim();

       if (cleaned) {
        textContent += (textContent ? ' ' : '') + cleaned;
       }
      }
      j++;
     }

     if (textContent && textContent.length > 2 && endTime - startTime >= 0.5) {
      segments.push({
       text: this.cleanText(textContent),
       start: parseFloat(startTime.toFixed(3)),
       end: parseFloat(endTime.toFixed(3)),
       duration: parseFloat((endTime - startTime).toFixed(3)),
      });
     }

     i = j - 1;
    }
   }

   return segments;
  } catch (error) {
   console.log('[ROBUST-V2] Error parsing subtitle content:', error.message);
   return [];
  }
 }

 parseTimeToSeconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(':');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
 }

 cleanText(text) {
  return text
   .replace(/\s+/g, ' ')
   .replace(/[^\w\s\.,!?;:\-'"()]/g, '')
   .trim();
 }

 selectBestSubtitleFile(files) {
  // PART 1: IMPROVED SUBTITLE SELECTION - Prioritize manual over auto-generated
  // Preference order: Manual Indonesian > Manual English > Auto Indonesian > Auto English > Others

  console.log(`[ROBUST-V2] Selecting best from ${files.length} subtitle files:`, files);

  // First, try to find manual subtitles (non-auto)
  const manualSubtitles = files.filter((file) => !file.includes('.auto.') && !file.includes('-auto.'));
  const autoSubtitles = files.filter((file) => file.includes('.auto.') || file.includes('-auto.'));

  console.log(`[ROBUST-V2] Found ${manualSubtitles.length} manual and ${autoSubtitles.length} auto-generated files`);

  // Priority 1: Manual Indonesian subtitles
  const manualId = manualSubtitles.find((file) => file.includes('.id.') || file.includes('-id.'));
  if (manualId) {
   console.log(`[ROBUST-V2] ✅ Selected manual Indonesian: ${manualId}`);
   return manualId;
  }

  // Priority 2: Manual English subtitles
  const manualEn = manualSubtitles.find((file) => file.includes('.en.') || file.includes('-en.'));
  if (manualEn) {
   console.log(`[ROBUST-V2] ✅ Selected manual English: ${manualEn}`);
   return manualEn;
  }

  // Priority 3: Any other manual subtitles
  if (manualSubtitles.length > 0) {
   console.log(`[ROBUST-V2] ✅ Selected manual (other language): ${manualSubtitles[0]}`);
   return manualSubtitles[0];
  }

  // Priority 4: Auto-generated Indonesian
  const autoId = autoSubtitles.find((file) => file.includes('.id.') || file.includes('-id.'));
  if (autoId) {
   console.log(`[ROBUST-V2] ⚠️ Selected auto-generated Indonesian: ${autoId}`);
   return autoId;
  }

  // Priority 5: Auto-generated English
  const autoEn = autoSubtitles.find((file) => file.includes('.en.') || file.includes('-en.'));
  if (autoEn) {
   console.log(`[ROBUST-V2] ⚠️ Selected auto-generated English: ${autoEn}`);
   return autoEn;
  }

  // Priority 6: Any remaining file
  console.log(`[ROBUST-V2] ⚠️ Selected fallback: ${files[0]}`);
  return files[0];
 }

 cleanupTempFiles(tempDir, videoId, timestamp) {
  try {
   const files = fs.readdirSync(tempDir);
   const filesToDelete = files.filter((file) => file.includes(videoId) && file.includes(timestamp.toString()));

   for (const file of filesToDelete) {
    fs.unlinkSync(path.join(tempDir, file));
   }
  } catch (error) {
   console.log('[ROBUST-V2] Cleanup error:', error.message);
  }
 }

 validateResult(result) {
  return result && result.transcript && result.transcript.length > 50 && result.segments && result.segments.length > 0;
 }
}

export default new RobustYouTubeTranscriptV2();
