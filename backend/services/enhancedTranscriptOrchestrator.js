/**
 * ENHANCED TRANSCRIPT ORCHESTRATOR
 * Robust transcript extraction pipeline with comprehensive error handling
 */

import robustTranscriptServiceV2 from './robustTranscriptServiceV2.js';
import alternativeTranscriptService from './alternativeTranscriptService.js';
import emergencyTranscriptService from './emergencyTranscriptService.js';
import {NoValidTranscriptError, TranscriptDisabledError, TranscriptValidator} from './transcriptErrors.js';

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
  const extractionContext = {
   servicesAttempted: [],
   lastError: null,
   isDisabledByOwner: false,
   sessionId,
   minLength,
   videoId
  };

  const result = await this.tryAllServices(extractionContext, options);
  if (result) {
   return result;
  }

  // All services failed
  this.stats.failureCount++;
  this.logExtractionFailure(extractionContext);
  this.throwAppropriateError(extractionContext);
 }

 /**
  * Try all services sequentially until one succeeds
  */
 async tryAllServices(context, options) {
  for (const serviceConfig of this.services) {
   const result = await this.tryService(serviceConfig, context, options);
   if (result) {
    return result;
   }
   
   if (context.isDisabledByOwner || context.lastError instanceof NoValidTranscriptError) {
    break;
   }
  }
  return null;
 }

 /**
  * Try a single service
  */
 async tryService(serviceConfig, context, options) {
  const {name, service, method, options: serviceOptions} = serviceConfig;
  const startTime = Date.now();

  try {
   console.log(`[TRANSCRIPT-ORCHESTRATOR] Trying ${name} service...`);
   context.servicesAttempted.push(name);

   const result = await this.callService(service, method, name, context.videoId, serviceOptions, options);
   const extractionTime = Date.now() - startTime;

   return this.handleServiceSuccess(result, name, extractionTime, context);
  } catch (error) {
   const extractionTime = Date.now() - startTime;
   this.handleServiceError(error, name, extractionTime, context);
   return null;
  }
 }

 /**
  * Call the actual service method
  */
 async callService(service, method, name, videoId, serviceOptions, options) {
  if (!service || typeof service[method] !== 'function') {
   throw new Error(`Service ${name} does not have method ${method}`);
  }

  const result = await service[method](videoId, {...serviceOptions, ...options});
  
  if (!result || !result.segments || !Array.isArray(result.segments) || result.segments.length === 0) {
   throw new Error(`Service ${name} returned invalid or empty segments`);
  }

  return result;
 }

 /**
  * Handle successful service response
  */
 handleServiceSuccess(result, serviceName, extractionTime, context) {
  console.log(`[TRANSCRIPT-ORCHESTRATOR] ${serviceName} service completed in ${extractionTime}ms`);

  const validation = TranscriptValidator.validate(result, context.videoId, context.minLength);

  console.log(`[TRANSCRIPT-ORCHESTRATOR] ✅ ${serviceName} service SUCCESS:`);
  console.log(`  - Transcript length: ${validation.totalLength} characters`);
  console.log(`  - Meaningful segments: ${validation.meaningfulSegments}`);
  console.log(`  - Method: ${result.method || 'Unknown'}`);

  this.stats.successCount++;
  this.updateServiceStats(serviceName, true, extractionTime);

  return {
   ...result,
   serviceUsed: serviceName,
   extractionTime,
   sessionId: context.sessionId,
   validation,
   isValidated: true,
  };
 }

 /**
  * Handle service error
  */
 handleServiceError(error, serviceName, extractionTime, context) {
  context.lastError = error;
  console.log(`[TRANSCRIPT-ORCHESTRATOR] ❌ ${serviceName} service failed: ${error.message}`);

  if (TranscriptValidator.isDisabledError(error)) {
   console.log(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ Video ${context.videoId} has transcripts disabled by owner - stopping service attempts`);
   context.isDisabledByOwner = true;
   this.updateServiceStats(serviceName, false, extractionTime);
   return;
  }

  if (error instanceof NoValidTranscriptError) {
   console.log(`[TRANSCRIPT-ORCHESTRATOR] ⚠️ Validation failed: ${error.message}`);
   this.updateServiceStats(serviceName, false, extractionTime);
   return;
  }

  this.updateServiceStats(serviceName, false, extractionTime);
 }

 /**
  * Log extraction failure details
  */
 logExtractionFailure(context) {
  console.log(`[TRANSCRIPT-ORCHESTRATOR] 💀 All services failed for ${context.videoId}`);
  console.log(`[TRANSCRIPT-ORCHESTRATOR] Services attempted: ${context.servicesAttempted.join(', ')}`);
 }

 /**
  * Throw the most appropriate error based on context
  */
 throwAppropriateError(context) {
  if (context.isDisabledByOwner) {
   throw new TranscriptDisabledError(context.videoId);
  }

  if (context.lastError instanceof NoValidTranscriptError) {
   throw context.lastError;
  }

  const comprehensiveError = new NoValidTranscriptError(
   context.videoId,
   'extraction_failed',
   context.lastError?.message || 'All transcript extraction methods failed',
   {
    actualLength: 0,
    minRequired: context.minLength,
    servicesAttempted: context.servicesAttempted,
    lastError: context.lastError?.message || 'Unknown error',
    sessionId: context.sessionId,
    totalAttempts: this.stats.totalAttempts,
    timestamp: new Date().toISOString(),
   }
  );

  throw comprehensiveError;
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
