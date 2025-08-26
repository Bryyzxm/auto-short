#!/usr/bin/env node

/**
 * Comprehensive Test Script for Transcript Error Fix
 * Tests the complete fix for "Transkrip tidak tersedia" error
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
 backendUrl: process.env.BACKEND_URL || 'https://auto-short.azurewebsites.net',
 testVideos: [
  {
   id: 'fKTiWrgc-ZQ',
   description: 'Original failing video',
   expectedSuccess: true,
  },
  {
   id: 'dQw4w9WgXcQ',
   description: 'Popular video (Rick Roll)',
   expectedSuccess: true,
  },
  {
   id: 'jNQXAC9IVRw',
   description: 'Private/deleted video',
   expectedSuccess: false,
  },
 ],
 timeout: 60000, // 60 seconds per test
};

console.log('🧪 Starting Comprehensive Transcript Error Fix Test');
console.log(`📍 Backend URL: ${TEST_CONFIG.backendUrl}`);
console.log(`🎯 Testing ${TEST_CONFIG.testVideos.length} videos\n`);

/**
 * Test enhanced transcript endpoint
 */
async function testEnhancedTranscript(videoId) {
 const url = `${TEST_CONFIG.backendUrl}/api/enhanced-transcript/${videoId}`;
 console.log(`  📡 Testing enhanced transcript: ${url}`);

 try {
  const response = await fetch(url, {
   method: 'GET',
   headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Test-Script/1.0',
   },
  });

  const data = await response.json();

  return {
   success: response.ok,
   status: response.status,
   data: data,
   errorType: data.errorType || null,
   segments: data.segments ? data.segments.length : 0,
   method: data.method || 'unknown',
  };
 } catch (error) {
  return {
   success: false,
   status: 0,
   error: error.message,
   errorType: 'network_error',
  };
 }
}

/**
 * Test emergency transcript endpoint
 */
async function testEmergencyTranscript(videoId) {
 const url = `${TEST_CONFIG.backendUrl}/api/emergency-transcript/${videoId}`;
 console.log(`  🚨 Testing emergency transcript: ${url}`);

 try {
  const response = await fetch(url, {
   method: 'GET',
   headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Test-Script/1.0',
   },
  });

  const data = await response.json();

  return {
   success: response.ok,
   status: response.status,
   data: data,
   segments: data.segments ? data.segments.length : 0,
   method: data.method || 'unknown',
  };
 } catch (error) {
  return {
   success: false,
   status: 0,
   error: error.message,
  };
 }
}

/**
 * Test backend health
 */
async function testBackendHealth() {
 const url = `${TEST_CONFIG.backendUrl}/health`;
 console.log(`🏥 Testing backend health: ${url}`);

 try {
  const response = await fetch(url);
  const data = await response.json();

  return {
   success: response.ok,
   status: response.status,
   data: data,
  };
 } catch (error) {
  return {
   success: false,
   error: error.message,
  };
 }
}

/**
 * Analyze error response
 */
function analyzeErrorResponse(result) {
 if (!result.data) return 'No error data';

 const data = result.data;

 if (data.errorType === 'bot_detection') {
  return '🤖 Bot detection triggered (expected for some videos)';
 }

 if (data.errorType === 'transcript_disabled') {
  return '🚫 Transcript disabled by owner (expected)';
 }

 if (data.errorType === 'extraction_failed') {
  return '⚠️ Extraction failed (may be temporary)';
 }

 if (result.status === 423) {
  return '🔒 Temporarily blocked (bot detection cooldown)';
 }

 if (result.status === 503) {
  return '🔧 Service temporarily unavailable';
 }

 return `❓ Other error: ${data.message || 'Unknown'}`;
}

/**
 * Run comprehensive test for a video
 */
async function testVideo(video) {
 console.log(`\n🎬 Testing Video: ${video.id} (${video.description})`);
 console.log('─'.repeat(60));

 const results = {
  videoId: video.id,
  description: video.description,
  expectedSuccess: video.expectedSuccess,
  enhanced: null,
  emergency: null,
  overallSuccess: false,
 };

 // Test enhanced transcript
 try {
  console.log('  📋 Testing enhanced transcript endpoint...');
  results.enhanced = await testEnhancedTranscript(video.id);

  if (results.enhanced.success) {
   console.log(`  ✅ Enhanced: SUCCESS (${results.enhanced.segments} segments, ${results.enhanced.method})`);
  } else {
   const analysis = analyzeErrorResponse(results.enhanced);
   console.log(`  ❌ Enhanced: FAILED (${results.enhanced.status}) - ${analysis}`);
  }
 } catch (error) {
  console.log(`  💥 Enhanced: EXCEPTION - ${error.message}`);
  results.enhanced = {success: false, error: error.message};
 }

 // Test emergency transcript
 try {
  console.log('  📋 Testing emergency transcript endpoint...');
  results.emergency = await testEmergencyTranscript(video.id);

  if (results.emergency.success) {
   console.log(`  ✅ Emergency: SUCCESS (${results.emergency.segments} segments, ${results.emergency.method})`);
  } else {
   console.log(`  ❌ Emergency: FAILED (${results.emergency.status})`);
  }
 } catch (error) {
  console.log(`  💥 Emergency: EXCEPTION - ${error.message}`);
  results.emergency = {success: false, error: error.message};
 }

 // Determine overall success
 results.overallSuccess = results.enhanced?.success || results.emergency?.success;

 // Validate against expectations
 if (video.expectedSuccess && results.overallSuccess) {
  console.log('  🎉 RESULT: SUCCESS (as expected)');
 } else if (!video.expectedSuccess && !results.overallSuccess) {
  console.log('  ✅ RESULT: FAILED (as expected for this video)');
  results.overallSuccess = true; // Expected failure is success
 } else if (video.expectedSuccess && !results.overallSuccess) {
  console.log('  🚨 RESULT: UNEXPECTED FAILURE');
 } else {
  console.log('  🤔 RESULT: UNEXPECTED SUCCESS');
 }

 return results;
}

/**
 * Main test execution
 */
async function runTests() {
 const startTime = Date.now();
 const results = [];

 // Test backend health first
 console.log('🏥 Testing Backend Health...');
 const healthResult = await testBackendHealth();

 if (healthResult.success) {
  console.log('✅ Backend is healthy');
  if (healthResult.data?.azure) {
   console.log(`🌐 Environment: ${healthResult.data.azure.siteName || 'Azure'}`);
  }
 } else {
  console.log('❌ Backend health check failed:', healthResult.error);
  console.log('⚠️ Continuing with tests anyway...');
 }

 // Test each video
 for (const video of TEST_CONFIG.testVideos) {
  const result = await testVideo(video);
  results.push(result);

  // Delay between tests to avoid rate limiting
  if (TEST_CONFIG.testVideos.indexOf(video) < TEST_CONFIG.testVideos.length - 1) {
   console.log('⏳ Waiting 5 seconds before next test...');
   await new Promise((resolve) => setTimeout(resolve, 5000));
  }
 }

 // Generate final report
 const duration = Date.now() - startTime;
 const successes = results.filter((r) => r.overallSuccess).length;
 const failures = results.length - successes;

 console.log('\n' + '='.repeat(70));
 console.log('📊 FINAL TEST REPORT');
 console.log('='.repeat(70));
 console.log(`⏱️ Total duration: ${Math.round(duration / 1000)}s`);
 console.log(`✅ Successful tests: ${successes}/${results.length}`);
 console.log(`❌ Failed tests: ${failures}/${results.length}`);

 if (failures === 0) {
  console.log('\n🎉 ALL TESTS PASSED! The transcript error fix is working correctly.');
 } else {
  console.log('\n⚠️ Some tests failed. Review the detailed results above.');
 }

 // Detailed breakdown
 console.log('\n📋 Detailed Results:');
 results.forEach((result, index) => {
  const status = result.overallSuccess ? '✅' : '❌';
  console.log(`${index + 1}. ${status} ${result.videoId} (${result.description})`);

  if (result.enhanced?.success) {
   console.log(`   📈 Enhanced: ${result.enhanced.segments} segments via ${result.enhanced.method}`);
  }
  if (result.emergency?.success) {
   console.log(`   🚨 Emergency: ${result.emergency.segments} segments via ${result.emergency.method}`);
  }
  if (!result.overallSuccess && result.expectedSuccess) {
   console.log(`   ⚠️ This was expected to succeed but failed`);
  }
 });

 console.log('\n' + '='.repeat(70));

 // Exit with appropriate code
 process.exit(failures === 0 ? 0 : 1);
}

// Run the tests
runTests().catch((error) => {
 console.error('💥 Test runner crashed:', error);
 process.exit(1);
});
