/**
 * ALTERNATIVE YOUTUBE TRANSCRIPT SERVICE
 * Using youtubei.js for better YouTube bot detection bypass
 */

import {Innertube} from 'youtubei.js';
import {YoutubeTranscript} from 'youtube-transcript';

class AlternativeYouTubeTranscript {
 constructor() {
  this.ytClient = null;
  this.requestCount = 0;
  this.sessionId = Math.random().toString(36).substring(7);
 }

 async initializeClient() {
  if (!this.ytClient) {
   try {
    this.ytClient = await Innertube.create({
     lang: 'id',
     location: 'ID',
     enable_session_cache: false,
    });
    console.log(`[ALT-TRANSCRIPT] Innertube client initialized for session: ${this.sessionId}`);
   } catch (error) {
    console.log(`[ALT-TRANSCRIPT] Failed to initialize Innertube:`, error.message);
    this.ytClient = null;
   }
  }
 }

 async extractTranscript(videoId, options = {}) {
  console.log(`[ALT-TRANSCRIPT] Starting extraction for ${videoId}, session: ${this.sessionId}`);

  const strategies = [() => this.strategyInnertubeAPI(videoId, options), () => this.strategyYouTubeTranscriptLatest(videoId, options), () => this.strategyDirectCaptionAPI(videoId, options)];

  for (let i = 0; i < strategies.length; i++) {
   try {
    const result = await strategies[i]();
    if (this.validateResult(result)) {
     console.log(`[ALT-TRANSCRIPT] ✅ Strategy ${i + 1} succeeded: ${result.segments.length} segments`);
     this.requestCount++;
     return result;
    }
   } catch (error) {
    console.log(`[ALT-TRANSCRIPT] ❌ Strategy ${i + 1} failed:`, error.message);
   }
  }

  throw new Error(`All alternative transcript strategies failed for ${videoId}`);
 }

 // Strategy 1: Innertube API (most robust)
 async strategyInnertubeAPI(videoId, options) {
  console.log(`[ALT-TRANSCRIPT] Strategy 1: Innertube API for ${videoId}`);

  await this.initializeClient();

  if (!this.ytClient) {
   throw new Error('Innertube client not available');
  }

  try {
   const info = await this.ytClient.getInfo(videoId);

   if (!info.captions) {
    throw new Error('No captions available');
   }

   // Try to get Indonesian captions first, then English, then any available
   const languages = ['id', 'en'];
   let captionTrack = null;

   for (const lang of languages) {
    captionTrack = info.captions.caption_tracks.find((track) => track.language_code === lang);
    if (captionTrack) break;
   }

   if (!captionTrack) {
    captionTrack = info.captions.caption_tracks[0]; // Use first available
   }

   if (!captionTrack) {
    throw new Error('No suitable caption track found');
   }

   console.log(`[ALT-TRANSCRIPT] Using caption track: ${captionTrack.name.simple_text} (${captionTrack.language_code})`);

   const transcriptData = await captionTrack.fetch();

   if (!transcriptData || transcriptData.length === 0) {
    throw new Error('Empty transcript data from Innertube');
   }

   const segments = transcriptData
    .map((item) => ({
     text: this.cleanText(item.text),
     start: parseFloat((item.start_time / 1000).toFixed(3)),
     end: parseFloat(((item.start_time + item.duration) / 1000).toFixed(3)),
     duration: parseFloat((item.duration / 1000).toFixed(3)),
    }))
    .filter((seg) => seg.text.length > 2 && seg.duration > 0.3);

   if (segments.length === 0) {
    throw new Error('No valid segments after processing');
   }

   return {
    transcript: segments.map((s) => s.text).join(' '),
    segments: segments,
    language: captionTrack.language_code || 'auto',
    method: 'Innertube API',
    hasRealTiming: true,
    totalSegments: segments.length,
    totalDuration: segments[segments.length - 1]?.end || 0,
    sessionId: this.sessionId,
   };
  } catch (error) {
   console.log(`[ALT-TRANSCRIPT] Innertube API error:`, error.message);
   throw error;
  }
 }

 // Strategy 2: Latest youtube-transcript with enhanced options
 async strategyYouTubeTranscriptLatest(videoId, options) {
  console.log(`[ALT-TRANSCRIPT] Strategy 2: Latest YouTube Transcript API for ${videoId}`);

  const languages = options.lang || ['id', 'en', 'auto'];

  for (const lang of languages) {
   try {
    console.log(`[ALT-TRANSCRIPT] Trying language: ${lang}`);

    const config = {
     lang: lang === 'auto' ? undefined : lang,
     ...(lang !== 'auto' && {country: lang === 'id' ? 'ID' : 'US'}),
    };

    const transcript = await YoutubeTranscript.fetchTranscript(videoId, config);

    if (transcript && transcript.length > 0) {
     console.log(`[ALT-TRANSCRIPT] ✅ YouTube API success for ${lang}: ${transcript.length} segments`);

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
      method: `YouTube Transcript API Latest (${lang.toUpperCase()})`,
      hasRealTiming: true,
      totalSegments: segments.length,
      totalDuration: segments[segments.length - 1]?.end || 0,
      sessionId: this.sessionId,
     };
    }
   } catch (error) {
    console.log(`[ALT-TRANSCRIPT] YouTube API failed for ${lang}:`, error.message);
   }
  }

  throw new Error('Latest YouTube Transcript API failed for all languages');
 }

 // Strategy 3: Direct caption API with advanced headers
 async strategyDirectCaptionAPI(videoId, options) {
  console.log(`[ALT-TRANSCRIPT] Strategy 3: Direct Caption API for ${videoId}`);

  const userAgents = [
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  ];

  const headers = {
   'User-Agent': userAgents[this.requestCount % userAgents.length],
   'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
   Accept: 'application/json, text/xml, text/plain, */*',
   Referer: `https://www.youtube.com/watch?v=${videoId}`,
   Origin: 'https://www.youtube.com',
   'Cache-Control': 'no-cache',
   Pragma: 'no-cache',
   DNT: '1',
   'Sec-Fetch-Dest': 'empty',
   'Sec-Fetch-Mode': 'cors',
   'Sec-Fetch-Site': 'same-origin',
   'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
   'sec-ch-ua-mobile': '?0',
   'sec-ch-ua-platform': '"Windows"',
  };

  // First try to get caption list
  try {
   const listResponse = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${videoId}`, {
    headers,
    timeout: 15000,
   });

   if (listResponse.ok) {
    const listData = await listResponse.text();
    console.log(`[ALT-TRANSCRIPT] Caption list retrieved for ${videoId}`);

    // Parse caption list to find available languages
    const langMatches = listData.match(/lang_code="([^"]+)"/g);
    const availableLanguages = langMatches ? langMatches.map((match) => match.match(/lang_code="([^"]+)"/)[1]) : ['id', 'en'];

    console.log(`[ALT-TRANSCRIPT] Available languages:`, availableLanguages);

    // Try each available language
    for (const lang of availableLanguages) {
     try {
      const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
      const captionResponse = await fetch(captionUrl, {headers, timeout: 15000});

      if (captionResponse.ok) {
       const captionData = await captionResponse.text();
       const result = this.parseJSON3Format(captionData, lang);

       if (result) {
        console.log(`[ALT-TRANSCRIPT] ✅ Direct API success for ${lang}: ${result.segments.length} segments`);
        return result;
       }
      }
     } catch (langError) {
      console.log(`[ALT-TRANSCRIPT] Direct API failed for ${lang}:`, langError.message);
     }
    }
   }
  } catch (error) {
   console.log(`[ALT-TRANSCRIPT] Direct caption API error:`, error.message);
  }

  throw new Error('Direct Caption API failed');
 }

 parseJSON3Format(data, language = 'auto') {
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
     language: language,
     method: 'Direct Caption API (JSON3)',
     hasRealTiming: true,
     totalSegments: segments.length,
     totalDuration: segments[segments.length - 1]?.end || 0,
     sessionId: this.sessionId,
    };
   }
  } catch (error) {
   console.log('[ALT-TRANSCRIPT] Error parsing JSON3:', error.message);
  }

  return null;
 }

 cleanText(text) {
  return text
   .replace(/\s+/g, ' ')
   .replace(/[^\w\s\.,!?;:\-'"()]/g, '')
   .trim();
 }

 validateResult(result) {
  return result && result.transcript && result.transcript.length > 50 && result.segments && result.segments.length > 0;
 }
}

export default new AlternativeYouTubeTranscript();
