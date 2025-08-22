/**
 * Advanced Bot Detection Bypass System
 * Handles YouTube's enhanced bot detection mechanisms
 */

const fs = require('fs');
const path = require('path');

class BotDetectionBypass {
 constructor() {
  this.userAgents = [
   // Real browser user agents - updated 2025
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  ];

  this.extractorConfigs = [
   // Configuration 1: Mobile-first approach
   {
    name: 'mobile-android',
    clients: 'android',
    userAgent: 'com.google.android.youtube/19.50.37 (Linux; U; Android 14; SM-G998B Build/UP1A.231005.007) gzip',
    extraArgs: ['--extractor-args', 'youtube:player_client=android;innertube_host=youtubei.googleapis.com'],
   },
   // Configuration 2: iOS approach
   {
    name: 'mobile-ios',
    clients: 'ios',
    userAgent: 'com.google.ios.youtube/19.50.7 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X)',
    extraArgs: ['--extractor-args', 'youtube:player_client=ios;innertube_host=youtubei.googleapis.com'],
   },
   // Configuration 3: Desktop web without cookies
   {
    name: 'web-no-cookies',
    clients: 'web',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraArgs: ['--extractor-args', 'youtube:player_client=web;innertube_host=youtubei.googleapis.com'],
    skipCookies: true,
   },
   // Configuration 4: TV client fallback
   {
    name: 'tv-fallback',
    clients: 'tv',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/40.13031.2 (unlike Gecko) v8/9.7.230.20 TV Safari/537.36',
    extraArgs: ['--extractor-args', 'youtube:player_client=tv;innertube_host=youtubei.googleapis.com'],
   },
   // Configuration 5: All clients as last resort
   {
    name: 'all-clients',
    clients: 'android,web,tv,ios',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraArgs: ['--extractor-args', 'youtube:player_client=android,web,tv,ios;innertube_host=youtubei.googleapis.com'],
   },
  ];

  this.delays = {
   between_attempts: 5000, // 5 seconds between attempts
   between_configs: 2000, // 2 seconds between config changes
   after_failure: 10000, // 10 seconds after failure
  };
 }

 /**
  * Get enhanced extractor arguments with bot detection bypass
  */
 getEnhancedArgs(videoId, config = null, useCookies = true) {
  const selectedConfig = config || this.extractorConfigs[0];
  console.log(`[BOT-BYPASS] 🛡️  Using config: ${selectedConfig.name}`);

  const args = [];

  // Add user agent
  args.push('--user-agent', selectedConfig.userAgent);

  // Add client configuration
  args.push(...selectedConfig.extraArgs);

  // Add cookies if not explicitly skipped and available
  if (!selectedConfig.skipCookies && useCookies) {
   const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
   if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
    console.log(`[BOT-BYPASS] 🍪 Using cookies with ${selectedConfig.name}`);
   }
  }

  // Add additional anti-detection measures
  args.push(
   '--sleep-requests',
   '1', // Sleep between requests
   '--sleep-interval',
   '0.5', // Random sleep interval
   '--socket-timeout',
   '60', // Longer timeout
   '--retries',
   '3', // Retry on failure
   '--fragment-retries',
   '3', // Fragment retry
   '--no-check-certificate', // Skip cert checks
   '--geo-bypass', // Bypass geo restrictions
   '--no-warnings' // Reduce output noise
  );

  return args;
 }

 /**
  * Attempt extraction with progressive fallback strategies
  */
 async attemptExtractionWithFallback(executeYtDlp, videoId, baseArgs) {
  console.log(`[BOT-BYPASS] 🚀 Starting progressive fallback extraction for ${videoId}`);

  let lastError = null;

  for (let i = 0; i < this.extractorConfigs.length; i++) {
   const config = this.extractorConfigs[i];

   try {
    console.log(`[BOT-BYPASS] 📡 Attempt ${i + 1}/${this.extractorConfigs.length}: ${config.name}`);

    // Build enhanced arguments
    const enhancedArgs = [...baseArgs, ...this.getEnhancedArgs(videoId, config, !config.skipCookies)];

    // Add delay between attempts (except first)
    if (i > 0) {
     console.log(`[BOT-BYPASS] ⏰ Waiting ${this.delays.between_configs}ms before next attempt...`);
     await this.sleep(this.delays.between_configs);
    }

    // Execute with current configuration
    const result = await executeYtDlp(enhancedArgs);

    if (result.success) {
     console.log(`[BOT-BYPASS] ✅ Success with config: ${config.name}`);
     return result;
    }

    lastError = result.error;
    console.log(`[BOT-BYPASS] ❌ Config ${config.name} failed: ${result.error?.message || 'Unknown error'}`);
   } catch (error) {
    lastError = error;
    console.log(`[BOT-BYPASS] ❌ Config ${config.name} threw exception: ${error.message}`);
   }
  }

  // All configurations failed
  console.log(`[BOT-BYPASS] 💀 All ${this.extractorConfigs.length} configurations failed`);
  throw lastError || new Error('All bot detection bypass strategies failed');
 }

 /**
  * Check if error indicates bot detection
  */
 isBotDetectionError(error) {
  if (!error) return false;

  const message = error.message || error.toString();
  const botDetectionIndicators = [
   'The following content is not available on this app',
   'Watch on the latest version of YouTube',
   "Sign in to confirm you're not a bot",
   'This video is not available',
   'Private video',
   'Video unavailable',
   'Requested format is not available',
   'HTTP Error 403',
   'HTTP Error 429',
   'Too Many Requests',
   'blocked',
   'banned',
  ];

  return botDetectionIndicators.some((indicator) => message.toLowerCase().includes(indicator.toLowerCase()));
 }

 /**
  * Get recommendation for next action based on error
  */
 getRecommendation(error) {
  if (!this.isBotDetectionError(error)) {
   return {
    type: 'other_error',
    message: 'This appears to be a different type of error, not bot detection',
    actions: ['Check video availability', 'Verify video ID', 'Check network connection'],
   };
  }

  return {
   type: 'bot_detection',
   message: 'Bot detection encountered - cookies may need refresh',
   actions: ['Update cookies from a fresh browser session', 'Try alternative extraction methods', 'Use different video for testing', 'Check if video is region-locked', 'Wait and retry later (rate limiting)'],
  };
 }

 /**
  * Generate detailed bot detection report
  */
 generateBotDetectionReport(videoId, errors) {
  console.log(`\n🔍 BOT DETECTION ANALYSIS REPORT`);
  console.log(`=================================`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`\n📊 Error Analysis:`);

  errors.forEach((error, index) => {
   const config = this.extractorConfigs[index];
   const isBotDetection = this.isBotDetectionError(error);

   console.log(`\n${index + 1}. ${config?.name || 'Unknown Config'}`);
   console.log(`   Bot Detection: ${isBotDetection ? '✅ YES' : '❌ NO'}`);
   console.log(`   Error: ${error?.message || error?.toString() || 'Unknown error'}`);
  });

  const recommendation = this.getRecommendation(errors[0]);
  console.log(`\n💡 RECOMMENDATION:`);
  console.log(`Type: ${recommendation.type}`);
  console.log(`Message: ${recommendation.message}`);
  console.log(`Actions:`);
  recommendation.actions.forEach((action, index) => {
   console.log(`   ${index + 1}. ${action}`);
  });
  console.log(`\n=================================\n`);

  return recommendation;
 }

 /**
  * Sleep utility
  */
 sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
 }
}

module.exports = BotDetectionBypass;
