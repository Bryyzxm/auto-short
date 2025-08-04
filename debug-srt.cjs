const fs = require('fs');
const path = require('path');

// Test the SRT splitting logic
const srtFilePath = path.join(__dirname, 'test-files', 'sample-ml-tutorial.srt');
const content = fs.readFileSync(srtFilePath, 'utf8');

console.log('Full content length:', content.length);
console.log('First 200 chars:', JSON.stringify(content.substring(0, 200)));

const blocks = content.trim().split('\n\n');
console.log(`\nSplit into ${blocks.length} blocks:`);

blocks.slice(0, 5).forEach((block, index) => {
 console.log(`\nBlock ${index + 1}:`);
 console.log('Lines:', block.split('\n').length);
 console.log('Content:', JSON.stringify(block.substring(0, 100)));
});
