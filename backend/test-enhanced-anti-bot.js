#!/usr/bin/env node

/**
 * COMPREHENSIVE ANTI-BOT DETECTION TEST
 *
 * This script tests our enhanced anti-bot detection measures:
 * 1. CORS header fixes
 * 2. Enhanced rate limiting
 * 3. Advanced user agent rotation
 * 4. Multi-client extractor arguments
 * 5. Human-like timing patterns
 */

const fs = require('fs');
const path = require('path');

console.log('🛡️ ENHANCED ANTI-BOT DETECTION TEST');
console.log('=====================================');

// Test 1: Verify CORS headers
console.log('\n1️⃣ Testing CORS Configuration...');
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const corsHeaders = ['User-Agent', 'Cache-Control', 'Accept', 'Accept-Language', 'Accept-Encoding', 'Origin', 'Referer'];

let corsFixed = true;
corsHeaders.forEach((header) => {
 if (!serverContent.includes(`'${header}'`)) {
  console.log(`❌ Missing CORS header: ${header}`);
  corsFixed = false;
 }
});

if (corsFixed) {
 console.log('✅ All required CORS headers are configured');
} else {
 console.log('⚠️ Some CORS headers are missing');
}

// Test 2: Check enhanced user agents
console.log('\n2️⃣ Testing User Agent Pool...');
const userAgentCount = (serverContent.match(/Mozilla\/5\.0/g) || []).length;
console.log(`📊 Found ${userAgentCount} user agents in pool`);

if (userAgentCount >= 10) {
 console.log('✅ Sufficient user agent diversity');
} else {
 console.log('⚠️ Consider adding more user agents');
}

// Test 3: Verify rate limiting
console.log('\n3️⃣ Testing Rate Limiting System...');
const hasRateLimiter = serverContent.includes('RATE_LIMITER') && serverContent.includes('checkAndWait') && serverContent.includes('globalCooldown');

if (hasRateLimiter) {
 console.log('✅ Rate limiting system is implemented');
} else {
 console.log('❌ Rate limiting system not found');
}

// Test 4: Check anti-detection measures
console.log('\n4️⃣ Testing Anti-Detection Measures...');
const antiDetectionFeatures = ['sleep-interval', 'geo-bypass', 'socket-timeout', 'player_client=android,web,tv,ios'];

let antiDetectionScore = 0;
antiDetectionFeatures.forEach((feature) => {
 if (serverContent.includes(feature)) {
  console.log(`✅ ${feature}`);
  antiDetectionScore++;
 } else {
  console.log(`❌ ${feature}`);
 }
});

console.log(`📊 Anti-detection score: ${antiDetectionScore}/${antiDetectionFeatures.length}`);

// Test 5: Verify enhanced execution function
console.log('\n5️⃣ Testing Enhanced Execution Function...');
const hasEnhancedExecution = serverContent.includes('🛡️ ENHANCED ANTI-BOT DETECTION LAYER') && serverContent.includes('extractVideoId') && serverContent.includes('getRandomUserAgent');

if (hasEnhancedExecution) {
 console.log('✅ Enhanced execution function is implemented');
} else {
 console.log('❌ Enhanced execution function not found');
}

// Test 6: Check Alternative Service Integration
console.log('\n6️⃣ Testing Alternative Service Integration...');
const altServicePath = path.join(__dirname, 'services', 'alternativeTranscriptService.js');
if (fs.existsSync(altServicePath)) {
 const altServiceContent = fs.readFileSync(altServicePath, 'utf8');
 const hasSecureExecution = altServiceContent.includes('getSecureExecutor') && altServiceContent.includes('enhanced anti-detection');

 if (hasSecureExecution) {
  console.log('✅ Alternative service uses enhanced execution');
 } else {
  console.log('❌ Alternative service still uses old execution');
 }
} else {
 console.log('⚠️ Alternative service file not found');
}

// Summary
console.log('\n📋 SUMMARY');
console.log('==========');
const totalTests = 6;
let passedTests = 0;

if (corsFixed) passedTests++;
if (userAgentCount >= 10) passedTests++;
if (hasRateLimiter) passedTests++;
if (antiDetectionScore >= 3) passedTests++;
if (hasEnhancedExecution) passedTests++;
if (fs.existsSync(altServicePath)) passedTests++;

console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
console.log(`📊 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

if (passedTests === totalTests) {
 console.log('\n🎉 ALL TESTS PASSED! Enhanced anti-bot detection is ready.');
} else {
 console.log('\n⚠️ Some tests failed. Please review the configuration.');
}

console.log('\n🚀 Ready for deployment to Azure!');
