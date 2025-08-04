const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

async function testTranscriptUpload() {
 console.log('🧪 Testing transcript upload API...');

 // Mock video segments data (typical structure from the app)
 const mockSegments = [
  {
   id: 'segment-1',
   title: 'Introduction to Machine Learning',
   description: 'Overview of ML fundamentals',
   startTimeSeconds: 0,
   endTimeSeconds: 30,
   youtubeVideoId: 'test123',
   thumbnailUrl: 'https://example.com/thumb1.jpg',
  },
  {
   id: 'segment-2',
   title: 'Types of Machine Learning',
   description: 'Supervised, unsupervised, reinforcement',
   startTimeSeconds: 30,
   endTimeSeconds: 60,
   youtubeVideoId: 'test123',
   thumbnailUrl: 'https://example.com/thumb2.jpg',
  },
  {
   id: 'segment-3',
   title: 'ML Algorithms',
   description: 'Popular algorithms and neural networks',
   startTimeSeconds: 60,
   endTimeSeconds: 90,
   youtubeVideoId: 'test123',
   thumbnailUrl: 'https://example.com/thumb3.jpg',
  },
 ];

 try {
  // Read the test SRT file
  const srtFilePath = path.join(__dirname, 'test-files', 'sample-ml-tutorial.srt');
  const srtContent = fs.readFileSync(srtFilePath);

  console.log(`📂 Reading test file: ${srtFilePath}`);
  console.log(`📊 File size: ${srtContent.length} bytes`);

  // Create FormData
  const formData = new FormData();

  formData.append('transcriptFile', srtContent, {
   filename: 'sample-ml-tutorial.srt',
   contentType: 'application/x-subrip',
  });
  formData.append('videoId', 'test123');
  formData.append('segments', JSON.stringify(mockSegments));

  console.log('📤 Sending request to API...');

  // Make the API request
  const response = await fetch('http://localhost:8080/api/upload-transcript', {
   method: 'POST',
   body: formData,
   headers: formData.getHeaders(),
  });

  const result = await response.json();

  if (response.ok) {
   console.log('✅ Upload successful!');
   console.log(`📈 Statistics: ${result.data.stats.matchedSegments}/${result.data.stats.totalSegments} segments matched`);
   console.log(`📄 Transcript entries: ${result.data.stats.transcriptEntries}`);
   console.log('📝 Updated segments:');
   result.data.segments.forEach((segment, index) => {
    console.log(`  ${index + 1}. ${segment.title}`);
    console.log(`     Transcript: ${segment.transcriptExcerpt ? segment.transcriptExcerpt.substring(0, 100) + '...' : 'No transcript'}`);
    console.log(`     Manual: ${segment.hasManualTranscript ? 'Yes' : 'No'}`);
   });
  } else {
   console.error('❌ Upload failed:', result);
  }
 } catch (error) {
  console.error('❌ Test failed:', error.message);
 }
}

// Only run if this file is executed directly
if (require.main === module) {
 testTranscriptUpload();
}

module.exports = {testTranscriptUpload};
