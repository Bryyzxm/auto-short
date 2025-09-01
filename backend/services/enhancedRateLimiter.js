/**
 * ENHANCED RATE LIMITER WITH INTELLIGENT BACKOFF
 *
 * Advanced rate limiting system to prevent YouTube bot detection
 * Implements exponential backoff, per-video tracking, and adaptive delays
 */

class EnhancedRateLimiter {
 constructor() {
  this.videoAttempts = new Map(); // videoId -> { attempts, lastAttempt, cooldownUntil }
  this.globalLastRequest = 0;
  this.globalCooldown = 0;

  // Configuration
  this.config = {
   maxAttemptsPerVideo: 5, // Max attempts per video before long cooldown
   globalMinInterval: 8000, // Minimum 8 seconds between any requests
   baseVideoDelay: 15000, // Base delay after video failure (15s)
   maxVideoDelay: 300000, // Max delay for a video (5 minutes)
   exponentialBase: 2, // Exponential backoff multiplier
   cooldownDecayTime: 1800000, // 30 minutes - when to reset video attempts
   burstPrevention: 3, // Max requests in burst window
   burstWindow: 30000, // 30 second burst window
   adaptiveThreshold: 0.7, // Success rate threshold for adaptive delays
  };

  this.requestHistory = [];
  this.successHistory = [];
 }

 /**
  * Check if request is allowed for a specific video
  */
 async checkRateLimit(videoId, requestType = 'download') {
  const now = Date.now();

  // Clean up old entries
  this.cleanupOldEntries(now);

  // Check global rate limiting
  const globalCheck = this.checkGlobalLimit(now);
  if (!globalCheck.allowed) {
   return {
    allowed: false,
    reason: 'global_rate_limit',
    waitTime: globalCheck.waitTime,
    message: `Global rate limit: wait ${Math.ceil(globalCheck.waitTime / 1000)}s`,
   };
  }

  // Check burst prevention
  const burstCheck = this.checkBurstLimit(now);
  if (!burstCheck.allowed) {
   return {
    allowed: false,
    reason: 'burst_prevention',
    waitTime: burstCheck.waitTime,
    message: `Burst prevention: wait ${Math.ceil(burstCheck.waitTime / 1000)}s`,
   };
  }

  // Check video-specific rate limiting
  const videoCheck = this.checkVideoLimit(videoId, now);
  if (!videoCheck.allowed) {
   return {
    allowed: false,
    reason: 'video_rate_limit',
    waitTime: videoCheck.waitTime,
    attempts: videoCheck.attempts,
    message: `Video rate limit: wait ${Math.ceil(videoCheck.waitTime / 1000)}s (attempt ${videoCheck.attempts}/${this.config.maxAttemptsPerVideo})`,
   };
  }

  // Check adaptive delays based on recent success rate
  const adaptiveDelay = this.calculateAdaptiveDelay(now);
  if (adaptiveDelay > 0) {
   return {
    allowed: false,
    reason: 'adaptive_delay',
    waitTime: adaptiveDelay,
    message: `Adaptive delay: wait ${Math.ceil(adaptiveDelay / 1000)}s (low success rate detected)`,
   };
  }

  // Request allowed - record it
  this.recordRequest(videoId, now, requestType);

  return {
   allowed: true,
   attempts: videoCheck.attempts + 1,
   message: `Rate limit check passed for ${videoId}`,
  };
 }

 /**
  * Check global minimum interval between any requests
  */
 checkGlobalLimit(now) {
  const timeSinceLastRequest = now - this.globalLastRequest;
  const required = this.config.globalMinInterval;

  if (timeSinceLastRequest < required) {
   return {
    allowed: false,
    waitTime: required - timeSinceLastRequest,
   };
  }

  return {allowed: true};
 }

 /**
  * Check burst prevention - max requests in time window
  */
 checkBurstLimit(now) {
  const recentRequests = this.requestHistory.filter((req) => now - req.timestamp < this.config.burstWindow);

  if (recentRequests.length >= this.config.burstPrevention) {
   const oldestRequest = recentRequests[0];
   const waitTime = this.config.burstWindow - (now - oldestRequest.timestamp);

   return {
    allowed: false,
    waitTime: Math.max(waitTime, 0),
   };
  }

  return {allowed: true};
 }

 /**
  * Check video-specific rate limiting with exponential backoff
  */
 checkVideoLimit(videoId, now) {
  const videoData = this.videoAttempts.get(videoId) || {
   attempts: 0,
   lastAttempt: 0,
   cooldownUntil: 0,
  };

  // Check if still in cooldown
  if (now < videoData.cooldownUntil) {
   return {
    allowed: false,
    waitTime: videoData.cooldownUntil - now,
    attempts: videoData.attempts,
   };
  }

  // Check if max attempts reached
  if (videoData.attempts >= this.config.maxAttemptsPerVideo) {
   // Reset if enough time has passed
   if (now - videoData.lastAttempt > this.config.cooldownDecayTime) {
    this.videoAttempts.set(videoId, {attempts: 0, lastAttempt: 0, cooldownUntil: 0});
    return {allowed: true, attempts: 0};
   }

   return {
    allowed: false,
    waitTime: this.config.cooldownDecayTime - (now - videoData.lastAttempt),
    attempts: videoData.attempts,
   };
  }

  return {
   allowed: true,
   attempts: videoData.attempts,
  };
 }

 /**
  * Calculate adaptive delay based on recent success rate
  */
 calculateAdaptiveDelay(now) {
  // Only apply if we have enough history
  if (this.successHistory.length < 5) {
   return 0;
  }

  // Check success rate in last 10 minutes
  const recentWindow = 10 * 60 * 1000; // 10 minutes
  const recentAttempts = this.requestHistory.filter((req) => now - req.timestamp < recentWindow);
  const recentSuccesses = this.successHistory.filter((success) => now - success.timestamp < recentWindow);

  if (recentAttempts.length === 0) return 0;

  const successRate = recentSuccesses.length / recentAttempts.length;

  // If success rate is below threshold, apply adaptive delay
  if (successRate < this.config.adaptiveThreshold) {
   const delayMultiplier = (this.config.adaptiveThreshold - successRate) * 2;
   return Math.min(delayMultiplier * this.config.baseVideoDelay, 60000); // Max 1 minute adaptive delay
  }

  return 0;
 }

 /**
  * Record a request attempt
  */
 recordRequest(videoId, timestamp, requestType) {
  // Update global tracking
  this.globalLastRequest = timestamp;

  // Update request history
  this.requestHistory.push({videoId, timestamp, requestType});

  // Update video-specific tracking
  const videoData = this.videoAttempts.get(videoId) || {
   attempts: 0,
   lastAttempt: 0,
   cooldownUntil: 0,
  };

  videoData.attempts += 1;
  videoData.lastAttempt = timestamp;

  this.videoAttempts.set(videoId, videoData);

  console.log(`[RATE-LIMITER] 📊 Request recorded for ${videoId} (attempt ${videoData.attempts}/${this.config.maxAttemptsPerVideo})`);
 }

 /**
  * Record a successful request
  */
 recordSuccess(videoId, timestamp = Date.now()) {
  this.successHistory.push({videoId, timestamp});
  console.log(`[RATE-LIMITER] ✅ Success recorded for ${videoId}`);
 }

 /**
  * Record a failed request and apply cooldown
  */
 recordFailure(videoId, error, timestamp = Date.now()) {
  const videoData = this.videoAttempts.get(videoId) || {
   attempts: 0,
   lastAttempt: timestamp,
   cooldownUntil: 0,
  };

  // Calculate exponential backoff delay
  const delay = Math.min(this.config.baseVideoDelay * Math.pow(this.config.exponentialBase, videoData.attempts - 1), this.config.maxVideoDelay);

  videoData.cooldownUntil = timestamp + delay;
  this.videoAttempts.set(videoId, videoData);

  console.log(`[RATE-LIMITER] ❌ Failure recorded for ${videoId}. Cooldown: ${Math.ceil(delay / 1000)}s`);

  // Apply global cooldown for bot detection errors
  if (this.isBotDetectionError(error)) {
   this.globalCooldown = timestamp + delay * 2; // Double the cooldown globally
   console.log(`[RATE-LIMITER] 🤖 Bot detection error - applying global cooldown: ${Math.ceil((delay * 2) / 1000)}s`);
  }
 }

 /**
  * Check if error indicates bot detection
  */
 isBotDetectionError(error) {
  const botErrorPatterns = ["Sign in to confirm you're not a bot", 'bot detection', 'too many requests', 'rate limit', 'blocked', 'captcha'];

  const errorString = error?.toString()?.toLowerCase() || '';
  return botErrorPatterns.some((pattern) => errorString.includes(pattern));
 }

 /**
  * Clean up old entries to prevent memory leaks
  */
 cleanupOldEntries(now) {
  const maxAge = this.config.cooldownDecayTime * 2; // Keep data for 1 hour

  // Clean request history
  this.requestHistory = this.requestHistory.filter((req) => now - req.timestamp < maxAge);

  // Clean success history
  this.successHistory = this.successHistory.filter((success) => now - success.timestamp < maxAge);

  // Clean video attempts that are very old
  for (const [videoId, data] of this.videoAttempts.entries()) {
   if (now - data.lastAttempt > maxAge && now > data.cooldownUntil) {
    this.videoAttempts.delete(videoId);
   }
  }
 }

 /**
  * Get current rate limiter statistics
  */
 getStats() {
  const now = Date.now();
  this.cleanupOldEntries(now);

  const recentWindow = 10 * 60 * 1000; // 10 minutes
  const recentAttempts = this.requestHistory.filter((req) => now - req.timestamp < recentWindow);
  const recentSuccesses = this.successHistory.filter((success) => now - success.timestamp < recentWindow);

  return {
   totalVideosTracked: this.videoAttempts.size,
   recentAttempts: recentAttempts.length,
   recentSuccesses: recentSuccesses.length,
   successRate: recentAttempts.length > 0 ? recentSuccesses.length / recentAttempts.length : 1,
   videosInCooldown: Array.from(this.videoAttempts.values()).filter((data) => now < data.cooldownUntil).length,
   globalCooldownRemaining: Math.max(0, this.globalCooldown - now),
  };
 }

 /**
  * Force reset rate limiting for a video (admin function)
  */
 resetVideo(videoId) {
  this.videoAttempts.delete(videoId);
  console.log(`[RATE-LIMITER] 🔄 Rate limiting reset for ${videoId}`);
 }

 /**
  * Force reset all rate limiting (admin function)
  */
 resetAll() {
  this.videoAttempts.clear();
  this.requestHistory = [];
  this.successHistory = [];
  this.globalLastRequest = 0;
  this.globalCooldown = 0;
  console.log(`[RATE-LIMITER] 🔄 All rate limiting reset`);
 }
}

module.exports = EnhancedRateLimiter;
