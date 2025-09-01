/**
 * DURATION MANAGEMENT UNIT TESTS
 *
 * Focused tests for segment duration validation and merging logic
 */

const SegmentDurationManager = require('../backend/utils/segmentDurationManager');

describe('SegmentDurationManager Unit Tests', () => {
 describe('calculateDuration', () => {
  test('should calculate duration from start/end', () => {
   const segment = {start: 10, end: 40};
   const result = SegmentDurationManager.calculateDuration(segment);
   expect(result).toBe(30);
  });

  test('should use duration field if available', () => {
   const segment = {duration: 45, start: 10, end: 40};
   const result = SegmentDurationManager.calculateDuration(segment);
   expect(result).toBe(45);
  });

  test('should handle YouTube-style timestamps', () => {
   const segment = {startTimeSeconds: 15, endTimeSeconds: 75};
   const result = SegmentDurationManager.calculateDuration(segment);
   expect(result).toBe(60);
  });
 });

 describe('mergeSegments', () => {
  test('should merge two adjacent short segments', () => {
   const segments = [
    {id: 'seg1', start: 0, end: 15, duration: 15, text: 'First segment', title: 'First'},
    {id: 'seg2', start: 15, end: 25, duration: 10, text: 'Second segment', title: 'Second'},
   ];

   const result = SegmentDurationManager.mergeSegments(segments);

   expect(result.start).toBe(0);
   expect(result.end).toBe(25);
   expect(result.duration).toBe(25);
   expect(result.text).toContain('First segment');
   expect(result.text).toContain('Second segment');
   expect(result.isMerged).toBe(true);
   expect(result.mergedFrom).toBe(2);
  });

  test('should handle single segment merge', () => {
   const segments = [{id: 'seg1', start: 0, end: 30, duration: 30, text: 'Single segment', title: 'Single'}];

   const result = SegmentDurationManager.mergeSegments(segments);
   expect(result).toEqual(segments[0]);
  });
 });

 describe('findBestMergeCandidate', () => {
  test('should prefer next segment with smaller gap', () => {
   const segments = [
    {id: 'prev', start: 0, end: 10, duration: 10, text: 'Previous'},
    {id: 'short', start: 15, end: 25, duration: 10, text: 'Short segment'}, // 5s gap from prev
    {id: 'next', start: 26, end: 36, duration: 10, text: 'Next'}, // 1s gap to next
   ];

   const result = SegmentDurationManager.findBestMergeCandidate(segments, 1);

   expect(result.success).toBe(true);
   expect(result.type).toBe('next'); // Should prefer smaller gap
  });

  test('should handle three-way merge for multiple short segments', () => {
   const segments = [
    {id: 'short1', start: 0, end: 15, duration: 15, text: 'Short 1'},
    {id: 'short2', start: 15, end: 25, duration: 10, text: 'Short 2'},
    {id: 'short3', start: 25, end: 35, duration: 10, text: 'Short 3'},
   ];

   const result = SegmentDurationManager.findBestMergeCandidate(segments, 1);

   expect(result.success).toBe(true);
   expect(result.type).toBe('three-way');
   expect(result.startIndex).toBe(0);
   expect(result.endIndex).toBe(2);
  });
 });

 describe('calculateMergeScore', () => {
  test('should score closer to ideal duration higher', () => {
   const score1 = SegmentDurationManager.calculateMergeScore(1, 60); // 1s gap, ideal duration
   const score2 = SegmentDurationManager.calculateMergeScore(1, 120); // 1s gap, double ideal

   expect(score1).toBeGreaterThan(score2);
  });

  test('should penalize large temporal gaps', () => {
   const score1 = SegmentDurationManager.calculateMergeScore(1, 60); // 1s gap
   const score2 = SegmentDurationManager.calculateMergeScore(15, 60); // 15s gap

   expect(score1).toBeGreaterThan(score2);
  });

  test('should penalize oversized segments', () => {
   const score1 = SegmentDurationManager.calculateMergeScore(1, 60); // Normal
   const score2 = SegmentDurationManager.calculateMergeScore(1, 200); // Oversized

   expect(score1).toBeGreaterThan(score2);
  });
 });

 describe('splitOversizedSegments', () => {
  test('should split very long segment', () => {
   const segments = [
    {
     id: 'long',
     start: 0,
     end: 300,
     duration: 300,
     text: 'This is a very long segment. It has multiple sentences. It should be split into smaller pieces. More content here.',
     title: 'Long Segment',
    },
   ];

   const result = SegmentDurationManager.splitOversizedSegments(segments);

   expect(result.length).toBeGreaterThan(1);
   expect(result[0].isSplit).toBe(true);
   expect(result[1].isSplit).toBe(true);
  });

  test('should not split segments within limits', () => {
   const segments = [{id: 'good', start: 0, end: 60, duration: 60, text: 'Good segment', title: 'Good'}];

   const result = SegmentDurationManager.splitOversizedSegments(segments);

   expect(result.length).toBe(1);
   expect(result[0]).toEqual(segments[0]);
  });
 });

 describe('validateAndFixSegmentDurations - Edge Cases', () => {
  test('should handle empty array', () => {
   const result = SegmentDurationManager.validateAndFixSegmentDurations([]);

   expect(result.segments).toEqual([]);
   expect(result.statistics.initial.totalSegments).toBe(0);
   expect(result.statistics.final.totalSegments).toBe(0);
  });

  test('should handle segments with invalid durations', () => {
   const segments = [
    {id: 'invalid1', start: 'invalid', end: 10, text: 'Invalid start'},
    {id: 'invalid2', start: 0, end: 'invalid', text: 'Invalid end'},
    {id: 'valid', start: 0, end: 60, duration: 60, text: 'Valid segment', title: 'Valid'},
   ];

   const result = SegmentDurationManager.validateAndFixSegmentDurations(segments);

   // Should handle gracefully and process valid segments
   expect(result.segments.length).toBeGreaterThanOrEqual(1);
  });

  test('should achieve 30-second minimum compliance', () => {
   const shortSegments = [
    {id: 'short1', start: 0, end: 20, duration: 20, text: 'Short 1', title: 'Short 1'},
    {id: 'short2', start: 20, end: 35, duration: 15, text: 'Short 2', title: 'Short 2'},
    {id: 'short3', start: 35, end: 50, duration: 15, text: 'Short 3', title: 'Short 3'},
    {id: 'good', start: 50, end: 110, duration: 60, text: 'Good segment', title: 'Good'},
   ];

   const result = SegmentDurationManager.validateAndFixSegmentDurations(shortSegments);

   // Check that all segments meet minimum duration
   const allCompliant = result.segments.every(
    (segment) => SegmentDurationManager.calculateDuration(segment) >= 29.5 // Allow 0.5s tolerance
   );

   expect(allCompliant).toBe(true);
   expect(result.statistics.final.underMinimum).toBe(0);

   console.log('Short segments test result:');
   console.log('Input segments:', shortSegments.length);
   console.log('Output segments:', result.segments.length);
   console.log('Compliance rate:', result.statistics.final.complianceRate + '%');
   result.segments.forEach((seg, i) => {
    const duration = SegmentDurationManager.calculateDuration(seg);
    console.log(`  ${i + 1}: ${duration.toFixed(1)}s - "${seg.title}"`);
   });
  });
 });

 describe('calculateSegmentStats', () => {
  test('should calculate accurate statistics', () => {
   const segments = [
    {start: 0, end: 25, duration: 25}, // Under minimum
    {start: 25, end: 85, duration: 60}, // Good
    {start: 85, end: 95, duration: 10}, // Under minimum
    {start: 95, end: 295, duration: 200}, // Over maximum
   ];

   const stats = SegmentDurationManager.calculateSegmentStats(segments);

   expect(stats.totalSegments).toBe(4);
   expect(stats.underMinimum).toBe(2);
   expect(stats.overMaximum).toBe(1);
   expect(stats.optimal).toBe(1);
   expect(stats.complianceRate).toBe(25); // 1/4 * 100
   expect(stats.minDuration).toBe(10);
   expect(stats.maxDuration).toBe(200);
  });
 });
});

// Manual test runner
const runManualDurationTests = () => {
 console.log('🧪 RUNNING MANUAL DURATION MANAGEMENT TESTS\n');

 // Test 1: Basic short segment merging
 console.log('📊 Test 1: Basic short segment merging');
 const shortSegments = [
  {id: 'short1', start: 0, end: 20, duration: 20, text: 'First short segment', title: 'Short 1'},
  {id: 'short2', start: 20, end: 30, duration: 10, text: 'Second short segment', title: 'Short 2'},
  {id: 'good', start: 30, end: 90, duration: 60, text: 'Good length segment', title: 'Good Segment'},
 ];

 const result1 = SegmentDurationManager.validateAndFixSegmentDurations(shortSegments);
 console.log('Input:', shortSegments.length, 'segments');
 console.log('Output:', result1.segments.length, 'segments');
 console.log('Compliance:', result1.statistics.final.complianceRate + '%');
 console.log('');

 // Test 2: Very long segment splitting
 console.log('📊 Test 2: Long segment splitting');
 const longSegments = [
  {
   id: 'very-long',
   start: 0,
   end: 400,
   duration: 400,
   text: 'This is a very long segment that talks about many different topics. First topic is about technology. Second topic is about business. Third topic is about life. Fourth topic is about success.',
   title: 'Very Long Discussion',
  },
 ];

 const result2 = SegmentDurationManager.validateAndFixSegmentDurations(longSegments);
 console.log('Input:', longSegments.length, 'segments');
 console.log('Output:', result2.segments.length, 'segments');
 result2.segments.forEach((seg, i) => {
  const duration = SegmentDurationManager.calculateDuration(seg);
  console.log(`  Split ${i + 1}: ${duration.toFixed(1)}s`);
 });
 console.log('');

 // Test 3: Mixed scenario
 console.log('📊 Test 3: Mixed scenario (realistic)');
 const mixedSegments = [
  {id: 'intro', start: 0, end: 25, duration: 25, text: 'Short intro', title: 'Introduction'},
  {id: 'topic1', start: 25, end: 40, duration: 15, text: 'Brief topic 1', title: 'Topic 1'},
  {id: 'main', start: 40, end: 120, duration: 80, text: 'Main discussion content', title: 'Main Discussion'},
  {id: 'aside', start: 120, end: 135, duration: 15, text: 'Quick aside', title: 'Aside'},
  {id: 'conclusion', start: 135, end: 155, duration: 20, text: 'Brief conclusion', title: 'Conclusion'},
  {id: 'very-long', start: 155, end: 375, duration: 220, text: 'Extended detailed explanation', title: 'Long Explanation'},
 ];

 const result3 = SegmentDurationManager.validateAndFixSegmentDurations(mixedSegments);
 console.log('Input:', mixedSegments.length, 'segments');
 console.log('Output:', result3.segments.length, 'segments');
 console.log('Initial compliance:', result3.statistics.initial.complianceRate + '%');
 console.log('Final compliance:', result3.statistics.final.complianceRate + '%');
 console.log('Short segments fixed:', result3.statistics.improvements.shortSegmentsFixed);

 return true;
};

module.exports = {runManualDurationTests};

// Run manual tests if called directly
if (require.main === module) {
 runManualDurationTests();
}
