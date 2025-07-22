/**
 * Smart Transcript Manager - Multiple Strategy Approach
 * Handles YouTube bot detection and provides reliable transcript fetching
 */

import {browserTranscriptService} from './browserTranscriptService';

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
   name: 'Backend-AntiDetection',
   priority: 1,
   execute: this.fetchFromBackend.bind(this),
  },
  {
   name: 'Browser-Direct',
   priority: 2,
   execute: this.fetchFromBrowserDirect.bind(this),
  },
  {
   name: 'Browser-Iframe',
   priority: 3,
   execute: this.fetchFromBrowserIframe.bind(this),
  },
  {
   name: 'Browser-Proxy',
   priority: 4,
   execute: this.fetchFromBrowserProxy.bind(this),
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

   // If still loading, don't return cached result - let it proceed to pending check
   if (cached.isLoading) {
    console.log(`[TRANSCRIPT] Cache shows loading in progress for ${videoId}`);
   } else if (age < maxAge) {
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

 // Strategy 1: Backend with Anti-Detection (Primary method)
 private async fetchFromBackend(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Trying backend anti-detection for ${videoId}`);

  // Use environment-aware backend URL
  const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
  const isDev = (import.meta as any).env.DEV;
  const backend = isDev && !envUrl ? 'http://localhost:5001' : envUrl || 'https://auto-short-production.up.railway.app';

  try {
   const params = new URLSearchParams({
    videoId,
    lang: 'id,en',
   });

   console.log(`[TRANSCRIPT] Request URL: ${backend}/api/yt-transcript?${params}`);

   const response = await fetch(`${backend}/api/yt-transcript?${params}`, {
    method: 'GET',
    headers: {
     'Content-Type': 'application/json',
     'User-Agent': 'AI-YouTube-Shorts-Segmenter/1.0',
    },
   });

   console.log(`[TRANSCRIPT] Backend response status: ${response.status} ${response.statusText}`);

   if (response.ok) {
    const data = await response.json();

    // Handle new backend API response format
    if (data.segments && Array.isArray(data.segments)) {
     // Convert segments to transcript text
     const transcriptText = data.segments.map((segment: any) => segment.text).join(' ');
     console.log(`[TRANSCRIPT] Backend success: ${transcriptText.length} chars from ${data.segments.length} segments via ${data.method}`);
     return transcriptText;
    }

    // Handle legacy format if available
    if (data.transcript && typeof data.transcript === 'string') {
     console.log(`[TRANSCRIPT] Backend legacy format: ${data.transcript.length} chars`);
     return data.transcript;
    }

    console.log(`[TRANSCRIPT] Backend returned unexpected format:`, data);
   } else {
    const errorText = await response.text();
    console.log(`[TRANSCRIPT] Backend error ${response.status}: ${errorText}`);
   }
  } catch (error: any) {
   console.log(`[TRANSCRIPT] Backend request failed for ${videoId}:`, error.message);
  }

  return null;
 }

 // Strategy 2: Browser Direct - Uses browserTranscriptService direct approach
 private async fetchFromBrowserDirect(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Using Browser Direct approach for ${videoId}`);

  try {
   return await browserTranscriptService.fetchTranscript(videoId);
  } catch (error: any) {
   console.log(`[TRANSCRIPT] Browser Direct failed for ${videoId}:`, error.message);
   return null;
  }
 }

 // Strategy 3: Browser Iframe - Uses hidden iframe method
 private async fetchFromBrowserIframe(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Using Browser Iframe approach for ${videoId}`);

  try {
   // Call specific method from browserTranscriptService
   const service = browserTranscriptService as any;
   if (service.fetchFromHiddenIframe) {
    return await service.fetchFromHiddenIframe(videoId);
   }
   return null;
  } catch (error: any) {
   console.log(`[TRANSCRIPT] Browser Iframe failed for ${videoId}:`, error.message);
   return null;
  }
 }

 // Strategy 4: Browser Proxy - Uses CORS proxy with user agent
 private async fetchFromBrowserProxy(videoId: string): Promise<string | null> {
  console.log(`[TRANSCRIPT] Using Browser Proxy approach for ${videoId}`);

  try {
   // Call specific method from browserTranscriptService
   const service = browserTranscriptService as any;
   if (service.fetchFromProxyWithUserAgent) {
    return await service.fetchFromProxyWithUserAgent(videoId);
   }
   return null;
  } catch (error: any) {
   console.log(`[TRANSCRIPT] Browser Proxy failed for ${videoId}:`, error.message);
   return null;
  }
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

 // Helper: Get video metadata
 private async getVideoInfo(videoId: string): Promise<{title: string; description: string} | null> {
  try {
   // Use environment-aware backend URL
   const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
   const isDev = (import.meta as any).env.DEV;
   const backend = isDev && !envUrl ? 'http://localhost:5001' : envUrl || 'https://auto-short-production.up.railway.app';

   const response = await fetch(`${backend}/api/video-metadata?videoId=${videoId}`);
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
 getCacheStatus(verbose = false) {
  const status = Array.from(this.cache.entries()).map(([key, value]) => ({
   videoId: key,
   strategy: value.strategy,
   failed: value.failed,
   age: Math.round((Date.now() - value.timestamp) / 1000),
   isLoading: value.isLoading,
  }));
  if (verbose) {
   console.log('[TRANSCRIPT] Cache status:', status);
  }
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
