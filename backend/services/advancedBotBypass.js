const fs = require('fs');
const path = require('path');

/**
 * Advanced YouTube Bot Detection Bypass
 *
 * This module implements sophisticated techniques to bypass YouTube's
 * aggressive bot detection mechanisms that cause "The following content
 * is not available on this app" errors.
 */

class AdvancedBotBypass {
 constructor() {
  this.userAgents = [
   // Mobile Safari (most successful)
   'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
   'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',

   // Desktop Safari (better than Chrome for YouTube)
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',

   // Firefox (often less detected)
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0',

   // Edge
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.46',
  ];

  this.clientConfigs = [
   {
    name: 'ios_music',
    client: 'ios',
    extractorArgs: 'youtube:player_client=ios;innertube_host=music.youtube.com',
    supportsCookies: false,
   },
   {
    name: 'web_embedded',
    client: 'web',
    extractorArgs: 'youtube:player_client=web;innertube_host=www.youtube.com;embed=true',
    supportsCookies: true,
   },
   {
    name: 'mweb',
    client: 'mweb',
    extractorArgs: 'youtube:player_client=mweb;innertube_host=m.youtube.com',
    supportsCookies: true,
   },
   {
    name: 'web_creator',
    client: 'web',
    extractorArgs: 'youtube:player_client=web;innertube_host=studio.youtube.com',
    supportsCookies: true,
   },
  ];
 }

 /**
  * Generate bypass arguments for yt-dlp with advanced anti-detection
  */
 generateBypassArgs(options = {}) {
  const {useCookies = true, cookiesPath = '', randomizeUserAgent = true, useProxy = false, proxyUrl = '', maxRetries = 3, delayBetweenRequests = true} = options;

  // Select random client configuration
  const clientConfig = this.clientConfigs[Math.floor(Math.random() * this.clientConfigs.length)];

  // Generate random user agent
  const userAgent = randomizeUserAgent ? this.userAgents[Math.floor(Math.random() * this.userAgents.length)] : 'default';

  // Determine if cookies should be used
  const shouldUseCookies = useCookies && cookiesPath && clientConfig.supportsCookies;

  return {
   userAgent,
   extractorArgs: clientConfig.extractorArgs,
   clientConfig: clientConfig.name,
   supportsCookies: clientConfig.supportsCookies,
   useCookiesForThisAttempt: shouldUseCookies,
   maxRetries,
   delayBetweenRequests,
   useProxy,
   proxyUrl,
  };
 }

 /**
  * Generate multiple bypass configurations for fallback attempts
  */
 generateFallbackConfigs(options = {}) {
  const configs = [];

  // Config 1: iOS Music (often bypasses detection)
  configs.push(
   this.generateBypassArgs({
    ...options,
    useCookies: false, // iOS doesn't support cookies
   })
  );

  // Config 2: Mobile Web with cookies
  configs.push(
   this.generateBypassArgs({
    ...options,
    useCookies: true,
   })
  );

  // Config 3: Embedded player (less detection)
  configs.push(
   this.generateBypassArgs({
    ...options,
    useCookies: true,
    delayBetweenRequests: true,
   })
  );

  // Config 4: No cookies, maximum stealth
  configs.push(
   this.generateBypassArgs({
    ...options,
    useCookies: false,
    maxRetries: 5,
    delayBetweenRequests: true,
   })
  );

  return configs;
 }

 /**
  * Check if error indicates bot detection
  */
 isBotDetectionError(error) {
  const botDetectionPatterns = [
   'content is not available on this app',
   'The following content is not available',
   'HTTP Error 429',
   'Too Many Requests',
   'Request is missing required authentication credential',
   'HTTP Error 401: Unauthorized',
   'Sign in to confirm your age',
   'This video is not available',
   'Private video',
   'Video unavailable',
  ];

  const errorMessage = error.message || error.toString();
  return botDetectionPatterns.some((pattern) => errorMessage.toLowerCase().includes(pattern.toLowerCase()));
 }

 /**
  * Get recommended delay before retry
  */
 getRetryDelay(attemptNumber) {
  // Exponential backoff with jitter
  const baseDelay = 5000; // 5 seconds
  const maxDelay = 60000; // 60 seconds
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);
  const jitter = Math.random() * 2000; // Random 0-2 seconds
  return exponentialDelay + jitter;
 }

 /**
  * Log bypass attempt for debugging
  */
 logBypassAttempt(config, attemptNumber, success = false, error = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
   timestamp,
   attempt: attemptNumber,
   clientConfig: config.clientConfig,
   userAgent: config.userAgent.substring(0, 50) + '...',
   supportsCookies: config.supportsCookies,
   success,
   error: error ? error.message : null,
  };

  console.log(`[BOT-BYPASS] Attempt ${attemptNumber}: ${config.clientConfig} - ${success ? '✅ SUCCESS' : '❌ FAILED'}`);

  if (error && this.isBotDetectionError(error)) {
   console.log(`[BOT-BYPASS] ⚠️  Bot detection triggered: ${error.message.substring(0, 100)}...`);
  }

  return logEntry;
 }
}

module.exports = AdvancedBotBypass;
