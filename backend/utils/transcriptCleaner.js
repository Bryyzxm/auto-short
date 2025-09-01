/**
 * TRANSCRIPT TEXT CLEANER UTILITY
 *
 * Professional-grade text cleaning for transcript processing.
 * Removes all tags, timestamps, metadata, and normalizes text output.
 *
 * Features:
 * - Remove VTT/SRT tags and cue markers
 * - Strip timestamp markers and metadata
 * - Normalize spacing and punctuation
 * - Handle compressed repetitions
 * - Preserve meaning and sentence structure
 * - Support multiple transcript formats
 */

class TranscriptCleaner {
 /**
  * MAIN CLEANING METHOD
  * Comprehensive cleaning for raw transcript text
  */
 static cleanTranscriptText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
   return '';
  }

  let cleanedText = rawText;

  // STEP 1: Remove timestamp tags and cue markers
  cleanedText = this.removeTimestampTags(cleanedText);

  // STEP 2: Remove VTT/SRT style tags
  cleanedText = this.removeStyleTags(cleanedText);

  // STEP 3: Remove metadata and positioning
  cleanedText = this.removeMetadata(cleanedText);

  // STEP 4: Normalize spacing and punctuation
  cleanedText = this.normalizeText(cleanedText);

  // STEP 5: Compress repetitions (optional)
  cleanedText = this.compressRepetitions(cleanedText);

  // STEP 6: Final cleanup
  cleanedText = this.finalCleanup(cleanedText);

  return cleanedText.trim();
 }

 /**
  * Remove all timestamp markers and cue indicators
  * Handles: <00:13:40.440>, [00:13:40], {00:13:40}, etc.
  */
 static removeTimestampTags(text) {
  return (
   text
    // Remove timestamp tags like <00:13:40.440>
    .replace(/<\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?>/g, '')
    // Remove bracket timestamps [00:13:40]
    .replace(/\[\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?\]/g, '')
    // Remove curly brace timestamps {00:13:40}
    .replace(/\{\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?\}/g, '')
    // Remove parenthesis timestamps (00:13:40)
    .replace(/\(\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?\)/g, '')
    // Remove simple MM:SS timestamps when standalone
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    // Remove cue sequence numbers
    .replace(/^\d+\s*$/gm, '')
    // Remove arrow indicators
    .replace(/-->/g, '')
  );
 }

 /**
  * Remove VTT style tags and markup
  * Handles: <c>, <c.color>, <v Speaker>, etc.
  */
 static removeStyleTags(text) {
  return (
   text
    // Remove all VTT style tags <c>, <c.className>, etc.
    .replace(/<\/?[cv]([^>]*)>/g, '')
    // Remove other common VTT tags
    .replace(/<\/?[bil]>/g, '')
    // Remove voice/speaker tags
    .replace(/<v\s+[^>]*>/g, '')
    // Remove any remaining HTML-like tags
    .replace(/<[^>]*>/g, '')
    // Remove CSS-style positioning
    .replace(/\{[^}]*\}/g, '')
  );
 }

 /**
  * Remove metadata and positioning information
  */
 static removeMetadata(text) {
  return (
   text
    // Remove WEBVTT header and metadata
    .replace(/^WEBVTT.*$/gm, '')
    .replace(/^Kind:.*$/gm, '')
    .replace(/^Language:.*$/gm, '')
    .replace(/^NOTE.*$/gm, '')
    // Remove positioning info
    .replace(/position:\d+%/g, '')
    .replace(/align:(start|middle|end)/g, '')
    .replace(/line:\d+%/g, '')
    // Remove subtitle sequence indicators
    .replace(/^\d+\s*$/gm, '')
    // Remove empty lines with just whitespace
    .replace(/^\s*$/gm, '')
  );
 }

 /**
  * Normalize spacing, punctuation, and word breaks
  */
 static normalizeText(text) {
  return (
   text
    // Fix word breaks from cue splitting
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    // Fix punctuation spacing
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])\s*/g, '$1 ')
    // Fix sentence spacing
    .replace(/([.!?])\s*([A-Z])/g, '$1 $2')
    // Remove line breaks within sentences
    .replace(/([a-z])\n([a-z])/g, '$1 $2')
    // Preserve paragraph breaks
    .replace(/\n\s*\n/g, '\n\n')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
  );
 }

 /**
  * Compress obvious repetitions while preserving meaning
  * Example: "Iya. Iya. Iya." → "Iya."
  */
 static compressRepetitions(text) {
  // Compress repeated short words/phrases (be conservative)
  const repetitionPatterns = [
   // Repeated single words with punctuation
   /\b(\w{1,4})\.\s*\1\.\s*\1\./g,
   // Repeated "Ya", "Iya", "Um", etc.
   /\b(Ya|Iya|Um|Eh|Ah)\.\s*\1\.\s*(\1\.?\s*)*/gi,
   // Repeated "OK", "Right", etc.
   /\b(OK|Right|So|Well)\.\s*\1\.\s*(\1\.?\s*)*/gi,
  ];

  let compressed = text;
  repetitionPatterns.forEach((pattern) => {
   compressed = compressed.replace(pattern, '$1.');
  });

  return compressed;
 }

 /**
  * Final cleanup and validation
  */
 static finalCleanup(text) {
  return (
   text
    // Remove remaining artifacts
    .replace(/\s*[\[\]{}()]\s*/g, ' ')
    // Fix capitalization at sentence starts
    .replace(/([.!?]\s*)([a-z])/g, (match, punct, letter) => punct + letter.toUpperCase())
    // Ensure proper sentence endings
    .replace(/([a-zA-Z])\s*$/gm, '$1.')
    // Clean up multiple spaces again
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
  );
 }

 /**
  * Clean transcript segment text specifically
  * Optimized for segment-level processing
  */
 static cleanSegmentText(segmentText) {
  if (!segmentText) return '';

  const cleaned = this.cleanTranscriptText(segmentText);

  // Additional segment-specific cleaning
  return (
   cleaned
    // Ensure minimum content length
    .replace(/^\W*$/, '') // Remove segments with only punctuation
    // Fix common transcription artifacts
    .replace(/\b(um|uh|ah|er)\b/gi, '') // Remove common filler words
    .replace(/\s+/g, ' ')
    .trim()
  );
 }

 /**
  * Validate cleaned text quality
  */
 static validateCleanedText(text) {
  if (!text || text.length < 10) {
   return {isValid: false, reason: 'Text too short after cleaning'};
  }

  const wordCount = text.split(/\s+/).filter((word) => word.length > 2).length;
  if (wordCount < 3) {
   return {isValid: false, reason: 'Insufficient meaningful words'};
  }

  // Check for remaining artifacts
  const hasArtifacts = /<|>|\{|\}|\[|\]/.test(text);
  if (hasArtifacts) {
   return {isValid: false, reason: 'Contains unremoved markup artifacts'};
  }

  return {isValid: true, wordCount, length: text.length};
 }

 /**
  * Bulk clean array of transcript segments
  */
 static cleanTranscriptSegments(segments) {
  if (!Array.isArray(segments)) return [];

  return segments
   .map((segment) => ({
    ...segment,
    text: this.cleanSegmentText(segment.text),
    cleanedAt: new Date().toISOString(),
   }))
   .filter((segment) => {
    const validation = this.validateCleanedText(segment.text);
    return validation.isValid;
   });
 }
}

module.exports = TranscriptCleaner;
