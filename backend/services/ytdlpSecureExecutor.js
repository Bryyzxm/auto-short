/**
 * YT-DLP Secure Execution Utility
 *
 * Shared execution function that can be used by all transcript services
 * without creating circular dependencies
 */

const ytDlpExec = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');

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

// Get operation-specific timeout
function getOperationTimeout(args) {
 const argsString = Array.isArray(args) ? args.join(' ') : args.toString();
 const isAzure = isAzureEnvironment();

 if (argsString.includes('--version')) {
  return isAzure ? 5000 : 10000; // Fast version check
 } else if (argsString.includes('--dump-json')) {
  return isAzure ? 20000 : 30000; // Metadata extraction
 } else if (argsString.includes('--list-formats')) {
  return isAzure ? 25000 : 40000; // Format listing
 } else if (argsString.includes('--write-auto-sub') || argsString.includes('--write-sub')) {
  return isAzure ? 30000 : 45000; // Subtitle extraction
 } else {
  return isAzure ? 20000 : 30000; // Default
 }
}

// Enhanced secure execution with anti-detection
async function executeYtDlpSecurely(args, options = {}) {
 const timeout = options.timeout || getOperationTimeout(args);
 const isAzure = isAzureEnvironment();

 console.log(`[YT-DLP-SECURE] ⏰ ${isAzure ? 'Azure' : 'Local'} timeout set to ${timeout}ms`);

 const emergencyTimeout = Math.max(timeout, isAzure ? 20000 : 30000);

 return Promise.race([executeYtDlpSecurelyCore(args, options), new Promise((_, reject) => setTimeout(() => reject(new Error(`Azure emergency timeout: yt-dlp execution exceeded ${emergencyTimeout}ms`)), emergencyTimeout))]);
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

 const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
 ];

 const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
 const enhancedArgs = [...normalizedArgs, '--user-agent', randomUserAgent, '--sleep-interval', '1', '--retries', '3', '--socket-timeout', '60', '--geo-bypass'];

 console.log('[YT-DLP-SECURE] 🕶️ Added randomized user-agent');
 console.log('[YT-DLP-SECURE] 😴 Added sleep interval for human-like behavior');
 console.log('[YT-DLP-SECURE] 🔄 Added retry mechanism');
 console.log('[YT-DLP-SECURE] ⏱️ Added socket timeout');
 console.log('[YT-DLP-SECURE] 🌍 Added geo bypass');
 console.log('[YT-DLP-SECURE] ✅ Anti-detection layer applied successfully');

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

 // Add multi-client support for better reliability
 if (!enhancedArgs.some((arg) => arg.includes('--extractor-args'))) {
  enhancedArgs.push('--extractor-args', 'youtube:player_client=android,web,tv,ios;innertube_host=youtubei.googleapis.com');
  console.log('[YT-DLP-SECURE] 🔧 Added optimized multi-client extractor args');
 }

 console.log('[YT-DLP-SECURE] 📋 Execution summary:');
 console.log(`[YT-DLP-SECURE]   🍪 Cookies used: ${options.useCookies !== false}`);
 console.log(`[YT-DLP-SECURE]   📊 Final arg count: ${enhancedArgs.length}`);
 console.log(`[YT-DLP-SECURE]   🌐 Environment: ${isAzureEnvironment() ? 'azure' : 'local'}`);

 try {
  // Use minimal options to prevent invalid command line arguments
  const result = await ytDlpExec(enhancedArgs);

  console.log('[YT-DLP-SECURE] ✅ Execution successful');
  return result;
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
