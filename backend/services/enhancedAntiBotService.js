/**
 * Enhanced Anti-Bot Detection Service
 * Implements advanced strategies to bypass YouTube's 2025 bot detection
 */

const fs = require('fs');
const path = require('path');

class EnhancedAntiBotService {
 constructor() {
  this.cookieRotationIndex = 0;
  this.lastRotationTime = 0;
  this.rotationInterval = 10 * 60 * 1000; // 10 minutes
  this.requestCount = 0;
  this.cooldownPeriod = 60 * 1000; // 1 minute cooldown after detection
  this.lastBotDetection = 0;
 }

 /**
  * Check if we're in cooldown after bot detection
  */
 isInCooldown() {
  const now = Date.now();
  return now - this.lastBotDetection < this.cooldownPeriod;
 }

 /**
  * Record bot detection event
  */
 recordBotDetection() {
  this.lastBotDetection = Date.now();
  console.log('[ANTI-BOT] 🤖 Bot detection recorded, entering cooldown period');
 }

 /**
  * Get enhanced yt-dlp arguments with anti-detection measures
  */
 getEnhancedArgs(baseArgs, videoId) {
  if (this.isInCooldown()) {
   console.log('[ANTI-BOT] ⏳ In cooldown period, using minimal arguments');
   return this.getMinimalArgs(baseArgs, videoId);
  }

  const enhancedArgs = [...baseArgs];

  // Advanced anti-detection strategies
  const antiDetectionArgs = [
   // 1. Use multiple client strategies
   '--extractor-args',
   'youtube:player_client=web,android,ios',

   // 2. Rotate user agents
   '--user-agent',
   this.getRotatingUserAgent(),

   // 3. Add realistic headers
   '--add-header',
   'Accept-Language: en-US,en;q=0.9,id;q=0.8',
   '--add-header',
   'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
   '--add-header',
   'Accept-Encoding: gzip, deflate, br',
   '--add-header',
   'Cache-Control: no-cache',
   '--add-header',
   'Pragma: no-cache',
   '--add-header',
   'Sec-Fetch-Dest: document',
   '--add-header',
   'Sec-Fetch-Mode: navigate',
   '--add-header',
   'Sec-Fetch-Site: none',
   '--add-header',
   'Upgrade-Insecure-Requests: 1',

   // 4. Network settings
   '--socket-timeout',
   '60',
   '--retries',
   '3',
   '--fragment-retries',
   '3',
   '--extractor-retries',
   '2',

   // 5. Geo bypass
   '--geo-bypass',
   '--geo-bypass-country',
   'US',

   // 6. Force IPv4 (more stable)
   '--force-ipv4',

   // 7. Rate limiting
   '--sleep-interval',
   '2',
   '--max-sleep-interval',
   '5',
   '--sleep-subtitles',
   '1',
  ];

  // Add anti-detection args if not already present
  antiDetectionArgs.forEach((arg, index) => {
   if (index % 2 === 0) {
    // Flag
    if (!enhancedArgs.includes(arg)) {
     enhancedArgs.push(arg, antiDetectionArgs[index + 1]);
    }
   }
  });

  console.log(`[ANTI-BOT] 🛡️ Enhanced args applied for ${videoId} (${enhancedArgs.length} total)`);
  return enhancedArgs;
 }

 /**
  * Get minimal arguments for cooldown period
  */
 getMinimalArgs(baseArgs, videoId) {
  const minimalArgs = [...baseArgs];

  // Remove potentially triggering arguments
  const toRemove = ['--extractor-args', '--add-header', '--user-agent'];
  toRemove.forEach((arg) => {
   const index = minimalArgs.indexOf(arg);
   if (index !== -1) {
    minimalArgs.splice(index, 2); // Remove flag and value
   }
  });

  // Add minimal safe arguments
  if (!minimalArgs.includes('--socket-timeout')) {
   minimalArgs.push('--socket-timeout', '30');
  }
  if (!minimalArgs.includes('--retries')) {
   minimalArgs.push('--retries', '1');
  }

  console.log(`[ANTI-BOT] 🔒 Minimal args for cooldown period: ${videoId}`);
  return minimalArgs;
 }

 /**
  * Get rotating user agent to avoid patterns
  */
 getRotatingUserAgent() {
  const userAgents = [
   // Chrome variants
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

   // Firefox variants
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',

   // Safari variants
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',

   // Edge variants
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  ];

  // Rotate user agent every few requests
  const now = Date.now();
  if (now - this.lastRotationTime > this.rotationInterval) {
   this.cookieRotationIndex = (this.cookieRotationIndex + 1) % userAgents.length;
   this.lastRotationTime = now;
   console.log(`[ANTI-BOT] 🔄 Rotated to user agent index: ${this.cookieRotationIndex}`);
  }

  return userAgents[this.cookieRotationIndex];
 }

 /**
  * Analyze error to detect bot detection
  */
 isBotDetectionError(error) {
  if (!error || typeof error !== 'string') return false;

  const botPatterns = [
   "sign in to confirm you're not a bot",
   'sign in to confirm you are not a bot',
   "confirm you're not a bot",
   'content is not available on this app',
   'video is not available',
   'private video',
   'this video has been removed',
   'video unavailable',
   'age-restricted video',
   'restricted from playback',
   'unable to extract',
   'http error 403',
   'http error 429',
   'too many requests',
   'rate limit',
   'please try again later',
   'temporarily blocked',
   'access denied',
  ];

  const errorLower = error.toLowerCase();
  return botPatterns.some((pattern) => errorLower.includes(pattern.toLowerCase()));
 }

 /**
  * Get enhanced cookie arguments
  */
 getEnhancedCookieArgs(cookiesPath) {
  if (!cookiesPath || !fs.existsSync(cookiesPath)) {
   console.log('[ANTI-BOT] ⚠️ No valid cookies path provided');
   return [];
  }

  // Validate cookies file
  try {
   const content = fs.readFileSync(cookiesPath, 'utf8');
   if (!content.includes('youtube.com') || content.length < 100) {
    console.log('[ANTI-BOT] ⚠️ Cookies file appears invalid or empty');
    return [];
   }
  } catch (error) {
   console.log('[ANTI-BOT] ❌ Failed to read cookies file:', error.message);
   return [];
  }

  console.log('[ANTI-BOT] 🍪 Using enhanced cookies configuration');
  return ['--cookies', cookiesPath];
 }

 /**
  * Get request statistics
  */
 getStats() {
  return {
   requestCount: this.requestCount,
   isInCooldown: this.isInCooldown(),
   lastBotDetection: this.lastBotDetection,
   cooldownRemaining: Math.max(0, this.cooldownPeriod - (Date.now() - this.lastBotDetection)),
   currentUserAgentIndex: this.cookieRotationIndex,
  };
 }
}

module.exports = new EnhancedAntiBotService();
