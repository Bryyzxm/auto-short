import axios from 'axios';

const BASE_URL = 'https://auto-short-backend-production.up.railway.app';

async function testDifferentVideo() {
  console.log('🧪 Testing different video to check if issue is video-specific...\n');
  
  // Test dengan video yang berbeda - video yang lebih baru dan mungkin memiliki transcript
  const testVideos = [
    { id: 'jNQXAC9IVRw', title: 'Me at the zoo (first YouTube video)' },
    { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito' },
    { id: 'fJ9rUzIMcZQ', title: 'Queen - Bohemian Rhapsody' }
  ];
  
  for (const video of testVideos) {
    console.log(`📹 Testing video: ${video.title} (${video.id})`);
    console.log(`📡 Making request to: ${BASE_URL}/api/yt-transcript?videoId=${video.id}&refresh=true`);
    
    try {
      const response = await axios.get(`${BASE_URL}/api/yt-transcript`, {
        params: {
          videoId: video.id,
          refresh: true
        },
        timeout: 60000
      });
      
      console.log(`✅ Response Status: ${response.status} ${response.statusText}`);
      console.log(`📊 Segments found: ${response.data.segments?.length || 0}`);
      
      if (response.data.segments && response.data.segments.length > 0) {
        console.log(`🎯 SUCCESS! Found ${response.data.segments.length} segments`);
        console.log(`📝 First segment: "${response.data.segments[0].text.substring(0, 100)}..."`);
        console.log(`⏱️ Duration: ${response.data.segments[0].start}s - ${response.data.segments[0].end}s`);
        console.log(`🔧 Source: ${response.data.metadata?.source || 'unknown'}`);
        break; // Stop testing if we found a working video
      } else {
        console.log(`❌ No segments found for ${video.title}`);
        console.log(`🔧 Source: ${response.data.metadata?.source || 'unknown'}`);
        console.log(`❌ Error: ${response.data.metadata?.error || 'No error message'}`);
      }
      
    } catch (error) {
      console.error(`❌ Request failed for ${video.title}:`, error.message);
      if (error.response) {
        console.error(`❌ Status: ${error.response.status}`);
        console.error(`❌ Data:`, error.response.data);
      }
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  // Test debug endpoint untuk video terakhir
  const lastVideo = testVideos[testVideos.length - 1];
  console.log(`🔍 Testing debug endpoint for: ${lastVideo.title}`);
  
  try {
    const debugResponse = await axios.get(`${BASE_URL}/api/debug-ytdlp/${lastVideo.id}`, {
      timeout: 60000
    });
    
    console.log('🔧 Debug Response:');
    console.log(JSON.stringify(debugResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Debug endpoint failed:', error.message);
  }
}

testDifferentVideo().catch(console.error);