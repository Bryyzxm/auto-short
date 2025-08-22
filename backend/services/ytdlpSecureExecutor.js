/**
 * YT-DLP Secure Execution Utility - Enhanced Azure Edition
 *
 * Comprehensive execution function with Azure-optimized error handling,
 * authentication management, and defensive programming practices
 */

const ytDlpExec = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const errorHandler = require('./errorHandler');

// Azure-optimized configuration
const AZURE_CONFIG = {
 maxRetries: 5,
 baseTimeout: 15000,
 maxTimeout: 45000,
 retryMultiplier: 1.5,
 authRetryLimit: 2,
 cookieRefreshThreshold: 3, // Refresh cookies after 3 auth failures
};

let consecutiveAuthFailures = 0;

// Determine Azure environment
function isAzureEnvironment() {
 return Boolean(
  process.env.WEBSITE_HOSTNAME ||
   process.env.WEBSITE_SITE_NAME ||
   process.env.WEBSITE_RESOURCE_GROUP ||
   process.env.APPSETTING_WEBSITE_NODE_DEFAULT_VERSION ||
   process.env.AZURE_STORAGE_ACCOUNT ||
   process.env.HOME?.includes('/home') ||
   process.env.RUNNING_IN_CONTAINER
 );
}

// Get operation-specific timeout with Azure optimization
function getOperationTimeout(args) {
 const argsString = Array.isArray(args) ? args.join(' ') : args.toString();
 const isAzure = isAzureEnvironment();

 // Base timeouts optimized for Azure performance
 const timeouts = {
  version: isAzure ? 8000 : 10000,
  metadata: isAzure ? 25000 : 30000,
  formats: isAzure ? 30000 : 40000,
  subtitles: isAzure ? 35000 : 45000,
  default: isAzure ? 25000 : 30000,
 };

 if (argsString.includes('--version')) return timeouts.version;
 if (argsString.includes('--dump-json')) return timeouts.metadata;
 if (argsString.includes('--list-formats')) return timeouts.formats;
 if (argsString.includes('--write-auto-sub') || argsString.includes('--write-sub')) return timeouts.subtitles;

 return timeouts.default;
}

// Helper function to build enhanced arguments
function buildEnhancedArgs(normalizedArgs, options) {
 const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
 ];

 const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

 const enhancedArgs = [
  ...normalizedArgs,
  '--user-agent',
  randomUserAgent,
  '--sleep-interval',
  '2',
  '--max-sleep-interval',
  '5',
  '--retries',
  '5',
  '--socket-timeout',
  '60',
  '--geo-bypass',
  '--geo-bypass-country',
  'US',
  '--extractor-retries',
  '3',
  '--fragment-retries',
  '3',
  '--force-ipv4',
 ];

 // Add single-client support optimized for Azure with proper cookie handling
 if (!enhancedArgs.some((arg) => arg.includes('--extractor-args'))) {
  // 🚨 CRITICAL FIX: Use single client approach to avoid cookie conflicts
  // Based on GitHub issue #13930 analysis - don't mix cookie-supporting and non-cookie clients
  if (options.skipCookies || options.client === 'tv_simply' || options.client === 'android') {
   // For TV/mobile clients that don't support cookies
   enhancedArgs.push('--extractor-args', `youtube:player_client=${options.client || 'tv_simply'};bypass_native_jsi`);
   console.log('[YT-DLP-SECURE] 🔧 Using no-cookie client strategy');
  } else {
   // For web/default clients that support cookies
   enhancedArgs.push('--extractor-args', 'youtube:player_client=default;bypass_native_jsi');
   console.log('[YT-DLP-SECURE] 🔧 Using cookie-compatible client strategy');
  }
 }

 console.log('[YT-DLP-SECURE] 🛡️ Enhanced arguments built with Azure optimizations');
 return enhancedArgs;
}

// Helper function to add cookies
function addCookiesIfAvailable(enhancedArgs) {
 const cookiesPaths = ['/home/data/cookies.txt', path.join(__dirname, '..', 'cookies.txt'), './cookies.txt'];

 for (const testPath of cookiesPaths) {
  if (fs.existsSync(testPath) && !enhancedArgs.includes('--cookies')) {
   enhancedArgs.push('--cookies', testPath);
   console.log('[YT-DLP-SECURE] 🍪 Added cookies from:', testPath);
   return;
  }
 }
 console.log('[YT-DLP-SECURE] 🚫 No cookies file found or cookies already added');
}

// Helper function to execute with timeout
async function executeWithTimeout(enhancedArgs, timeout) {
 const emergencyTimeout = Math.max(timeout, AZURE_CONFIG.maxTimeout);

 return Promise.race([ytDlpExec(enhancedArgs), new Promise((_, reject) => setTimeout(() => reject(new Error(`Azure timeout: yt-dlp execution exceeded ${emergencyTimeout}ms`)), emergencyTimeout))]);
}

// Enhanced secure execution with Azure optimizations and error handling
async function executeYtDlpSecurely(args, options = {}) {
 return errorHandler.executeWithRetry(() => executeYtDlpSecurelyCore(args, options), {
  maxRetries: AZURE_CONFIG.maxRetries,
  retryDelay: 2000,
  context: 'yt-dlp-execution',
  fallbackValue: {output: '', error: 'All execution attempts failed'},
 });
}

async function executeYtDlpSecurelyCore(args, options = {}) {
 console.log('[YT-DLP-SECURE] 🚀 Starting yt-dlp execution...');
 console.log('[YT-DLP-SECURE] ⏰ Start time:', new Date().toISOString());

 // Normalize arguments
 const normalizedArgs = Array.isArray(args) ? args : [args];

 console.log('[YT-DLP-SECURE] 🔍 Command arguments analysis:');
 console.log(`[YT-DLP-SECURE]   📊 Total args: ${normalizedArgs.length}`);
 console.log(`[YT-DLP-SECURE]   📋 Args: ${normalizedArgs.join(' ')}`);

 // Apply anti-detection measures
 console.log('[YT-DLP-SECURE] 🛡️ Applying enhanced anti-detection measures...');

 // Railway-compatible user agents and geo settings
 const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
 ];

 const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

 // Railway-style enhanced arguments with geo bypass and aggressive anti-detection
 const enhancedArgs = [
  ...normalizedArgs,
  '--user-agent',
  randomUserAgent,
  '--sleep-interval',
  '2',
  '--max-sleep-interval',
  '5',
  '--retries',
  '5',
  '--socket-timeout',
  '60',
  '--geo-bypass',
  '--geo-bypass-country',
  'US',
  '--extractor-retries',
  '3',
  '--fragment-retries',
  '3',
  '--force-ipv4',
 ];

 console.log('[YT-DLP-SECURE] 🕶️ Added Railway-compatible user-agent');
 console.log('[YT-DLP-SECURE] 😴 Added enhanced sleep intervals for human-like behavior');
 console.log('[YT-DLP-SECURE] 🔄 Added aggressive retry mechanisms');
 console.log('[YT-DLP-SECURE] ⏱️ Added extended socket timeout');
 console.log('[YT-DLP-SECURE] 🌍 Added US geo bypass with force IPv4');
 console.log('[YT-DLP-SECURE] 🛡️ Added fragment and extractor retries');
 console.log('[YT-DLP-SECURE] ✅ Railway-style anti-detection layer applied');

 // Handle cookies
 if (options.useCookies !== false) {
  const cookiesPaths = ['/home/data/cookies.txt', path.join(__dirname, '..', 'cookies.txt'), './cookies.txt'];

  let cookiesPath = null;
  for (const testPath of cookiesPaths) {
   if (fs.existsSync(testPath)) {
    cookiesPath = testPath;
    break;
   }
  }

  if (cookiesPath && !enhancedArgs.includes('--cookies')) {
   enhancedArgs.push('--cookies', cookiesPath);
   console.log('[YT-DLP-SECURE] 🍪 Added cookies from:', cookiesPath);
  }
 } else {
  console.log('[YT-DLP-SECURE] 🚫 Cookies explicitly disabled for this execution');
 }

 // Add single-client support for better reliability with proper cookie handling
 if (!enhancedArgs.some((arg) => arg.includes('--extractor-args'))) {
  // 🚨 CRITICAL FIX: Use single client approach to avoid cookie conflicts
  // Based on GitHub issue #13930 analysis - separate cookie-supporting from non-cookie clients
  if (options.useCookies === false || options.skipCookies) {
   // For clients that don't support cookies (tv_simply, android, tv_embedded)
   enhancedArgs.push('--extractor-args', 'youtube:player_client=tv_simply;bypass_native_jsi');
   console.log('[YT-DLP-SECURE] 🔧 Added TV_SIMPLY client (no cookies) - GitHub issue #13930 fix');
  } else {
   // For clients that support cookies (default, web)
   enhancedArgs.push('--extractor-args', 'youtube:player_client=default;bypass_native_jsi');
   console.log('[YT-DLP-SECURE] 🔧 Added DEFAULT client (with cookies) - GitHub issue #13930 fix');
  }
 }

 console.log('[YT-DLP-SECURE] 📋 Execution summary:');
 console.log(`[YT-DLP-SECURE]   🍪 Cookies used: ${options.useCookies !== false}`);
 console.log(`[YT-DLP-SECURE]   📊 Final arg count: ${enhancedArgs.length}`);
 console.log(`[YT-DLP-SECURE]   🌐 Environment: ${isAzureEnvironment() ? 'azure' : 'local'}`);

 try {
  // Use minimal options to prevent invalid command line arguments
  const result = await ytDlpExec(enhancedArgs);

  console.log('[YT-DLP-SECURE] ✅ Execution successful');
  console.log('[YT-DLP-SECURE] 🔍 Result type:', typeof result);
  console.log('[YT-DLP-SECURE] 🔍 Result structure:', Object.keys(result || {}));

  // Handle different return formats from yt-dlp-exec
  if (typeof result === 'string') {
   // Direct string output
   return result;
  } else if (result && typeof result === 'object') {
   // Object with potential stdout/stderr/output properties
   return result.stdout || result.output || result;
  } else {
   // Fallback for undefined/null results
   console.warn('[YT-DLP-SECURE] ⚠️ Unexpected result format, returning empty string');
   return '';
  }
 } catch (error) {
  console.error('[YT-DLP-SECURE] ❌ Execution failed:', error.message);
  throw error;
 }
}

module.exports = {
 executeYtDlpSecurely,
 isAzureEnvironment,
 getOperationTimeout,
};
