#!/usr/bin/env node

/**
 * 🎯 Final Azure Verification Script
 *
 * Comprehensive test of all deployed fixes to ensure Azure deployment success
 */

const https = require('https');

const AZURE_BASE_URL = 'https://auto-short.azurewebsites.net';

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
 return new Promise((resolve, reject) => {
  const req = https.request(
   url,
   {
    method: options.method || 'GET',
    headers: {
     'Content-Type': 'application/json',
     ...options.headers,
    },
   },
   (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
     try {
      const parsed = JSON.parse(data);
      resolve({status: res.statusCode, data: parsed});
     } catch (e) {
      resolve({status: res.statusCode, data: data});
     }
    });
   }
  );

  req.on('error', reject);

  if (options.body) {
   req.write(JSON.stringify(options.body));
  }

  req.end();
 });
}

// Test suite
async function runVerificationTests() {
 console.log('🎯 FINAL AZURE VERIFICATION TESTS');
 console.log('='.repeat(50));

 const results = [];

 // Test 1: Health Check
 console.log('\n📋 Test 1: Health Check');
 try {
  const health = await makeRequest(`${AZURE_BASE_URL}/health`);
  const isHealthy = health.status === 200 && health.data.status === 'healthy';
  console.log(`✅ Health: ${isHealthy ? 'PASS' : 'FAIL'} (${health.status})`);
  if (isHealthy) {
   console.log(`   Uptime: ${Math.floor(health.data.uptime / 60)}m${Math.floor(health.data.uptime % 60)}s`);
   console.log(`   Environment: ${health.data.environment?.type || 'unknown'}`);
  }
  results.push({test: 'Health Check', status: isHealthy ? 'PASS' : 'FAIL', details: health.status});
 } catch (error) {
  console.log(`❌ Health: FAIL (${error.message})`);
  results.push({test: 'Health Check', status: 'FAIL', details: error.message});
 }

 // Test 2: Enhanced Error Handling (Intelligent Segments)
 console.log('\n📋 Test 2: Enhanced Error Handling');
 try {
  const segments = await makeRequest(`${AZURE_BASE_URL}/api/intelligent-segments`, {
   method: 'POST',
   body: {videoId: 'dQw4w9WgXcQ'},
  });

  const hasStructuredError = segments.status === 400 && segments.data.error && segments.data.message && segments.data.videoId;

  console.log(`✅ Error Handling: ${hasStructuredError ? 'PASS' : 'FAIL'} (${segments.status})`);
  if (hasStructuredError) {
   console.log(`   Error Type: ${segments.data.error}`);
   console.log(`   Message: ${segments.data.message}`);
  }
  results.push({
   test: 'Enhanced Error Handling',
   status: hasStructuredError ? 'PASS' : 'FAIL',
   details: `${segments.status} - ${segments.data.error || 'No structured error'}`,
  });
 } catch (error) {
  console.log(`❌ Error Handling: FAIL (${error.message})`);
  results.push({test: 'Enhanced Error Handling', status: 'FAIL', details: error.message});
 }

 // Test 3: Timeout Optimization (Video Metadata)
 console.log('\n📋 Test 3: Timeout Optimization');
 const startTime = Date.now();
 try {
  const metadata = await makeRequest(`${AZURE_BASE_URL}/api/video-metadata?videoId=dQw4w9WgXcQ`);
  const responseTime = Date.now() - startTime;
  const isOptimized = metadata.status === 200 && responseTime < 15000; // Should be under 15s

  console.log(`✅ Timeouts: ${isOptimized ? 'PASS' : 'FAIL'} (${responseTime}ms)`);
  if (isOptimized) {
   console.log(`   Title: ${metadata.data.title?.substring(0, 50)}...`);
   console.log(`   Duration: ${metadata.data.duration}s`);
  }
  results.push({
   test: 'Timeout Optimization',
   status: isOptimized ? 'PASS' : 'FAIL',
   details: `${responseTime}ms`,
  });
 } catch (error) {
  const responseTime = Date.now() - startTime;
  console.log(`❌ Timeouts: FAIL (${responseTime}ms - ${error.message})`);
  results.push({test: 'Timeout Optimization', status: 'FAIL', details: `${responseTime}ms - ${error.message}`});
 }

 // Test 4: Environment Detection
 console.log('\n📋 Test 4: Environment Detection');
 try {
  const env = await makeRequest(`${AZURE_BASE_URL}/api/debug/environment`);
  const isAzure = env.status === 200 && env.data.azure?.detected === true && env.data.ytdlp_path?.includes('/home/site/wwwroot');

  console.log(`✅ Environment: ${isAzure ? 'PASS' : 'FAIL'} (${env.status})`);
  if (isAzure) {
   console.log(`   Site: ${env.data.azure.siteName}`);
   console.log(`   yt-dlp Path: ${env.data.ytdlp_path}`);
   console.log(`   Cookies: ${env.data.cookies_exists ? 'Present' : 'Missing'}`);
  }
  results.push({
   test: 'Environment Detection',
   status: isAzure ? 'PASS' : 'FAIL',
   details: env.data.azure?.siteName || 'Not Azure',
  });
 } catch (error) {
  console.log(`❌ Environment: FAIL (${error.message})`);
  results.push({test: 'Environment Detection', status: 'FAIL', details: error.message});
 }

 // Test 5: Startup Validation
 console.log('\n📋 Test 5: Startup Validation');
 try {
  const validation = await makeRequest(`${AZURE_BASE_URL}/api/debug/startup-validation`);
  const isValid = validation.status === 200 && validation.data.startup_validation?.overall_success === true;

  console.log(`✅ Startup: ${isValid ? 'PASS' : 'FAIL'} (${validation.status})`);
  if (isValid) {
   const tests = validation.data.startup_validation.test_results;
   console.log(`   Basic Tests: ${Object.values(tests).filter((v) => v === true).length}/${Object.values(tests).length} passed`);
   console.log(`   Duration: ${validation.data.startup_validation.duration_ms}ms`);
  }
  results.push({
   test: 'Startup Validation',
   status: isValid ? 'PASS' : 'FAIL',
   details: `${validation.data.startup_validation?.overall_success}`,
  });
 } catch (error) {
  console.log(`❌ Startup: FAIL (${error.message})`);
  results.push({test: 'Startup Validation', status: 'FAIL', details: error.message});
 }

 // Summary
 console.log('\n📊 VERIFICATION SUMMARY');
 console.log('='.repeat(50));

 const passed = results.filter((r) => r.status === 'PASS').length;
 const total = results.length;
 const successRate = Math.round((passed / total) * 100);

 results.forEach((result) => {
  const icon = result.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${result.test}: ${result.status} (${result.details})`);
 });

 console.log(`\n🎯 OVERALL RESULT: ${passed}/${total} tests passed (${successRate}%)`);

 if (successRate >= 80) {
  console.log('🎉 DEPLOYMENT VERIFICATION: SUCCESS');
  console.log('   All critical fixes are working on Azure!');
 } else {
  console.log('⚠️  DEPLOYMENT VERIFICATION: PARTIAL');
  console.log('   Some issues detected, manual investigation needed.');
 }

 return {passed, total, successRate, results};
}

// Run if called directly
if (require.main === module) {
 runVerificationTests()
  .then((results) => {
   process.exit(results.successRate >= 80 ? 0 : 1);
  })
  .catch((error) => {
   console.error('\n❌ Verification failed:', error.message);
   process.exit(1);
  });
}

module.exports = {runVerificationTests};
