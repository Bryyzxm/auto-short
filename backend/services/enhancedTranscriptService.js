/**
 * Enhanced Transcript Service
 * Production-ready solution for YouTube transcript extraction
 * Handles bot detection, rate limiting, and multiple fallback strategies
 */

import antiDetectionTranscript from './antiDetectionTranscript.js';
import {YoutubeTranscript} from 'youtube-transcript';
import fetch from 'node-fetch';

class EnhancedTranscriptService {
 constructor() {
  this.cache = new Map();
  this.requestQueue = [];
  this.isProcessing = false;
  this.rateLimiter = {
   requests: [],
   maxRequests: 5,
   windowMs: 60000, // 1 minute
  };
 }

 // Main extraction method with comprehensive fallback
 async extractTranscript(videoId, options = {}) {
  try {
   // Check cache first
   const cached = this.getFromCache(videoId);
   if (cached) return cached;

   // Add to queue and process
   return await this.queueRequest(videoId, options);
  } catch (error) {
   console.error(`[ENHANCED-TRANSCRIPT] Fatal error for ${videoId}:`, error);
   throw error;
  }
 }

 async queueRequest(videoId, options) {
  return new Promise((resolve, reject) => {
   this.requestQueue.push({videoId, options, resolve, reject});
   this.processQueue();
  });
 }

 async processQueue() {
  if (this.isProcessing || this.requestQueue.length === 0) return;

  this.isProcessing = true;

  while (this.requestQueue.length > 0) {
   const request = this.requestQueue.shift();

   try {
    // Rate limiting
    await this.respectRateLimit();

    // Process with multiple strategies
    const result = await this.executeMultiStrategy(request.videoId, request.options);

    // Cache successful result
    this.cache.set(request.videoId, {
     data: result,
     timestamp: Date.now(),
     ttl: 3600000, // 1 hour
    });

    request.resolve(result);
   } catch (error) {
    request.reject(error);
   }

   // Small delay between requests
   await this.delay(2000);
  }

  this.isProcessing = false;
 }

 async executeMultiStrategy(videoId, options) {
  const strategies = [() => this.strategyAntiDetection(videoId, options), () => this.strategyYouTubeAPI(videoId, options), () => this.strategyDirectAPI(videoId, options), () => this.strategyFallbackLibrary(videoId, options)];

  let lastError = null;

  for (let i = 0; i < strategies.length; i++) {
   try {
    console.log(`[ENHANCED-TRANSCRIPT] Trying strategy ${i + 1}/${strategies.length} for ${videoId}`);

    const result = await Promise.race([
     strategies[i](),
     this.timeoutPromise(45000), // 45 second timeout
    ]);

    if (result && this.validateResult(result)) {
     console.log(`[ENHANCED-TRANSCRIPT] ✅ Strategy ${i + 1} succeeded for ${videoId}`);
     return result;
    }
   } catch (error) {
    lastError = error;
    console.log(`[ENHANCED-TRANSCRIPT] ❌ Strategy ${i + 1} failed for ${videoId}:`, error.message);

    // Progressive delay between strategies
    if (i < strategies.length - 1) {
     await this.delay(Math.min(5000 * (i + 1), 15000));
    }
   }
  }

  throw new Error(`All transcript extraction strategies failed. Last error: ${lastError?.message}`);
 }

 // Strategy 1: Enhanced Anti-Detection Service
 async strategyAntiDetection(videoId, options) {
  const segments = await antiDetectionTranscript.extractTranscriptWithSegments(videoId, options);

  if (segments && segments.length > 0) {
   const transcript = segments.map((s) => s.text).join(' ');
   return {
    transcript,
    segments: segments.map((s) => ({
     text: s.text,
     start: typeof s.start === 'string' ? this.parseTimeToSeconds(s.start) : s.start,
     end: typeof s.end === 'string' ? this.parseTimeToSeconds(s.end) : s.end,
    })),
    method: 'Enhanced Anti-Detection',
    hasRealTiming: true,
   };
  }

  // Fallback to plain transcript
  const plainTranscript = await antiDetectionTranscript.extractTranscript(videoId, options);
  if (plainTranscript && plainTranscript.length > 50) {
   return {
    transcript: plainTranscript,
    segments: this.createEstimatedSegments(plainTranscript),
    method: 'Anti-Detection (Estimated Timing)',
    hasRealTiming: false,
   };
  }

  throw new Error('Anti-detection service failed');
 }

 // Strategy 2: Official YouTube Transcript API
 async strategyYouTubeAPI(videoId, options) {
  const languages = options.lang || ['id', 'en'];

  for (const lang of languages) {
   try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
     lang,
     country: lang === 'id' ? 'ID' : 'US',
    });

    if (transcript && transcript.length > 0) {
     return {
      transcript: transcript.map((t) => t.text).join(' '),
      segments: transcript.map((t) => ({
       text: t.text,
       start: t.offset / 1000,
       end: (t.offset + t.duration) / 1000,
      })),
      method: `YouTube API (${lang.toUpperCase()})`,
      hasRealTiming: true,
     };
    }
   } catch (error) {
    console.log(`[ENHANCED-TRANSCRIPT] YouTube API failed for language ${lang}:`, error.message);
   }
  }

  throw new Error('YouTube Transcript API failed for all languages');
 }

 // Strategy 3: Direct API calls with various endpoints
 async strategyDirectAPI(videoId, options) {
  const endpoints = [
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=srv3`,
   `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
  ];

  for (const endpoint of endpoints) {
   try {
    const response = await fetch(endpoint, {
     headers: {
      'User-Agent': this.getRandomUserAgent(),
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
     },
     timeout: 10000,
    });

    if (response.ok) {
     const data = await response.text();
     const processed = this.processTranscriptData(data, endpoint.includes('json3'));

     if (processed) {
      return {
       transcript: processed.transcript,
       segments: processed.segments || this.createEstimatedSegments(processed.transcript),
       method: 'Direct API',
       hasRealTiming: !!processed.segments,
      };
     }
    }
   } catch (error) {
    console.log(`[ENHANCED-TRANSCRIPT] Direct API failed for ${endpoint}:`, error.message);
   }
  }

  throw new Error('Direct API calls failed');
 }

 // Strategy 4: Fallback library with enhanced error handling
 async strategyFallbackLibrary(videoId, options) {
  // This could integrate with other transcript libraries
  // For now, return empty to indicate failure
  throw new Error('Fallback library not implemented');
 }

 // Helper methods
 validateResult(result) {
  return result && result.transcript && result.transcript.length > 50 && result.segments && result.segments.length > 0;
 }

 createEstimatedSegments(transcript) {
  const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  let currentTime = 0;

  return sentences.map((sentence) => {
   const wordCount = sentence.trim().split(/\s+/).length;
   const duration = Math.max(2, wordCount / 2.5); // ~150 words per minute

   const segment = {
    text: sentence.trim(),
    start: currentTime,
    end: currentTime + duration,
   };

   currentTime += duration;
   return segment;
  });
 }

 processTranscriptData(data, isJson) {
  try {
   if (isJson) {
    const parsed = JSON.parse(data);
    if (parsed.events && Array.isArray(parsed.events)) {
     const transcript = parsed.events
      .filter((event) => event.segs)
      .map((event) => event.segs.map((seg) => seg.utf8 || '').join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

     return {transcript};
    }
   } else {
    // Process SRV3 format
    const textMatches = data.match(/<text[^>]*>(.*?)<\/text>/g);
    if (textMatches) {
     const transcript = textMatches
      .map((match) => match.replace(/<[^>]*>/g, '').trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

     return {transcript};
    }
   }
  } catch (error) {
   console.error('[ENHANCED-TRANSCRIPT] Error processing transcript data:', error);
  }

  return null;
 }

 parseTimeToSeconds(timeString) {
  if (typeof timeString === 'number') return timeString;

  try {
   const [time, milliseconds] = timeString.split('.');
   const [hours, minutes, seconds] = time.split(':').map(Number);
   return hours * 3600 + minutes * 60 + seconds + parseInt(milliseconds || '0') / 1000;
  } catch (error) {
   return 0;
  }
 }

 getRandomUserAgent() {
  const userAgents = [
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
 }

 getFromCache(videoId) {
  const cached = this.cache.get(videoId);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
   return cached.data;
  }

  if (cached) {
   this.cache.delete(videoId);
  }

  return null;
 }

 async respectRateLimit() {
  const now = Date.now();

  // Clean old requests
  this.rateLimiter.requests = this.rateLimiter.requests.filter((time) => now - time < this.rateLimiter.windowMs);

  // Check if we need to wait
  if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
   const oldestRequest = Math.min(...this.rateLimiter.requests);
   const waitTime = this.rateLimiter.windowMs - (now - oldestRequest) + 1000;

   if (waitTime > 0) {
    console.log(`[ENHANCED-TRANSCRIPT] Rate limited, waiting ${waitTime}ms`);
    await this.delay(waitTime);
   }
  }

  this.rateLimiter.requests.push(now);
 }

 timeoutPromise(ms) {
  return new Promise((_, reject) => {
   setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
 }

 delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
 }
}

export default new EnhancedTranscriptService();
