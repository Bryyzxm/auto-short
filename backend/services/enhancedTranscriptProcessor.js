/**
 * ENHANCED TRANSCRIPT PROCESSOR
 *
 * Production-ready service for processing uploaded transcript files and generating
 * intelligent video segments with AI-powered analysis.
 *
 * Features:
 * - Advanced SRT/TXT/VTT parsing with robust error handling
 * - AI-powered segmentation using enhanced AI segmenter
 * - Flexible duration constraints (20-90 seconds)
 * - Multi-format timestamp support
 * - Content validation and quality scoring
 * - Fallback mechanisms for various edge cases
 *
 * Integration Points:
 * - Works with existing manual transcript upload endpoint
 * - Integrates with enhanced AI segmenter for intelligent analysis
 * - Supports both sync and generation modes
 * - Compatible with existing frontend components
 */

const enhancedAISegmenter = require('./enhancedAISegmenter.js');

class EnhancedTranscriptProcessor {
 constructor() {
  this.supportedFormats = ['.srt', '.txt', '.vtt'];
  this.maxFileSize = 10 * 1024 * 1024; // 10MB
  this.minSegmentDuration = 20; // seconds
  this.maxSegmentDuration = 90; // seconds

  console.log('✅ [Enhanced Transcript Processor] Initialized');
 }

 /**
  * MAIN PROCESSING METHOD
  * Processes uploaded transcript file and generates intelligent segments
  */
 async processUploadedTranscript(fileBuffer, originalName, videoId, existingSegments = []) {
  try {
   console.log(`[TRANSCRIPT-PROCESSOR] 🚀 Processing ${originalName} for video ${videoId}`);

   // STEP 1: Parse the transcript file
   const transcriptSegments = this.parseTranscriptFile(fileBuffer, originalName);
   console.log(`[TRANSCRIPT-PROCESSOR] 📄 Parsed ${transcriptSegments.length} transcript segments`);

   // STEP 2: Validate transcript quality
   const validation = this.validateTranscriptQuality(transcriptSegments);
   if (!validation.isValid) {
    throw new Error(`Transcript validation failed: ${validation.reason}`);
   }

   // STEP 3: Determine processing mode
   const processingMode = existingSegments.length > 0 ? 'synchronize' : 'generate';
   console.log(`[TRANSCRIPT-PROCESSOR] 🎯 Processing mode: ${processingMode}`);

   if (processingMode === 'synchronize') {
    // Mode 1: Synchronize with existing video segments
    return await this.synchronizeWithExistingSegments(transcriptSegments, existingSegments, videoId);
   } else {
    // Mode 2: Generate new segments from transcript using AI
    return await this.generateSegmentsFromTranscript(transcriptSegments, videoId);
   }
  } catch (error) {
   console.error('[TRANSCRIPT-PROCESSOR] ❌ Processing failed:', error);
   throw error;
  }
 }

 /**
  * STEP 1: TRANSCRIPT FILE PARSING
  * Robust parsing for SRT, TXT, and VTT formats
  */
 parseTranscriptFile(fileBuffer, originalName) {
  const content = fileBuffer.toString('utf-8');
  const fileExtension = '.' + originalName.split('.').pop().toLowerCase();

  console.log(`[TRANSCRIPT-PROCESSOR] 📄 Parsing ${fileExtension} file: ${originalName}`);

  switch (fileExtension) {
   case '.srt':
    return this.parseSRT(content);
   case '.vtt':
    return this.parseVTT(content);
   case '.txt':
    return this.parseTXT(content);
   default:
    throw new Error(`Unsupported file format: ${fileExtension}`);
  }
 }

 /**
  * Enhanced SRT Parser with robust error handling
  */
 parseSRT(content) {
  const segments = [];
  const lines = content.split(/\r?\n/);

  let currentSegment = null;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
   const line = lines[lineIndex].trim();

   // Skip empty lines
   if (!line) {
    lineIndex++;
    continue;
   }

   // Check if this is a sequence number (should be a number)
   if (/^\d+$/.test(line)) {
    // Save previous segment if exists
    if (currentSegment && currentSegment.text) {
     segments.push(currentSegment);
    }

    // Start new segment
    currentSegment = {
     index: parseInt(line),
     text: '',
    };
    lineIndex++;

    // Next line should be timestamp
    if (lineIndex < lines.length) {
     const timestampLine = lines[lineIndex].trim();
     const timestamps = this.parseTimestampLine(timestampLine);

     if (timestamps) {
      currentSegment.start = timestamps.start;
      currentSegment.end = timestamps.end;
      lineIndex++;
     } else {
      console.warn(`[SRT-PARSER] Invalid timestamp: ${timestampLine}`);
      currentSegment = null;
      continue;
     }
    }
   } else if (currentSegment) {
    // This is transcript text
    if (currentSegment.text) {
     currentSegment.text += ' ';
    }
    currentSegment.text += line;
    lineIndex++;
   } else {
    // Orphaned text line, skip
    lineIndex++;
   }
  }

  // Add final segment
  if (currentSegment && currentSegment.text) {
   segments.push(currentSegment);
  }

  console.log(`[SRT-PARSER] ✅ Successfully parsed ${segments.length} SRT segments`);
  return segments;
 }

 /**
  * Enhanced VTT Parser
  */
 parseVTT(content) {
  const segments = [];
  const lines = content.split(/\r?\n/);

  let inHeader = true;
  let currentSegment = null;

  for (let i = 0; i < lines.length; i++) {
   const line = lines[i].trim();

   // Skip header
   if (inHeader) {
    if (line.startsWith('WEBVTT')) {
     continue;
    } else if (line === '') {
     inHeader = false;
     continue;
    } else if (line.startsWith('NOTE') || line.startsWith('STYLE')) {
     continue;
    }
   }

   // Skip empty lines
   if (!line) {
    if (currentSegment && currentSegment.text) {
     segments.push(currentSegment);
     currentSegment = null;
    }
    continue;
   }

   // Check for timestamp line (contains -->)
   if (line.includes('-->')) {
    // Save previous segment
    if (currentSegment && currentSegment.text) {
     segments.push(currentSegment);
    }

    // Parse new timestamp
    const timestamps = this.parseTimestampLine(line);
    if (timestamps) {
     currentSegment = {
      start: timestamps.start,
      end: timestamps.end,
      text: '',
     };
    }
   } else if (currentSegment) {
    // This is transcript text
    if (currentSegment.text) {
     currentSegment.text += ' ';
    }
    currentSegment.text += line.replace(/<[^>]*>/g, ''); // Remove HTML tags
   }
  }

  // Add final segment
  if (currentSegment && currentSegment.text) {
   segments.push(currentSegment);
  }

  console.log(`[VTT-PARSER] ✅ Successfully parsed ${segments.length} VTT segments`);
  return segments;
 }

 /**
  * Enhanced TXT Parser with timestamp detection
  */
 parseTXT(content) {
  const segments = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
   const trimmed = line.trim();
   if (!trimmed) continue;

   // Try to extract timestamp and text from various formats
   const parsed = this.parseTXTLine(trimmed);
   if (parsed) {
    segments.push(parsed);
   }
  }

  // If no timestamps found, create segments from text chunks
  if (segments.length === 0) {
   console.log('[TXT-PARSER] No timestamps found, creating estimated segments');
   return this.createEstimatedSegments(content);
  }

  console.log(`[TXT-PARSER] ✅ Successfully parsed ${segments.length} TXT segments`);
  return segments;
 }

 /**
  * Parse timestamp line in various formats
  */
 parseTimestampLine(line) {
  // SRT format: 00:00:20,000 --> 00:00:24,400
  let match = line.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
  if (match) {
   return {
    start: this.parseTimestamp(match[1]),
    end: this.parseTimestamp(match[2]),
   };
  }

  // VTT format: 00:00:20.000 --> 00:00:24.400
  match = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
  if (match) {
   return {
    start: this.parseTimestamp(match[1]),
    end: this.parseTimestamp(match[2]),
   };
  }

  // Simple format: MM:SS --> MM:SS
  match = line.match(/(\d{1,2}:\d{2})\s*-->\s*(\d{1,2}:\d{2})/);
  if (match) {
   return {
    start: this.parseSimpleTimestamp(match[1]),
    end: this.parseSimpleTimestamp(match[2]),
   };
  }

  return null;
 }

 /**
  * Parse TXT line with various timestamp formats
  */
 parseTXTLine(line) {
  // Format: [MM:SS - MM:SS] Text
  let match = line.match(/\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]\s*(.*)/);
  if (match) {
   return {
    start: this.parseSimpleTimestamp(match[1]),
    end: this.parseSimpleTimestamp(match[2]),
    text: match[3].trim(),
   };
  }

  // Format: (MM:SS - MM:SS) Text
  match = line.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)\s*(.*)/);
  if (match) {
   return {
    start: this.parseSimpleTimestamp(match[1]),
    end: this.parseSimpleTimestamp(match[2]),
    text: match[3].trim(),
   };
  }

  // Format: MM:SS: Text
  match = line.match(/^(\d{1,2}:\d{2}):\s*(.*)/);
  if (match) {
   const start = this.parseSimpleTimestamp(match[1]);
   return {
    start: start,
    end: start + 30, // Default 30 second duration
    text: match[2].trim(),
   };
  }

  return null;
 }

 /**
  * Parse timestamp in various formats to seconds
  */
 parseTimestamp(timestamp) {
  // Handle comma or dot for milliseconds
  const normalized = timestamp.replace(',', '.');

  // Parse HH:MM:SS.mmm format
  const match = normalized.match(/(\d{1,2}):(\d{2}):(\d{2})\.?(\d{0,3})?/);
  if (match) {
   const hours = parseInt(match[1]) || 0;
   const minutes = parseInt(match[2]) || 0;
   const seconds = parseInt(match[3]) || 0;
   const milliseconds = parseInt((match[4] || '0').padEnd(3, '0')) || 0;

   return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }

  return 0;
 }

 /**
  * Parse simple MM:SS timestamp to seconds
  */
 parseSimpleTimestamp(timestamp) {
  const parts = timestamp.split(':');
  if (parts.length === 2) {
   const minutes = parseInt(parts[0]) || 0;
   const seconds = parseInt(parts[1]) || 0;
   return minutes * 60 + seconds;
  }
  return 0;
 }

 /**
  * Create estimated segments from plain text
  */
 createEstimatedSegments(content) {
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  const segments = [];

  const wordsPerSecond = 3; // Average speaking rate
  let currentTime = 0;

  for (let i = 0; i < sentences.length; i++) {
   const sentence = sentences[i].trim();
   if (!sentence) continue;

   const wordCount = sentence.split(' ').length;
   const duration = Math.max(3, Math.round(wordCount / wordsPerSecond));

   segments.push({
    start: currentTime,
    end: currentTime + duration,
    text: sentence,
    estimated: true,
   });

   currentTime += duration;
  }

  return segments;
 }

 /**
  * STEP 2: TRANSCRIPT QUALITY VALIDATION
  */
 validateTranscriptQuality(transcriptSegments) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🔍 Validating transcript quality...`);

  // Check if we have segments
  if (!transcriptSegments || transcriptSegments.length === 0) {
   return {
    isValid: false,
    reason: 'No transcript segments found',
    score: 0,
   };
  }

  // Check minimum segment count
  if (transcriptSegments.length < 5) {
   return {
    isValid: false,
    reason: 'Too few transcript segments (minimum 5 required)',
    score: 0.2,
   };
  }

  // Check content quality
  const totalText = transcriptSegments.map((s) => s.text).join(' ');
  if (totalText.length < 200) {
   return {
    isValid: false,
    reason: 'Transcript content too short (minimum 200 characters)',
    score: 0.3,
   };
  }

  // Check for valid timestamps (if not estimated)
  const hasTimestamps = transcriptSegments.some((s) => !s.estimated && s.start >= 0 && s.end > s.start);
  if (!hasTimestamps && !transcriptSegments.every((s) => s.estimated)) {
   return {
    isValid: false,
    reason: 'Invalid or missing timestamps',
    score: 0.4,
   };
  }

  // Calculate quality score
  let score = 0.6; // Base score for valid transcript

  // Bonus for having timestamps
  if (hasTimestamps) score += 0.2;

  // Bonus for good length
  if (totalText.length > 1000) score += 0.1;

  // Bonus for segment count
  if (transcriptSegments.length > 20) score += 0.1;

  console.log(`[TRANSCRIPT-PROCESSOR] ✅ Validation passed: score ${score}`);

  return {
   isValid: true,
   reason: 'Transcript validation passed',
   score: Math.min(1.0, score),
   metrics: {
    segmentCount: transcriptSegments.length,
    totalCharacters: totalText.length,
    hasTimestamps: hasTimestamps,
    averageSegmentLength: totalText.length / transcriptSegments.length,
   },
  };
 }

 /**
  * MODE 1: SYNCHRONIZE WITH EXISTING SEGMENTS
  * Enhanced synchronization with flexible overlap detection
  */
 async synchronizeWithExistingSegments(transcriptSegments, existingSegments, videoId) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🔄 Synchronizing ${transcriptSegments.length} transcript segments with ${existingSegments.length} video segments`);

  const updatedSegments = [];
  let matchedCount = 0;

  for (const videoSegment of existingSegments) {
   const segmentStart = videoSegment.startTimeSeconds || 0;
   const segmentEnd = videoSegment.endTimeSeconds || segmentStart + 60;

   // Find overlapping transcript segments using flexible criteria
   const overlappingTranscripts = this.findOverlappingTranscripts(transcriptSegments, segmentStart, segmentEnd);

   if (overlappingTranscripts.length > 0) {
    // Combine overlapping transcript text
    const combinedText = overlappingTranscripts
     .map((t) => t.text)
     .join(' ')
     .trim();

    // Create enhanced segment with transcript
    const enhancedSegment = {
     ...videoSegment,
     transcriptExcerpt: this.createExcerpt(combinedText, 300),
     transcriptFull: combinedText,
     hasManualTranscript: true,
     transcriptQuality: this.calculateTextQuality(combinedText),
     matchedTranscriptSegments: overlappingTranscripts.length,
    };

    updatedSegments.push(enhancedSegment);
    matchedCount++;

    console.log(`[TRANSCRIPT-PROCESSOR] ✅ Matched segment "${videoSegment.title || 'Untitled'}" with ${overlappingTranscripts.length} transcript segments`);
   } else {
    // Keep original segment without transcript
    updatedSegments.push({
     ...videoSegment,
     hasManualTranscript: false,
    });

    console.log(`[TRANSCRIPT-PROCESSOR] ⚠️ No transcript match for segment "${videoSegment.title || 'Untitled'}"`);
   }
  }

  return {
   success: true,
   mode: 'synchronize',
   data: {
    videoId: videoId,
    segments: updatedSegments,
    stats: {
     totalSegments: existingSegments.length,
     matchedSegments: matchedCount,
     transcriptEntries: transcriptSegments.length,
     matchPercentage: Math.round((matchedCount / existingSegments.length) * 100),
    },
   },
  };
 }

 /**
  * MODE 2: GENERATE NEW SEGMENTS FROM TRANSCRIPT
  * Uses enhanced AI segmenter for intelligent segment creation
  */
 async generateSegmentsFromTranscript(transcriptSegments, videoId) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🎯 Generating new segments from ${transcriptSegments.length} transcript segments using AI`);

  try {
   // Use enhanced AI segmenter for intelligent analysis
   const aiResult = await enhancedAISegmenter.generateIntelligentSegments(transcriptSegments, {
    targetCount: 8,
    minDuration: this.minSegmentDuration,
    maxDuration: this.maxSegmentDuration,
   }); // Convert AI segments to video segment format
   const videoSegments = aiResult.segments.map((aiSegment, index) => ({
    id: aiSegment.id || `generated-${Date.now()}-${index + 1}`,
    title: aiSegment.title || `Generated Segment ${index + 1}`,
    description: aiSegment.description || `AI-generated segment with ${aiSegment.duration}s duration`,
    startTimeSeconds: aiSegment.start,
    endTimeSeconds: aiSegment.end,
    youtubeVideoId: videoId,
    transcriptExcerpt: aiSegment.text, // Use full text instead of truncated excerpt
    transcriptFull: aiSegment.text,
    keyQuote: aiSegment.keyQuote,
    hasManualTranscript: true,
    hasAIGenerated: true,
    aiQualityScore: aiResult.metadata.qualityScore,
    contentType: aiResult.analysis.contentType,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    duration: aiSegment.duration,
    segmentIndex: index + 1,
   }));

   console.log(`[TRANSCRIPT-PROCESSOR] ✅ Generated ${videoSegments.length} AI-powered segments`);

   return {
    success: true,
    mode: 'generate',
    data: {
     videoId: videoId,
     segments: videoSegments,
     aiAnalysis: aiResult.analysis,
     stats: {
      totalSegments: videoSegments.length,
      transcriptEntries: transcriptSegments.length,
      averageDuration: aiResult.metadata.averageSegmentDuration,
      qualityScore: aiResult.metadata.qualityScore,
      contentType: aiResult.analysis.contentType,
      processingMethod: 'ai-enhanced',
     },
    },
   };
  } catch (aiError) {
   console.warn(`[TRANSCRIPT-PROCESSOR] ⚠️ AI segmentation failed: ${aiError.message}`);
   console.log(`[TRANSCRIPT-PROCESSOR] 🔄 Falling back to rule-based generation`);

   // Fallback to rule-based segmentation
   return this.generateRuleBasedSegments(transcriptSegments, videoId);
  }
 }

 /**
  * FALLBACK: Rule-based segment generation
  */
 generateRuleBasedSegments(transcriptSegments, videoId) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🔧 Generating rule-based segments`);

  const segments = [];
  const totalDuration = this.calculateTotalDuration(transcriptSegments);
  const targetSegmentDuration = 60; // 60 seconds per segment

  let currentStart = 0;
  let segmentIndex = 1;

  while (currentStart < totalDuration) {
   const segmentEnd = Math.min(currentStart + targetSegmentDuration, totalDuration);

   // Find transcript segments in this time range (allow overlap)
   const segmentTranscripts = transcriptSegments.filter((t) => t.start < segmentEnd && t.end > currentStart);

   if (segmentTranscripts.length > 0) {
    const combinedText = segmentTranscripts
     .map((t) => t.text)
     .join(' ')
     .trim();

    if (combinedText.length > 50) {
     // Ensure meaningful content
     const duration = segmentEnd - currentStart;

     segments.push({
      id: `rule-based-${Date.now()}-${segmentIndex}`,
      title: `Segment ${segmentIndex}`,
      description: `Rule-based segment with ${Math.round(duration)}s duration`,
      startTimeSeconds: currentStart,
      endTimeSeconds: segmentEnd,
      youtubeVideoId: videoId,
      transcriptExcerpt: combinedText, // Use full text instead of truncated excerpt
      transcriptFull: combinedText,
      hasManualTranscript: true,
      hasAIGenerated: false,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      duration: Math.round(duration),
      segmentIndex: segmentIndex,
      fallback: true,
     });

     segmentIndex++;
    }
   }

   currentStart += targetSegmentDuration;
  }

  console.log(`[TRANSCRIPT-PROCESSOR] ✅ Generated ${segments.length} rule-based segments`);

  return {
   success: true,
   mode: 'generate',
   data: {
    videoId: videoId,
    segments: segments,
    stats: {
     totalSegments: segments.length,
     transcriptEntries: transcriptSegments.length,
     averageDuration: segments.length > 0 ? Math.round(segments.reduce((sum, s) => sum + s.duration, 0) / segments.length) : 0,
     processingMethod: 'rule-based-fallback',
    },
   },
  };
 }

 // ===== HELPER METHODS =====

 findOverlappingTranscripts(transcriptSegments, segmentStart, segmentEnd) {
  return transcriptSegments.filter((transcript) => {
   const tStart = transcript.start;
   const tEnd = transcript.end;

   // Check for any overlap
   const hasOverlap = tStart < segmentEnd && tEnd > segmentStart;

   if (hasOverlap) {
    // Calculate overlap amount
    const overlapStart = Math.max(tStart, segmentStart);
    const overlapEnd = Math.min(tEnd, segmentEnd);
    const overlapDuration = overlapEnd - overlapStart;

    // Accept if overlap is at least 1 second OR covers 50% of transcript segment
    const transcriptDuration = tEnd - tStart;
    const overlapPercentage = overlapDuration / transcriptDuration;

    return overlapDuration >= 1 || overlapPercentage >= 0.5;
   }

   return false;
  });
 }

 calculateTotalDuration(transcriptSegments) {
  if (transcriptSegments.length === 0) return 0;

  // If segments have estimated flag, calculate from text length
  if (transcriptSegments.every((s) => s.estimated)) {
   const totalWords = transcriptSegments.reduce((sum, s) => sum + s.text.split(' ').length, 0);
   return Math.round(totalWords / 3); // 3 words per second
  }

  // Use actual timestamps
  return Math.max(...transcriptSegments.map((s) => s.end));
 }

 createExcerpt(text, maxLength = 300) {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
 }

 calculateTextQuality(text) {
  if (!text || text.length === 0) return 0;

  let score = 0.5; // Base score

  // Length bonus
  if (text.length > 100) score += 0.2;
  if (text.length > 300) score += 0.1;

  // Sentence structure bonus
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  if (sentences.length >= 2) score += 0.1;

  // Word diversity bonus
  const words = text.toLowerCase().split(' ');
  const uniqueWords = new Set(words);
  const diversity = uniqueWords.size / words.length;
  if (diversity > 0.5) score += 0.1;

  return Math.min(1.0, score);
 }
}

module.exports = new EnhancedTranscriptProcessor();
