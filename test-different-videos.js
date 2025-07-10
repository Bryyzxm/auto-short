// Test dengan beberapa video ID yang berbeda
const testVideos = [
  { id: 'jNQXAC9IVRw', title: 'Me at the zoo (first YouTube video)' },
  { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito' },
  { id: 'fJ9rUzIMcZQ', title: 'Queen - Bohemian Rhapsody' },
  { id: 'YQHsXMglC9A', title: 'Adele - Hello' },
  { id: 'pRpeEdMmmQ0', title: 'Shakira - Waka Waka' }
];

const SERVER_URL = 'https://auto-short-backend-production.up.railway.app';

async function testVideo(videoId, title) {
  console.log(`\n🧪 Testing: ${title} (${videoId})`);
  
  try {
    const response = await fetch(`${SERVER_URL}/api/yt-transcript?videoId=${videoId}&refresh=true`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(60000)
    });
    
    console.log(`📊 Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const data = await response.json();
    
    console.log(`📝 Segments: ${data.segments?.length || 0}`);
    console.log(`⏱️ Processing time: ${data.metadata?.processingTime}ms`);
    console.log(`🔧 Source: ${data.metadata?.source}`);
    
    if (data.metadata?.error) {
      console.log(`❌ Error: ${data.metadata.error}`);
    }
    
    if (data.segments && data.segments.length > 0) {
      console.log(`✅ SUCCESS! Found ${data.segments.length} segments`);
      console.log(`📝 First segment: "${data.segments[0].text.substring(0, 100)}..."`);
      return true;
    } else {
      console.log(`❌ No segments found`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Testing transcript generation with different videos...\n');
  
  let successCount = 0;
  
  for (const video of testVideos) {
    const success = await testVideo(video.id, video.title);
    if (success) successCount++;
    
    // Wait between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n📊 RESULTS: ${successCount}/${testVideos.length} videos successful`);
  
  if (successCount === 0) {
    console.log('❌ All videos failed - there may be a systematic issue');
  } else if (successCount < testVideos.length) {
    console.log('⚠️ Some videos failed - may be video-specific issues');
  } else {
    console.log('✅ All videos successful!');
  }
}

runTests().catch(console.error);