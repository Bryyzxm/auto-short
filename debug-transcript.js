async function debugTranscript() {
  try {
    console.log('🔍 DEBUGGING TRANSCRIPT GENERATION');
    console.log('=====================================');
    
    // Test 1: Check server health
    console.log('\n1. Testing server health...');
    const healthResponse = await fetch('https://auto-short-backend-production.up.railway.app/');
    const healthData = await healthResponse.json();
    console.log('Health check:', healthData);
    
    // Test 2: Check transcript stats
    console.log('\n2. Checking transcript statistics...');
    const statsResponse = await fetch('https://auto-short-backend-production.up.railway.app/api/transcript-stats');
    const statsData = await statsResponse.json();
    console.log('Transcript stats:', JSON.stringify(statsData, null, 2));
    
    // Test 3: Try a simple video that should work
    console.log('\n3. Testing with a simple video (dQw4w9WgXcQ)...');
    const transcriptResponse = await fetch('https://auto-short-backend-production.up.railway.app/api/yt-transcript?videoId=dQw4w9WgXcQ');
    const transcriptData = await transcriptResponse.json();
    console.log('Transcript response:', JSON.stringify(transcriptData, null, 2));
    
    // Test 4: Check performance metrics
    console.log('\n4. Checking performance metrics...');
    const perfResponse = await fetch('https://auto-short-backend-production.up.railway.app/api/transcript-performance');
    const perfData = await perfResponse.json();
    console.log('Performance data:', JSON.stringify(perfData, null, 2));
    
    // Test 5: Try with refresh flag
    console.log('\n5. Testing with refresh flag...');
    const refreshResponse = await fetch('https://auto-short-backend-production.up.railway.app/api/yt-transcript?videoId=dQw4w9WgXcQ&refresh=true');
    const refreshData = await refreshResponse.json();
    console.log('Refresh response:', JSON.stringify(refreshData, null, 2));
    
    console.log('\n=====================================');
    console.log('🔍 DEBUG COMPLETE');
    
  } catch (error) {
    console.error('❌ DEBUG ERROR:', error.message);
  }
}

debugTranscript();