/**
 * Transcript Parser Service
 * Handles parsing of uploaded transcript files (.srt and .txt formats)
 * and synchronizes them with video segments
 */

/**
 * Parse SRT subtitle format
 * @param {string} content - Raw SRT file content
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function parseSRT(content) {
 const segments = [];
 // Handle both Windows (\r\n) and Unix (\n) line endings
 const normalizedContent = content.replace(/\r\n/g, '\n');
 const blocks = normalizedContent.trim().split('\n\n');

 for (const block of blocks) {
  const lines = block.trim().split('\n');
  if (lines.length < 3) continue;

  // Skip the sequence number (first line)
  const timeCodeLine = lines[1];
  const textLines = lines.slice(2);

  // Parse time codes (format: 00:00:20,000 --> 00:00:24,400)
  const timeMatch = timeCodeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

  if (timeMatch) {
   const startTime = parseTimeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
   const endTime = parseTimeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);

   const text = textLines.join(' ').trim();
   if (text) {
    segments.push({
     start: startTime,
     end: endTime,
     text: text,
    });
   }
  }
 }

 return segments;
}

/**
 * Parse custom TXT format: [00:00 - 00:30] your sentence
 * @param {string} content - Raw TXT file content
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function parseTXT(content) {
 const segments = [];
 const lines = content.trim().split('\n');

 for (const line of lines) {
  const trimmedLine = line.trim();
  if (!trimmedLine) continue;

  // Match pattern: [MM:SS - MM:SS] text or [HH:MM:SS - HH:MM:SS] text
  const match = trimmedLine.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)/);

  if (match) {
   const startHours = match[3] ? parseInt(match[1]) : 0;
   const startMinutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
   const startSeconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);

   const endHours = match[6] ? parseInt(match[4]) : 0;
   const endMinutes = match[6] ? parseInt(match[5]) : parseInt(match[4]);
   const endSecondsVal = match[6] ? parseInt(match[6]) : parseInt(match[5]);

   const startTime = startHours * 3600 + startMinutes * 60 + startSeconds;
   const endTime = endHours * 3600 + endMinutes * 60 + endSecondsVal;
   const text = match[7].trim();

   if (text && endTime > startTime) {
    segments.push({
     start: startTime,
     end: endTime,
     text: text,
    });
   }
  } else {
   // Try alternative format: MM:SS text (assume 30 second duration)
   const simpleMatch = trimmedLine.match(/^(\d{1,2}):(\d{2})\s+(.+)/);
   if (simpleMatch) {
    const minutes = parseInt(simpleMatch[1]);
    const seconds = parseInt(simpleMatch[2]);
    const startTime = minutes * 60 + seconds;
    const text = simpleMatch[3].trim();

    segments.push({
     start: startTime,
     end: startTime + 30, // Default 30 second duration
     text: text,
    });
   }
  }
 }

 return segments;
}

/**
 * Helper function to convert time components to seconds
 */
function parseTimeToSeconds(hours, minutes, seconds, milliseconds = 0) {
 return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
}

/**
 * Synchronize transcript segments with video segments based on timestamp overlap
 * @param {Array} transcriptSegments - Parsed transcript segments
 * @param {Array} videoSegments - Generated video segments
 * @returns {Array} Updated video segments with matched transcript text
 */
function synchronizeWithSegments(transcriptSegments, videoSegments) {
 if (!transcriptSegments || !videoSegments) {
  throw new Error('Invalid segments data provided');
 }

 console.log(`[TRANSCRIPT-SYNC] Synchronizing ${transcriptSegments.length} transcript segments with ${videoSegments.length} video segments`);

 const updatedSegments = videoSegments.map((segment, index) => {
  const segmentStart = segment.startTimeSeconds;
  const segmentEnd = segment.endTimeSeconds;

  // Find all transcript segments that have ANY overlap with this video segment
  const overlappingTranscripts = transcriptSegments.filter((transcript) => {
   // Check if there's any temporal overlap
   const hasOverlap = transcript.start < segmentEnd && transcript.end > segmentStart;

   if (hasOverlap) {
    const overlapStart = Math.max(segmentStart, transcript.start);
    const overlapEnd = Math.min(segmentEnd, transcript.end);
    const overlapDuration = overlapEnd - overlapStart;
    const transcriptDuration = transcript.end - transcript.start;

    // More flexible overlap calculation:
    // - If transcript is fully contained in video segment: always include
    // - If transcript partially overlaps: include if overlap > 1 second OR > 50% of transcript
    const isFullyContained = transcript.start >= segmentStart && transcript.end <= segmentEnd;
    const significantOverlap = overlapDuration > 1.0; // At least 1 second overlap
    const majorityOfTranscript = overlapDuration / transcriptDuration > 0.5; // >50% of transcript overlaps

    return isFullyContained || significantOverlap || majorityOfTranscript;
   }

   return false;
  });

  // Combine overlapping transcript text
  let combinedTranscript = '';
  if (overlappingTranscripts.length > 0) {
   // Sort by start time to maintain chronological order
   overlappingTranscripts.sort((a, b) => a.start - b.start);

   combinedTranscript = overlappingTranscripts
    .map((t) => t.text)
    .join(' ')
    .trim();

   console.log(`[TRANSCRIPT-SYNC] Segment ${index + 1} (${segmentStart}s-${segmentEnd}s): Found ${overlappingTranscripts.length} overlapping transcripts`);
   console.log(`[TRANSCRIPT-SYNC]   Combined text length: ${combinedTranscript.length} characters`);
  } else {
   console.log(`[TRANSCRIPT-SYNC] Segment ${index + 1} (${segmentStart}s-${segmentEnd}s): No matching transcript found`);
  }

  return {
   ...segment,
   transcriptExcerpt: combinedTranscript || segment.transcriptExcerpt || '',
   hasManualTranscript: combinedTranscript.length > 0,
  };
 });

 const successfulMatches = updatedSegments.filter((s) => s.hasManualTranscript).length;
 console.log(`[TRANSCRIPT-SYNC] ✅ Successfully matched ${successfulMatches}/${videoSegments.length} segments with transcript data`);

 return updatedSegments;
}

/**
 * Validate and parse uploaded transcript file
 * @param {Buffer} fileBuffer - Uploaded file buffer
 * @param {string} filename - Original filename
 * @param {string} mimetype - File MIME type
 * @returns {Array} Parsed transcript segments
 */
function parseTranscriptFile(fileBuffer, filename, mimetype) {
 if (!fileBuffer || fileBuffer.length === 0) {
  throw new Error('File is empty');
 }

 // Max file size: 2MB
 const MAX_FILE_SIZE = 2 * 1024 * 1024;
 if (fileBuffer.length > MAX_FILE_SIZE) {
  throw new Error('File size exceeds 2MB limit');
 }

 const content = fileBuffer.toString('utf8');
 const fileExtension = filename.toLowerCase().split('.').pop();

 console.log(`[TRANSCRIPT-PARSER] Parsing file: ${filename} (${fileExtension}), size: ${fileBuffer.length} bytes`);

 let segments = [];

 try {
  if (fileExtension === 'srt' || mimetype === 'application/x-subrip') {
   segments = parseSRT(content);
  } else if (fileExtension === 'txt' || mimetype === 'text/plain') {
   segments = parseTXT(content);
  } else {
   throw new Error('Unsupported file format. Only .srt and .txt files are allowed.');
  }

  if (segments.length === 0) {
   throw new Error('No valid transcript entries found in the file. Please check the format.');
  }

  console.log(`[TRANSCRIPT-PARSER] ✅ Successfully parsed ${segments.length} transcript segments`);

  // Validate segments
  const validSegments = segments.filter((segment) => {
   return segment.start >= 0 && segment.end > segment.start && segment.text && segment.text.length > 0;
  });

  if (validSegments.length === 0) {
   throw new Error('No valid transcript segments found. Please check timestamp formats.');
  }

  if (validSegments.length < segments.length) {
   console.log(`[TRANSCRIPT-PARSER] ⚠️ Filtered out ${segments.length - validSegments.length} invalid segments`);
  }

  return validSegments;
 } catch (error) {
  console.error(`[TRANSCRIPT-PARSER] Error parsing file:`, error);
  throw new Error(`Failed to parse transcript file: ${error.message}`);
 }
}

module.exports = {
 parseTranscriptFile,
 synchronizeWithSegments,
 parseSRT,
 parseTXT,
};
