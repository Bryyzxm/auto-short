// BULLETPROOF SERVICE IMPORTS - Handle missing services gracefully
let robustTranscriptServiceV2, alternativeTranscriptService, emergencyTranscriptService;

try {
 robustTranscriptServiceV2 = require('./robustTranscriptServiceV2.js');
} catch (error) {
 console.error('[TRANSCRIPT-ORCHESTRATOR] ❌ Failed to load robustTranscriptServiceV2:', error.message);
 robustTranscriptServiceV2 = null;
}

try {
 alternativeTranscriptService = require('./alternativeTranscriptService.js');
} catch (error) {
 console.error('[TRANSCRIPT-ORCHESTRATOR] ❌ Failed to load alternativeTranscriptService:', error.message);
 alternativeTranscriptService = null;
}

try {
 emergencyTranscriptService = require('./emergencyTranscriptService.js');
} catch (error) {
 console.error('[TRANSCRIPT-ORCHESTRATOR] ❌ Failed to load emergencyTranscriptService:', error.message);
 emergencyTranscriptService = null;
}

const {NoValidTranscriptError, TranscriptDisabledError} = require('./transcriptErrors.js');

// Build services array dynamically, excluding null services
const services = [
 {name: 'robust', service: robustTranscriptServiceV2},
 {name: 'alternative', service: alternativeTranscriptService},
 {name: 'emergency', service: emergencyTranscriptService},
].filter((s) => s.service !== null); // Only include successfully loaded services

console.log(
 `[TRANSCRIPT-ORCHESTRATOR] Loaded ${services.length} transcript services:`,
 services.map((s) => s.name)
);

async function extract(videoId, options = {}) {
 const session = Math.random().toString(36).substring(2, 9);
 console.log(`[TRANSCRIPT-ORCHESTRATOR] 🚀 Starting extraction for ${videoId} (session: ${session})`);

 let lastError = null;
 let isDisabledByOwner = false;
 const servicesAttempted = [];

 // BULLETPROOF SERVICE ITERATION - Handle missing or corrupted services gracefully
 for (const {name, service} of services) {
  servicesAttempted.push(name);
  try {
   console.log(`[TRANSCRIPT-ORCHESTRATOR] Trying ${name} service...`);

   // Enhanced validation - ensure the service and its extract method exist
   if (!service) {
    console.warn(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ Service '${name}' is null or undefined, skipping...`);
    continue;
   }

   if (typeof service.extract !== 'function') {
    console.warn(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ Service '${name}' has no extract method, skipping...`);
    continue;
   }

   // BULLETPROOF SERVICE CALL - Wrap each service call in its own try-catch
   let result;
   try {
    result = await service.extract(videoId, options);
   } catch (serviceError) {
    // Handle MODULE_NOT_FOUND errors specifically (missing fallback services)
    if (serviceError.code === 'MODULE_NOT_FOUND') {
     console.error(`[TRANSCRIPT-ORCHESTRATOR] ❌ ${name} service has missing dependency: ${serviceError.message}`);
     console.error(`[TRANSCRIPT-ORCHESTRATOR] This likely indicates a missing fallback service file.`);
    }
    throw serviceError; // Re-throw to be handled by outer catch
   }

   // Validate the result
   if (result && result.segments && result.segments.length > 0) {
    console.log(`[TRANSCRIPT-ORCHESTRATOR] ✅ Success with ${name} service for ${videoId}`);

    // Add validation metadata that the enhanced API expects
    const totalText = result.segments
     .map((s) => s.text || '')
     .join(' ')
     .trim();
    const enhancedResult = {
     ...result,
     serviceUsed: name,
     hasRealTiming: result.segments.some((s) => s.start !== undefined),
     extractionTime: Date.now(),
     validation: {
      totalLength: totalText.length,
      segmentCount: result.segments.length,
      hasValidContent: totalText.length > 0,
     },
     language: result.language || 'unknown',
     method: result.method || result.source || 'unknown',
    };

    return enhancedResult;
   }
   console.log(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ ${name} service returned no segments for ${videoId}`);
  } catch (error) {
   console.log(`[TRANSCRIPT-ORCHESTRATOR] ❌ ${name} service failed: ${error.message}`);
   lastError = error;

   // Check for specific error types to stop retrying unnecessarily
   if (error instanceof TranscriptDisabledError || /transcript is disabled/i.test(error.message)) {
    isDisabledByOwner = true;
    // If owner disabled transcripts, no other service will work. Stop trying.
    break;
   }

   // Handle MODULE_NOT_FOUND errors (missing fallback services)
   if (error.code === 'MODULE_NOT_FOUND') {
    console.error(`[TRANSCRIPT-ORCHESTRATOR] ❌ Module not found in ${name} service: ${error.message}`);
    console.error(`[TRANSCRIPT-ORCHESTRATOR] This service may be trying to load a missing fallback module.`);
    // Continue to next service instead of crashing
    continue;
   }
  }
 }

 console.log(`[TRANSCRIPT-ORCHESTRATOR] 💀 All services failed for ${videoId}`);
 const finalError = new NoValidTranscriptError(`All transcript services failed for ${videoId}. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
 finalError.isDisabledByOwner = isDisabledByOwner;
 finalError.servicesAttempted = servicesAttempted;
 throw finalError;
}

module.exports = {
 extract,
};
