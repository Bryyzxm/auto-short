/**
 * ROBUST TRANSCRIPT SERVICE WITH REAL TIMING
 * Production-ready solution for accurate transcript extraction
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {YoutubeTranscript} = require('youtube-transcript');

class RobustTranscriptService {
 constructor() {
  this.cache = new Map();
  this.rateLimitDelay = 2000;
  this.lastRequestTime = 0;
 }

 // MAIN METHOD: Extract transcript with accurate timing
 async extractWithRealTiming(videoId, options = {}) {
  console.log(`[ROBUST] Starting extraction for ${videoId}`);

  const strategies = [() => this.strategyYouTubeTranscriptAPI(videoId, options), () => this.strategyDirectSubtitleAPI(videoId, options), () => this.strategyYouTubePlayerAPI(videoId, options)];

  for (let i = 0; i < strategies.length; i++) {
   try {
    const result = await strategies[i]();
    if (this.validateResult(result)) {
     console.log(`[ROBUST] ✅ Strategy ${i + 1} succeeded with ${result.segments.length} segments`);
     return result;
    }
   } catch (error) {
    console.log(`[ROBUST] ❌ Strategy ${i + 1} failed:`, error.message);
   }
  }

  throw new Error('All robust extraction strategies failed');
 }

 // Strategy 1: YouTube Transcript API (most reliable)
 async strategyYouTubeTranscriptAPI(videoId, options) {
  await this.respectRateLimit();

  const languages = options.lang || ['id', 'en'];

  for (const lang of languages) {
   try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
     lang: lang,
     country: lang === 'id' ? 'ID' : 'US',
    });

    if (transcript && transcript.length > 0) {
     console.log(`[ROBUST] YouTube API success for ${lang}: ${transcript.length} segments`);

     const segments = transcript
      .map((item) => ({
       text: this.cleanText(item.text),
       start: parseFloat((item.offset / 1000).toFixed(3)),
       end: parseFloat(((item.offset + item.duration) / 1000).toFixed(3)),
       duration: parseFloat((item.duration / 1000).toFixed(3)),
      }))
      .filter((seg) => seg.text.length > 5 && seg.duration > 0.5);

     return {
      transcript: segments.map((s) => s.text).join(' '),
      segments: segments,
      language: lang,
      method: `YouTube Transcript API (${lang.toUpperCase()})`,
      hasRealTiming: true,
      totalSegments: segments.length,
      totalDuration: segments[segments.length - 1]?.end || 0,
     };
    }
   } catch (error) {
    console.log(`[ROBUST] YouTube API failed for ${lang}:`, error.message);
   }
  }

  throw new Error('YouTube Transcript API failed for all languages');
 }

 // Strategy 2: Direct Subtitle API calls
 async strategyDirectSubtitleAPI(videoId, options) {
  await this.respectRateLimit();

  const endpoints = [
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=srv3&name=`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3&name=`,
  ];

  for (const endpoint of endpoints) {
   try {
    const response = await fetch(endpoint, {
     headers: {
      'User-Agent': this.getRandomUserAgent(),
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      Accept: 'application/json, text/xml, text/plain, */*',
     },
     timeout: 15000,
    });

    if (response.ok) {
     const data = await response.text();

     if (endpoint.includes('json3')) {
      const result = this.parseJSON3Format(data);
      if (result) return result;
     } else {
      const result = this.parseSRV3Format(data);
      if (result) return result;
     }
    }
   } catch (error) {
    console.log(`[ROBUST] Direct API failed for ${endpoint}:`, error.message);
   }
  }

  throw new Error('Direct Subtitle API calls failed');
 }

 // Strategy 3: YouTube Player API
 async strategyYouTubePlayerAPI(videoId, options) {
  await this.respectRateLimit();

  try {
   const playerResponse = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
     'User-Agent': this.getRandomUserAgent(),
     'X-YouTube-Client-Name': '1',
     'X-YouTube-Client-Version': '2.20240101.00.00',
     Origin: 'https://www.youtube.com',
     Referer: `https://www.youtube.com/watch?v=${videoId}`,
    },
    body: JSON.stringify({
     context: {
      client: {
       clientName: 'WEB',
       clientVersion: '2.20240101.00.00',
      },
     },
     videoId: videoId,
    }),
    timeout: 15000,
   });

   if (playerResponse.ok) {
    const playerData = await playerResponse.json();
    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (captions && captions.length > 0) {
     // Find Indonesian or English captions
     const track = captions.find((t) => t.languageCode === 'id') || captions.find((t) => t.languageCode === 'en') || captions[0];

     if (track?.baseUrl) {
      const captionResponse = await fetch(track.baseUrl + '&fmt=json3');
      if (captionResponse.ok) {
       const captionData = await captionResponse.text();
       return this.parseJSON3Format(captionData, track.languageCode);
      }
     }
    }
   }
  } catch (error) {
   console.log('[ROBUST] YouTube Player API failed:', error.message);
  }

  throw new Error('YouTube Player API failed');
 }

 // Parse JSON3 format (YouTube's native timing format)
 parseJSON3Format(data, language = 'auto') {
  try {
   const parsed = JSON.parse(data);
   if (!parsed.events || !Array.isArray(parsed.events)) {
    throw new Error('Invalid JSON3 format');
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

   if (segments.length === 0) {
    throw new Error('No valid segments found in JSON3');
   }

   console.log(`[ROBUST] JSON3 parsing success: ${segments.length} segments`);

   return {
    transcript: segments.map((s) => s.text).join(' '),
    segments: segments,
    language: language,
    method: 'Direct JSON3 API',
    hasRealTiming: true,
    totalSegments: segments.length,
    totalDuration: segments[segments.length - 1]?.end || 0,
   };
  } catch (error) {
   console.error('[ROBUST] JSON3 parsing failed:', error);
   return null;
  }
 }

 // Parse SRV3/XML format
 parseSRV3Format(data, language = 'auto') {
  try {
   // Simple regex parsing for XML format
   const textMatches = [...data.matchAll(/<text start="([^"]*)" dur="([^"]*)"[^>]*>(.*?)<\/text>/g)];

   if (textMatches.length === 0) {
    throw new Error('No text elements found in SRV3');
   }

   const segments = textMatches
    .map((match) => {
     const start = parseFloat(match[1]);
     const duration = parseFloat(match[2]);
     const text = match[3]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, '')
      .trim();

     return {
      text: this.cleanText(text),
      start: parseFloat(start.toFixed(3)),
      end: parseFloat((start + duration).toFixed(3)),
      duration: parseFloat(duration.toFixed(3)),
     };
    })
    .filter((seg) => seg.text.length > 2 && seg.duration > 0.3);

   if (segments.length === 0) {
    throw new Error('No valid segments after SRV3 parsing');
   }

   console.log(`[ROBUST] SRV3 parsing success: ${segments.length} segments`);

   return {
    transcript: segments.map((s) => s.text).join(' '),
    segments: segments,
    language: language,
    method: 'Direct SRV3 API',
    hasRealTiming: true,
    totalSegments: segments.length,
    totalDuration: segments[segments.length - 1]?.end || 0,
   };
  } catch (error) {
   console.error('[ROBUST] SRV3 parsing failed:', error);
   return null;
  }
 }

 // Enhanced text cleaning
 cleanText(text) {
  return text
   .replace(/\[.*?\]/g, '') // Remove [Music], [Applause]
   .replace(/\(.*?\)/g, '') // Remove (background noise)
   .replace(/<[^>]*>/g, '') // Remove HTML tags
   .replace(/&[a-zA-Z]+;/g, ' ') // Remove HTML entities
   .replace(/\s+/g, ' ') // Normalize whitespace
   .trim();
 }

 // Validation
 validateResult(result) {
  return result && result.transcript && result.transcript.length > 100 && result.segments && result.segments.length > 10 && result.hasRealTiming === true;
 }

 // Rate limiting
 async respectRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;

  if (timeSinceLastRequest < this.rateLimitDelay) {
   const waitTime = this.rateLimitDelay - timeSinceLastRequest;
   await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  this.lastRequestTime = Date.now();
 }

 getRandomUserAgent() {
  const userAgents = [
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
 }
}

const robustTranscriptService = new RobustTranscriptService();

// Export with an extract method for compatibility
module.exports = {
 extract: async (videoId, options = {}) => {
  return await robustTranscriptService.extractWithRealTiming(videoId, options);
 },
 service: robustTranscriptService,
};
