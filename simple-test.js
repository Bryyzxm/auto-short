async function testEndpoint() {
  try {
    console.log('Testing https://auto-short-backend-production.up.railway.app/api/generate-segments...');
    const response = await fetch('https://auto-short-backend-production.up.railway.app/api/generate-segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: 'test', transcript: 'test' })
    });
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEndpoint();