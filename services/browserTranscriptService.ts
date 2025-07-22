/**
 * Browser Transcript Service - Client-side approach to bypass YouTube bot detection
 * Uses user's browser directly to access YouTube content
 */

interface BrowserTranscriptCache {
 data: string | null;
 timestamp: number;
 failed: boolean;
 method: string;
}

class BrowserTranscriptService {
 private cache = new Map<string, BrowserTranscriptCache>();
 private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
 private readonly FAILED_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for failed

 async fetchTranscript(videoId: string): Promise<string | null> {
  console.log(`[BROWSER-TRANSCRIPT] Starting fetch for ${videoId}`);

  // Check cache first
  const cached = this.cache.get(videoId);
  if (cached) {
   const age = Date.now() - cached.timestamp;
   const maxAge = cached.failed ? this.FAILED_CACHE_DURATION : this.CACHE_DURATION;

   if (age < maxAge) {
    console.log(`[BROWSER-TRANSCRIPT] Cache hit for ${videoId} (${cached.method}, ${cached.failed ? 'failed' : 'success'}, ${Math.round(age / 1000)}s ago)`);
    return cached.failed ? null : cached.data;
   } else {
    console.log(`[BROWSER-TRANSCRIPT] Cache expired for ${videoId} (${Math.round(age / 1000)}s old)`);
    this.cache.delete(videoId);
   }
  }

  // Try multiple browser-based methods
  const methods = [
   () => this.fetchFromYouTubeDirectAPI(videoId),
   () => this.fetchFromHiddenIframe(videoId),
   () => this.fetchFromProxyWithUserAgent(videoId),
   () => this.fetchFromYouTubeInternalAPI(videoId),
   () => this.fetchFromAlternativeEndpoint(videoId),
  ];

  for (let i = 0; i < methods.length; i++) {
   const methodName = ['YouTube Direct API', 'Hidden Iframe', 'Proxy with User Agent', 'YouTube Internal API', 'Alternative Endpoint'][i];

   // Only log attempts for successful methods to reduce noise
   // console.log(`[BROWSER-TRANSCRIPT] Trying method ${i + 1}/5: ${methodName} for ${videoId}`);

   try {
    const result = await Promise.race([methods[i](), new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Method timeout')), 15000))]);

    if (result && result.length > 10) {
     // Success - cache the result
     this.cache.set(videoId, {
      data: result,
      timestamp: Date.now(),
      failed: false,
      method: methodName,
     });

     console.log(`[BROWSER-TRANSCRIPT] Success with ${methodName} for ${videoId} (${result.length} chars)`);
     return result;
    } else {
     // console.log(`[BROWSER-TRANSCRIPT] Method ${methodName} returned empty result for ${videoId}`);
    }
   } catch (error: any) {
    console.log(`[BROWSER-TRANSCRIPT] Method ${methodName} failed for ${videoId}:`, error.message);
   }
  }

  // All methods failed - cache the failure
  this.cache.set(videoId, {
   data: null,
   timestamp: Date.now(),
   failed: true,
   method: 'all-methods-failed',
  });

  console.log(`[BROWSER-TRANSCRIPT] All methods failed for ${videoId}`);
  return null;
 }

 // Method 1: YouTube Direct API with user's session
 private async fetchFromYouTubeDirectAPI(videoId: string): Promise<string | null> {
  try {
   // Try different YouTube API endpoints
   const endpoints = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
   ];

   for (const endpoint of endpoints) {
    console.log(`[BROWSER-TRANSCRIPT] Trying endpoint: ${endpoint}`);

    try {
     const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include', // Include cookies for user session
      headers: {
       Accept: 'application/json, text/plain, */*',
       'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
       'Cache-Control': 'no-cache',
       Pragma: 'no-cache',
       'Sec-Fetch-Dest': 'empty',
       'Sec-Fetch-Mode': 'cors',
       'Sec-Fetch-Site': 'same-origin',
       'X-Requested-With': 'XMLHttpRequest',
      },
     });

     if (response.ok) {
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('json')) {
       const data = await response.json();
       return this.processYouTubeJSON(data);
      } else {
       const text = await response.text();
       return this.processYouTubeSRV3(text);
      }
     } else {
      console.log(`[BROWSER-TRANSCRIPT] Endpoint failed with status ${response.status}: ${endpoint}`);
     }
    } catch (error: any) {
     console.log(`[BROWSER-TRANSCRIPT] Endpoint error: ${endpoint} - ${error.message}`);
    }
   }
  } catch (error: any) {
   console.log(`[BROWSER-TRANSCRIPT] YouTube Direct API failed:`, error.message);
  }

  return null;
 }

 // Method 2: Hidden iframe approach
 private async fetchFromHiddenIframe(videoId: string): Promise<string | null> {
  return new Promise((resolve) => {
   console.log(`[BROWSER-TRANSCRIPT] Creating hidden iframe for ${videoId}`);

   const iframe = document.createElement('iframe');
   iframe.style.display = 'none';
   iframe.style.width = '1px';
   iframe.style.height = '1px';
   iframe.style.position = 'absolute';
   iframe.style.top = '-9999px';
   iframe.src = `https://www.youtube.com/watch?v=${videoId}&t=1s`;

   let resolved = false;

   const cleanup = () => {
    if (document.body.contains(iframe)) {
     document.body.removeChild(iframe);
    }
   };

   iframe.onload = () => {
    console.log(`[BROWSER-TRANSCRIPT] Iframe loaded for ${videoId}`);

    // Wait for page to fully load, then try to extract
    setTimeout(async () => {
     if (resolved) return;

     try {
      // Try to access iframe content (will likely fail due to CORS)
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
       const transcript = this.extractTranscriptFromDOM(doc);
       if (transcript) {
        resolved = true;
        cleanup();
        resolve(transcript);
        return;
       }
      }

      // CORS blocked - try postMessage approach
      iframe.contentWindow?.postMessage(
       {
        type: 'EXTRACT_TRANSCRIPT',
        videoId: videoId,
       },
       'https://www.youtube.com'
      );
     } catch (error: any) {
      console.log(`[BROWSER-TRANSCRIPT] Cannot access iframe content for ${videoId}:`, error.message);
     }

     if (!resolved) {
      resolved = true;
      cleanup();
      resolve(null);
     }
    }, 5000);
   };

   iframe.onerror = () => {
    console.log(`[BROWSER-TRANSCRIPT] Iframe failed to load for ${videoId}`);
    if (!resolved) {
     resolved = true;
     cleanup();
     resolve(null);
    }
   };

   // Timeout fallback
   setTimeout(() => {
    if (!resolved) {
     resolved = true;
     cleanup();
     resolve(null);
    }
   }, 12000);

   document.body.appendChild(iframe);
  });
 }

 // Method 3: Proxy with user agent spoofing
 private async fetchFromProxyWithUserAgent(videoId: string): Promise<string | null> {
  const proxies = ['https://api.allorigins.win/get?url=', 'https://corsproxy.io/?', 'https://cors-anywhere.herokuapp.com/'];

  const userAgents = [
   'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
   'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
   'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  ];

  for (const proxy of proxies) {
   for (const userAgent of userAgents) {
    try {
     const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`;
     const proxyUrl = proxy + encodeURIComponent(targetUrl);

     console.log(`[BROWSER-TRANSCRIPT] Trying proxy: ${proxy.split('//')[1].split('/')[0]} with ${userAgent.includes('iPhone') ? 'iPhone' : userAgent.includes('Android') ? 'Android' : 'iPad'} UA`);

     const response = await fetch(proxyUrl, {
      headers: {
       'User-Agent': userAgent,
       Accept: 'application/json, text/plain, */*',
       'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
       Referer: 'https://www.youtube.com/',
       Origin: 'https://www.youtube.com',
      },
     });

     if (response.ok) {
      const text = await response.text();

      // Handle different proxy response formats
      let data;
      if (proxy.includes('allorigins')) {
       const parsed = JSON.parse(text);
       data = JSON.parse(parsed.contents);
      } else {
       data = JSON.parse(text);
      }

      const transcript = this.processYouTubeJSON(data);
      if (transcript) return transcript;
     }
    } catch (error: any) {
     console.log(`[BROWSER-TRANSCRIPT] Proxy ${proxy.split('//')[1].split('/')[0]} failed:`, error.message);
    }
   }
  }

  return null;
 }

 // Method 4: YouTube internal API endpoints
 private async fetchFromYouTubeInternalAPI(videoId: string): Promise<string | null> {
  try {
   // Try YouTube's internal player API
   const playerResponse = await fetch(`https://www.youtube.com/youtubei/v1/player`, {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
     'X-YouTube-Client-Name': '1',
     'X-YouTube-Client-Version': '2.0',
     Origin: 'https://www.youtube.com',
     Referer: `https://www.youtube.com/watch?v=${videoId}`,
    },
    body: JSON.stringify({
     context: {
      client: {
       clientName: 'WEB',
       clientVersion: '2.0',
      },
     },
     videoId: videoId,
    }),
   });

   if (playerResponse.ok) {
    const playerData = await playerResponse.json();

    // Extract caption tracks from player response
    if (playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
     const tracks = playerData.captions.playerCaptionsTracklistRenderer.captionTracks;

     // Find Indonesian or English track
     const track = tracks.find((t: any) => t.languageCode === 'id' || t.languageCode === 'en') || tracks[0];

     if (track?.baseUrl) {
      const captionResponse = await fetch(track.baseUrl);
      if (captionResponse.ok) {
       const captionText = await captionResponse.text();
       return this.processYouTubeSRV3(captionText);
      }
     }
    }
   }
  } catch (error: any) {
   console.log(`[BROWSER-TRANSCRIPT] YouTube internal API failed:`, error.message);
  }

  return null;
 }

 // Method 5: Alternative endpoints
 private async fetchFromAlternativeEndpoint(videoId: string): Promise<string | null> {
  const alternatives = [`https://video.google.com/timedtext?v=${videoId}&lang=id&fmt=json3`, `https://m.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`, `https://youtube.googleapis.com/v/${videoId}/captions?alt=json`];

  for (const endpoint of alternatives) {
   try {
    console.log(`[BROWSER-TRANSCRIPT] Trying alternative endpoint: ${endpoint}`);

    const response = await fetch(endpoint, {
     credentials: 'include',
     headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; YouTubeBot/1.0)',
     },
    });

    if (response.ok) {
     const data = await response.json();
     const transcript = this.processYouTubeJSON(data);
     if (transcript) return transcript;
    }
   } catch (error: any) {
    console.log(`[BROWSER-TRANSCRIPT] Alternative endpoint failed: ${endpoint} - ${error.message}`);
   }
  }

  return null;
 }

 // Helper: Extract transcript from DOM
 private extractTranscriptFromDOM(doc: Document): string | null {
  const selectors = ['[data-testid="transcript-segment"]', '.ytd-transcript-segment-renderer', '.transcript-segment', '.captions-text', '[role="button"][aria-label*="transcript"]'];

  for (const selector of selectors) {
   const elements = doc.querySelectorAll(selector);
   if (elements.length > 0) {
    const transcript = Array.from(elements)
     .map((el) => el.textContent?.trim())
     .filter((text) => text && text.length > 1)
     .join(' ');

    if (transcript.length > 10) {
     console.log(`[BROWSER-TRANSCRIPT] Extracted from DOM using selector: ${selector}`);
     return transcript;
    }
   }
  }

  return null;
 }

 // Helper: Process YouTube JSON format
 private processYouTubeJSON(data: any): string | null {
  try {
   if (data?.events && Array.isArray(data.events)) {
    const transcript = data.events
     .filter((event: any) => event.segs)
     .map((event: any) => event.segs.map((seg: any) => seg.utf8 || '').join(''))
     .join(' ')
     .replace(/\n/g, ' ')
     .replace(/\s+/g, ' ')
     .trim();

    return transcript.length > 10 ? transcript : null;
   }
  } catch (error) {
   console.log('[BROWSER-TRANSCRIPT] Error processing YouTube JSON:', error);
  }

  return null;
 }

 // Helper: Process YouTube SRV3 format
 private processYouTubeSRV3(text: string): string | null {
  try {
   // Parse XML-like SRV3 format
   const parser = new DOMParser();
   const doc = parser.parseFromString(text, 'text/xml');

   const textElements = doc.getElementsByTagName('text');
   if (textElements.length > 0) {
    const transcript = Array.from(textElements)
     .map((el) => el.textContent?.trim())
     .filter((text) => text)
     .join(' ')
     .replace(/\s+/g, ' ')
     .trim();

    return transcript.length > 10 ? transcript : null;
   }
  } catch (error) {
   console.log('[BROWSER-TRANSCRIPT] Error processing SRV3 format:', error);
  }

  return null;
 }

 // Debug method
 getCacheStatus() {
  const status = Array.from(this.cache.entries()).map(([key, value]) => ({
   videoId: key,
   method: value.method,
   failed: value.failed,
   age: Math.round((Date.now() - value.timestamp) / 1000),
   chars: value.data?.length || 0,
  }));
  console.log('[BROWSER-TRANSCRIPT] Cache status:', status);
  return status;
 }

 clearCache() {
  this.cache.clear();
  console.log('[BROWSER-TRANSCRIPT] Cache cleared');
 }
}

// Global singleton instance
export const browserTranscriptService = new BrowserTranscriptService();
export default browserTranscriptService;
