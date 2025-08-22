const OfficialYtDlpFixService = require('./services/officialYtDlpFixService');

/**
 * Test the Official YT-DLP Fix from Issue #13930
 *
 * This script tests the official solution for:
 * "The following content is not available on this app" errors
 *
 * Based on: https://github.com/yt-dlp/yt-dlp/issues/13930
 * Fixed by: https://github.com/yt-dlp/yt-dlp/pull/14081
 */

async function testOfficialFix() {
 console.log('🔧 TESTING OFFICIAL YT-DLP FIX');
 console.log('====================================');
 console.log('📋 Issue: https://github.com/yt-dlp/yt-dlp/issues/13930');
 console.log('✅ Fixed by: https://github.com/yt-dlp/yt-dlp/pull/14081');
 console.log('');

 const officialService = new OfficialYtDlpFixService();

 // Test video that commonly triggers the error
 const testVideos = [
  'BaW_jenozKc', // yt-dlp test video
  'A_WgNFdRaGU', // From the original issue
  'dQw4w9WgXcQ', // Rick Roll (classic test)
 ];

 for (const videoId of testVideos) {
  console.log(`\n🧪 Testing video: ${videoId}`);
  console.log(`🔗 URL: https://www.youtube.com/watch?v=${videoId}`);

  try {
   const startTime = Date.now();
   const result = await officialService.extractTranscript(videoId);
   const duration = Date.now() - startTime;

   console.log(`✅ SUCCESS in ${duration}ms`);
   console.log(`📊 Extracted ${result.segments.length} segments`);
   console.log(`🔧 Method: ${result.extractionMethod}`);
   console.log(`🎯 Source: ${result.source}`);

   if (result.segments.length > 0) {
    console.log(`📝 First segment: "${result.segments[0].text.substring(0, 50)}..."`);
    console.log(`⏱️  Duration: ${result.segments[0].start}s - ${result.segments[0].end}s`);
   }
  } catch (error) {
   console.log(`❌ FAILED: ${error.message}`);

   // Check if this is the specific error the fix addresses
   if (error.message.includes('content is not available on this app')) {
    console.log(`🚨 This is the EXACT error the official fix addresses!`);
    console.log(`💡 Solution: Update yt-dlp to latest version with the fix`);
   }
  }
 }

 // Show update instructions
 console.log('\n📦 UPDATE INSTRUCTIONS');
 console.log('======================');
 const updateInfo = await officialService.updateYtDlp();
 updateInfo.instructions.forEach((instruction, index) => {
  console.log(`${index + 1}. ${instruction}`);
 });

 console.log('\n🔄 Alternative: Test if fix is working');
 const testResult = await officialService.testOfficialFix();
 if (testResult.success) {
  console.log(`✅ Official fix is working! Extracted ${testResult.segments} segments using ${testResult.method}`);
 } else {
  console.log(`❌ Official fix test failed: ${testResult.error}`);
 }
}

// Run the test
if (require.main === module) {
 testOfficialFix()
  .then(() => {
   console.log('\n🏁 Test completed');
   process.exit(0);
  })
  .catch((error) => {
   console.error('\n💥 Test script failed:', error);
   process.exit(1);
  });
}

module.exports = {testOfficialFix};
