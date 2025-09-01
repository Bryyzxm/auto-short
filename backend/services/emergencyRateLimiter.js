/**
 * EMERGENCY RATE LIMITER FOR AZURE PRODUCTION
 *
 * Critical fix for rate limit exhaustion (10/10 attempts reached)
 * Implements conservative limiting to prevent YouTube hourly bans
 */

class EmergencyRateLimiter {
 constructor() {
  this.videoAttempts = new Map();
  this.globalLastRequest = 0;

  // Conservative configuration to prevent Azure rate limit issues
  this.config = {
   maxAttemptsPerVideo: 3, // Reduced from 10 to 3 (critical fix)
   globalMinInterval: 15000, // 15 seconds between ANY requests
   videoDelay: 300000, // 5 minutes delay after video failure
   resetTime: 3600000, // 1 hour to reset video attempts
   burstPrevention: 2, // Max 2 requests per burst
   burstWindow: 60000, // 1 minute burst window
  };

  this.requestHistory = [];
 }

 /**
  * Check if request is allowed for video
  */
 async checkRateLimit(videoId, requestType = 'download') {
  const now = Date.now();

  // Clean old history
  this.cleanupHistory(now);

  // Check global rate limiting (15s minimum between requests)
  const timeSinceLastRequest = now - this.globalLastRequest;
  if (timeSinceLastRequest < this.config.globalMinInterval) {
   const waitTime = this.config.globalMinInterval - timeSinceLastRequest;
   return {
    allowed: false,
    reason: 'global_rate_limit',
    waitTime,
    message: `Global cooldown: wait ${Math.ceil(waitTime / 1000)}s`,
   };
  }

  // Check burst prevention
  const recentRequests = this.requestHistory.filter((req) => now - req.timestamp < this.config.burstWindow);

  if (recentRequests.length >= this.config.burstPrevention) {
   const oldestRequest = recentRequests[0];
   const waitTime = this.config.burstWindow - (now - oldestRequest.timestamp);
   return {
    allowed: false,
    reason: 'burst_prevention',
    waitTime,
    message: `Burst limit: wait ${Math.ceil(waitTime / 1000)}s`,
   };
  }

  // Check video-specific rate limiting
  const videoData = this.videoAttempts.get(videoId) || {
   attempts: 0,
   lastAttempt: 0,
   firstAttempt: now,
  };

  // Reset video attempts if enough time has passed
  if (now - videoData.lastAttempt > this.config.resetTime) {
   videoData.attempts = 0;
   videoData.firstAttempt = now;
   console.log(`[EMERGENCY-RATE] 🔄 Reset attempts for video: ${videoId}`);
  }

  // Check if video has reached max attempts
  if (videoData.attempts >= this.config.maxAttemptsPerVideo) {
   const waitTime = this.config.resetTime - (now - videoData.lastAttempt);
   return {
    allowed: false,
    reason: 'video_rate_limit',
    waitTime,
    attempts: videoData.attempts,
    message: `Video rate limit: wait ${Math.ceil(waitTime / 60000)} minutes (${videoData.attempts}/${this.config.maxAttemptsPerVideo})`,
   };
  }

  // Request is allowed - record it
  this.globalLastRequest = now;
  videoData.attempts += 1;
  videoData.lastAttempt = now;
  this.videoAttempts.set(videoId, videoData);

  // Add to request history
  this.requestHistory.push({
   videoId,
   timestamp: now,
   requestType,
  });

  console.log(`[EMERGENCY-RATE] ✅ Request allowed for ${videoId} (${videoData.attempts}/${this.config.maxAttemptsPerVideo})`);

  return {
   allowed: true,
   attempts: videoData.attempts,
   maxAttempts: this.config.maxAttemptsPerVideo,
   message: `Request allowed (${videoData.attempts}/${this.config.maxAttemptsPerVideo})`,
  };
 }

 /**
  * Record successful request
  */
 recordSuccess(videoId, timestamp = Date.now()) {
  console.log(`[EMERGENCY-RATE] ✅ Success recorded for ${videoId}`);
  // Success doesn't reset attempts, but it's good for monitoring
 }

 /**
  * Record failed request
  */
 recordFailure(videoId, error, timestamp = Date.now()) {
  const videoData = this.videoAttempts.get(videoId);
  if (videoData) {
   console.log(`[EMERGENCY-RATE] ❌ Failure recorded for ${videoId} (${videoData.attempts}/${this.config.maxAttemptsPerVideo})`);
  }

  // For bot detection errors, we may want to apply additional cooldown
  if (this.isBotDetectionError(error)) {
   console.log(`[EMERGENCY-RATE] 🤖 Bot detection error for ${videoId} - applying extra cooldown`);
   if (videoData) {
    videoData.lastAttempt = timestamp + this.config.videoDelay; // Extra delay
    this.videoAttempts.set(videoId, videoData);
   }
  }
 }

 /**
  * Check if error indicates bot detection
  */
 isBotDetectionError(error) {
  const errorString = error?.toString()?.toLowerCase() || '';
  const botPatterns = ["sign in to confirm you're not a bot", 'bot detection', 'too many requests', 'rate limit', 'blocked'];

  return botPatterns.some((pattern) => errorString.includes(pattern));
 }

 /**
  * Clean up old request history
  */
 cleanupHistory(now) {
  const maxAge = this.config.resetTime; // Keep history for 1 hour

  this.requestHistory = this.requestHistory.filter((req) => now - req.timestamp < maxAge);

  // Clean up very old video attempts
  for (const [videoId, data] of this.videoAttempts.entries()) {
   if (now - data.lastAttempt > maxAge * 2) {
    // 2 hours
    this.videoAttempts.delete(videoId);
   }
  }
 }

 /**
  * Get current rate limiter statistics
  */
 getStats() {
  const now = Date.now();
  this.cleanupHistory(now);

  const videosInCooldown = Array.from(this.videoAttempts.values()).filter((data) => data.attempts >= this.config.maxAttemptsPerVideo && now - data.lastAttempt < this.config.resetTime).length;

  const recentRequests = this.requestHistory.filter(
   (req) => now - req.timestamp < 600000 // Last 10 minutes
  );

  return {
   totalVideosTracked: this.videoAttempts.size,
   videosInCooldown,
   recentRequests: recentRequests.length,
   lastGlobalRequest: this.globalLastRequest,
   timeSinceLastRequest: now - this.globalLastRequest,
   config: this.config,
   videoDetails: Array.from(this.videoAttempts.entries()).map(([videoId, data]) => ({
    videoId,
    attempts: data.attempts,
    lastAttempt: data.lastAttempt,
    cooldownRemaining: Math.max(0, this.config.resetTime - (now - data.lastAttempt)),
   })),
  };
 }

 /**
  * Reset rate limiting for specific video (emergency admin function)
  */
 resetVideo(videoId) {
  this.videoAttempts.delete(videoId);
  console.log(`[EMERGENCY-RATE] 🔄 Reset video: ${videoId}`);
  return {success: true, message: `Video ${videoId} rate limit reset`};
 }

 /**
  * Reset all rate limiting (emergency admin function)
  */
 resetAll() {
  this.videoAttempts.clear();
  this.requestHistory = [];
  this.globalLastRequest = 0;
  console.log('[EMERGENCY-RATE] 🔄 All rate limits reset');
  return {success: true, message: 'All rate limits reset'};
 }

 /**
  * Check if video is currently in cooldown
  */
 isVideoInCooldown(videoId) {
  const videoData = this.videoAttempts.get(videoId);
  if (!videoData) return false;

  const now = Date.now();
  const isInCooldown = videoData.attempts >= this.config.maxAttemptsPerVideo && now - videoData.lastAttempt < this.config.resetTime;

  return {
   inCooldown: isInCooldown,
   attempts: videoData.attempts,
   maxAttempts: this.config.maxAttemptsPerVideo,
   cooldownRemaining: isInCooldown ? this.config.resetTime - (now - videoData.lastAttempt) : 0,
  };
 }
}

module.exports = EmergencyRateLimiter;
