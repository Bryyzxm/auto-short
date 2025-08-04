const {parseTranscriptFile} = require('./backend/services/transcriptParser.js');
const fs = require('fs');
const path = require('path');

// Test the parser directly
const srtFilePath = path.join(__dirname, 'test-files', 'sample-ml-tutorial.srt');
const srtContent = fs.readFileSync(srtFilePath);

console.log('Testing SRT parser...');
console.log(`File size: ${srtContent.length} bytes`);

try {
 const segments = parseTranscriptFile(srtContent, 'sample-ml-tutorial.srt', 'application/x-subrip');
 console.log(`✅ Parsed ${segments.length} segments:`);
 segments.forEach((segment, index) => {
  console.log(`${index + 1}. ${segment.start}s - ${segment.end}s: "${segment.text.substring(0, 50)}..."`);
 });
} catch (error) {
 console.error('❌ Parser error:', error.message);
}
