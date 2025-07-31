/**
 * CUSTOM ERROR CLASSES FOR TRANSCRIPT EXTRACTION PIPELINE
 * Enhanced error handling with specific error types for better user experience
 */

// Base error class for all transcript-related errors
class NoValidTranscriptError extends Error {
 constructor(message, videoId, details = {}) {
  super(message);
  this.name = 'NoValidTranscriptError';
  this.videoId = videoId;
  this.details = details;
  this.isTranscriptError = true;
  this.userFriendly = true;
 }
}

// Specific error when transcript is too short to be useful
class TranscriptTooShortError extends NoValidTranscriptError {
 constructor(videoId, actualLength, minRequired = 250) {
  const message = `A valid transcript is not available for this video. The extracted transcript is too short (${actualLength} characters, minimum required: ${minRequired}).`;
  super(message, videoId, {
   actualLength,
   minRequired,
   reason: 'transcript_too_short',
  });
  this.name = 'TranscriptTooShortError';
 }
}

// Specific error when video owner has disabled transcripts/captions
class TranscriptDisabledError extends NoValidTranscriptError {
 constructor(videoId) {
  const message = 'A valid transcript is not available for this video. The video owner has disabled captions/transcripts.';
  super(message, videoId, {
   reason: 'transcript_disabled_by_owner',
  });
  this.name = 'TranscriptDisabledError';
 }
}

// Specific error when no transcript can be found despite trying multiple methods
class TranscriptNotFoundError extends NoValidTranscriptError {
 constructor(videoId, servicesAttempted = []) {
  const message = 'A valid transcript is not available for this video. No captions were found despite trying multiple extraction methods.';
  super(message, videoId, {
   reason: 'transcript_not_found',
   servicesAttempted,
  });
  this.name = 'TranscriptNotFoundError';
 }
}

class TranscriptExtractionError extends Error {
 constructor(message, videoId, details = {}) {
  super(message);
  this.name = 'TranscriptExtractionError';
  this.videoId = videoId;
  this.details = details;
  this.isTranscriptError = true;
  this.userFriendly = false; // Technical error, not user-facing
 }
}

/**
 * ENHANCED TRANSCRIPT VALIDATOR
 * Validates transcript quality and length before processing
 */
class TranscriptValidator {
 static validate(transcriptData, videoId, minLength = 250) {
  // Check if transcript data exists
  if (!transcriptData) {
   throw new TranscriptNotFoundError(videoId, ['all_services']);
  }

  // Check if segments exist
  if (!transcriptData.segments || !Array.isArray(transcriptData.segments) || transcriptData.segments.length === 0) {
   throw new TranscriptNotFoundError(videoId, ['all_services']);
  }

  // Calculate full text length
  const fullText = transcriptData.segments
   .map((s) => s.text || '')
   .join(' ')
   .trim();

  // Check if transcript is too short
  if (fullText.length < minLength) {
   throw new TranscriptTooShortError(videoId, fullText.length, minLength);
  }

  // Check if segments have meaningful content
  const meaningfulSegments = transcriptData.segments.filter((s) => s.text && s.text.trim().length > 5);

  if (meaningfulSegments.length < 3) {
   throw new TranscriptTooShortError(videoId, fullText.length, minLength);
  }

  console.log(`[TRANSCRIPT-VALIDATOR] ✅ Validation passed: ${fullText.length} chars, ${meaningfulSegments.length} meaningful segments`);

  return {
   isValid: true,
   fullText,
   meaningfulSegments: meaningfulSegments.length,
   totalLength: fullText.length,
  };
 }

 static isDisabledError(error) {
  const message = error.message.toLowerCase();
  const disabledPatterns = [
   'transcript is disabled',
   'transcripts disabled',
   'captions disabled',
   'no transcript available',
   'no captions available',
   'disabled by owner',
   'captions disabled',
   'subtitles disabled',
   'transcript disabled on this video',
   'transcript is disabled on this video',
   '🚨 transcript is disabled',
   'disabled on this video',
   'no transcript available - all extraction methods failed',
   'may not have captions or may be restricted',
   'this video may not have captions',
  ];

  return disabledPatterns.some((pattern) => message.includes(pattern));
 }

 static isNotFoundError(error) {
  const message = error.message.toLowerCase();
  return message.includes('not found') || message.includes('unavailable') || message.includes('no subtitles') || message.includes('no caption');
 }
}

module.exports = {
    NoValidTranscriptError,
    TranscriptTooShortError,
    TranscriptDisabledError,
    TranscriptNotFoundError,
    TranscriptExtractionError,
    TranscriptValidator,
};
