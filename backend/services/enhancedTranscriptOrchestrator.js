import robustTranscriptServiceV2 from './robustTranscriptServiceV2.js';
import alternativeTranscriptService from './alternativeTranscriptService.js';
import emergencyTranscriptService from './emergencyTranscriptService.js';
import { NoValidTranscriptError, TranscriptDisabledError } from './transcriptErrors.js';

const services = [
  { name: 'robust', service: robustTranscriptServiceV2 },
  { name: 'alternative', service: alternativeTranscriptService },
  { name: 'emergency', service: emergencyTranscriptService },
];

async function extract(videoId, options = {}) {
  const session = Math.random().toString(36).substring(2, 9);
  console.log(`[TRANSCRIPT-ORCHESTRATOR] 🚀 Starting extraction for ${videoId} (session: ${session})`);

  let lastError = null;
  let isDisabledByOwner = false;
  const servicesAttempted = [];

  for (const { name, service } of services) {
    servicesAttempted.push(name);
    try {
      console.log(`[TRANSCRIPT-ORCHESTRATOR] Trying ${name} service...`);
      // Ensure the service and its extract method exist before calling
      if (service && typeof service.extract === 'function') {
        const result = await service.extract(videoId, options);
        if (result && result.segments && result.segments.length > 0) {
          console.log(`[TRANSCRIPT-ORCHESTRATOR] ✅ Success with ${name} service for ${videoId}`);
          return result;
        }
        console.log(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ ${name} service returned no segments for ${videoId}`);
      } else {
        // This handles cases where a service file might be missing or corrupted
        throw new Error(`Service '${name}' is not configured correctly or has no extract method.`);
      }
    } catch (error) {
      console.log(`[TRANSCRIPT-ORCHESTRATOR] ❌ ${name} service failed: ${error.message}`);
      lastError = error;
      // Check for specific error types to stop retrying unnecessarily
      if (error instanceof TranscriptDisabledError || /transcript is disabled/i.test(error.message)) {
        isDisabledByOwner = true;
        // If owner disabled transcripts, no other service will work. Stop trying.
        break; 
      }
    }
  }

  console.log(`[TRANSCRIPT-ORCHESTRATOR] 💀 All services failed for ${videoId}`);
  const finalError = new NoValidTranscriptError(`All transcript services failed for ${videoId}. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
  finalError.isDisabledByOwner = isDisabledByOwner;
  throw finalError;
}

export default {
  extract,
};
