/**
 * Smart Transcript Manager - Multiple Strategy Approach
 * Handles YouTube bot detection and provides reliable transcript fetching
 */

interface TranscriptCacheEntry {
 data: string | null;
 timestamp: number;
 isLoading: boolean;
 failed: boolean;
 strategy: string;
 error?: string;
}

interface TranscriptStrategy {
 name: string;
 execute: (videoId: string) => Promise<string | null>;
 priority: number;
}

class SmartTranscriptManager {
 private cache = new Map<string, TranscriptCacheEntry>();
 private pendingRequests = new Map<string, Promise<string | null>>();

 // Cache durations
 private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
 private readonly FAILED_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

 // Rate limiting
 private lastRequestTime = 0;
 private readonly MIN_REQUEST_INTERVAL = 3000; // 3 seconds

 private strategies: TranscriptStrategy[] = [
  {
   name: 'Browser-Based',
   priority: 1,
   execute: this.fetchFromBrowser.bind(this),
  },
  {
   name: 'CORS Proxy',
   priority: 2,
   execute: this.fetchFromCORSProxy.bind(this),
  },
  {
   name: 'Alternative API',
   priority: 3,
   execute: this.fetchFromAlternativeAPI.bind(this),
  },
  {
   name: 'Backend Fallback',
   priority: 4,
   execute: this.fetchFromBackend.bind(this),
  },
  {
   name: 'AI Generated',
   priority: 5,
   execute: this.generateWithAI.bind(this),
  },
 ];

 async fetchTranscript(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Request for ${videoId}`);

  // Check cache first
  const cached = this.cache.get(videoId);
  if (cached) {
   const age = Date.now() - cached.timestamp;
   const maxAge = cached.failed ? this.FAILED_CACHE_DURATION : this.CACHE_DURATION;

   if (age < maxAge) {
    console.log(`[TRANSCRIPT] Cache hit for ${videoId} (${cached.strategy}, ${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
    return cached.failed ? null : cached.data;
   } else {
    console.log(`[TRANSCRIPT] Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
    this.cache.delete(videoId);
   }
  }

  // Check pending requests
  if (this.pendingRequests.has(videoId)) {
   console.log(`[TRANSCRIPT] Waiting for pending request for ${videoId}`);
   return this.pendingRequests.get(videoId)!;
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;
  if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
   const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
   console.log(`[TRANSCRIPT] Rate limiting: waiting ${waitTime}ms for ${videoId}`);
   await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  // Execute request with strategy fallback
  const requestPromise = this.executeWithStrategies(videoId);
  this.pendingRequests.set(videoId, requestPromise);
  this.lastRequestTime = Date.now();

  try {
   const result = await requestPromise;
   return result;
  } finally {
   this.pendingRequests.delete(videoId);
  }
 }

 private async executeWithStrategies(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Executing strategies for ${videoId}`);

  // Set loading state
  this.cache.set(videoId, {
   data: null,
   timestamp: Date.now(),
   isLoading: true,
   failed: false,
   strategy: 'loading',
  });

  // Try each strategy in order of priority
  for (const strategy of this.strategies) {
   console.log(`[TRANSCRIPT] Trying strategy: ${strategy.name} for ${videoId}`);

   try {
    const result = await Promise.race([strategy.execute(videoId), new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Strategy timeout')), 20000))]);

    if (result && result.length > 0) {
     // Success - cache the result
     this.cache.set(videoId, {
      data: result,
      timestamp: Date.now(),
      isLoading: false,
      failed: false,
      strategy: strategy.name,
     });

     console.log(`[TRANSCRIPT] Success with ${strategy.name} for ${videoId} (${result.length} chars)`);
     return result;
    } else {
     console.log(`[TRANSCRIPT] Strategy ${strategy.name} returned empty result for ${videoId}`);
    }
   } catch (error: any) {
    console.log(`[TRANSCRIPT] Strategy ${strategy.name} failed for ${videoId}:`, error.message);
   }
  }

  // All strategies failed - cache the failure
  this.cache.set(videoId, {
   data: null,
   timestamp: Date.now(),
   isLoading: false,
   failed: true,
   strategy: 'all-failed',
   error: 'All transcript strategies failed',
  });

  console.log(`[TRANSCRIPT] All strategies failed for ${videoId}`);
  return null;
 }

 // Strategy 1: Browser-based (uses user's IP and browser context)
 private async fetchFromBrowser(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Trying browser-based approach for ${videoId}`);

  try {
   // Method 1: YouTube's internal API (same-origin only)
   if (window.location.hostname === 'www.youtube.com') {
    const response = await fetch(`/api/timedtext?v=${videoId}&lang=id&fmt=json3`);
    if (response.ok) {
     const data = await response.json();
     return this.processYouTubeTimedText(data);
    }
   }

   // Method 2: Use iframe messaging (if iframe is available)
   const transcript = await this.fetchFromYouTubeIframe(videoId);
   if (transcript) return transcript;
  } catch (error: any) {
   console.log(`[TRANSCRIPT] Browser-based failed for ${videoId}:`, error.message);
  }

  return null;
 }

 // Strategy 2: CORS Proxy approach
 private async fetchFromCORSProxy(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Trying CORS proxy for ${videoId}`);

  const proxies = ['https://api.allorigins.win/raw?url=', 'https://corsproxy.io/?', 'https://cors-anywhere.herokuapp.com/'];

  for (const proxy of proxies) {
   try {
    const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`;
    const response = await fetch(`${proxy}${encodeURIComponent(targetUrl)}`, {
     headers: {
      'X-Requested-With': 'XMLHttpRequest',
     },
    });

    if (response.ok) {
     const data = await response.json();
     const transcript = this.processYouTubeTimedText(data);
     if (transcript) return transcript;
    }
   } catch (error: any) {
    console.log(`[TRANSCRIPT] CORS proxy ${proxy} failed for ${videoId}:`, error.message);
   }
  }

  return null;
 }

 // Strategy 3: Alternative APIs
 private async fetchFromAlternativeAPI(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Trying alternative APIs for ${videoId}`);

  // You can add alternative API services here
  // For example: RapidAPI, other transcript services, etc.

  return null;
 }

 // Strategy 4: Backend fallback (current implementation)
 private async fetchFromBackend(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Trying backend fallback for ${videoId}`);

  const backend = 'https://auto-short-production.up.railway.app';

  try {
   const params = new URLSearchParams({
    videoId,
    lang: 'id,en',
   });

   const response = await fetch(`${backend}/api/yt-transcript?${params}`, {
    method: 'GET',
    headers: {
     'Content-Type': 'application/json',
     'User-Agent': 'AI-YouTube-Shorts-Segmenter/1.0',
    },
   });

   if (response.ok) {
    const data = await response.json();
    if (data.transcript && typeof data.transcript === 'string') {
     return data.transcript;
    }
   }
  } catch (error: any) {
   console.log(`[TRANSCRIPT] Backend fallback failed for ${videoId}:`, error.message);
  }

  return null;
 }

 // Strategy 5: AI-generated transcript (ultimate fallback)
 private async generateWithAI(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Generating AI transcript for ${videoId}`);

  try {
   // Use video metadata to generate approximate transcript
   const videoInfo = await this.getVideoInfo(videoId);
   if (videoInfo) {
    return `AI-generated transcript: This video appears to be about ${videoInfo.title}. ${videoInfo.description || 'Content includes various discussion topics and highlights.'}`;
   }
  } catch (error: any) {
   console.log(`[TRANSCRIPT] AI generation failed for ${videoId}:`, error.message);
  }

  return null;
 }

 // Helper: Process YouTube's timedtext format
 private processYouTubeTimedText(data: any): string | null {
  try {
   if (data.events && Array.isArray(data.events)) {
    const transcript = data.events
     .filter((event: any) => event.segs)
     .map((event: any) => event.segs.map((seg: any) => seg.utf8).join(''))
     .join(' ')
     .replace(/\n/g, ' ')
     .replace(/\s+/g, ' ')
     .trim();

    return transcript.length > 0 ? transcript : null;
   }
  } catch (error) {
   console.log('[TRANSCRIPT] Error processing YouTube timedtext:', error);
  }

  return null;
 }

 // Helper: Fetch from YouTube iframe
 private async fetchFromYouTubeIframe(videoId: string): Promise<string | null> {
  // This would require iframe communication
  // Implementation depends on specific iframe setup
  return null;
 }

 // Helper: Get video metadata
 private async getVideoInfo(videoId: string): Promise<{title: string; description: string} | null> {
  try {
   // You could fetch this from your backend or other APIs
   const response = await fetch(`https://auto-short-production.up.railway.app/api/video-metadata?videoId=${videoId}`);
   if (response.ok) {
    const data = await response.json();
    return {
     title: data.title || '',
     description: data.description || '',
    };
   }
  } catch (error) {
   console.log('[TRANSCRIPT] Failed to get video info:', error);
  }

  return null;
 }

 // Debug methods
 getCacheStatus() {
  const status = Array.from(this.cache.entries()).map(([key, value]) => ({
   videoId: key,
   strategy: value.strategy,
   failed: value.failed,
   age: Math.round((Date.now() - value.timestamp) / 1000),
   isLoading: value.isLoading,
  }));
  console.log('[TRANSCRIPT] Cache status:', status);
  return status;
 }

 clearCache() {
  this.cache.clear();
  console.log('[TRANSCRIPT] Cache cleared');
 }
}

// Global singleton instance
export const transcriptManager = new SmartTranscriptManager();

// Export for use in components
export default transcriptManager;
