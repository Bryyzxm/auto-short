/**
 * EMERGENCY ENDPOINTS FOR AZURE PRODUCTION CRISIS
 *
 * Add these endpoints to your server.js immediately to resolve:
 * - Cookie degradation (5/5 → 0/5)
 * - Rate limit exhaustion (10/10 attempts)
 * - Bot detection failures
 */

// ========================================
// ADD THESE IMPORTS TO SERVER.JS TOP
// ========================================
const EmergencyCookieManager = require('./services/emergencyCookieManager');
const EmergencyRateLimiter = require('./services/emergencyRateLimiter');

// Initialize emergency services
const emergencyCookies = new EmergencyCookieManager();
const emergencyRate = new EmergencyRateLimiter();

// ========================================
// ADD THESE ENDPOINTS TO SERVER.JS
// ========================================

// Emergency cookie validation endpoint
app.get('/api/emergency/cookies', async (req, res) => {
 try {
  const validation = await emergencyCookies.validateCookies();

  res.json({
   status: validation.isValid ? 'VALID' : 'INVALID',
   foundCookies: validation.foundCookies.length,
   totalRequired: 5,
   essentialCookies: validation.foundCookies,
   missingCookies: validation.missingCookies,
   fileSize: validation.fileSize || 0,
   lineCount: validation.lineCount || 0,
   error: validation.error || null,
   userAgent: emergencyCookies.getUserAgent(),
   timestamp: new Date().toISOString(),
   environment: process.env.NODE_ENV || 'development',
  });
 } catch (error) {
  res.status(500).json({
   status: 'ERROR',
   error: error.message,
   timestamp: new Date().toISOString(),
  });
 }
});

// Emergency rate limiter statistics
app.get('/api/emergency/rate-stats', (req, res) => {
 try {
  const stats = emergencyRate.getStats();

  res.json({
   status: 'OK',
   totalVideosTracked: stats.totalVideosTracked,
   videosInCooldown: stats.videosInCooldown,
   recentRequests: stats.recentRequests,
   lastGlobalRequest: stats.lastGlobalRequest,
   timeSinceLastRequest: stats.timeSinceLastRequest,
   configuration: {
    maxAttemptsPerVideo: stats.config.maxAttemptsPerVideo,
    globalMinInterval: `${stats.config.globalMinInterval / 1000}s`,
    videoDelay: `${stats.config.videoDelay / 60000}min`,
    resetTime: `${stats.config.resetTime / 60000}min`,
   },
   videoDetails: stats.videoDetails,
   timestamp: new Date().toISOString(),
  });
 } catch (error) {
  res.status(500).json({
   status: 'ERROR',
   error: error.message,
  });
 }
});

// Emergency video rate limit check
app.get('/api/emergency/video/:videoId/status', async (req, res) => {
 try {
  const {videoId} = req.params;
  const cooldownStatus = emergencyRate.isVideoInCooldown(videoId);
  const rateLimitCheck = await emergencyRate.checkRateLimit(videoId, 'status_check');

  res.json({
   videoId,
   allowed: rateLimitCheck.allowed,
   inCooldown: cooldownStatus.inCooldown,
   attempts: cooldownStatus.attempts,
   maxAttempts: cooldownStatus.maxAttempts,
   cooldownRemaining: cooldownStatus.cooldownRemaining,
   waitTime: rateLimitCheck.waitTime || 0,
   message: rateLimitCheck.message,
   reason: rateLimitCheck.reason || 'allowed',
   timestamp: new Date().toISOString(),
  });
 } catch (error) {
  res.status(500).json({
   status: 'ERROR',
   error: error.message,
  });
 }
});

// Emergency reset specific video
app.post('/api/emergency/reset-video/:videoId', (req, res) => {
 try {
  const {videoId} = req.params;
  const result = emergencyRate.resetVideo(videoId);

  res.json({
   success: true,
   videoId,
   message: `Rate limit reset for video: ${videoId}`,
   timestamp: new Date().toISOString(),
   action: 'video_reset',
  });
 } catch (error) {
  res.status(500).json({
   success: false,
   error: error.message,
  });
 }
});

// Emergency reset all rate limits
app.post('/api/emergency/reset-all', (req, res) => {
 try {
  const result = emergencyRate.resetAll();

  res.json({
   success: true,
   message: 'All rate limits and video tracking reset',
   timestamp: new Date().toISOString(),
   action: 'full_reset',
  });
 } catch (error) {
  res.status(500).json({
   success: false,
   error: error.message,
  });
 }
});

// Emergency health check with comprehensive status
app.get('/api/emergency/health', async (req, res) => {
 try {
  const cookieValidation = await emergencyCookies.smartValidation();
  const rateStats = emergencyRate.getStats();

  // Determine overall health
  const cookiesHealthy = cookieValidation.isValid !== false;
  const rateLimitsHealthy = rateStats.videosInCooldown < 5;
  const overallHealthy = cookiesHealthy && rateLimitsHealthy;

  res.json({
   status: overallHealthy ? 'HEALTHY' : 'DEGRADED',
   components: {
    cookies: {
     status: cookiesHealthy ? 'OK' : 'DEGRADED',
     valid: cookieValidation.isValid !== false,
     count: cookieValidation.foundCookies?.length || 0,
     details: cookieValidation,
    },
    rateLimiter: {
     status: rateLimitsHealthy ? 'OK' : 'DEGRADED',
     videosTracked: rateStats.totalVideosTracked,
     videosInCooldown: rateStats.videosInCooldown,
     recentActivity: rateStats.recentRequests,
    },
   },
   environment: process.env.NODE_ENV || 'development',
   timestamp: new Date().toISOString(),
   uptime: process.uptime(),
  });
 } catch (error) {
  res.status(500).json({
   status: 'ERROR',
   error: error.message,
   timestamp: new Date().toISOString(),
  });
 }
});

// ========================================
// VALIDATION COMMANDS FOR DEPLOYMENT
// ========================================

/* 
After deployment, test these endpoints:

1. Check cookie status:
curl https://your-app.azurewebsites.net/api/emergency/cookies

2. Check rate limiter:
curl https://your-app.azurewebsites.net/api/emergency/rate-stats

3. Check overall health:
curl https://your-app.azurewebsites.net/api/emergency/health

4. Test video status (replace VIDEO_ID):
curl https://your-app.azurewebsites.net/api/emergency/video/VIDEO_ID/status

5. Reset all if needed:
curl -X POST https://your-app.azurewebsites.net/api/emergency/reset-all

Expected success indicators:
- Cookies: status: "VALID", foundCookies: 3-5
- Rate: videosInCooldown: 0-2, maxAttemptsPerVideo: 3
- Health: status: "HEALTHY"
*/
