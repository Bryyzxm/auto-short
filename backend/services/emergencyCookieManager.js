/**
 * EMERGENCY COOKIE MANAGER FOR AZURE PRODUCTION
 *
 * Critical fix for YouTube bot detection and cookie degradation issues
 * Identified from Azure logs showing 5/5 → 0/5 cookie degradation
 */

const fs = require('fs').promises;
const path = require('path');

class EmergencyCookieManager {
 constructor() {
  this.cookiePath = process.env.NODE_ENV === 'production' ? '/home/data/cookies.txt' : path.join(__dirname, '../cookies.txt');

  // Mobile-first user agents for better Azure compatibility
  this.userAgents = [
   'Mozilla/5.0 (Linux; Android 12; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
   'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
   'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
   'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  ];

  this.lastValidation = 0;
  this.validationInterval = 300000; // 5 minutes
 }

 /**
  * Validate essential YouTube cookies
  */
 async validateCookies() {
  try {
   const content = await fs.readFile(this.cookiePath, 'utf8');
   const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

   // Essential YouTube authentication cookies
   const essentialCookies = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
   const found = essentialCookies.filter((cookie) => lines.some((line) => line.includes(cookie)));

   const fileSize = content.length;
   const isValid = found.length >= 3; // Minimum 3 essential cookies

   console.log(`[EMERGENCY-COOKIES] 🔍 Validation: ${found.length}/5 cookies, ${fileSize} bytes`);

   this.lastValidation = Date.now();

   return {
    isValid,
    foundCookies: found,
    missingCookies: essentialCookies.filter((c) => !found.includes(c)),
    fileSize,
    lineCount: lines.length,
    lastValidated: new Date().toISOString(),
   };
  } catch (error) {
   console.error('[EMERGENCY-COOKIES] ❌ Validation failed:', error.message);
   return {
    isValid: false,
    error: error.message,
    foundCookies: [],
    missingCookies: ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'],
   };
  }
 }

 /**
  * Get rotating user agent (rotates every 5 minutes)
  */
 getUserAgent() {
  const index = Math.floor(Date.now() / 300000) % this.userAgents.length;
  return this.userAgents[index];
 }

 /**
  * Get anti-detection arguments optimized for Azure
  */
 getAntiDetectionArgs() {
  const userAgent = this.getUserAgent();
  const randomSleep = Math.floor(Math.random() * 3) + 3; // 3-6 seconds

  return [
   '--user-agent',
   userAgent,
   '--add-header',
   'Accept-Language: en-US,en;q=0.9',
   '--add-header',
   'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
   '--add-header',
   'Cache-Control: no-cache',
   '--add-header',
   'Sec-Fetch-Dest: document',
   '--add-header',
   'Sec-Fetch-Mode: navigate',
   '--sleep-interval',
   randomSleep.toString(),
   '--max-sleep-interval',
   (randomSleep + 3).toString(),
   '--socket-timeout',
   '45',
   '--retries',
   '2',
   '--fragment-retries',
   '2',
   '--geo-bypass',
   '--geo-bypass-country',
   'US',
   '--force-ipv4',
  ];
 }

 /**
  * Generate minimal cookie template as emergency fallback
  */
 async generateEmergencyCookies() {
  const template = `# Netscape HTTP Cookie File
# Emergency template for Azure production
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 86400}	CONSENT	YES+cb.20240101
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 86400}	VISITOR_INFO1_LIVE	${this.generateRandomString(22)}
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 86400}	YSC	${this.generateRandomString(16)}
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 86400}	PREF	f4=4000000
`;

  try {
   await fs.writeFile(this.cookiePath, template, 'utf8');
   console.log('[EMERGENCY-COOKIES] 🆕 Emergency template generated');
   return true;
  } catch (error) {
   console.error('[EMERGENCY-COOKIES] ❌ Template generation failed:', error.message);
   return false;
  }
 }

 /**
  * Generate random string for cookie values
  */
 generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
   result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
 }

 /**
  * Smart validation that only checks if enough time has passed
  */
 async smartValidation() {
  const now = Date.now();

  // Only validate if enough time has passed
  if (now - this.lastValidation < this.validationInterval) {
   return {skipped: true, message: 'Validation not needed yet'};
  }

  return await this.validateCookies();
 }
}

module.exports = EmergencyCookieManager;
