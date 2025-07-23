/**
 * EMERGENCY TRANSCRIPT RECOVERY SERVICE
 * Solusi darurat untuk masalah transcript yang gagal
 */

import {YoutubeTranscript} from 'youtube-transcript';

class EmergencyTranscriptService {
 constructor() {
  this.cache = new Map();
  this.failureCount = 0;
  this.successCount = 0;
 }

 async extractTranscript(videoId, options = {}) {
  console.log(`[EMERGENCY] Starting emergency extraction for ${videoId}`);

  // Check cache first
  const cached = this.cache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 300000) {
   // 5 minute cache
   console.log(`[EMERGENCY] ✅ Cache hit for ${videoId}`);
   return cached.data;
  }

  const strategies = [() => this.simpleYouTubeTranscript(videoId), () => this.multiLanguageTranscript(videoId), () => this.createFallbackSegments(videoId)];

  for (let i = 0; i < strategies.length; i++) {
   try {
    const result = await strategies[i]();
    if (this.validateResult(result)) {
     console.log(`[EMERGENCY] ✅ Strategy ${i + 1} succeeded: ${result.segments.length} segments`);

     // Cache result
     this.cache.set(videoId, {
      data: result,
      timestamp: Date.now(),
     });

     this.successCount++;
     return result;
    }
   } catch (error) {
    console.log(`[EMERGENCY] ❌ Strategy ${i + 1} failed:`, error.message);
    this.failureCount++;
   }
  }

  throw new Error(`All emergency strategies failed for ${videoId}. Success rate: ${this.successCount}/${this.successCount + this.failureCount}`);
 }

 async simpleYouTubeTranscript(videoId) {
  console.log(`[EMERGENCY] Trying simple YouTube transcript for ${videoId}`);

  // Try default first (no language specified)
  try {
   const transcript = await YoutubeTranscript.fetchTranscript(videoId);

   if (transcript && transcript.length > 0) {
    const segments = transcript.map((item) => ({
     text: item.text.trim(),
     start: parseFloat((item.offset / 1000).toFixed(2)),
     end: parseFloat(((item.offset + item.duration) / 1000).toFixed(2)),
    }));

    return {
     segments: segments,
     language: 'Auto-detected',
     source: 'YouTube Transcript API',
     method: 'Simple Default',
     hasRealTiming: true,
     length: segments.map((s) => s.text).join(' ').length,
    };
   }
  } catch (error) {
   console.log(`[EMERGENCY] Simple default failed:`, error.message);
  }

  throw new Error('Simple YouTube transcript failed');
 }

 async multiLanguageTranscript(videoId) {
  console.log(`[EMERGENCY] Trying multi-language transcript for ${videoId}`);

  const languages = [
   {code: 'id', country: 'ID', name: 'Indonesian'},
   {code: 'en', country: 'US', name: 'English'},
   {code: 'auto', country: null, name: 'Auto'},
  ];

  for (const lang of languages) {
   try {
    const config =
     lang.code === 'auto'
      ? {}
      : {
         lang: lang.code,
         country: lang.country,
        };

    const transcript = await YoutubeTranscript.fetchTranscript(videoId, config);

    if (transcript && transcript.length > 0) {
     console.log(`[EMERGENCY] ✅ Success with ${lang.name} (${transcript.length} segments)`);

     const segments = transcript.map((item) => ({
      text: item.text.trim(),
      start: parseFloat((item.offset / 1000).toFixed(2)),
      end: parseFloat(((item.offset + item.duration) / 1000).toFixed(2)),
     }));

     return {
      segments: segments,
      language: lang.name,
      source: 'YouTube Transcript API',
      method: `Multi-language (${lang.name})`,
      hasRealTiming: true,
      length: segments.map((s) => s.text).join(' ').length,
     };
    }
   } catch (error) {
    console.log(`[EMERGENCY] ${lang.name} failed:`, error.message);
   }
  }

  throw new Error('Multi-language transcript failed');
 }

 async createFallbackSegments(videoId) {
  console.log(`[EMERGENCY] Creating fallback segments for ${videoId}`);

  // This creates dummy segments as absolute last resort
  // In real scenario, this might scrape video description or use other sources
  const fallbackSegments = [
   {
    text: 'Video content is available but transcript extraction failed.',
    start: 0,
    end: 30,
   },
   {
    text: 'This is an automatically generated fallback transcript.',
    start: 30,
    end: 60,
   },
   {
    text: 'Please try using a different video with available captions.',
    start: 60,
    end: 90,
   },
  ];

  return {
   segments: fallbackSegments,
   language: 'Fallback',
   source: 'Emergency Fallback',
   method: 'Dummy Segments',
   hasRealTiming: false,
   length: fallbackSegments.map((s) => s.text).join(' ').length,
   isFallback: true,
  };
 }

 validateResult(result) {
  return result && result.segments && result.segments.length > 0 && result.segments.some((s) => s.text && s.text.length > 5);
 }

 getStats() {
  return {
   successCount: this.successCount,
   failureCount: this.failureCount,
   cacheSize: this.cache.size,
   successRate: this.successCount / (this.successCount + this.failureCount) || 0,
  };
 }
}

export default new EmergencyTranscriptService();
