/**
 * COMPREHENSIVE TEST SUITE FOR TRANSCRIPT CLEANING & DURATION MANAGEMENT
 *
 * Tests both transcript text cleaning and segment duration enforcement
 * to ensure production-ready quality and compliance.
 */

const TranscriptCleaner = require('../backend/utils/transcriptCleaner');
const SegmentDurationManager = require('../backend/utils/segmentDurationManager');

// Test data for transcript cleaning
const testTranscriptSamples = {
 // Raw transcript with VTT tags, timestamps, and metadata
 rawVTTSample: `WEBVTT
Kind: captions
Language: id

00:13:40.440 --> 00:13:45.880
Kadang lupa dompet kan? Iya. Iya. Iya. Ini<00:13:40.440><c> enggak</c> pernah lupa kan?

00:13:45.880 --> 00:13:52.320
<c.red>Ini selalu</c> kita bawa ke mana-mana. <v Speaker>So what we do is</v> we basically HP`,

 // SRT format with sequence numbers
 rawSRTSample: `1
00:00:10,500 --> 00:00:15,000
Hello world! This is<c> a test</c> {position:50%} sentence.

2
00:00:15,000 --> 00:00:20,000
Another <b>sentence</b> with [00:15:30] timestamps and <i>formatting</i>.`,

 // Expected clean outputs
 expectedVTTClean: 'Kadang lupa dompet kan? Iya. Ini enggak pernah lupa kan? Ini selalu kita bawa ke mana-mana. So what we do is we basically HP',
 expectedSRTClean: 'Hello world! This is a test sentence. Another sentence with timestamps and formatting.',
};

// Test data for duration management
const testSegmentSamples = {
 // Mix of short, good, and long segments
 mixedDurationSegments: [
  {id: 'seg1', start: 0, end: 15, duration: 15, text: 'Short segment 1', title: 'Short 1'},
  {id: 'seg2', start: 15, end: 25, duration: 10, text: 'Very short segment', title: 'Short 2'},
  {id: 'seg3', start: 25, end: 85, duration: 60, text: 'Good segment', title: 'Good Segment'},
  {id: 'seg4', start: 85, end: 95, duration: 10, text: 'Another short', title: 'Short 3'},
  {id: 'seg5', start: 95, end: 155, duration: 60, text: 'Another good segment', title: 'Good 2'},
  {id: 'seg6', start: 155, end: 385, duration: 230, text: 'Very long segment that needs splitting', title: 'Long Segment'},
 ],

 // Edge case: All segments too short
 allShortSegments: [
  {id: 'short1', start: 0, end: 20, duration: 20, text: 'Short 1', title: 'Short 1'},
  {id: 'short2', start: 20, end: 35, duration: 15, text: 'Short 2', title: 'Short 2'},
  {id: 'short3', start: 35, end: 55, duration: 20, text: 'Short 3', title: 'Short 3'},
 ],
};

class TranscriptDurationTestSuite {
 static async runAllTests() {
  console.log('🧪 STARTING COMPREHENSIVE TRANSCRIPT & DURATION TEST SUITE\n');

  const results = {
   transcriptCleaning: this.testTranscriptCleaning(),
   durationManagement: this.testDurationManagement(),
   integrationTests: this.testIntegration(),
   edgeCases: this.testEdgeCases(),
  };

  // Summary
  console.log('\n📊 TEST SUMMARY:');
  Object.entries(results).forEach(([category, result]) => {
   const status = result.passed ? '✅' : '❌';
   console.log(`${status} ${category}: ${result.passed ? 'PASSED' : 'FAILED'}`);
   if (!result.passed) {
    console.log(`   Errors: ${result.errors.join(', ')}`);
   }
  });

  const allPassed = Object.values(results).every((r) => r.passed);
  console.log(`\n🎯 OVERALL RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  return allPassed;
 }

 static testTranscriptCleaning() {
  console.log('🧹 TESTING TRANSCRIPT CLEANING...');
  const errors = [];

  try {
   // Test 1: VTT cleaning
   const cleanedVTT = TranscriptCleaner.cleanTranscriptText(testTranscriptSamples.rawVTTSample);
   console.log(`📝 VTT Input: "${testTranscriptSamples.rawVTTSample.substring(0, 100)}..."`);
   console.log(`✨ VTT Output: "${cleanedVTT}"`);

   if (!cleanedVTT.includes('Kadang lupa dompet kan?')) {
    errors.push('VTT cleaning failed - missing expected content');
   }

   if (cleanedVTT.includes('<') || cleanedVTT.includes('>') || cleanedVTT.includes('WEBVTT')) {
    errors.push('VTT cleaning failed - still contains tags/metadata');
   }

   // Test 2: SRT cleaning
   const cleanedSRT = TranscriptCleaner.cleanTranscriptText(testTranscriptSamples.rawSRTSample);
   console.log(`📝 SRT Output: "${cleanedSRT}"`);

   if (cleanedSRT.includes('<') || cleanedSRT.includes('[') || /^\d+$/.test(cleanedSRT)) {
    errors.push('SRT cleaning failed - still contains formatting/numbers');
   }

   // Test 3: Segment cleaning
   const testSegments = [
    {text: 'Test <c>with</c> tags <00:15:30> and {position:50%} metadata', start: 0, end: 10},
    {text: 'Clean text here', start: 10, end: 20},
   ];

   const cleanedSegments = TranscriptCleaner.cleanTranscriptSegments(testSegments);
   console.log(`📊 Segment cleaning: ${testSegments.length} → ${cleanedSegments.length} segments`);

   if (cleanedSegments[0].text.includes('<') || cleanedSegments[0].text.includes('{')) {
    errors.push('Segment cleaning failed - tags still present');
   }

   console.log('✅ Transcript cleaning tests completed\n');
  } catch (error) {
   errors.push(`Transcript cleaning error: ${error.message}`);
  }

  return {passed: errors.length === 0, errors};
 }

 static testDurationManagement() {
  console.log('⏱️ TESTING DURATION MANAGEMENT...');
  const errors = [];

  try {
   // Test 1: Mixed duration segments
   const mixedResult = SegmentDurationManager.validateAndFixSegmentDurations(testSegmentSamples.mixedDurationSegments);

   console.log('📊 Mixed segments test:');
   console.log(`   Input: ${testSegmentSamples.mixedDurationSegments.length} segments`);
   console.log(`   Output: ${mixedResult.segments.length} segments`);
   console.log(`   Compliance: ${mixedResult.statistics.final.complianceRate}%`);
   console.log(`   Short segments fixed: ${mixedResult.statistics.improvements.shortSegmentsFixed}`);

   // Verify no segments under 30s
   const shortSegments = mixedResult.segments.filter((s) => SegmentDurationManager.calculateDuration(s) < 29.5);

   if (shortSegments.length > 0) {
    errors.push(`Duration management failed - ${shortSegments.length} segments still under 30s`);
   }

   // Test 2: All short segments
   const allShortResult = SegmentDurationManager.validateAndFixSegmentDurations(testSegmentSamples.allShortSegments);

   console.log('\n📊 All short segments test:');
   console.log(`   Input: ${testSegmentSamples.allShortSegments.length} segments`);
   console.log(`   Output: ${allShortResult.segments.length} segments`);
   console.log(`   Compliance: ${allShortResult.statistics.final.complianceRate}%`);

   // Test 3: Edge case - empty segments
   const emptyResult = SegmentDurationManager.validateAndFixSegmentDurations([]);
   if (emptyResult.segments.length !== 0) {
    errors.push('Empty segments test failed');
   }

   // Test 4: Single short segment
   const singleShortResult = SegmentDurationManager.validateAndFixSegmentDurations([{id: 'single', start: 0, end: 20, duration: 20, text: 'Single short segment', title: 'Single'}]);

   console.log(`\n📊 Single short segment: compliance ${singleShortResult.statistics.final.complianceRate}%`);

   console.log('✅ Duration management tests completed\n');
  } catch (error) {
   errors.push(`Duration management error: ${error.message}`);
  }

  return {passed: errors.length === 0, errors};
 }

 static testIntegration() {
  console.log('🔗 TESTING INTEGRATION...');
  const errors = [];

  try {
   // Test full pipeline: dirty transcript → clean → duration fix
   const dirtySegments = [
    {
     text: 'Test <c>with</c> {position:50%} tags and <00:15:30> metadata',
     start: 0,
     end: 15,
     duration: 15,
    },
    {
     text: 'Another <b>short</b> segment [00:20:00] here',
     start: 15,
     end: 25,
     duration: 10,
    },
    {
     text: 'This is a proper length segment with good content',
     start: 25,
     end: 85,
     duration: 60,
    },
   ];

   console.log('🔄 Full pipeline test:');
   console.log(`   Input: ${dirtySegments.length} dirty segments`);

   // Step 1: Clean
   const cleanedSegments = TranscriptCleaner.cleanTranscriptSegments(dirtySegments);
   console.log(`   After cleaning: ${cleanedSegments.length} segments`);

   // Step 2: Fix durations
   const durationResult = SegmentDurationManager.validateAndFixSegmentDurations(cleanedSegments);
   console.log(`   After duration fix: ${durationResult.segments.length} segments`);
   console.log(`   Final compliance: ${durationResult.statistics.final.complianceRate}%`);

   // Verify final result
   const finalSegments = durationResult.segments;

   // Check for clean text
   const hasCleanText = finalSegments.every((s) => !s.text.includes('<') && !s.text.includes('{') && !s.text.includes('['));

   if (!hasCleanText) {
    errors.push('Integration test failed - text not properly cleaned');
   }

   // Check for duration compliance
   const hasGoodDurations = finalSegments.every((s) => SegmentDurationManager.calculateDuration(s) >= 29.5);

   if (!hasGoodDurations) {
    errors.push('Integration test failed - duration compliance not achieved');
   }

   console.log('✅ Integration tests completed\n');
  } catch (error) {
   errors.push(`Integration error: ${error.message}`);
  }

  return {passed: errors.length === 0, errors};
 }

 static testEdgeCases() {
  console.log('🎯 TESTING EDGE CASES...');
  const errors = [];

  try {
   // Test 1: Empty text cleaning
   const emptyClean = TranscriptCleaner.cleanTranscriptText('');
   if (emptyClean !== '') {
    errors.push('Empty text cleaning failed');
   }

   // Test 2: Only tags text
   const onlyTags = TranscriptCleaner.cleanTranscriptText('<c>test</c><00:15:30>{position:50%}');
   console.log(`📝 Tags-only input cleaned to: "${onlyTags}"`);

   // Test 3: Very long segment
   const veryLongSegment = {
    id: 'long',
    start: 0,
    end: 500,
    duration: 500,
    text: 'This is a very long segment that should be split into smaller pieces. '.repeat(20),
    title: 'Very Long Segment',
   };

   const longResult = SegmentDurationManager.validateAndFixSegmentDurations([veryLongSegment]);
   console.log(`📊 Very long segment split into: ${longResult.segments.length} segments`);

   if (longResult.segments.length === 1) {
    errors.push('Long segment splitting failed');
   }

   // Test 4: Invalid segment data
   const invalidSegments = [{id: 'invalid1', start: 'invalid', end: 10, text: 'test'}, {id: 'invalid2', start: 0, end: 'invalid', text: 'test'}, null, undefined];

   try {
    const invalidResult = SegmentDurationManager.validateAndFixSegmentDurations(invalidSegments);
    console.log(`📊 Invalid segments handled: ${invalidResult.segments.length} valid segments`);
   } catch (e) {
    // Expected to handle gracefully
   }

   console.log('✅ Edge case tests completed\n');
  } catch (error) {
   errors.push(`Edge case error: ${error.message}`);
  }

  return {passed: errors.length === 0, errors};
 }

 // Helper method to run specific test
 static async runSpecificTest(testName) {
  console.log(`🧪 RUNNING SPECIFIC TEST: ${testName}\n`);

  switch (testName) {
   case 'cleaning':
    return this.testTranscriptCleaning();
   case 'duration':
    return this.testDurationManagement();
   case 'integration':
    return this.testIntegration();
   case 'edge':
    return this.testEdgeCases();
   default:
    console.log('❌ Unknown test name. Available: cleaning, duration, integration, edge');
    return {passed: false, errors: ['Unknown test']};
  }
 }
}

// Export for use in other test files
module.exports = TranscriptDurationTestSuite;

// Run tests if called directly
if (require.main === module) {
 console.log('🚀 Running transcript and duration tests...\n');

 // Check command line arguments
 const testName = process.argv[2];

 if (testName) {
  TranscriptDurationTestSuite.runSpecificTest(testName);
 } else {
  TranscriptDurationTestSuite.runAllTests();
 }
}
