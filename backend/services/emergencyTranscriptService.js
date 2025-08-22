const {YoutubeTranscript} = require('youtube-transcript');
const fs = require('fs');
const path = require('path');

/**
 * ENHANCED Emergency transcript service with VTT file recovery capability
 * Last-resort transcript service using the 'youtube-transcript' library + existing VTT files.
 * @param {string} videoId The YouTube video ID.
 * @returns {Promise<Array<{text: string, start: number, duration: number}>>} A promise that resolves to the transcript segments.
 */
async function extract(videoId) {
 const startTime = Date.now();
 stats.totalRequests++;
 stats.lastRequestTime = new Date().toISOString();

 console.log(`Emergency Transcript Service: Attempting to fetch transcript for videoId: ${videoId}`);

 // 🚨 FIRST ATTEMPT: Check for existing VTT files from previous failed attempts
 const vttRecoveryResult = await attemptVttFileRecovery(videoId);
 if (vttRecoveryResult) {
  console.log(`Emergency Transcript Service: ✅ VTT file recovery successful`);
  stats.successfulRequests++;
  return vttRecoveryResult;
 }

 // Try multiple languages in order of preference
 const languages = ['en', 'id', 'es', 'fr', 'de', 'pt', 'ja'];

 for (const lang of languages) {
  try {
   console.log(`Emergency Transcript Service: Trying language: ${lang}`);
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: lang,
    country: 'US',
    // Railway-style configuration
    headers: {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
     'Accept-Language': 'en-US,en;q=0.9',
     Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
   });

   if (transcript && transcript.length > 0) {
    console.log(`Emergency Transcript Service: Successfully fetched ${transcript.length} segments in ${lang}.`);

    stats.successfulRequests++;
    stats.avgResponseTime = (stats.avgResponseTime * (stats.totalRequests - 1) + (Date.now() - startTime)) / stats.totalRequests;

    // The library already returns the desired format { text, duration, offset }
    // We just need to rename 'offset' to 'start' for consistency
    return {
     segments: transcript.map((item) => ({
      text: item.text,
      start: parseFloat((item.offset / 1000).toFixed(3)),
      duration: parseFloat((item.duration / 1000).toFixed(3)),
     })),
     language: lang,
     source: 'youtube-transcript',
    };
   } else {
    console.log(`Emergency Transcript Service: Language ${lang} returned empty transcript.`);
   }
  } catch (error) {
   console.log(`Emergency Transcript Service: Language ${lang} failed: ${error.message}`);
   // Continue to next language
  }
 }

 stats.failedRequests++;
 stats.errors.push({
  videoId,
  timestamp: new Date().toISOString(),
  error: 'No transcript found in any supported language',
 });

 console.error('Emergency Transcript Service: No transcript found in any supported language.');
 throw new Error('No transcript found by emergency service.');
}

/**
 * 🚨 VTT FILE RECOVERY FUNCTION
 * Attempt to recover transcript from existing VTT files left by failed yt-dlp attempts
 */
async function attemptVttFileRecovery(videoId) {
 console.log(`Emergency Transcript Service: 🩹 Attempting VTT file recovery for ${videoId}`);

 const tempDir = path.join(__dirname, '../temp');
 if (!fs.existsSync(tempDir)) {
  return null;
 }

 // Check for existing VTT files with various patterns
 const vttPatterns = [
  `${videoId}_plugin.id.vtt`,
  `${videoId}_tv_embedded.id.vtt`,
  `${videoId}_web_embedded.id.vtt`,
  `${videoId}.id.vtt`,
  `${videoId}_plugin.en.vtt`,
  `${videoId}_tv_embedded.en.vtt`,
  `${videoId}_web_embedded.en.vtt`,
  `${videoId}.en.vtt`,
  `${videoId}.vtt`,
 ];

 for (const pattern of vttPatterns) {
  const vttPath = path.join(tempDir, pattern);

  if (fs.existsSync(vttPath)) {
   console.log(`Emergency Transcript Service: 🎉 Found existing VTT file: ${pattern}`);

   try {
    const segments = parseVttFile(vttPath);
    const isIndonesian = pattern.includes('.id.vtt');

    if (segments && segments.length > 0) {
     console.log(`Emergency Transcript Service: ✅ Parsed ${segments.length} segments from ${pattern}`);

     return {
      segments: segments.map((seg) => ({
       text: seg.text,
       start: seg.start,
       duration: seg.end - seg.start,
      })),
      language: isIndonesian ? 'indonesian' : 'english',
      source: 'vtt-file-recovery',
      method: 'emergency-vtt-recovery',
      originalFile: pattern,
     };
    }
   } catch (parseError) {
    console.log(`Emergency Transcript Service: ❌ Failed to parse ${pattern}: ${parseError.message}`);
   }
  }
 }

 console.log(`Emergency Transcript Service: ❌ No recoverable VTT files found`);
 return null;
}

/**
 * Parse VTT file content into segments
 */
function parseVttFile(vttFilePath) {
 try {
  const content = fs.readFileSync(vttFilePath, 'utf8');

  if (!content || !content.includes('WEBVTT')) {
   return [];
  }

  const segments = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
   const line = lines[i].trim();

   if (line.includes('-->')) {
    const [startTime, endTimeRaw] = line.split(' --> ');
    const endTime = endTimeRaw.split(' ')[0];
    const textLines = [];

    for (let j = i + 1; j < lines.length; j++) {
     const textLine = lines[j].trim();
     if (!textLine || textLine.includes('-->')) {
      break;
     }
     textLines.push(textLine);
    }

    if (textLines.length > 0) {
     const start = parseTime(startTime);
     const end = parseTime(endTime);
     const text = textLines
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .trim();

     if (text && text.length > 0 && start >= 0 && end > start) {
      segments.push({
       start: start,
       end: end,
       text: text,
      });
     }
    }
   }
  }

  return segments;
 } catch (error) {
  console.log(`Emergency Transcript Service: Parse error: ${error.message}`);
  return [];
 }
}

/**
 * Parse time string to seconds
 */
function parseTime(timeStr) {
 try {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;

  return hours * 3600 + minutes * 60 + seconds;
 } catch (error) {
  return 0;
 }
}

// Add stats tracking for server.js compatibility
const stats = {
 totalRequests: 0,
 successfulRequests: 0,
 failedRequests: 0,
 avgResponseTime: 0,
 lastRequestTime: null,
 errors: [],
};

function getStats() {
 return {
  ...stats,
  successRate: stats.totalRequests > 0 ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) : '0.00',
 };
}

module.exports = {extract, getStats};
