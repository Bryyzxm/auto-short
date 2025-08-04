#!/usr/bin/env node

/**
 * SERVER ENDPOINT INTEGRATION TEST
 * Tests the enhanced AI segmentation endpoints
 */

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const SERVER_URL = 'http://localhost:3001';

// Mock SRT content for testing
const mockSRTContent = `1
00:00:00,000 --> 00:00:15,000
Welcome to this technology podcast. Today we're discussing artificial intelligence.

2
00:00:15,000 --> 00:00:35,000
Machine learning algorithms have revolutionized how companies analyze data.

3
00:00:35,000 --> 00:00:58,000
The implementation of AI in customer service has reduced response times significantly.

4
00:00:58,000 --> 00:01:22,000
However, businesses must also consider the ethical implications of automation.

5
00:01:22,000 --> 00:01:45,000
Data privacy regulations like GDPR have forced companies to rethink their strategies.`;

console.log('\n🔌 SERVER ENDPOINT INTEGRATION TEST');
console.log('='.repeat(50));

async function testServerHealth() {
 try {
  console.log('\n📡 Testing server connectivity...');
  const response = await axios.get(`${SERVER_URL}/health`, {timeout: 5000});
  console.log(`✅ Server is running: ${response.status}`);
  return true;
 } catch (error) {
  console.log(`❌ Server not accessible: ${error.message}`);
  console.log('⚠️  Please start the server with: npm start');
  return false;
 }
}

async function testIntelligentSegmentsEndpoint() {
 try {
  console.log('\n🤖 Testing /api/intelligent-segments endpoint...');

  const response = await axios.post(
   `${SERVER_URL}/api/intelligent-segments`,
   {
    videoId: 'dQw4w9WgXcQ', // Rick Roll video ID for testing
    targetSegmentCount: 5,
    minDuration: 20,
    maxDuration: 90,
   },
   {timeout: 30000}
  );

  console.log(`✅ Response status: ${response.status}`);
  console.log(`✅ Generated ${response.data.segments?.length || 0} segments`);
  console.log(`✅ Method: ${response.data.method}`);
  console.log(`✅ Quality: ${response.data.transcriptQuality}`);

  return true;
 } catch (error) {
  if (error.response) {
   console.log(`❌ Server error: ${error.response.status} - ${error.response.data?.error || error.response.data?.message}`);
  } else {
   console.log(`❌ Request failed: ${error.message}`);
  }
  return false;
 }
}

async function testTranscriptUploadEndpoint() {
 try {
  console.log('\n📄 Testing /api/upload-transcript endpoint...');

  // Create a temporary SRT file
  const tempFilePath = './temp-test.srt';
  fs.writeFileSync(tempFilePath, mockSRTContent);

  const formData = new FormData();
  formData.append('transcriptFile', fs.createReadStream(tempFilePath));
  formData.append('videoId', 'test_video_123');
  formData.append('segments', JSON.stringify([])); // No existing segments - should generate new ones

  const response = await axios.post(`${SERVER_URL}/api/upload-transcript`, formData, {
   headers: formData.getHeaders(),
   timeout: 30000,
  });

  console.log(`✅ Response status: ${response.status}`);
  console.log(`✅ Success: ${response.data.success}`);
  console.log(`✅ Mode: ${response.data.mode}`);
  console.log(`✅ Generated ${response.data.data?.segments?.length || 0} segments`);
  console.log(`✅ Enhanced: ${response.data.enhanced ? 'Yes' : 'No'}`);
  console.log(`✅ Method: ${response.data.processingMethod}`);

  // Cleanup
  fs.unlinkSync(tempFilePath);

  return true;
 } catch (error) {
  if (error.response) {
   console.log(`❌ Server error: ${error.response.status} - ${error.response.data?.error || error.response.data?.message}`);
  } else {
   console.log(`❌ Request failed: ${error.message}`);
  }

  // Cleanup on error
  try {
   fs.unlinkSync('./temp-test.srt');
  } catch {}

  return false;
 }
}

async function runServerTests() {
 console.log('Starting server endpoint tests...');

 const serverRunning = await testServerHealth();
 if (!serverRunning) {
  console.log('\n⚠️  Server tests skipped - server not running');
  return;
 }

 let passed = 0;
 let total = 0;

 total++;
 if (await testIntelligentSegmentsEndpoint()) passed++;

 total++;
 if (await testTranscriptUploadEndpoint()) passed++;

 console.log('\n' + '='.repeat(50));
 console.log('📊 SERVER TEST RESULTS');
 console.log('='.repeat(50));
 console.log(`Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`);
 console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);

 if (passed === total) {
  console.log('\n🎉 All server tests passed!');
 } else {
  console.log('\n⚠️  Some server tests failed. Check the output above.');
 }
}

runServerTests().catch((error) => {
 console.error('\n💥 Fatal error during server tests:', error);
 process.exit(1);
});
