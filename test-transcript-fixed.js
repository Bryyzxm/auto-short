async function testTranscript() {
  try {
    console.log('🧪 Testing transcript generation for video: dQw4w9WgXcQ (first video that worked)');
    
    const response = await fetch('https://auto-short-backend-production.up.railway.app/api/yt-transcript?videoId=dQw4w9WgXcQ', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📝 Response Data:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.segments && data.segments.length > 0) {
      console.log('✅ SUCCESS: Transcript generated with', data.segments.length, 'segments');
    } else {
      console.log('⚠️ WARNING: No transcript segments found');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testTranscript();