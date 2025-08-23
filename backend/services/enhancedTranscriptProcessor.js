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
 async generateSegmentsFromTranscript(transcriptSegments, videoId, options = {}) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🎯 Generating new segments from ${transcriptSegments.length} transcript segments using AI`);

  // Extract language information from options
  const detectedLanguage = options.detectedLanguage || options.sourceLanguage || 'unknown';
  const preferIndonesian = options.preferIndonesian || detectedLanguage === 'indonesian';

  console.log(`[TRANSCRIPT-PROCESSOR] 🌐 Language context: ${detectedLanguage} (Indonesian priority: ${preferIndonesian})`);

  try {
   // CRITICAL FIX: Ensure all transcript segments have proper end values
   const normalizedSegments = transcriptSegments.map((segment) => {
    if (!segment.end || isNaN(segment.end)) {
     return {
      ...segment,
      end: segment.start + (segment.duration || 0),
     };
    }
    return segment;
   });

   console.log(`[TRANSCRIPT-PROCESSOR] 🔧 Normalized ${normalizedSegments.length} segments with proper end values`);

   // ALWAYS use AI-powered analysis for finding interesting moments
   // Remove the "large transcript" shortcut that bypasses AI
   console.log(`[TRANSCRIPT-PROCESSOR] 🧠 Using FULL AI analysis to find interesting moments`);

   // Use full AI processing with user-specified parameters and viral moments focus
   const targetCount = options.targetCount || 15; // Use API parameter or default to 15
   const minDuration = options.minDuration || 30; // Use API parameter or default to 30s
   const maxDuration = options.maxDuration || 90; // Use API parameter or default to 90s
   const maxSegments = Math.min(Math.max(targetCount + 3, 18), 20); // Dynamic max based on target

   console.log(`[TRANSCRIPT-PROCESSOR] ⚙️ AI Parameters: target=${targetCount}, max=${maxSegments}, duration=${minDuration}-${maxDuration}s`);

   const aiResult = await enhancedAISegmenter.generateIntelligentSegments(normalizedSegments, {
    targetCount: targetCount, // DYNAMIC: Use API-specified target count
    minDuration: minDuration, // DYNAMIC: Use API-specified minimum duration
    maxDuration: maxDuration, // DYNAMIC: Use API-specified maximum duration
    maxSegments: maxSegments, // DYNAMIC: Hard limit based on target count
    focusOnInterest: true, // NEW: Focus on finding interesting moments
    contentMode: 'viral-moments', // NEW: Look for viral/engaging content
    detectedLanguage: detectedLanguage, // CRITICAL: Pass detected language to AI
    preferIndonesian: preferIndonesian, // CRITICAL: Indonesian preference flag
   });

   // DYNAMIC enforcement - use maxSegments calculated above
   if (!aiResult || !aiResult.segments || aiResult.segments.length === 0) {
    console.log(`[TRANSCRIPT-PROCESSOR] ⚠️ AI returned no segments, using emergency fallback`);
    return this.generateEmergencySegments(normalizedSegments, videoId, {
     targetCount: targetCount,
     minDuration: minDuration,
     maxDuration: maxDuration,
    });
   }

   // Enforce dynamic segment count limit based on target
   const strictLimit = Math.min(aiResult.segments.length, maxSegments);
   const limitedSegments = aiResult.segments.slice(0, strictLimit);

   console.log(`[TRANSCRIPT-PROCESSOR] 🔒 STRICT LIMIT: Using ${limitedSegments.length} out of ${aiResult.segments.length} AI segments`);

   // Validate segment durations and fix any that are too long
   const validatedSegments = limitedSegments.map((segment, index) => {
    // Ensure duration is within API-specified limits
    if (segment.duration > maxDuration) {
     console.log(`[TRANSCRIPT-PROCESSOR] ⚠️ Segment ${index + 1} too long (${segment.duration}s), capping at ${maxDuration}s`);
     const newEnd = segment.start + maxDuration;
     return {
      ...segment,
      end: newEnd,
      duration: maxDuration,
      text: this.extractSegmentText(normalizedSegments, segment.start, newEnd),
     };
    }

    if (segment.duration < minDuration) {
     console.log(`[TRANSCRIPT-PROCESSOR] ⚠️ Segment ${index + 1} too short (${segment.duration}s), extending to ${minDuration}s`);

     // Calculate total duration safely
     const maxEnd = Math.max(...normalizedSegments.filter((s) => s.end && !isNaN(s.end)).map((s) => s.end));
     const totalDuration = !isNaN(maxEnd) ? maxEnd : 600; // fallback to 600s

     const newEnd = Math.min(segment.start + minDuration, totalDuration);
     return {
      ...segment,
      end: newEnd,
      duration: Math.round(newEnd - segment.start),
      text: this.extractSegmentText(normalizedSegments, segment.start, newEnd),
     };
    }

    return segment;
   });

   const finalResult = {
    ...aiResult,
    segments: validatedSegments,
    metadata: {
     ...aiResult.metadata,
     processingMethod: 'full-ai-analysis',
     segmentCount: validatedSegments.length,
     averageSegmentDuration: Math.round(validatedSegments.reduce((sum, s) => sum + s.duration, 0) / validatedSegments.length),
    },
   };

   return this.formatSegmentResults(validatedSegments, videoId, finalResult, normalizedSegments);
  } catch (error) {
   console.error('[TRANSCRIPT-PROCESSOR] ❌ AI processing failed:', error);
   // Fallback to emergency simple segmentation
   return this.generateEmergencySegments(transcriptSegments, videoId, {
    targetCount: options.targetCount || 15,
    minDuration: options.minDuration || 30,
    maxDuration: options.maxDuration || 90,
   });
  }
 }

 /**
  * Create intelligent chunks for large transcripts that preserve timing accuracy
  */
 createIntelligentChunks(transcriptSegments, targetCount) {
  const totalDuration = Math.max(...transcriptSegments.map((s) => s.end));
  const chunkDuration = totalDuration / targetCount;
  const chunks = [];

  for (let i = 0; i < targetCount; i++) {
   const startTime = i * chunkDuration;
   const endTime = Math.min((i + 1) * chunkDuration, totalDuration);

   // Find all transcript segments that overlap with this chunk
   const overlappingSegments = transcriptSegments.filter((segment) => segment.start < endTime && segment.end > startTime);

   if (overlappingSegments.length > 0) {
    // Use actual timing from the overlapping segments
    const actualStartTime = Math.min(...overlappingSegments.map((s) => s.start));
    const actualEndTime = Math.max(...overlappingSegments.map((s) => s.end));
    const combinedText = overlappingSegments.map((s) => s.text).join(' ');

    chunks.push({
     startTime: actualStartTime,
     endTime: actualEndTime,
     text: combinedText,
     segmentCount: overlappingSegments.length,
    });
   }
  }

  return chunks;
 }

 /**
  * Generate short, concise titles (max 40 characters)
  */
 generateShortTitle(text) {
  // Extract first meaningful sentence or phrase
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  if (sentences.length > 0) {
   let title = sentences[0].trim();
   // Truncate to 40 characters with proper word boundary
   if (title.length > 40) {
    title = title.substring(0, 37).trim();
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 20) {
     title = title.substring(0, lastSpace);
    }
    title += '...';
   }
   return title;
  }

  // Fallback: use first few words
  const words = text.split(' ').slice(0, 6).join(' ');
  return words.length > 40 ? words.substring(0, 37) + '...' : words;
 }

 /**
  * Generate short, concise descriptions (max 100 characters)
  */
 generateShortDescription(text) {
  // Find the most descriptive sentence
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
   const trimmed = sentence.trim();
   if (trimmed.length > 20 && trimmed.length <= 100) {
    return trimmed;
   }
  }

  // Fallback: truncate text to 100 chars
  if (text.length <= 100) {
   return text.trim();
  }

  let description = text.substring(0, 97).trim();
  const lastSpace = description.lastIndexOf(' ');
  if (lastSpace > 50) {
   description = description.substring(0, lastSpace);
  }
  return description + '...';
 }

 /**
  * Extract a simple quote from text
  */
 extractSimpleQuote(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 15);
  if (sentences.length > 0) {
   // Return the most impactful sentence (usually the first meaningful one)
   const quote = sentences[0].trim();
   return quote.length > 120 ? quote.substring(0, 117) + '...' : quote;
  }
  return text.substring(0, 100).trim();
 }
 /**
  * Sample transcript segments for large files to reduce processing time
  */
 sampleTranscriptSegments(transcriptSegments, targetCount) {
  if (transcriptSegments.length <= targetCount) {
   return transcriptSegments;
  }

  const sampledSegments = [];
  const step = Math.floor(transcriptSegments.length / targetCount);

  for (let i = 0; i < transcriptSegments.length; i += step) {
   sampledSegments.push(transcriptSegments[i]);
  }

  return sampledSegments.slice(0, targetCount);
 }

 /**
  * Map sampled AI results back to original transcript timing
  */
 mapSampledResultsToOriginal(aiSegments, originalTranscript) {
  return aiSegments.map((segment) => {
   // Find closest matches in original transcript
   const startMatch = this.findClosestTranscriptMatch(segment.start, originalTranscript);
   const endMatch = this.findClosestTranscriptMatch(segment.end, originalTranscript);

   return {
    ...segment,
    start: startMatch ? startMatch.start : segment.start,
    end: endMatch ? endMatch.end : segment.end,
   };
  });
 }

 /**
  * Find closest transcript segment by timestamp
  */
 findClosestTranscriptMatch(targetTime, transcriptSegments) {
  let closest = null;
  let minDiff = Infinity;

  for (const segment of transcriptSegments) {
   const diff = Math.abs(segment.start - targetTime);
   if (diff < minDiff) {
    minDiff = diff;
    closest = segment;
   }
  }

  return closest;
 }

 /**
  * Format segment results into consistent response format
  */
 formatSegmentResults(segments, videoId, aiResult, transcriptSegments) {
  // Convert AI segments to video segment format
  const videoSegments = segments.map((aiSegment, index) => ({
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
   aiQualityScore: aiResult.metadata?.qualityScore || 0.8,
   contentType: aiResult.analysis?.contentType || 'video',
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
     averageDuration: aiResult.metadata?.averageSegmentDuration || 60,
     qualityScore: aiResult.metadata?.qualityScore || 0.8,
     contentType: aiResult.analysis?.contentType || 'video',
     processingMethod: 'ai-enhanced',
    },
   },
  };
 }

 /**
  * Fallback segmentation for when AI processing fails
  */
 generateFallbackSegments(transcriptSegments, videoId) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🔄 Using fallback segmentation for ${transcriptSegments.length} segments`);

  const segments = [];
  const segmentDuration = 60; // 60 seconds per segment
  const totalDuration = Math.max(...transcriptSegments.map((s) => s.end));

  let currentStart = 0;
  let segmentIndex = 1;

  while (currentStart < totalDuration) {
   const currentEnd = Math.min(currentStart + segmentDuration, totalDuration);

   // Find transcript segments in this time range
   const segmentTranscripts = transcriptSegments.filter((t) => t.start < currentEnd && t.end > currentStart);

   if (segmentTranscripts.length > 0) {
    const combinedText = segmentTranscripts.map((t) => t.text).join(' ');

    segments.push({
     id: `fallback-${segmentIndex}`,
     title: `Segment ${segmentIndex}`,
     description: combinedText.length > 100 ? combinedText.substring(0, 100) + '...' : combinedText,
     startTimeSeconds: currentStart,
     endTimeSeconds: currentEnd,
     youtubeVideoId: videoId,
     transcriptExcerpt: combinedText,
     hasManualTranscript: true,
     thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
     duration: currentEnd - currentStart,
    });

    segmentIndex++;
   }

   currentStart += segmentDuration;
  }

  return {
   success: true,
   mode: 'generate',
   data: {
    videoId: videoId,
    segments: segments,
    stats: {
     totalSegments: segments.length,
     transcriptEntries: transcriptSegments.length,
     processingMethod: 'fallback-rule-based',
    },
   },
  };
 }

 /**
  * Legacy method - kept for compatibility
  */
 async generateRuleBasedSegments(transcriptSegments, videoId) {
  return this.generateFallbackSegments(transcriptSegments, videoId);
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

 /**
  * Emergency segmentation when AI fails - focus on finding interesting content
  */
 generateEmergencySegments(transcriptSegments, videoId, options = {}) {
  console.log(`[TRANSCRIPT-PROCESSOR] 🚨 Using emergency segmentation - finding interesting moments`);

  const totalDuration = Math.max(...transcriptSegments.map((s) => s.end));
  const targetSegments = options.targetCount || 15; // FIXED: Use API target count instead of hardcoded 8
  const segmentDuration = 60; // 60 seconds per segment
  const segments = [];

  // Look for content indicators of interesting moments
  const interestKeywords = [
   // General interest indicators
   'amazing',
   'incredible',
   'shocking',
   'unbelievable',
   'secret',
   'revealed',
   'important',
   'crucial',
   'essential',
   'must know',
   'warning',
   'dangerous',
   'money',
   'profit',
   'earn',
   'save',
   'expensive',
   'cheap',
   'free',
   'mistake',
   'error',
   'wrong',
   'correct',
   'truth',
   'lie',
   'hidden',

   // Indonesian equivalents
   'menakjubkan',
   'luar biasa',
   'mengejutkan',
   'penting',
   'rahasia',
   'terungkap',
   'wajib',
   'harus',
   'peringatan',
   'berbahaya',
   'uang',
   'keuntungan',
   'gratis',
   'kesalahan',
   'benar',
   'salah',
   'kebenaran',
   'bohong',
   'tersembunyi',
  ];

  // Find segments with interesting content
  const scoredSegments = transcriptSegments.map((segment) => {
   const text = segment.text.toLowerCase();
   let score = 0;

   // Score based on keywords
   interestKeywords.forEach((keyword) => {
    if (text.includes(keyword)) score += 2;
   });

   // Score based on punctuation (excitement)
   score += (text.match(/[!?]/g) || []).length;

   // Score based on length (meaningful content)
   if (text.length > 100) score += 1;

   return {...segment, interestScore: score};
  });

  // Sort by interest score
  scoredSegments.sort((a, b) => b.interestScore - a.interestScore);

  // Create segments around high-interest points
  const usedTimeRanges = [];

  for (let i = 0; i < Math.min(targetSegments, scoredSegments.length); i++) {
   const centerSegment = scoredSegments[i];
   const centerTime = centerSegment.start;

   // Create 60-second segment centered around interesting moment
   let startTime = Math.max(0, centerTime - 30);
   let endTime = Math.min(totalDuration, startTime + segmentDuration);

   // Adjust if it would go beyond total duration
   if (endTime - startTime < segmentDuration) {
    startTime = Math.max(0, endTime - segmentDuration);
   }

   // Check for overlap with existing segments
   const hasOverlap = usedTimeRanges.some((range) => !(endTime <= range.start || startTime >= range.end));

   if (!hasOverlap) {
    usedTimeRanges.push({start: startTime, end: endTime});

    const segmentText = this.extractSegmentText(transcriptSegments, startTime, endTime);

    segments.push({
     id: `emergency-segment-${segments.length + 1}`,
     title: this.generateShortTitle(segmentText),
     description: this.generateShortDescription(segmentText),
     start: startTime,
     end: endTime,
     duration: Math.round(endTime - startTime),
     text: segmentText,
     keyQuote: this.extractSimpleQuote(segmentText),
     interestScore: centerSegment.interestScore,
    });
   }
  }

  console.log(`[TRANSCRIPT-PROCESSOR] 🎯 Emergency segmentation created ${segments.length} interesting segments`);

  const result = {
   segments: segments,
   analysis: {contentType: 'video', language: 'unknown', topics: ['general']},
   metadata: {
    totalDuration: totalDuration,
    averageSegmentDuration: Math.round(segments.reduce((sum, s) => sum + s.duration, 0) / segments.length),
    processingMethod: 'emergency-interest-based',
    qualityScore: 0.7,
   },
  };

  return this.formatSegmentResults(segments, videoId, result, transcriptSegments);
 }

 /**
  * Extract text content for a specific time range
  */
 extractSegmentText(transcriptSegments, startTime, endTime) {
  const relevantSegments = transcriptSegments.filter((segment) => segment.start < endTime && segment.end > startTime);

  return relevantSegments
   .map((segment) => segment.text)
   .join(' ')
   .trim();
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
