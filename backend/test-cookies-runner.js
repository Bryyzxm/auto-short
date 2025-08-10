#!/usr/bin/env node

/**
 * Comprehensive Cookies Test Runner
 *
 * This script runs all cookie-related tests in sequence:
 * 1. Cookies comparison test (env var vs file)
 * 2. yt-dlp functionality test with cookies
 * 3. Server startup validation simulation
 */

require('dotenv').config();
const {spawn} = require('child_process');
const path = require('path');
const fs = require('fs');

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
 console.log('\n' + '='.repeat(70));
 log(` 🧪 ${title}`, 'bold');
 console.log('='.repeat(70));
}

/**
 * Run a Node.js script and return results
 */
function runScript(scriptPath, args = []) {
 return new Promise((resolve, reject) => {
  const startTime = Date.now();
  log(`🔧 Running: node ${path.basename(scriptPath)} ${args.join(' ')}`, 'blue');

  const child = spawn('node', [scriptPath, ...args], {
   stdio: ['inherit', 'pipe', 'pipe'],
   cwd: path.dirname(scriptPath),
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
   const output = data.toString();
   stdout += output;
   process.stdout.write(output); // Real-time output
  });

  child.stderr.on('data', (data) => {
   const output = data.toString();
   stderr += output;
   process.stderr.write(output); // Real-time output
  });

  child.on('close', (code) => {
   const duration = Date.now() - startTime;
   resolve({
    script: path.basename(scriptPath),
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
    script: path.basename(scriptPath),
    error: error.message,
    duration,
    success: false,
   });
  });
 });
}

/**
 * Check if required test scripts exist
 */
function checkTestScripts() {
 const scripts = [path.join(__dirname, 'test-cookies-comparison.js'), path.join(__dirname, 'test-ytdlp-cookies.js')];

 const missing = scripts.filter((script) => !fs.existsSync(script));

 if (missing.length > 0) {
  log('❌ Missing test scripts:', 'red');
  missing.forEach((script) => {
   log(`   - ${path.basename(script)}`, 'red');
  });
  return false;
 }

 log('✅ All test scripts found', 'green');
 return scripts;
}

/**
 * Pre-flight checks
 */
function preFlightChecks() {
 logSection('PRE-FLIGHT CHECKS');

 const checks = {
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || 'development',
  cookiesEnvVar: false,
  ytdlpInstalled: false,
  testScripts: false,
 };

 log(`📋 Node.js version: ${checks.nodeVersion}`, 'blue');
 log(`📋 Environment: ${checks.environment}`, 'blue');

 // Check environment variables
 const envVarNames = ['YTDLP_COOKIES_CONTENT', 'YOUTUBE_COOKIES_CONTENT', 'COOKIES_CONTENT'];
 for (const varName of envVarNames) {
  if (process.env[varName]) {
   checks.cookiesEnvVar = true;
   log(`✅ Found cookies environment variable: ${varName}`, 'green');
   break;
  }
 }

 if (!checks.cookiesEnvVar) {
  log('❌ No cookies environment variable found', 'red');
  log('💡 Set YTDLP_COOKIES_CONTENT, YOUTUBE_COOKIES_CONTENT, or COOKIES_CONTENT', 'yellow');
 }

 // Check yt-dlp installation
 try {
  const {execSync} = require('child_process');
  const ytdlpVersion = execSync('yt-dlp --version', {encoding: 'utf8', timeout: 5000}).trim();
  checks.ytdlpInstalled = true;
  log(`✅ yt-dlp installed: ${ytdlpVersion}`, 'green');
 } catch (error) {
  log('❌ yt-dlp not found or not working', 'red');
  log('💡 Install yt-dlp: pip install yt-dlp', 'yellow');
 }

 // Check test scripts
 const scripts = checkTestScripts();
 checks.testScripts = !!scripts;

 return {checks, scripts};
}

/**
 * Generate summary report
 */
function generateSummary(results) {
 logSection('COMPREHENSIVE TEST SUMMARY');

 const totalTests = results.length;
 const passedTests = results.filter((r) => r.success).length;
 const failedTests = totalTests - passedTests;
 const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

 log(`📊 Test Results Overview:`, 'blue');
 log(`   Total tests: ${totalTests}`);
 log(`   Passed: ${passedTests}`, passedTests === totalTests ? 'green' : 'yellow');
 log(`   Failed: ${failedTests}`, failedTests === 0 ? 'green' : 'red');
 log(`   Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);

 log(`\n📋 Individual Test Results:`, 'blue');
 results.forEach((result, index) => {
  const status = result.success ? '✅ PASS' : '❌ FAIL';
  const color = result.success ? 'green' : 'red';
  const duration = `${result.duration}ms`;
  log(`   ${index + 1}. ${result.script}: ${status} (${duration})`, color);

  if (!result.success && result.error) {
   log(`      Error: ${result.error}`, 'red');
  }
 });

 // Overall assessment
 log(`\n🎯 Overall Assessment:`, 'bold');
 if (passedTests === totalTests) {
  log('🎉 ALL TESTS PASSED - Cookies system is fully functional!', 'green');
  log('✅ Environment variables, file creation, and yt-dlp integration all working', 'green');
 } else if (passedTests > 0) {
  log('⚠️  PARTIAL SUCCESS - Some components working, others need attention', 'yellow');
  log(`✅ ${passedTests}/${totalTests} tests passed`, 'yellow');
  log('💡 Check failed test details above for troubleshooting guidance', 'yellow');
 } else {
  log('❌ ALL TESTS FAILED - Cookies system needs significant attention', 'red');
  log('🔧 Review environment variables, file permissions, and yt-dlp installation', 'red');
 }

 // Recommendations
 const recommendations = [];

 if (results.some((r) => r.script === 'test-cookies-comparison.js' && !r.success)) {
  recommendations.push('Fix cookies environment variable or file creation issues');
 }

 if (results.some((r) => r.script === 'test-ytdlp-cookies.js' && !r.success)) {
  recommendations.push('Check yt-dlp installation and cookies file validity');
 }

 if (recommendations.length > 0) {
  log(`\n💡 Next Steps:`, 'cyan');
  recommendations.forEach((rec, index) => {
   log(`   ${index + 1}. ${rec}`, 'cyan');
  });
 }

 // Debug endpoint information
 log(`\n🔍 Debug Resources:`, 'magenta');
 log('   Server debug endpoints (when server is running):', 'magenta');
 log('   - GET /api/debug/cookies - Detailed cookies analysis', 'magenta');
 log('   - GET /api/debug/startup-validation - Startup validation results', 'magenta');
 log('   - GET /api/debug/environment - Environment information', 'magenta');

 return {
  total: totalTests,
  passed: passedTests,
  failed: failedTests,
  duration: totalDuration,
  success: passedTests === totalTests,
 };
}

async function main() {
 log('🧪 Comprehensive Cookies Test Runner', 'bold');
 log('Running all cookies-related tests in sequence\n', 'cyan');

 const startTime = Date.now();
 const results = [];

 try {
  // 1. Pre-flight checks
  const {checks, scripts} = preFlightChecks();

  if (!checks.testScripts) {
   log('\n❌ Cannot proceed without test scripts', 'red');
   process.exit(1);
  }

  if (!checks.cookiesEnvVar) {
   log('\n⚠️  Warning: No cookies environment variable found', 'yellow');
   log('Tests will likely fail - consider setting up cookies first', 'yellow');

   const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
   });

   const answer = await new Promise((resolve) => {
    readline.question('Continue anyway? (y/N): ', resolve);
   });
   readline.close();

   if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    log('Test run cancelled by user', 'yellow');
    process.exit(0);
   }
  }

  // 2. Run cookies comparison test
  logSection('TEST 1: COOKIES COMPARISON');
  try {
   const comparisonResult = await runScript(scripts[0]);
   results.push(comparisonResult);
  } catch (error) {
   results.push(error);
  }

  // 3. Run yt-dlp cookies test
  logSection('TEST 2: YT-DLP COOKIES FUNCTIONALITY');
  try {
   const ytdlpResult = await runScript(scripts[1]);
   results.push(ytdlpResult);
  } catch (error) {
   results.push(error);
  }

  // 4. Generate comprehensive summary
  const summary = generateSummary(results);

  const totalDuration = Date.now() - startTime;
  log(`\n⏱️  Total test suite duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`, 'blue');

  // Exit with appropriate code
  process.exit(summary.success ? 0 : 1);
 } catch (error) {
  log(`\n💥 Test runner failed: ${error.message}`, 'red');
  console.error(error.stack);
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

module.exports = {runScript, preFlightChecks, generateSummary};
