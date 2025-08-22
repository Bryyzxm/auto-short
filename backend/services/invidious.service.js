const axios = require('axios');

/**
 * Production-Ready Invidious Service Module
 * Implements resilient YouTube transcript extraction via Invidious network
 * Built to circumvent datacenter IP blocking in cloud environments
 * @version 2.0.0 - Enhanced for maximum reliability
 */

/**
 * Fetches and filters healthy Invidious instances from the official API
 * Implements strict filtering for HTTPS + API-enabled instances only
 * Includes hardcoded fallback instances as safety net
 * @returns {Promise<string[]>} Array of healthy instance hostnames
 */
async function getHealthyInvidiousInstances() {
 try {
  console.log('[INVIDIOUS-SERVICE] 🌐 Fetching instances from official Invidious API...');

  // Request to official Invidious instances API with robust configuration
  const response = await axios.get('https://api.invidious.io/instances.json', {
   timeout: 12000, // Extended timeout for network reliability
   headers: {
    'User-Agent': 'YouTube-to-Shorts-Segmenter/2.0',
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
   },
   validateStatus: (status) => status === 200, // Only accept 200 OK
  });

  // Validate API response structure
  if (!response.data || !Array.isArray(response.data)) {
   throw new Error('Invalid response format from Invidious API');
  }

  console.log(`[INVIDIOUS-SERVICE] 📊 Found ${response.data.length} total instances from API`);

  // STRICT FILTERING: Only HTTPS instances with API enabled
  const healthyInstances = response.data
   .filter((instance) => {
    // Validate instance structure: [domain, details]
    if (!Array.isArray(instance) || instance.length < 2) {
     return false;
    }

    const [domain, details] = instance;

    // Validate domain and details existence
    if (!domain || !details || typeof details !== 'object') {
     return false;
    }

    // Core requirements: HTTPS protocol AND API functionality enabled
    const isHttps = details.type === 'https';
    const hasApi = details.api === true;

    // Additional quality checks (optional but recommended)
    const hasValidDomain = typeof domain === 'string' && domain.length > 4;

    return isHttps && hasApi && hasValidDomain;
   })
   .map((instance) => instance[0]) // Extract domain name
   .filter((domain) => {
    // Final domain validation
    return typeof domain === 'string' && domain.length > 0 && !domain.includes('localhost') && domain.includes('.');
   })
   .slice(0, 50); // Limit to top 50 instances for performance

  console.log(`[INVIDIOUS-SERVICE] ✅ Filtered to ${healthyInstances.length} healthy HTTPS+API instances`);

  // Return instances if we found any
  if (healthyInstances.length > 0) {
   console.log('[INVIDIOUS-SERVICE] 🎯 Sample instances:', healthyInstances.slice(0, 3));
   return healthyInstances;
  }

  // No instances found - use fallback
  console.warn('[INVIDIOUS-SERVICE] ⚠️ No healthy instances from API - using fallback list');
  return getHardcodedFallbackInstances();
 } catch (error) {
  console.error('[INVIDIOUS-SERVICE] ❌ Error fetching instances:', error.message);
  console.warn('[INVIDIOUS-SERVICE] 🔄 Falling back to hardcoded instances');

  return getHardcodedFallbackInstances();
 }
}

/**
 * Returns a curated list of historically reliable Invidious instances
 * These are manually verified instances that have shown consistent uptime
 * @returns {string[]} Array of fallback instance hostnames
 */
function getHardcodedFallbackInstances() {
 const fallbackInstances = [
  'yewtu.be', // Most reliable, consistently up
  'invidious.fdn.fr', // French instance, good uptime
  'invidious.privacydev.net', // Privacy-focused, stable
  'vid.puffyan.us', // US-based, good performance
  'invidious.lunar.icu', // Alternative stable instance
  'invidious.nerdvpn.de', // German instance, reliable
  'iv.gg', // Short domain, fast response
  'invidious.slipfox.xyz', // Community favorite
  'invidious.io.lol', // Additional fallback
  'inv.riverside.rocks', // Backup option
 ];

 console.log(`[INVIDIOUS-SERVICE] 🛡️ Using ${fallbackInstances.length} hardcoded fallback instances`);
 return fallbackInstances;
}

/**
 * Shuffles an array randomly using Fisher-Yates algorithm
 * Ensures fair load distribution across Invidious instances
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array (does not mutate original)
 */
function shuffleArray(array) {
 const shuffled = [...array]; // Create copy to avoid mutation
 for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
 }
 return shuffled;
}

/**
 * Selects the best caption track from available captions
 * Prioritizes English and Indonesian, falls back to first available
 * @param {Array} captions - Array of caption objects from Invidious API
 * @returns {Object|null} Selected caption object or null if none suitable
 */
function selectBestCaptions(captions) {
 // 🇮🇩 INDONESIAN-FIRST PRIORITY: Put Indonesian first for Indonesian content
 const preferredLanguages = ['id', 'en', 'en-US', 'en-GB'];

 // Try to find captions in preferred languages
 for (const langCode of preferredLanguages) {
  const caption = captions.find((cap) => cap.language_code === langCode || cap.language_code?.toLowerCase() === langCode.toLowerCase());

  if (caption && caption.text && Array.isArray(caption.text)) {
   console.log(`[INVIDIOUS-SERVICE] 🎯 Found captions in preferred language: ${langCode}`);
   return caption;
  }
 }

 // Fallback: use first available caption with valid text array
 const validCaption = captions.find((caption) => caption && caption.text && Array.isArray(caption.text) && caption.text.length > 0);

 if (validCaption) {
  const langCode = validCaption.language_code || 'unknown';
  console.log(`[INVIDIOUS-SERVICE] 📝 Using first available captions: ${langCode}`);
  return validCaption;
 }

 console.warn('[INVIDIOUS-SERVICE] ❌ No valid captions found in response');
 return null;
}

/**
 * Converts caption text array to clean transcript string
 * Filters out empty segments and joins with proper spacing
 * @param {Array} textArray - Array of text objects from Invidious captions
 * @returns {string} Clean transcript text
 */
function extractTranscriptText(textArray) {
 if (!Array.isArray(textArray)) {
  return '';
 }

 return textArray
  .map((textObj) => {
   // Handle both string and object formats
   const text = typeof textObj === 'string' ? textObj : textObj.text || '';
   return text.trim();
  })
  .filter((text) => text.length > 0) // Remove empty segments
  .join(' ')
  .trim()
  .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Fetches captions from a single Invidious instance
 * Implements proper timeout and error handling for individual instances
 * @param {string} hostname - Invidious instance hostname
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string|null>} Transcript text or null if failed
 */
async function fetchFromInstance(hostname, videoId) {
 const apiUrl = `https://${hostname}/api/v1/captions/${videoId}`;

 try {
  console.log(`[INVIDIOUS-SERVICE] 🔍 Trying instance: ${hostname}`);

  const response = await axios.get(apiUrl, {
   timeout: 7000, // Fast timeout to skip unresponsive instances
   headers: {
    'User-Agent': 'YouTube-to-Shorts-Segmenter/2.0',
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
   },
   validateStatus: (status) => status === 200,
  });

  // Validate response structure
  if (!response.data || !response.data.captions) {
   console.warn(`[INVIDIOUS-SERVICE] ⚠️ Invalid response format from ${hostname}`);
   return null;
  }

  const {captions} = response.data;

  if (!Array.isArray(captions) || captions.length === 0) {
   console.warn(`[INVIDIOUS-SERVICE] ⚠️ No captions available from ${hostname}`);
   return null;
  }

  // Select best caption track
  const selectedCaptions = selectBestCaptions(captions);
  if (!selectedCaptions) {
   console.warn(`[INVIDIOUS-SERVICE] ⚠️ No suitable caption track found from ${hostname}`);
   return null;
  }

  // Extract transcript text
  const transcriptText = extractTranscriptText(selectedCaptions.text);

  if (transcriptText.length === 0) {
   console.warn(`[INVIDIOUS-SERVICE] ⚠️ Empty transcript from ${hostname}`);
   return null;
  }

  // Success!
  console.log(`[INVIDIOUS-SERVICE] ✅ Success from ${hostname}: ${transcriptText.length} characters`);
  return transcriptText;
 } catch (error) {
  // Log specific error type for debugging
  if (error.code === 'ECONNABORTED') {
   console.warn(`[INVIDIOUS-SERVICE] ⏱️ Timeout from ${hostname}`);
  } else if (error.response?.status) {
   console.warn(`[INVIDIOUS-SERVICE] 🚫 HTTP ${error.response.status} from ${hostname}`);
  } else {
   console.warn(`[INVIDIOUS-SERVICE] ❌ Error from ${hostname}: ${error.message}`);
  }

  return null; // Return null to try next instance
 }
}

/**
 * Main transcript extraction function using Invidious network
 * Implements comprehensive retry logic with load balancing
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string>} Complete transcript text
 * @throws {Error} When all instances fail to provide transcript
 */
async function fetchTranscriptViaInvidious(videoId) {
 console.log(`[INVIDIOUS-SERVICE] 🚀 Starting transcript extraction for video: ${videoId}`);
 const startTime = Date.now();

 // Get list of healthy instances
 const instances = await getHealthyInvidiousInstances();

 if (!instances || instances.length === 0) {
  throw new Error('No healthy Invidious instances available');
 }

 // Shuffle instances for load balancing
 const shuffledInstances = shuffleArray(instances);
 console.log(`[INVIDIOUS-SERVICE] 🎲 Trying ${shuffledInstances.length} instances in random order`);

 // Track attempt statistics
 let successfulAttempts = 0;
 let failedAttempts = 0;
 let lastError = null;

 // Try each instance until success
 for (const hostname of shuffledInstances) {
  try {
   const transcript = await fetchFromInstance(hostname, videoId);

   if (transcript && transcript.length > 50) {
    // Minimum viable transcript length
    successfulAttempts++;
    const extractionTime = Date.now() - startTime;

    console.log(`[INVIDIOUS-SERVICE] 🎉 EXTRACTION SUCCESSFUL!`);
    console.log(`[INVIDIOUS-SERVICE] 📊 Stats: ${successfulAttempts} successful, ${failedAttempts} failed`);
    console.log(`[INVIDIOUS-SERVICE] ⏱️ Total time: ${extractionTime}ms`);
    console.log(`[INVIDIOUS-SERVICE] 📏 Transcript length: ${transcript.length} characters`);

    return transcript;
   } else {
    failedAttempts++;
    console.log(`[INVIDIOUS-SERVICE] ⚠️ ${hostname} returned insufficient transcript data`);
   }
  } catch (error) {
   failedAttempts++;
   lastError = error;
   console.warn(`[INVIDIOUS-SERVICE] ❌ Failed to fetch from ${hostname}: ${error.message}`);
  }

  // Progress logging for long attempts
  if (failedAttempts % 5 === 0 && failedAttempts > 0) {
   console.log(`[INVIDIOUS-SERVICE] 📈 Progress: ${failedAttempts}/${shuffledInstances.length} instances tried`);
  }
 }

 // All instances exhausted
 const extractionTime = Date.now() - startTime;
 console.error(`[INVIDIOUS-SERVICE] 💀 EXTRACTION FAILED - All ${shuffledInstances.length} instances exhausted`);
 console.error(`[INVIDIOUS-SERVICE] 📊 Final stats: ${successfulAttempts} successful, ${failedAttempts} failed`);
 console.error(`[INVIDIOUS-SERVICE] ⏱️ Total time: ${extractionTime}ms`);

 // Prepare detailed error message
 const errorDetails = lastError ? lastError.message : 'Unknown error';
 throw new Error(`Failed to fetch transcript from all ${shuffledInstances.length} available Invidious instances. Last error: ${errorDetails}`);
}

// Export the main functions
module.exports = {
 getHealthyInvidiousInstances,
 fetchTranscriptViaInvidious,
};
