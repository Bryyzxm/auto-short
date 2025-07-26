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
 * Fetches video transcript by trying multiple Invidious instances
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string>} Transcript text
 */
async function fetchTranscriptViaInvidious(videoId) {
 console.log(`Attempting to fetch transcript for video: ${videoId}`);

 // Step 1: Get healthy instances
 const instances = await getHealthyInvidiousInstances();

 // Step 2: Check if we have any instances
 if (!instances || instances.length === 0) {
  throw new Error('No healthy Invidious instances found');
 }

 // Step 3: Shuffle instances to distribute load
 const shuffledInstances = shuffleArray(instances);
 console.log(`Trying ${shuffledInstances.length} instances in random order`);

 // Step 4: Try each instance
 for (const hostname of shuffledInstances) {
  try {
   // Step 5: Construct API URL
   const apiUrl = `https://${hostname}/api/v1/captions/${videoId}`;
   console.log(`Trying instance: ${hostname}`);

   // Step 6: Make request with short timeout
   const response = await axios.get(apiUrl, {
    timeout: 5000, // 5 second timeout
    headers: {
     'User-Agent': 'YouTube-to-Shorts-Segmenter/1.0',
    },
   });

   // Step 8: Parse successful response
   if (response.status === 200 && response.data) {
    const {captions} = response.data;

    if (!captions || !Array.isArray(captions)) {
     console.warn(`Invalid captions format from ${hostname}`);
     continue;
    }

    // Find caption track for desired language (prioritize 'en', fallback to 'id' or first available)
    const preferredLanguages = ['en', 'id'];
    let selectedCaptions = null;

    for (const lang of preferredLanguages) {
     selectedCaptions = captions.find((caption) => caption.language_code === lang);
     if (selectedCaptions) {
      console.log(`Found captions in language: ${lang}`);
      break;
     }
    }

    // If no preferred language found, use first available
    if (!selectedCaptions && captions.length > 0) {
     selectedCaptions = captions[0];
     console.log(`Using first available captions in language: ${selectedCaptions.language_code || 'unknown'}`);
    }

    if (!selectedCaptions || !Array.isArray(selectedCaptions.text)) {
     console.warn(`No valid caption text found from ${hostname}`);
     continue;
    }

    // Join all text parts into a single string
    const transcriptText = selectedCaptions.text
     .map((textObj) => textObj.text || '')
     .filter((text) => text.trim().length > 0)
     .join(' ')
     .trim();

    if (transcriptText.length > 0) {
     console.log(`Successfully fetched transcript from ${hostname} (${transcriptText.length} characters)`);
     return transcriptText;
    } else {
     console.warn(`Empty transcript received from ${hostname}`);
     continue;
    }
   }
  } catch (error) {
   // Step 9: Log warning and continue to next instance
   console.warn(`Failed to fetch from ${hostname}:`, error.message);
   continue;
  }
 }

 // Step 10: All instances failed
 throw new Error('Failed to fetch transcript from all available Invidious instances');
}

module.exports = {
 getHealthyInvidiousInstances,
 fetchTranscriptViaInvidious,
};
