/**
 * UNIT TESTS FOR SPECIFIC TRANSCRIPT CLEANING FUNCTIONS
 *
 * Focused unit tests for individual cleaning methods
 * to verify specific edge cases and requirements.
 */

const TranscriptCleaner = require('../backend/utils/transcriptCleaner');

describe('TranscriptCleaner Unit Tests', () => {
 describe('removeTimestampTags', () => {
  test('should remove various timestamp formats', () => {
   const input = 'Text <00:13:40.440> with <01:15:20> timestamps [00:30:15] and {02:45:30}';
   const expected = 'Text  with  timestamps  and ';
   const result = TranscriptCleaner.removeTimestampTags(input);
   expect(result).toBe(expected);
  });

  test('should handle edge case with no timestamps', () => {
   const input = 'Clean text without any timestamps';
   const result = TranscriptCleaner.removeTimestampTags(input);
   expect(result).toBe(input);
  });
 });

 describe('removeStyleTags', () => {
  test('should remove VTT style tags', () => {
   const input = 'Text with <c>colored</c> and <c.red>red colored</c> text';
   const expected = 'Text with colored and red colored text';
   const result = TranscriptCleaner.removeStyleTags(input);
   expect(result).toBe(expected);
  });

  test('should remove voice tags', () => {
   const input = '<v Speaker1>Hello there</v> and <v Speaker2>How are you?</v>';
   const expected = 'Hello there and How are you?';
   const result = TranscriptCleaner.removeStyleTags(input);
   expect(result).toBe(expected);
  });
 });

 describe('compressRepetitions', () => {
  test('should compress repeated affirmations', () => {
   const input = 'Iya. Iya. Iya. Benar sekali.';
   const expected = 'Iya. Benar sekali.';
   const result = TranscriptCleaner.compressRepetitions(input);
   expect(result).toBe(expected);
  });

  test('should preserve meaningful repetitions', () => {
   const input = 'We need to go. We need to go now.';
   const result = TranscriptCleaner.compressRepetitions(input);
   expect(result).toBe(input); // Should not be compressed
  });
 });

 describe('validateCleanedText', () => {
  test('should validate good text', () => {
   const input = 'This is a good quality transcript text with meaningful content.';
   const result = TranscriptCleaner.validateCleanedText(input);
   expect(result.isValid).toBe(true);
   expect(result.wordCount).toBeGreaterThan(5);
  });

  test('should reject text that is too short', () => {
   const input = 'Too short';
   const result = TranscriptCleaner.validateCleanedText(input);
   expect(result.isValid).toBe(false);
   expect(result.reason).toContain('too short');
  });

  test('should detect remaining artifacts', () => {
   const input = 'Text with remaining <tags> and {artifacts}';
   const result = TranscriptCleaner.validateCleanedText(input);
   expect(result.isValid).toBe(false);
   expect(result.reason).toContain('artifacts');
  });
 });

 describe('Full cleaning integration', () => {
  test('should handle Indonesian example from requirements', () => {
   const input = 'Kadang lupa dompet kan? Iya. Iya. Iya. Ini<00:13:40.440><c> enggak</c> pernah lupa kan? Ini selalu kita bawa ke mana-mana. <v Speaker>So what we do is</v> we basically HP';
   const expected = 'Kadang lupa dompet kan? Iya. Ini enggak pernah lupa kan? Ini selalu kita bawa ke mana-mana. So what we do is we basically HP.';

   const result = TranscriptCleaner.cleanTranscriptText(input);

   // Check key requirements
   expect(result).not.toContain('<');
   expect(result).not.toContain('>');
   expect(result).not.toContain('00:13:40');
   expect(result).toContain('enggak');
   expect(result).toContain('So what we do is');

   // Check repetition compression
   expect(result.match(/Iya\./g) || []).toHaveLength(1);

   console.log('Input:', input);
   console.log('Output:', result);
  });

  test('should handle complex VTT content', () => {
   const input = `WEBVTT
Kind: captions
Language: en

NOTE
This is a test

00:00:01.000 --> 00:00:05.000
<c.yellow>Hello</c> world! This is a <b>test</b>.

00:00:05.000 --> 00:00:10.000
<v Narrator>Another line</v> with {position:50%} positioning.`;

   const result = TranscriptCleaner.cleanTranscriptText(input);

   expect(result).not.toContain('WEBVTT');
   expect(result).not.toContain('Kind:');
   expect(result).not.toContain('NOTE');
   expect(result).not.toContain('00:00:01');
   expect(result).not.toContain('<c.yellow>');
   expect(result).not.toContain('<v Narrator>');
   expect(result).not.toContain('{position:50%}');

   expect(result).toContain('Hello world');
   expect(result).toContain('Another line');

   console.log('VTT Input:', input);
   console.log('VTT Output:', result);
  });
 });
});

// Export test functions for manual testing
module.exports = {
 runManualTests: () => {
  console.log('🧪 RUNNING MANUAL TRANSCRIPT CLEANING TESTS\n');

  // Test Indonesian example
  const indonesianInput = 'Kadang lupa dompet kan? Iya. Iya. Iya. Ini<00:13:40.440><c> enggak</c> pernah lupa kan?';
  const indonesianOutput = TranscriptCleaner.cleanTranscriptText(indonesianInput);

  console.log('📝 Indonesian Test:');
  console.log('Input:', indonesianInput);
  console.log('Output:', indonesianOutput);
  console.log('Valid:', TranscriptCleaner.validateCleanedText(indonesianOutput));
  console.log('');

  // Test VTT complex
  const vttInput = `WEBVTT

00:01:30.500 --> 00:01:35.000
<c.blue>This</c> is <b>complex</b> VTT content with <i>formatting</i>.`;

  const vttOutput = TranscriptCleaner.cleanTranscriptText(vttInput);

  console.log('📝 VTT Test:');
  console.log('Input:', vttInput);
  console.log('Output:', vttOutput);
  console.log('Valid:', TranscriptCleaner.validateCleanedText(vttOutput));
  console.log('');

  // Test segments
  const testSegments = [
   {text: 'Segment with <c>tags</c> and <00:15:30> timestamps', start: 0, end: 10},
   {text: 'Clean segment without issues', start: 10, end: 20},
   {text: '<v Speaker>Voice tagged content</v> here', start: 20, end: 30},
  ];

  const cleanedSegments = TranscriptCleaner.cleanTranscriptSegments(testSegments);

  console.log('📝 Segments Test:');
  console.log('Input segments:', testSegments.length);
  console.log('Output segments:', cleanedSegments.length);
  cleanedSegments.forEach((seg, i) => {
   console.log(`  ${i + 1}: "${seg.text}"`);
  });

  return true;
 },
};

// Run manual tests if called directly
if (require.main === module) {
 module.exports.runManualTests();
}
