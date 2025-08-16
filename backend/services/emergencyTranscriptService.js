const {YoutubeTranscript} = require('youtube-transcript');

/**
 * Last-resort transcript service using the 'youtube-transcript' library.
 * @param {string} videoId The YouTube video ID.
 * @returns {Promise<Array<{text: string, start: number, duration: number}>>} A promise that resolves to the transcript segments.
 */
async function extract(videoId) {
 const startTime = Date.now();
 stats.totalRequests++;
 stats.lastRequestTime = new Date().toISOString();

 console.log(`Emergency Transcript Service: Attempting to fetch transcript for videoId: ${videoId}`);

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
