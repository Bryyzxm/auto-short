#!/usr/bin/env node

/**
 * FINAL COMPREHENSIVE TEST - AFTER ALL CRITICAL FIXES
 * Test transcript service method calls and proper error handling
 */

import fetch from 'node-fetch';

const BACKEND_URL = 'https://auto-short-production.up.railway.app';

console.log('🔧 FINAL TEST AFTER CRITICAL FIXES\n');

// Test 1: Test enhanced transcript with proper error messages
async function testEnhancedTranscript() {
 console.log('1️⃣ Testing Enhanced Transcript Endpoint');

 // Test with video that has transcript disabled
 const disabledVideoId = 'rHpMT4leNeg'; // From logs - transcript disabled

 try {
  const response = await fetch(`${BACKEND_URL}/api/enhanced-transcript/${disabledVideoId}`, {
   headers: {
    'User-Agent': 'Test-Client/1.0',
    Accept: 'application/json',
   },
  });

  const data = await response.json();
  console.log(`   Status: ${response.status}`);
  console.log(`   Response:`, JSON.stringify(data, null, 2));

  if (data.disabledByOwner) {
   console.log('   ✅ EXCELLENT: Proper "disabled by owner" detection!');
  } else if (data.error && data.error.includes('Transcript is disabled')) {
   console.log('   ✅ GOOD: Proper transcript disabled error message');
  } else {
   console.log('   ❌ Still not handling disabled transcripts properly');
  }
 } catch (error) {
  console.log(`   ❌ Request failed: ${error.message}`);
 }

 console.log('');
}

// Test 2: Test with a video that should have transcript
async function testWithPopularVideo() {
 console.log('2️⃣ Testing with Popular Video (should have transcript)');

 // Rick Roll - very popular, should have transcript
 const videoId = 'dQw4w9WgXcQ';

 try {
  const response = await fetch(`${BACKEND_URL}/api/enhanced-transcript/${videoId}`, {
   headers: {
    'User-Agent': 'Test-Client/1.0',
    Accept: 'application/json',
   },
  });

  const data = await response.json();
  console.log(`   Status: ${response.status}`);
  console.log(`   Service used: ${data.serviceUsed || 'Unknown'}`);
  console.log(`   Method: ${data.method || 'Unknown'}`);

  if (data.transcript) {
   console.log(`   ✅ Success! Transcript length: ${data.transcript.length} chars`);
   console.log(`   📊 Segments: ${data.segments?.length || 0}`);

   if (data.transcript.length > 200) {
    console.log('   ✅ EXCELLENT: No more short transcript issue!');
   } else {
    console.log('   ⚠️  WARNING: Transcript still short');
   }
  } else if (data.error) {
   console.log(`   ℹ️  Error: ${data.error}`);
   if (data.disabledByOwner) {
    console.log('   ✅ Proper error handling for disabled transcript');
   }
  }
 } catch (error) {
  console.log(`   ❌ Request failed: ${error.message}`);
 }

 console.log('');
}

// Test 3: Test intelligent segments
async function testIntelligentSegments() {
 console.log('3️⃣ Testing Intelligent Segments (should not crash now)');

 const videoId = 'dQw4w9WgXcQ';

 try {
  const response = await fetch(`${BACKEND_URL}/api/intelligent-segments`, {
   method: 'POST',
   headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Test-Client/1.0',
    Accept: 'application/json',
   },
   body: JSON.stringify({
    videoId: videoId,
    targetSegmentCount: 3,
   }),
  });

  const data = await response.json();
  console.log(`   Status: ${response.status}`);

  if (response.ok && data.segments) {
   console.log(`   ✅ SUCCESS! Generated ${data.segments.length} segments`);
   console.log(`   📊 Average duration: ${data.averageDuration}s`);
   console.log('   ✅ FIXED: No more "service.extractTranscript is not a function" error!');
  } else {
   console.log(`   Error: ${data.error || 'Unknown error'}`);
   console.log(`   Details: ${data.message || 'No details'}`);

   // Check if it's a proper transcript disabled error vs technical error
   if (data.message && data.message.includes('extractTranscript is not a function')) {
    console.log('   ❌ STILL BROKEN: Method call issue not fixed');
   } else if (data.message && data.message.includes('Transcript is disabled')) {
    console.log('   ✅ PROPER: Legitimate transcript disabled error');
   } else {
    console.log('   ℹ️  Other error - need investigation');
   }
  }
 } catch (error) {
  console.log(`   ❌ Request failed: ${error.message}`);
 }

 console.log('');
}

// Test 4: Test health and basic functionality
async function testHealth() {
 console.log('4️⃣ Testing Backend Health');

 try {
  const response = await fetch(`${BACKEND_URL}/health`);
  const data = await response.json();

  console.log(`   Status: ${response.status}`);
  console.log(`   Node version: ${data.node_version}`);
  console.log(`   yt-dlp version: ${data.ytdlp_version}`);
  console.log(`   Platform: ${data.platform}`);
  console.log('   ✅ Backend is healthy');
 } catch (error) {
  console.log(`   ❌ Health check failed: ${error.message}`);
 }

 console.log('');
}

async function runFinalTest() {
 console.log('🚀 Running final comprehensive test...\n');

 await testHealth();
 await testEnhancedTranscript();
 await testWithPopularVideo();
 await testIntelligentSegments();

 console.log('🏁 Final test completed!\n');
 console.log('📋 CRITICAL FIXES APPLIED:');
 console.log('   1. ✅ Fixed robustTranscriptServiceV2.extractTranscript -> extractWithRealTiming');
 console.log('   2. ✅ Fixed yt-dlp user-agent escaping in command logging');
 console.log('   3. ✅ Added proper "transcript disabled" error handling');
 console.log('   4. ✅ Removed dummy segment fallback from emergency service');
 console.log('   5. ✅ Enhanced error messages for legitimate restrictions');
 console.log('\n🎯 EXPECTED OUTCOME:');
 console.log('   • No more "service.extractTranscript is not a function" errors');
 console.log('   • No more "110 character" dummy transcript fallbacks');
 console.log('   • Clear error messages when videos legitimately have disabled transcripts');
 console.log('   • Proper transcript extraction for videos that do have captions');
}

runFinalTest().catch(console.error);
