/**
 * FINAL VERIFICATION SCRIPT
 *
 * Comprehensive test to verify:
 * 1. Transcript cleaning removes all VTT/SRT tags and metadata
 * 2. Duration management ensures 30s minimum for all segments
 * 3. Integration works correctly in the full pipeline
 */

const TranscriptCleaner = require('../backend/utils/transcriptCleaner.js');
const SegmentDurationManager = require('../backend/utils/segmentDurationManager.js');

console.log('🔍 FINAL VERIFICATION STARTED\n');

// ===========================================
// TEST 1: TRANSCRIPT CLEANING VERIFICATION
// ===========================================

console.log('📝 TESTING TRANSCRIPT CLEANING...');

// Indonesian example from user requirements
const indonesianVTT = `WEBVTT
Kind: captions
Language: id

00:13:40.440 --> 00:13:45.880
Kadang lupa dompet kan? Iya. Iya. Iya. Ini<00:13:40.440><c> enggak</c> pernah lupa kan?

00:13:45.880 --> 00:13:52.320
Ini selalu kita bawa ke mana-mana. So what we do is we basically HP.`;

const complexSRT = `1
00:00:10,500 --> 00:00:15,000
<font color="red">Hello world!</font> This is a test sentence.

2
00:00:15,000 --> 00:00:20,000
Another sentence with <b>timestamps</b> and formatting.

3
[Music]
00:00:20,000 --> 00:00:25,000
Text with sound effects [Applause] and background noise.`;

console.log('Input VTT (Indonesian):');
console.log(indonesianVTT);
console.log('\nCleaned output:');
const cleanedIndonesian = TranscriptCleaner.cleanTranscriptText(indonesianVTT);
console.log('"' + cleanedIndonesian + '"');

console.log('\nInput SRT (Complex):');
console.log(complexSRT);
console.log('\nCleaned output:');
const cleanedSRT = TranscriptCleaner.cleanTranscriptText(complexSRT);
console.log('"' + cleanedSRT + '"');

// Verify cleaning worked
const hasTimestamps = cleanedIndonesian.includes('-->') || cleanedIndonesian.includes(',');
const hasTags = cleanedIndonesian.includes('<') || cleanedIndonesian.includes('[');
const hasNumbers = /^\d+$/.test(cleanedIndonesian.split('\n')[0]);

console.log('\n✅ CLEANING VERIFICATION:');
console.log(`   Timestamps removed: ${!hasTimestamps ? '✅' : '❌'}`);
console.log(`   Tags removed: ${!hasTags ? '✅' : '❌'}`);
console.log(`   Clean text output: ${cleanedIndonesian.length > 20 ? '✅' : '❌'}`);

// ===========================================
// TEST 2: DURATION MANAGEMENT VERIFICATION
// ===========================================

console.log('\n⏱️ TESTING DURATION MANAGEMENT...');

// Test case 1: Mixed segments with some under 30s
const testSegments = [
 {id: 1, start: 0, end: 15, duration: 15, text: 'Short segment 1'},
 {id: 2, start: 15, end: 25, duration: 10, text: 'Very short segment'},
 {id: 3, start: 25, end: 85, duration: 60, text: 'Good length segment'},
 {id: 4, start: 85, end: 95, duration: 10, text: 'Another short'},
 {id: 5, start: 95, end: 145, duration: 50, text: 'Another good segment'},
];

console.log('\nInput segments:');
testSegments.forEach((s) => {
 console.log(`   ${s.id}: ${s.duration}s - "${s.text}"`);
});

const result = SegmentDurationManager.validateAndFixSegmentDurations(testSegments);

console.log('\nOutput segments:');
result.segments.forEach((s, i) => {
 console.log(`   ${i + 1}: ${s.duration}s - "${s.text.substring(0, 50)}${s.text.length > 50 ? '...' : ''}"`);
});

console.log('\n✅ DURATION VERIFICATION:');
const allMeetMinimum = result.segments.every((s) => s.duration >= 30);
console.log(`   All segments >= 30s: ${allMeetMinimum ? '✅' : '❌'}`);
console.log(`   Segments extended (no merging): ${result.statistics.improvements.shortSegmentsFixed}`);
console.log(`   Processing mode: ${result.statistics.improvements.processingMode || 'extension_only'}`);
console.log(`   Final compliance: ${result.statistics.final.complianceRate}%`);

// Test case 2: Single isolated short segment
console.log('\n🔧 TESTING ISOLATED SHORT SEGMENT...');
const isolatedSegment = [{id: 1, start: 0, end: 20, duration: 20, text: 'Isolated short segment that cannot be merged'}];

const isolatedResult = SegmentDurationManager.validateAndFixSegmentDurations(isolatedSegment);
console.log(`Input: ${isolatedSegment[0].duration}s`);
console.log(`Output: ${isolatedResult.segments[0].duration}s`);
console.log(`Extended: ${isolatedResult.segments[0].isExtended ? '✅' : '❌'}`);

// ===========================================
// TEST 3: FULL PIPELINE INTEGRATION
// ===========================================

console.log('\n🔄 TESTING FULL PIPELINE INTEGRATION...');

// Simulate dirty segments with short durations
const dirtySegments = [
 {
  id: 1,
  start: 0,
  end: 25,
  duration: 25,
  text: `WEBVTT

00:00:00.000 --> 00:00:25.000
Kadang lupa dompet kan? <c>Iya</c>. [MUSIC] Background noise.`,
 },
 {
  id: 2,
  start: 25,
  end: 35,
  duration: 10,
  text: `2
00:00:25,000 --> 00:00:35,000
<font color="red">Short segment</font> with formatting.`,
 },
 {
  id: 3,
  start: 35,
  end: 95,
  duration: 60,
  text: 'This is a clean segment with good duration.',
 },
];

console.log('STEP 1: Clean transcript text...');
const cleanedSegments = dirtySegments.map((segment) => ({
 ...segment,
 text: TranscriptCleaner.cleanTranscriptText(segment.text),
}));

console.log('STEP 2: Fix segment durations...');
const finalResult = SegmentDurationManager.validateAndFixSegmentDurations(cleanedSegments);

console.log('\n📊 FINAL PIPELINE RESULTS:');
console.log(`Input segments: ${dirtySegments.length}`);
console.log(`Output segments: ${finalResult.segments.length}`);
console.log(`All text cleaned: ${finalResult.segments.every((s) => !s.text.includes('<') && !s.text.includes('-->')) ? '✅' : '❌'}`);
console.log(`All durations >= 30s: ${finalResult.segments.every((s) => s.duration >= 30) ? '✅' : '❌'}`);

console.log('\nFinal segments:');
finalResult.segments.forEach((segment, i) => {
 console.log(`   ${i + 1}: ${segment.duration.toFixed(1)}s`);
 console.log(`      Text: "${segment.text.substring(0, 80)}${segment.text.length > 80 ? '...' : ''}"`);
 console.log(`      Clean: ${!segment.text.includes('<') && !segment.text.includes('-->') ? '✅' : '❌'}`);
 console.log(`      Duration OK: ${segment.duration >= 30 ? '✅' : '❌'}`);
});

// ===========================================
// FINAL SUMMARY
// ===========================================

console.log('\n🎯 FINAL VERIFICATION SUMMARY:');

const cleaningWorks = !cleanedIndonesian.includes('<') && !cleanedIndonesian.includes('-->');
const durationWorks = result.segments.every((s) => s.duration >= 30);
const isolatedWorks = isolatedResult.segments[0].duration >= 30;
const pipelineWorks = finalResult.segments.every((s) => s.duration >= 30 && !s.text.includes('<'));

console.log(`✅ Transcript Cleaning: ${cleaningWorks ? 'PASSED' : 'FAILED'}`);
console.log(`✅ Duration Management: ${durationWorks ? 'PASSED' : 'FAILED'}`);
console.log(`✅ Isolated Segment Fix: ${isolatedWorks ? 'PASSED' : 'FAILED'}`);
console.log(`✅ Full Pipeline Integration: ${pipelineWorks ? 'PASSED' : 'FAILED'}`);

const allTestsPassed = cleaningWorks && durationWorks && isolatedWorks && pipelineWorks;
console.log(`\n🏆 OVERALL RESULT: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

if (allTestsPassed) {
 console.log('\n🎉 SUCCESS: Both transcript cleaning and duration enforcement are working correctly!');
 console.log('   • VTT/SRT tags and metadata are properly removed');
 console.log('   • All segments meet the 30-second minimum requirement');
 console.log('   • Isolated short segments are extended automatically');
 console.log('   • Full pipeline integration works seamlessly');
} else {
 console.log('\n⚠️ Some issues detected. Please review the output above.');
}

console.log('\n🔍 FINAL VERIFICATION COMPLETED');
