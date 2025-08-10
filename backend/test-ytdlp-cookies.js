#!/usr/bin/env node

/**
 * yt-dlp Cookies Test Utility
 *
 * This script tests yt-dlp functionality with the created cookies file
 * to validate YouTube authentication and bot detection bypass.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

// ANSI color codes for better console output
const colors = {
 red: '\x1b[31m',
 green: '\x1b[32m',
 yellow: '\x1b[33m',
 blue: '\x1b[34m',
 magenta: '\x1b[35m',
 cyan: '\x1b[36m',
 reset: '\x1b[0m',
 bold: '\x1b[1m',
};

function log(message, color = 'reset') {
 console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
 console.log('\n' + '='.repeat(60));
 log(` 🧪 ${title}`, 'bold');
 console.log('='.repeat(60));
}

// Test YouTube URLs for different scenarios
const TEST_URLS = {
 public: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Roll - always public
 shorts: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
 playlist: 'https://www.youtube.com/playlist?list=PLLALQuK1NDrjqddIhYb5c7S4gD4vQ7TqF',
};

/**
 * Execute yt-dlp with specific arguments and return results
 */
function executeYtDlp(args, options = {}) {
 return new Promise((resolve, reject) => {
  const startTime = Date.now();
  const timeout = options.timeout || 30000;

  log(`🔧 Executing: yt-dlp ${args.join(' ')}`, 'blue');

  const child = spawn('yt-dlp', args, {
   stdio: ['ignore', 'pipe', 'pipe'],
   timeout: timeout,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
   stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
   stderr += data.toString();
  });

  child.on('close', (code) => {
   const duration = Date.now() - startTime;
   resolve({
    code,
    stdout,
    stderr,
    duration,
    success: code === 0,
   });
  });

  child.on('error', (error) => {
   const duration = Date.now() - startTime;
   reject({
    error: error.message,
    duration,
    success: false,
   });
  });

  // Set timeout
  setTimeout(() => {
   child.kill('SIGTERM');
   reject({
    error: 'Timeout exceeded',
    duration: timeout,
    success: false,
   });
  }, timeout);
 });
}

/**
 * Analyze yt-dlp output for authentication and bot detection indicators
 */
function analyzeOutput(result, testName) {
 const analysis = {
  testName,
  success: result.success,
  duration: result.duration,
  indicators: {
   botDetection: false,
   authenticationRequired: false,
   cookiesWorking: false,
   quotaExceeded: false,
   videoUnavailable: false,
   formatError: false,
  },
  details: {
   outputSize: result.stdout.length,
   errorSize: result.stderr.length,
   exitCode: result.code,
  },
  issues: [],
  recommendations: [],
 };

 const fullOutput = (result.stdout + result.stderr).toLowerCase();

 // Bot detection patterns
 const botPatterns = ["sign in to confirm you're not a bot", 'sign in to confirm you are not a bot', "confirm you're not a bot", 'bot detection', 'unusual traffic', 'automated requests'];

 for (const pattern of botPatterns) {
  if (fullOutput.includes(pattern)) {
   analysis.indicators.botDetection = true;
   analysis.issues.push(`Bot detection triggered: "${pattern}"`);
   break;
  }
 }

 // Authentication indicators
 const authPatterns = ['sign in', 'login required', 'authentication', 'private video', 'members-only'];

 for (const pattern of authPatterns) {
  if (fullOutput.includes(pattern)) {
   analysis.indicators.authenticationRequired = true;
   analysis.issues.push(`Authentication required: "${pattern}"`);
   break;
  }
 }

 // Quota/rate limiting
 const quotaPatterns = ['quota exceeded', 'rate limit', 'too many requests', 'service unavailable'];

 for (const pattern of quotaPatterns) {
  if (fullOutput.includes(pattern)) {
   analysis.indicators.quotaExceeded = true;
   analysis.issues.push(`Quota/rate limiting: "${pattern}"`);
   break;
  }
 }

 // Video availability
 const availabilityPatterns = ['video unavailable', 'private video', 'deleted video', 'blocked in your country'];

 for (const pattern of availabilityPatterns) {
  if (fullOutput.includes(pattern)) {
   analysis.indicators.videoUnavailable = true;
   analysis.issues.push(`Video availability issue: "${pattern}"`);
   break;
  }
 }

 // Format/parsing errors
 const formatPatterns = ['no formats found', 'extraction failed', 'unable to extract', 'json decode error'];

 for (const pattern of formatPatterns) {
  if (fullOutput.includes(pattern)) {
   analysis.indicators.formatError = true;
   analysis.issues.push(`Format/extraction error: "${pattern}"`);
   break;
  }
 }

 // Positive indicators (cookies working)
 const successPatterns = ['available formats', 'video title', 'duration:', 'upload date', 'extracting', 'downloading'];

 for (const pattern of successPatterns) {
  if (fullOutput.includes(pattern)) {
   analysis.indicators.cookiesWorking = true;
   break;
  }
 }

 // Generate recommendations
 if (analysis.indicators.botDetection) {
  analysis.recommendations.push('Cookies may be expired or invalid - refresh YouTube cookies');
  analysis.recommendations.push('Consider rotating user agents or IP addresses');
 }

 if (analysis.indicators.authenticationRequired && !analysis.indicators.cookiesWorking) {
  analysis.recommendations.push('Cookies authentication not working - verify cookies validity');
  analysis.recommendations.push('Check if YouTube account is still logged in');
 }

 if (analysis.indicators.quotaExceeded) {
  analysis.recommendations.push('Implement rate limiting or use multiple cookie sets');
  analysis.recommendations.push('Wait before retrying or use different IP');
 }

 if (analysis.success && analysis.indicators.cookiesWorking) {
  analysis.recommendations.push('Cookies are working correctly - authentication successful');
 }

 return analysis;
}

/**
 * Test yt-dlp version and basic functionality
 */
async function testYtDlpBasic() {
 logSection('YT-DLP BASIC FUNCTIONALITY TEST');

 try {
  log('📋 Testing yt-dlp version...', 'cyan');
  const versionResult = await executeYtDlp(['--version'], {timeout: 10000});

  if (versionResult.success) {
   log(`✅ yt-dlp version: ${versionResult.stdout.trim()}`, 'green');
   log(`⏱️  Response time: ${versionResult.duration}ms`, 'blue');
   return true;
  } else {
   log(`❌ yt-dlp version check failed (exit code: ${versionResult.code})`, 'red');
   log(`🔍 Error: ${versionResult.stderr}`, 'red');
   return false;
  }
 } catch (error) {
  log(`❌ yt-dlp basic test failed: ${error.error}`, 'red');
  return false;
 }
}

/**
 * Test yt-dlp without cookies
 */
async function testWithoutCookies() {
 logSection('YT-DLP WITHOUT COOKIES TEST');

 try {
  log('📋 Testing public video access without cookies...', 'cyan');
  const result = await executeYtDlp(['--list-formats', '--no-download', TEST_URLS.public], {timeout: 20000});

  const analysis = analyzeOutput(result, 'Without Cookies');

  log(`\n📊 Test Results:`, 'blue');
  log(`   Success: ${analysis.success ? 'YES' : 'NO'}`, analysis.success ? 'green' : 'red');
  log(`   Duration: ${analysis.duration}ms`);
  log(`   Bot detection: ${analysis.indicators.botDetection ? 'YES' : 'NO'}`, analysis.indicators.botDetection ? 'red' : 'green');
  log(`   Authentication required: ${analysis.indicators.authenticationRequired ? 'YES' : 'NO'}`, analysis.indicators.authenticationRequired ? 'yellow' : 'green');

  if (analysis.issues.length > 0) {
   log(`\n⚠️  Issues detected:`, 'yellow');
   analysis.issues.forEach((issue, index) => {
    log(`   ${index + 1}. ${issue}`, 'yellow');
   });
  }

  return analysis;
 } catch (error) {
  log(`❌ Test without cookies failed: ${error.error}`, 'red');
  return {success: false, error: error.error};
 }
}

/**
 * Test yt-dlp with cookies
 */
async function testWithCookies(cookiesPath) {
 logSection('YT-DLP WITH COOKIES TEST');

 // Verify cookies file exists
 if (!fs.existsSync(cookiesPath)) {
  log(`❌ Cookies file not found: ${cookiesPath}`, 'red');
  return {success: false, error: 'Cookies file not found'};
 }

 const cookiesStats = fs.statSync(cookiesPath);
 log(`✅ Cookies file found: ${cookiesPath}`, 'green');
 log(`📏 File size: ${cookiesStats.size} bytes`, 'blue');
 log(`🕒 Last modified: ${cookiesStats.mtime.toISOString()}`, 'blue');

 try {
  log('\n📋 Testing public video access with cookies...', 'cyan');
  const result = await executeYtDlp(['--cookies', cookiesPath, '--list-formats', '--no-download', TEST_URLS.public], {timeout: 30000});

  const analysis = analyzeOutput(result, 'With Cookies');

  log(`\n📊 Test Results:`, 'blue');
  log(`   Success: ${analysis.success ? 'YES' : 'NO'}`, analysis.success ? 'green' : 'red');
  log(`   Duration: ${analysis.duration}ms`);
  log(`   Cookies working: ${analysis.indicators.cookiesWorking ? 'YES' : 'NO'}`, analysis.indicators.cookiesWorking ? 'green' : 'red');
  log(`   Bot detection: ${analysis.indicators.botDetection ? 'YES' : 'NO'}`, analysis.indicators.botDetection ? 'red' : 'green');
  log(`   Authentication required: ${analysis.indicators.authenticationRequired ? 'YES' : 'NO'}`, analysis.indicators.authenticationRequired ? 'yellow' : 'green');

  if (analysis.issues.length > 0) {
   log(`\n⚠️  Issues detected:`, 'yellow');
   analysis.issues.forEach((issue, index) => {
    log(`   ${index + 1}. ${issue}`, 'yellow');
   });
  }

  if (analysis.recommendations.length > 0) {
   log(`\n💡 Recommendations:`, 'cyan');
   analysis.recommendations.forEach((rec, index) => {
    log(`   ${index + 1}. ${rec}`, 'cyan');
   });
  }

  return analysis;
 } catch (error) {
  log(`❌ Test with cookies failed: ${error.error}`, 'red');
  return {success: false, error: error.error};
 }
}

/**
 * Compare results with and without cookies
 */
function compareResults(withoutCookies, withCookies) {
 logSection('COMPARISON ANALYSIS');

 log('📊 Comparison Results:', 'blue');

 const improvements = [];
 const regressions = [];

 // Success rate comparison
 if (withCookies.success && !withoutCookies.success) {
  improvements.push('Cookies enabled successful video access');
 } else if (!withCookies.success && withoutCookies.success) {
  regressions.push('Cookies caused failure in previously working test');
 }

 // Bot detection comparison
 if (withoutCookies.indicators?.botDetection && !withCookies.indicators?.botDetection) {
  improvements.push('Cookies eliminated bot detection');
 } else if (!withoutCookies.indicators?.botDetection && withCookies.indicators?.botDetection) {
  regressions.push('Bot detection triggered even with cookies');
 }

 // Authentication comparison
 if (withoutCookies.indicators?.authenticationRequired && !withCookies.indicators?.authenticationRequired) {
  improvements.push('Cookies provided successful authentication');
 }

 // Performance comparison
 if (withCookies.duration && withoutCookies.duration) {
  const speedDiff = withoutCookies.duration - withCookies.duration;
  if (speedDiff > 1000) {
   improvements.push(`Cookies improved response time by ${speedDiff}ms`);
  } else if (speedDiff < -1000) {
   regressions.push(`Cookies slowed response time by ${Math.abs(speedDiff)}ms`);
  }
 }

 if (improvements.length > 0) {
  log(`\n✅ Improvements with cookies (${improvements.length}):`, 'green');
  improvements.forEach((improvement, index) => {
   log(`   ${index + 1}. ${improvement}`, 'green');
  });
 }

 if (regressions.length > 0) {
  log(`\n❌ Regressions with cookies (${regressions.length}):`, 'red');
  regressions.forEach((regression, index) => {
   log(`   ${index + 1}. ${regression}`, 'red');
  });
 }

 if (improvements.length === 0 && regressions.length === 0) {
  log(`\n➡️  No significant difference detected between with/without cookies`, 'yellow');
  log(`💡 This might indicate the test video doesn't require authentication`, 'yellow');
 }

 return {improvements, regressions};
}

async function main() {
 log('🧪 yt-dlp Cookies Test Utility', 'bold');
 log('Testing yt-dlp functionality with created cookies file\n', 'cyan');

 // 1. Basic yt-dlp functionality test
 const basicTest = await testYtDlpBasic();
 if (!basicTest) {
  log('\n❌ Basic yt-dlp test failed - cannot proceed', 'red');
  log('💡 Make sure yt-dlp is installed and accessible in PATH', 'yellow');
  process.exit(1);
 }

 // 2. Test without cookies (baseline)
 const withoutCookiesResult = await testWithoutCookies();

 // 3. Find cookies file
 const cookiesPath = path.join(__dirname, 'cookies.txt');

 // 4. Test with cookies
 const withCookiesResult = await testWithCookies(cookiesPath);

 // 5. Compare results
 const comparison = compareResults(withoutCookiesResult, withCookiesResult);

 // 6. Final assessment
 logSection('FINAL ASSESSMENT');

 const cookiesWorking = withCookiesResult.indicators?.cookiesWorking || false;
 const botDetectionBypassed = withoutCookiesResult.indicators?.botDetection && !withCookiesResult.indicators?.botDetection;
 const authenticationWorking = withoutCookiesResult.indicators?.authenticationRequired && !withCookiesResult.indicators?.authenticationRequired;

 if (cookiesWorking || botDetectionBypassed || authenticationWorking) {
  log('🎉 SUCCESS: Cookies are functioning correctly!', 'green');

  if (cookiesWorking) log('✅ Cookies enabled successful video data extraction', 'green');
  if (botDetectionBypassed) log('✅ Cookies successfully bypassed bot detection', 'green');
  if (authenticationWorking) log('✅ Cookies provided successful YouTube authentication', 'green');

  process.exit(0);
 } else if (withCookiesResult.success) {
  log('⚠️  PARTIAL SUCCESS: yt-dlp works but cookies benefits unclear', 'yellow');
  log('💡 Test videos may not require authentication - cookies may still be valid', 'yellow');
  process.exit(0);
 } else {
  log('❌ FAILURE: Cookies are not working correctly', 'red');

  if (withCookiesResult.indicators?.botDetection) {
   log('🤖 Bot detection is still being triggered', 'red');
   log('💡 Cookies may be expired or from a different browser/session', 'yellow');
  }

  if (withCookiesResult.error) {
   log(`💥 Error: ${withCookiesResult.error}`, 'red');
  }

  process.exit(1);
 }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
 log(`\n💥 Uncaught Exception: ${error.message}`, 'red');
 console.error(error.stack);
 process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
 log(`\n💥 Unhandled Rejection: ${reason}`, 'red');
 console.error(reason);
 process.exit(1);
});

// Run the main function
if (require.main === module) {
 main().catch((error) => {
  log(`\n💥 Error: ${error.message}`, 'red');
  console.error(error.stack);
  process.exit(1);
 });
}

module.exports = {executeYtDlp, analyzeOutput, testWithCookies, testWithoutCookies};
