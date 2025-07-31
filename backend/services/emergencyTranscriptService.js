const {YoutubeTranscript} = require('youtube-transcript');

/**
 * Last-resort transcript service using the 'youtube-transcript' library.
 * @param {string} videoId The YouTube video ID.
 * @returns {Promise<Array<{text: string, start: number, duration: number}>>} A promise that resolves to the transcript segments.
 */
async function extract(videoId) {
 console.log(`Emergency Transcript Service: Attempting to fetch transcript for videoId: ${videoId}`);

 // Try multiple languages in order of preference
 const languages = ['en', 'id', 'es', 'fr', 'de', 'pt', 'ja'];

 for (const lang of languages) {
  try {
   console.log(`Emergency Transcript Service: Trying language: ${lang}`);
   const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: lang,
    country: 'US',
   });

   if (transcript && transcript.length > 0) {
    console.log(`Emergency Transcript Service: Successfully fetched ${transcript.length} segments in ${lang}.`);
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

 console.error('Emergency Transcript Service: No transcript found in any supported language.');
 throw new Error('No transcript found by emergency service.');
}

module.exports = {extract};
