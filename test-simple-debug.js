// Test sederhana untuk melihat detail error
const SERVER_URL = 'https://auto-short-backend-production.up.railway.app';

async function testSimple() {
  console.log('🧪 Testing simple video with detailed error logging...\n');
  
  // Test dengan video yang sangat populer dan lama
  const videoId = 'dQw4w9WgXcQ'; // Rick Roll - video yang sangat terkenal
  
  try {
    console.log(`📡 Making request to: ${SERVER_URL}/api/yt-transcript?videoId=${videoId}&refresh=true`);
    
    const response = await fetch(`${SERVER_URL}/api/yt-transcript?videoId=${videoId}&refresh=true`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(120000) // 2 minutes timeout
    });
    
    console.log(`📊 Response Status: ${response.status}`);
    console.log(`📊 Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.log(`❌ Error Body: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    
    console.log('\n📝 Full Response Data:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.metadata?.error) {
      console.log(`\n❌ Server Error: ${data.metadata.error}`);
    }
    
    if (data.segments && data.segments.length > 0) {
      console.log(`\n✅ SUCCESS! Found ${data.segments.length} segments`);
    } else {
      console.log(`\n❌ No segments found - this indicates yt-dlp/whisper.cpp issues`);
    }
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    console.log(`❌ Error details:`, error);
  }
}

// Test stats endpoint
async function testStats() {
  console.log('\n📊 Checking transcript stats...');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/transcript-stats`);
    const stats = await response.json();
    
    console.log('📊 Transcript Statistics:');
    console.log(JSON.stringify(stats, null, 2));
    
  } catch (error) {
    console.log(`❌ Stats request failed: ${error.message}`);
  }
}

async function runTest() {
  await testSimple();
  await testStats();
}

runTest().catch(console.error);