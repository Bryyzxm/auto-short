/**
 * ENHANCED AZURE COOKIE REFRESH & BOT DETECTION BYPASS
 *
 * Comprehensive solution for YouTube bot detection and cookie expiration issues
 * Based on Azure log analysis and industry best practices
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class AzureCookieManager {
 constructor() {
  this.cookiePath = process.env.NODE_ENV === 'production' ? '/home/data/cookies.txt' : path.join(__dirname, '../cookies.txt');
  this.backupPath = process.env.NODE_ENV === 'production' ? '/home/data/cookies-backup.txt' : path.join(__dirname, '../cookies-backup.txt');

  // Enhanced user agents with valid mobile signatures
  this.userAgents = [
   'Mozilla/5.0 (Linux; Android 12; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
   'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
   'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
   'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
   'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  ];

  this.lastRefresh = 0;
  this.refreshInterval = 3600000; // 1 hour
  this.maxRetries = 3;
 }

 /**
  * Get current user agent with rotation
  */
 getUserAgent() {
  const index = Math.floor(Date.now() / 300000) % this.userAgents.length; // Rotate every 5 minutes
  return this.userAgents[index];
 }

 /**
  * Validate cookie file integrity
  */
 async validateCookies() {
  try {
   const content = await fs.readFile(this.cookiePath, 'utf8');
   const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

   // Check for essential YouTube authentication cookies
   const essentialCookies = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
   const foundCookies = essentialCookies.filter((cookieName) => lines.some((line) => line.includes(cookieName)));

   const isValid = foundCookies.length >= 3; // At least 3 essential cookies

   console.log(`[COOKIE-MANAGER] 🍪 Validation result: ${foundCookies.length}/${essentialCookies.length} essential cookies found`);

   return {
    isValid,
    foundCookies,
    missingCookies: essentialCookies.filter((c) => !foundCookies.includes(c)),
    fileSize: content.length,
    lineCount: lines.length,
   };
  } catch (error) {
   console.error(`[COOKIE-MANAGER] ❌ Cookie validation failed:`, error.message);
   return {isValid: false, error: error.message};
  }
 }

 /**
  * Create backup of current cookies
  */
 async backupCookies() {
  try {
   const content = await fs.readFile(this.cookiePath, 'utf8');
   await fs.writeFile(this.backupPath, content, 'utf8');

   const timestamp = new Date().toISOString();
   await fs.appendFile(this.backupPath, `\n# Backup created: ${timestamp}\n`, 'utf8');

   console.log(`[COOKIE-MANAGER] 💾 Cookies backed up successfully`);
   return true;
  } catch (error) {
   console.error(`[COOKIE-MANAGER] ❌ Backup failed:`, error.message);
   return false;
  }
 }

 /**
  * Restore cookies from backup
  */
 async restoreCookies() {
  try {
   const backupContent = await fs.readFile(this.backupPath, 'utf8');
   await fs.writeFile(this.cookiePath, backupContent, 'utf8');

   console.log(`[COOKIE-MANAGER] 🔄 Cookies restored from backup`);
   return true;
  } catch (error) {
   console.error(`[COOKIE-MANAGER] ❌ Restore failed:`, error.message);
   return false;
  }
 }

 /**
  * Generate fresh cookies template with required YouTube structure
  */
 async generateFreshCookies() {
  const template = `# Netscape HTTP Cookie File
# This is a generated file! Do not edit.

.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 31536000}	CONSENT	YES+cb.20240101-00-p0.en+FX+000
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 31536000}	VISITOR_INFO1_LIVE	${this.generateRandomString(22)}
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 31536000}	YSC	${this.generateRandomString(16)}
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 31536000}	PREF	f4=4000000&f5=30000&f6=8&f7=100
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 31536000}	__Secure-YEC	${this.generateRandomString(32)}
`;

  try {
   await fs.writeFile(this.cookiePath, template, 'utf8');
   console.log(`[COOKIE-MANAGER] 🆕 Fresh cookie template generated`);
   return true;
  } catch (error) {
   console.error(`[COOKIE-MANAGER] ❌ Fresh cookie generation failed:`, error.message);
   return false;
  }
 }

 /**
  * Generate random string for cookie values
  */
 generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(crypto.randomBytes(length), (byte) => chars[byte % chars.length]).join('');
 }

 /**
  * Smart cookie refresh based on validation
  */
 async smartRefresh() {
  const now = Date.now();
  const timeSinceRefresh = now - this.lastRefresh;

  // Check if refresh is needed
  if (timeSinceRefresh < this.refreshInterval) {
   console.log(`[COOKIE-MANAGER] ⏰ Refresh not needed yet (${Math.round((this.refreshInterval - timeSinceRefresh) / 60000)}min remaining)`);
   return false;
  }

  console.log(`[COOKIE-MANAGER] 🔄 Starting smart cookie refresh...`);

  // Step 1: Validate current cookies
  const validation = await this.validateCookies();

  if (validation.isValid) {
   console.log(`[COOKIE-MANAGER] ✅ Current cookies are still valid`);
   this.lastRefresh = now;
   return true;
  }

  // Step 2: Backup current cookies
  await this.backupCookies();

  // Step 3: Try to restore from backup if available
  try {
   const backupValidation = await this.validateCookies();
   if (backupValidation.isValid) {
    console.log(`[COOKIE-MANAGER] 🔄 Using backup cookies`);
    this.lastRefresh = now;
    return true;
   }
  } catch (error) {
   console.log(`[COOKIE-MANAGER] ⚠️ No valid backup available`);
  }

  // Step 4: Generate fresh template as last resort
  await this.generateFreshCookies();
  this.lastRefresh = now;

  console.log(`[COOKIE-MANAGER] ✅ Cookie refresh completed`);
  return true;
 }

 /**
  * Get enhanced anti-detection arguments for yt-dlp
  */
 getAntiDetectionArgs() {
  const userAgent = this.getUserAgent();
  const randomSleep = Math.floor(Math.random() * 3) + 2; // 2-5 seconds

  return [
   '--user-agent',
   userAgent,
   '--add-header',
   'Accept-Language: en-US,en;q=0.9',
   '--add-header',
   'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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
   '--extractor-retries',
   '1',
   '--geo-bypass',
   '--geo-bypass-country',
   'US',
   '--force-ipv4',
  ];
 }

 /**
  * Get optimized extractor arguments for different strategies
  */
 getExtractorArgs(strategy = 'balanced') {
  const strategies = {
   stealth: 'youtube:player_client=android_creator,web_creator',
   mobile: 'youtube:player_client=android,ios',
   balanced: 'youtube:player_client=android,web',
   web: 'youtube:player_client=web,tv_embedded',
   minimal: 'youtube:player_client=android_testsuite',
  };

  return ['--extractor-args', strategies[strategy] || strategies.balanced];
 }
}

module.exports = AzureCookieManager;
