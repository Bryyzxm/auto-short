async function testEndpoint() {
  try {
    console.log('Testing http://localhost:5001/api/transcript-stats...');
    const response = await fetch('http://localhost:5001/api/transcript-stats');
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEndpoint();