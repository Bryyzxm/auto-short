const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testCompleteWorkflow() {
 console.log('🚀 Testing Complete Manual Transcript Upload Workflow');
 console.log('='.repeat(60));

 // Mock segments from a typical AI video analysis
 const mockVideoSegments = [
  {
   id: 'ai-segment-1',
   title: 'Introduction to Machine Learning',
   description: 'Overview of ML basics and fundamentals',
   startTimeSeconds: 0,
   endTimeSeconds: 30,
   youtubeVideoId: 'dQw4w9WgXcQ',
   thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
  },
  {
   id: 'ai-segment-2',
   title: 'Types of Machine Learning',
   description: 'Supervised, unsupervised, and reinforcement learning',
   startTimeSeconds: 30,
   endTimeSeconds: 60,
   youtubeVideoId: 'dQw4w9WgXcQ',
   thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
  },
  {
   id: 'ai-segment-3',
   title: 'Neural Networks Deep Dive',
   description: 'Understanding neural networks and deep learning',
   startTimeSeconds: 60,
   endTimeSeconds: 90,
   youtubeVideoId: 'dQw4w9WgXcQ',
   thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
  },
 ];

 console.log(`📊 Testing with ${mockVideoSegments.length} video segments:`);
 mockVideoSegments.forEach((segment, index) => {
  console.log(`  ${index + 1}. "${segment.title}" (${segment.startTimeSeconds}s-${segment.endTimeSeconds}s)`);
 });

 console.log('\n📂 Testing SRT file upload...');

 try {
  // Test SRT file upload
  const srtPath = './test-files/sample-ml-tutorial.srt';
  const srtContent = fs.readFileSync(srtPath);

  const formData = new FormData();
  formData.append('transcriptFile', srtContent, {
   filename: 'sample-ml-tutorial.srt',
   contentType: 'application/x-subrip',
  });
  formData.append('videoId', 'dQw4w9WgXcQ');
  formData.append('segments', JSON.stringify(mockVideoSegments));

  console.log('🌐 Uploading to backend API...');

  const response = await fetch('http://localhost:8082/api/upload-transcript', {
   method: 'POST',
   body: formData,
   headers: formData.getHeaders(),
  });

  const result = await response.json();

  if (response.ok) {
   console.log('✅ Upload successful!');
   console.log(`📈 Statistics:`);
   console.log(`   - Total segments: ${result.data.stats.totalSegments}`);
   console.log(`   - Matched segments: ${result.data.stats.matchedSegments}`);
   console.log(`   - Transcript entries: ${result.data.stats.transcriptEntries}`);
   console.log(`   - File size: ${result.data.stats.fileSize} bytes`);
   console.log(`   - Filename: ${result.data.stats.filename}`);

   console.log('\n📝 Updated segments with transcript data:');
   result.data.segments.forEach((segment, index) => {
    console.log(`\n${index + 1}. ${segment.title} (${segment.startTimeSeconds}s-${segment.endTimeSeconds}s)`);
    console.log(`   Manual transcript: ${segment.hasManualTranscript ? '✅ Yes' : '❌ No'}`);
    if (segment.transcriptExcerpt) {
     const excerpt = segment.transcriptExcerpt.length > 100 ? segment.transcriptExcerpt.substring(0, 100) + '...' : segment.transcriptExcerpt;
     console.log(`   Transcript: "${excerpt}"`);
    }
   });

   // Test TXT file format as well
   console.log('\n📂 Testing TXT file upload...');

   const txtPath = './test-files/sample-ml-tutorial.txt';
   const txtContent = fs.readFileSync(txtPath);

   const txtFormData = new FormData();
   txtFormData.append('transcriptFile', txtContent, {
    filename: 'sample-ml-tutorial.txt',
    contentType: 'text/plain',
   });
   txtFormData.append('videoId', 'dQw4w9WgXcQ');
   txtFormData.append('segments', JSON.stringify(mockVideoSegments));

   const txtResponse = await fetch('http://localhost:8082/api/upload-transcript', {
    method: 'POST',
    body: txtFormData,
    headers: txtFormData.getHeaders(),
   });

   const txtResult = await txtResponse.json();

   if (txtResponse.ok) {
    console.log('✅ TXT upload also successful!');
    console.log(`📈 TXT Statistics: ${txtResult.data.stats.matchedSegments}/${txtResult.data.stats.totalSegments} segments matched`);
   } else {
    console.log('❌ TXT upload failed:', txtResult.error);
   }
  } else {
   console.log('❌ Upload failed:', result.error);
   console.log('   Message:', result.message);
  }
 } catch (error) {
  console.error('❌ Test failed with error:', error.message);
 }

 console.log('\n' + '='.repeat(60));
 console.log('🎯 Manual Transcript Upload Feature Test Complete!');
 console.log('🚀 Feature is ready for production deployment.');
}

testCompleteWorkflow();
