// Test debug endpoint untuk melihat detail error yt-dlp
const SERVER_URL = 'https://auto-short-backend-production.up.railway.app';

async function testDebugEndpoint() {
  console.log('🔍 Testing debug endpoint for yt-dlp troubleshooting...\n');
  
  const videoId = 'dQw4w9WgXcQ'; // Rick Roll - video yang sangat terkenal
  
  try {
    console.log(`📡 Making request to debug endpoint: ${SERVER_URL}/api/debug-ytdlp/${videoId}`);
    
    const response = await fetch(`${SERVER_URL}/api/debug-ytdlp/${videoId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(60000) // 1 minute timeout
    });
    
    console.log(`📊 Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.log(`❌ Error Body: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    
    console.log('\n📝 Debug Logs from Server:');
    console.log('='.repeat(50));
    
    data.debugLogs.forEach((log, index) => {
      const emoji = log.type === 'error' ? '❌' : log.type === 'success' ? '✅' : log.type === 'info' ? 'ℹ️' : '📝';
      console.log(`${index + 1}. ${emoji} [${log.type.toUpperCase()}] ${log.timestamp}`);
      console.log(`   ${log.message}`);
      console.log('');
    });
    
    console.log('='.repeat(50));
    console.log(`🕐 Debug completed at: ${data.timestamp}`);
    
    // Analisis hasil
    const errorLogs = data.debugLogs.filter(log => log.type === 'error');
    const successLogs = data.debugLogs.filter(log => log.type === 'success');
    
    if (errorLogs.length > 0) {
      console.log(`\n❌ Found ${errorLogs.length} error(s):`);
      errorLogs.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.message}`);
      });
    }
    
    if (successLogs.length > 0) {
      console.log(`\n✅ Found ${successLogs.length} success(es):`);
      successLogs.forEach((success, index) => {
        console.log(`   ${index + 1}. ${success.message}`);
      });
    }
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    console.log(`❌ Error details:`, error);
  }
}

testDebugEndpoint().catch(console.error);