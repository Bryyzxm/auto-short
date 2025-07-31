const axios = require('axios');

/**
 * Fetches and filters healthy Invidious instances from the official API
 * @returns {Promise<string[]>} Array of healthy instance hostnames
 */
async function getHealthyInvidiousInstances() {
 try {
  console.log('Fetching Invidious instances from official API...');

  // Make request to official Invidious API
  const response = await axios.get('https://api.invidious.io/instances.json', {
   timeout: 10000, // 10 second timeout
   headers: {
    'User-Agent': 'YouTube-to-Shorts-Segmenter/1.0',
   },
  });

  if (!response.data || !Array.isArray(response.data)) {
   throw new Error('Invalid response format from Invidious API');
  }

  console.log(`Found ${response.data.length} total instances`);

  // Filter instances based on criteria
  const healthyInstances = response.data
   .filter((instance) => {
    // Each instance is an array: [domain, details]
    if (!Array.isArray(instance) || instance.length < 2) {
     return false;
    }

    const [domain, details] = instance;

    // Check if domain exists and details is an object
    if (!domain || !details || typeof details !== 'object') {
     return false;
    }

    // Filter criteria:
    // 1. Must be HTTPS (type === 'https')
    // 2. Must have API enabled (api === true)
    return details.type === 'https' && details.api === true;
   })
   .map((instance) => {
    // Extract just the domain name from the filtered instances
    const [domain] = instance;
    return domain;
   })
   .filter((domain) => {
    // Additional validation to ensure domain is a valid string
    return typeof domain === 'string' && domain.length > 0;
   });

  console.log(`Filtered to ${healthyInstances.length} healthy HTTPS instances with API enabled`);

  if (healthyInstances.length === 0) {
   console.warn('No healthy Invidious instances found');
  } else {
   console.log('Sample healthy instances:', healthyInstances.slice(0, 3));
  }

  return healthyInstances;
 } catch (error) {
  console.error('Error fetching Invidious instances:', error.message);

  // Return fallback instances if API fails
  const fallbackInstances = ['yewtu.be', 'invidious.fdn.fr', 'invidious.privacydev.net', 'vid.puffyan.us', 'invidious.lunar.icu'];

  console.log('Using fallback instances due to API error');
  return fallbackInstances;
 }
}

/**
 * Shuffles an array randomly using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
 const shuffled = [...array];
 for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
 }
 return shuffled;
}

/**
 * Selects the best caption track from available captions
 * @param {Array} captions - Array of caption objects
 * @returns {Object|null} Selected caption object or null
 */
function selectBestCaptions(captions) {
 const preferredLanguages = ['en', 'id'];

 for (const lang of preferredLanguages) {
  const caption = captions.find((caption) => caption.language_code === lang);
  if (caption) {
   console.log(`Found captions in language: ${lang}`);
   return caption;
  }
 }

 if (captions.length > 0) {
  const firstCaption = captions[0];
  console.log(`Using first available captions in language: ${firstCaption.language_code || 'unknown'}`);
  return firstCaption;
 }

 return null;
}

/**
 * Converts caption text array to transcript string
 * @param {Array} textArray - Array of text objects
 * @returns {string} Transcript text
 */
function extractTranscriptText(textArray) {
 return textArray
  .map((textObj) => textObj.text || '')
  .filter((text) => text.trim().length > 0)
  .join(' ')
  .trim();
}

/**
 * Fetches captions from a single Invidious instance
 * @param {string} hostname - Invidious instance hostname
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string|null>} Transcript text or null if failed
 */
async function fetchFromInstance(hostname, videoId) {
 const apiUrl = `https://${hostname}/api/v1/captions/${videoId}`;
 console.log(`Trying instance: ${hostname}`);

 const response = await axios.get(apiUrl, {
  timeout: 5000,
  headers: {
   'User-Agent': 'YouTube-to-Shorts-Segmenter/1.0',
  },
 });

 if (response.status !== 200 || !response.data) {
  return null;
 }

 const {captions} = response.data;
 if (!captions || !Array.isArray(captions)) {
  console.warn(`Invalid captions format from ${hostname}`);
  return null;
 }

 const selectedCaptions = selectBestCaptions(captions);
 if (!selectedCaptions || !Array.isArray(selectedCaptions.text)) {
  console.warn(`No valid caption text found from ${hostname}`);
  return null;
 }

 const transcriptText = extractTranscriptText(selectedCaptions.text);
 if (transcriptText.length === 0) {
  console.warn(`Empty transcript received from ${hostname}`);
  return null;
 }

 console.log(`Successfully fetched transcript from ${hostname} (${transcriptText.length} characters)`);
 return transcriptText;
}

/**
 * Fetches video transcript by trying multiple Invidious instances
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string>} Transcript text
 */
async function fetchTranscriptViaInvidious(videoId) {
 console.log(`Attempting to fetch transcript for video: ${videoId}`);

 const instances = await getHealthyInvidiousInstances();
 if (!instances || instances.length === 0) {
  throw new Error('No healthy Invidious instances found');
 }

 const shuffledInstances = shuffleArray(instances);
 console.log(`Trying ${shuffledInstances.length} instances in random order`);

 for (const hostname of shuffledInstances) {
  try {
   const transcript = await fetchFromInstance(hostname, videoId);
   if (transcript) {
    return transcript;
   }
  } catch (error) {
   console.warn(`Failed to fetch from ${hostname}:`, error.message);
  }
 }

 throw new Error('Failed to fetch transcript from all available Invidious instances');
}

module.exports = {getHealthyInvidiousInstances, fetchTranscriptViaInvidious};
