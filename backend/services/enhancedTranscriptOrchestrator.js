/**
 * ENHANCED TRANSCRIPT ORCHESTRATOR
 * Robust transcript extraction pipeline with comprehensive error handling
 */

import robustTranscriptServiceV2 from './robustTranscriptServiceV2.js';
import alternativeTranscriptService from './alternativeTranscriptService.js';
import emergencyTranscriptService from './emergencyTranscriptService.js';
import {NoValidTranscriptError, TranscriptTooShortError, TranscriptDisabledError, TranscriptNotFoundError, TranscriptExtractionError, TranscriptValidator} from './transcriptErrors.js';

class EnhancedTranscriptOrchestrator {
 constructor() {
  this.services = [
   {
    name: 'robust',
    service: robustTranscriptServiceV2,
    method: 'extractWithRealTiming',
    priority: 1,
    options: {lang: ['id', 'en']},
   },
   {
    name: 'alternative',
    service: alternativeTranscriptService,
    method: 'extractTranscript',
    priority: 2,
    options: {},
   },
   {
    name: 'emergency',
    service: emergencyTranscriptService,
    method: 'extractTranscript',
    priority: 3,
    options: {},
   },
  ];

  this.stats = {
   totalAttempts: 0,
   successCount: 0,
   failureCount: 0,
   serviceStats: {},
  };
 }

 /**
  * MAIN EXTRACTION METHOD
  * Attempts to extract transcript using multiple services with proper validation
  */
 async extractTranscript(videoId, options = {}) {
  const minLength = options.minLength || 250;
  const sessionId = Date.now().toString(36);

  console.log(`[TRANSCRIPT-ORCHESTRATOR] 🚀 Starting extraction for ${videoId} (session: ${sessionId})`);
  console.log(`[TRANSCRIPT-ORCHESTRATOR] Minimum required length: ${minLength} characters`);

  this.stats.totalAttempts++;
  const servicesAttempted = [];
  let lastError = null;
  let isDisabledByOwner = false;

  for (const {name, service, method, options: serviceOptions} of this.services) {
   try {
    console.log(`[TRANSCRIPT-ORCHESTRATOR] Trying ${name} service...`);
    servicesAttempted.push(name);

    const startTime = Date.now();
    let result;

    // Call the appropriate method based on service type
    if (method === 'extractWithRealTiming') {
     result = await service[method](videoId, {...serviceOptions, ...options});
    } else {
     result = await service[method](videoId, {...serviceOptions, ...options});
    }

    const extractionTime = Date.now() - startTime;
    console.log(`[TRANSCRIPT-ORCHESTRATOR] ${name} service completed in ${extractionTime}ms`);

    // Validate the result using our enhanced validator
    const validation = TranscriptValidator.validate(result, videoId, minLength);

    console.log(`[TRANSCRIPT-ORCHESTRATOR] ✅ ${name} service SUCCESS:`);
    console.log(`  - Transcript length: ${validation.totalLength} characters`);
    console.log(`  - Meaningful segments: ${validation.meaningfulSegments}`);
    console.log(`  - Method: ${result.method || 'Unknown'}`);

    // Track success stats
    this.stats.successCount++;
    this.updateServiceStats(name, true, extractionTime);

    // Return successful result with additional metadata
    return {
     ...result,
     serviceUsed: name,
     extractionTime,
     sessionId,
     validation,
     isValidated: true,
    };
   } catch (error) {
    const extractionTime = Date.now() - startTime;
    lastError = error;

    console.log(`[TRANSCRIPT-ORCHESTRATOR] ❌ ${name} service failed: ${error.message}`);

    // Check if this is a "disabled by owner" error - if so, stop trying other services
    if (TranscriptValidator.isDisabledError(error)) {
     console.log(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ Video ${videoId} has transcripts disabled by owner - stopping service attempts`);
     isDisabledByOwner = true;
     this.updateServiceStats(name, false, extractionTime);
     break;
    }

    // Check if this is our custom validation error - preserve it
    if (error instanceof NoValidTranscriptError) {
     console.log(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ Validation failed: ${error.message}`);
     this.updateServiceStats(name, false, extractionTime);
     lastError = error;
     break; // Don't try other services if validation specifically failed
    }

    // Track failure stats
    this.updateServiceStats(name, false, extractionTime);
    continue;
   }
  }

  // All services failed - determine the most appropriate error to throw
  this.stats.failureCount++;

  console.log(`[TRANSCRIPT-ORCHESTRATOR] 💀 All services failed for ${videoId}`);
  console.log(`[TRANSCRIPT-ORCHESTRATOR] Services attempted: ${servicesAttempted.join(', ')}`);

  // If we detected that transcripts are disabled by owner
  if (isDisabledByOwner) {
   throw new TranscriptDisabledError(videoId);
  }

  // If the last error was our custom validation error, preserve it
  if (lastError instanceof NoValidTranscriptError) {
   throw lastError;
  }

  // Default to not found error
  throw new TranscriptNotFoundError(videoId, servicesAttempted);
 }

 /**
  * QUICK VALIDATION METHOD
  * Just checks if a transcript exists without full extraction
  */
 async validateTranscriptAvailable(videoId) {
  try {
   // Try emergency service first (fastest)
   const result = await emergencyTranscriptService.extractTranscript(videoId);
   const validation = TranscriptValidator.validate(result, videoId, 100); // Lower threshold for validation
   return {
    available: true,
    preview: validation.fullText.substring(0, 200) + '...',
    estimatedLength: validation.totalLength,
   };
  } catch (error) {
   if (error instanceof NoValidTranscriptError) {
    return {
     available: false,
     reason: error.details.reason || 'unknown',
     error: error.message,
    };
   }
   return {
    available: false,
    reason: 'extraction_failed',
    error: error.message,
   };
  }
 }

 /**
  * HEALTH CHECK METHOD
  * Returns current service health and stats
  */
 getHealthStatus() {
  const totalRequests = this.stats.successCount + this.stats.failureCount;
  const successRate = totalRequests > 0 ? (this.stats.successCount / totalRequests) * 100 : 0;

  return {
   overall: {
    successRate: parseFloat(successRate.toFixed(2)),
    totalAttempts: this.stats.totalAttempts,
    successCount: this.stats.successCount,
    failureCount: this.stats.failureCount,
   },
   services: this.stats.serviceStats,
   timestamp: new Date().toISOString(),
  };
 }

 /**
  * Update service-specific statistics
  */
 updateServiceStats(serviceName, success, extractionTime) {
  if (!this.stats.serviceStats[serviceName]) {
   this.stats.serviceStats[serviceName] = {
    attempts: 0,
    successes: 0,
    failures: 0,
    averageTime: 0,
    totalTime: 0,
   };
  }

  const stats = this.stats.serviceStats[serviceName];
  stats.attempts++;
  stats.totalTime += extractionTime;
  stats.averageTime = Math.round(stats.totalTime / stats.attempts);

  if (success) {
   stats.successes++;
  } else {
   stats.failures++;
  }
 }

 /**
  * RESET STATS
  */
 resetStats() {
  this.stats = {
   totalAttempts: 0,
   successCount: 0,
   failureCount: 0,
   serviceStats: {},
  };
  console.log('[TRANSCRIPT-ORCHESTRATOR] Stats reset');
 }
}

export default new EnhancedTranscriptOrchestrator();
