import Groq from 'groq-sdk';
import type {GeminiShortSegmentSuggestion, ShortVideo} from '../types';
import {parseTimeStringToSeconds} from '../utils/timeUtils';

const GROQ_API_KEY = (import.meta as any).env.VITE_GROQ_API_KEY;

if (!GROQ_API_KEY) {
 console.error('Groq API Key is not configured. Please set the VITE_GROQ_API_KEY environment variable.');
}

const groq = GROQ_API_KEY ? new Groq({apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true}) : null;

// Enhanced interface for timing segments
interface TranscriptSegment {
 start: number;
 end: number;
 text: string;
}

interface EnhancedTranscriptData {
 transcript: string;
 segments?: TranscriptSegment[];
 method: string;
}

// ========================================================================================
// PART 1: "TABLE OF CONTENTS" GENERATOR FUNCTION
// ========================================================================================

interface TableOfContentsEntry {
 title: string;
 startTime: string; // MM:SS format
 endTime: string; // MM:SS format
}

/**
 * PHASE 1: Generate a "Table of Contents" by analyzing transcript chunks with AI
 * This identifies potential segments without needing the full verbatim text
 */
const generateTableOfContents = async (fullTranscriptText: string, videoDuration?: number): Promise<TableOfContentsEntry[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized');
 }

 const CHUNK_SIZE = 8000; // 8K characters per chunk for better rate limit management
 const chunks = [];

 // Split transcript into manageable chunks
 for (let i = 0; i < fullTranscriptText.length; i += CHUNK_SIZE) {
  const chunk = fullTranscriptText.substring(i, i + CHUNK_SIZE);
  const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
  const totalChunks = Math.ceil(fullTranscriptText.length / CHUNK_SIZE);

  chunks.push({
   text: chunk,
   chunkNumber,
   totalChunks,
   startCharPosition: i,
   endCharPosition: Math.min(i + CHUNK_SIZE, fullTranscriptText.length),
  });
 }

 console.log(`[TOC-GENERATOR] Processing ${chunks.length} chunks for Table of Contents generation`);

 const allTopics: TableOfContentsEntry[] = [];
 const safeVideoDuration = videoDuration || Math.ceil((fullTranscriptText.length / 2500) * 60);

 // PART 1: SEQUENTIAL PROCESSING TO AVOID RATE LIMITS
 // Process each chunk SEQUENTIALLY (not in parallel) to respect API rate limits
 for (const chunk of chunks) {
  try {
   console.log(`[TOC-GENERATOR] Processing chunk ${chunk.chunkNumber}/${chunk.totalChunks} sequentially...`);

   // Calculate approximate time range for this chunk
   const startTimeRatio = chunk.startCharPosition / fullTranscriptText.length;
   const endTimeRatio = chunk.endCharPosition / fullTranscriptText.length;

   const chunkStartTime = Math.floor(startTimeRatio * safeVideoDuration);
   const chunkEndTime = Math.floor(endTimeRatio * safeVideoDuration);

   // PART 1: DISCOVERY PASS - Find the most interesting topics without duration constraints
   const prompt = `You are a topic spotter expert. Your task is to analyze this transcript chunk and identify the most engaging content.

CHUNK INFO:
- Chunk ${chunk.chunkNumber} of ${chunk.totalChunks}
- Approximate time range: ${Math.floor(chunkStartTime / 60)}:${(chunkStartTime % 60).toString().padStart(2, '0')} to ${Math.floor(chunkEndTime / 60)}:${(chunkEndTime % 60).toString().padStart(2, '0')}
- Video duration: ${Math.floor(safeVideoDuration / 60)} minutes ${safeVideoDuration % 60} seconds

TASK:
Analyze this transcript chunk and identify up to 3 of the most interesting and distinct topics that would make compelling short video content.

**YOUR GOAL: Find the BEST content, regardless of length. Focus on quality over duration constraints.**

REQUIREMENTS:
- Identify topics that are naturally engaging, informative, or entertaining
- Each topic should be distinct and self-contained
- Look for moments with clear narrative structure (beginning, middle, end)
- Find content that would grab viewer attention immediately
- Provide ONLY timing information and topic titles
- Times should be in MM:SS format relative to the full video
- Topics can be any length - we'll optimize duration later

OUTPUT FORMAT (Return ONLY valid JSON, no additional text):
[
  {
    "title": "Engaging topic title (5-8 words)",
    "startTime": "MM:SS",
    "endTime": "MM:SS"
  }
]

If no compelling topics can be identified in this chunk, return: []

TRANSCRIPT CHUNK:
"""
${chunk.text}
"""`;

   // Make API call with intelligent retry logic for rate limits
   console.log(`[TOC-GENERATOR] Making discovery API call for chunk ${chunk.chunkNumber}...`);

   let chunkAttempts = 0;
   const maxChunkRetries = 2; // Reduced retries for efficiency
   let chunkTopics: TableOfContentsEntry[] = [];

   while (chunkAttempts < maxChunkRetries) {
    try {
     const completion = await groq.chat.completions.create({
      messages: [
       {
        role: 'system',
        content:
         'You are an expert content discoverer specializing in identifying the most engaging and interesting topics from video transcripts. Your role is to find compelling content that would make great short videos, focusing on quality and engagement rather than duration constraints. Always respond with valid JSON arrays only.',
       },
       {
        role: 'user',
        content: prompt,
       },
      ],
      model: 'llama3-70b-8192', // Use powerful model for creative discovery task
      temperature: 0.3, // Balanced creativity and consistency
      max_tokens: 800, // More tokens for richer topic discovery
      top_p: 0.9,
      stream: false,
     });
     const response = completion.choices[0]?.message?.content?.trim() || '';
     console.log(`[TOC-GENERATOR] Received response for chunk ${chunk.chunkNumber}: ${response.substring(0, 100)}...`);

     // Parse AI response
     try {
      // Extract JSON from response
      const jsonRegex = /\[[\s\S]*\]/;
      const jsonMatch = jsonRegex.exec(response);
      if (jsonMatch) {
       chunkTopics = JSON.parse(jsonMatch[0]);
       console.log(`[TOC-GENERATOR] Successfully parsed ${chunkTopics.length} topics for chunk ${chunk.chunkNumber}`);
       break; // Success - exit retry loop
      } else {
       console.warn(`[TOC-GENERATOR] No valid JSON found in chunk ${chunk.chunkNumber} response`);
       // Don't retry for parse errors - continue to next chunk
       break;
      }
     } catch (parseError) {
      console.warn(`[TOC-GENERATOR] Failed to parse JSON for chunk ${chunk.chunkNumber}:`, parseError);
      // Don't retry for parse errors - continue to next chunk
      break;
     }
    } catch (error: any) {
     chunkAttempts++;
     console.error(`[TOC-GENERATOR] Error processing chunk ${chunk.chunkNumber} (attempt ${chunkAttempts}/${maxChunkRetries}):`, error.message);

     // PART 1: INTELLIGENT DYNAMIC RATE LIMIT HANDLING
     if (error.response?.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
      console.warn(`[TOC-GENERATOR] 🚦 Rate limit hit for chunk ${chunk.chunkNumber} (attempt ${chunkAttempts})`);

      // Parse the suggested wait time from error message
      let waitTimeInSeconds = 5; // Default fallback
      const waitTimeMatch = error.message?.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (waitTimeMatch) {
       waitTimeInSeconds = parseFloat(waitTimeMatch[1]);
       console.log(`[TOC-GENERATOR] Extracted wait time: ${waitTimeInSeconds} seconds from error message`);
      } else {
       console.log(`[TOC-GENERATOR] No wait time found in error message, using default ${waitTimeInSeconds}s`);
      }

      // Implement dynamic delay with buffer
      const dynamicDelayMs = (waitTimeInSeconds + 1) * 1000; // Add 1 second buffer
      console.log(`[TOC-GENERATOR] ⏳ Rate limit hit. Waiting for ${waitTimeInSeconds + 1} seconds before retry...`);
      await new Promise((resolve) => setTimeout(resolve, dynamicDelayMs));

      // Retry the same chunk
      if (chunkAttempts < maxChunkRetries) {
       console.log(`[TOC-GENERATOR] 🔄 Retrying chunk ${chunk.chunkNumber} (attempt ${chunkAttempts + 1}/${maxChunkRetries})`);
       continue; // Continue to next iteration of retry loop
      } else {
       console.error(`[TOC-GENERATOR] ❌ Max retries reached for chunk ${chunk.chunkNumber}, skipping...`);
       break; // Exit retry loop and continue to next chunk
      }
     } else {
      // For non-rate-limit errors, don't retry
      console.error(`[TOC-GENERATOR] Non-rate-limit error for chunk ${chunk.chunkNumber}, skipping retries`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Standard delay for other errors
      break; // Exit retry loop and continue to next chunk
     }
    }
   }

   // Collect all discovered topics (no duration filtering in discovery pass)
   if (Array.isArray(chunkTopics)) {
    chunkTopics.forEach((topic) => {
     if (topic.title && topic.startTime && topic.endTime) {
      const startSeconds = parseTimeStringToSeconds(topic.startTime);
      const endSeconds = parseTimeStringToSeconds(topic.endTime);
      const duration = endSeconds - startSeconds;

      // Accept all valid topics - duration refinement happens in Phase 2
      if (duration > 10 && duration < 600) {
       // Basic sanity check (10s-10min)
       allTopics.push(topic);
       console.log(`[TOC-GENERATOR] ✅ Discovered topic: "${topic.title}" (${topic.startTime}-${topic.endTime}, ${duration}s)`);
      } else {
       console.warn(`[TOC-GENERATOR] ⚠️ Rejected topic "${topic.title}": duration ${duration}s outside reasonable range`);
      }
     }
    });
   }

   // DELIBERATE DELAY to respect API rate limits (sequential processing)
   if (chunk.chunkNumber < chunk.totalChunks) {
    console.log(`[TOC-GENERATOR] Chunk ${chunk.chunkNumber} complete. Waiting 1000ms before next request...`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Conservative delay for rate limit compliance
   }
  } catch (finalError: any) {
   console.error(`[TOC-GENERATOR] Final error for chunk ${chunk.chunkNumber}:`, finalError.message);
   // Continue with other chunks even if one fails completely
  }
 }

 console.log(`[TOC-GENERATOR] Discovery phase complete: Generated ${allTopics.length} raw topics`);

 // PART 3: REFINED VALIDATION - Final check for empty results
 if (allTopics.length === 0) {
  console.warn(`[TOC-GENERATOR] ⚠️ No interesting topics could be discovered in the transcript`);
  throw new Error('No suitable topics could be identified from the transcript content. The content may not be suitable for short video segments.');
 }

 return allTopics;
};

// ========================================================================================
// PART 1.5: SEGMENT REFINEMENT FUNCTION (Phase 2 of Two-Pass Strategy)
// ========================================================================================

interface RefinedSegment {
 title: string;
 startTime: string;
 endTime: string;
 originalDuration: number;
 refinedDuration: number;
}

/**
 * PHASE 2: Refine discovered segments to fit 60-90 second constraints
 * Uses fast model for simple duration optimization task
 */
const refineSegments = async (rawSegments: TableOfContentsEntry[], fullTranscript: string): Promise<TableOfContentsEntry[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized');
 }

 console.log(`[SEGMENT-REFINER] Starting refinement of ${rawSegments.length} discovered segments...`);

 const refinedSegments: TableOfContentsEntry[] = [];

 for (const segment of rawSegments) {
  const startSeconds = parseTimeStringToSeconds(segment.startTime);
  const endSeconds = parseTimeStringToSeconds(segment.endTime);
  const duration = endSeconds - startSeconds;

  console.log(`[SEGMENT-REFINER] Processing "${segment.title}" (${duration}s)...`);

  // If segment is already within 60-95s range, keep as-is
  if (duration >= 60 && duration <= 95) {
   refinedSegments.push(segment);
   console.log(`[SEGMENT-REFINER] ✅ "${segment.title}" already optimal (${duration}s) - keeping as-is`);
   continue;
  }

  // If segment is too short, skip it
  if (duration < 60) {
   console.log(`[SEGMENT-REFINER] ❌ "${segment.title}" too short (${duration}s) - skipping`);
   continue;
  }

  // If segment is too long, refine it with AI
  if (duration > 95) {
   console.log(`[SEGMENT-REFINER] 🔧 "${segment.title}" too long (${duration}s) - refining with AI...`);

   try {
    // Extract the transcript excerpt for this segment
    const transcriptStartRatio = startSeconds / (endSeconds + 300); // Rough estimate
    const transcriptEndRatio = endSeconds / (endSeconds + 300);

    const startChar = Math.floor(fullTranscript.length * transcriptStartRatio);
    const endChar = Math.floor(fullTranscript.length * transcriptEndRatio);
    const segmentExcerpt = fullTranscript.substring(startChar, endChar);

    const refinementPrompt = `You are a precise video editor. Here is a transcript excerpt from a video segment.

SEGMENT INFO:
- Original title: "${segment.title}"
- Original duration: ${duration} seconds (from ${segment.startTime} to ${segment.endTime})
- This segment is too long and needs to be shortened to 60-90 seconds

TASK:
Find the **single best 60-90 second clip** within this transcript excerpt. Choose the most engaging, self-contained portion that captures the essence of "${segment.title}".

REQUIREMENTS:
- The new segment MUST be between 60-90 seconds
- Choose the most compelling part of the content
- Ensure the clip has a clear beginning and natural ending
- The timing should be relative to the original segment start time

OUTPUT FORMAT (Return ONLY valid JSON, no additional text):
{
  "startTime": "MM:SS",
  "endTime": "MM:SS"
}

TRANSCRIPT EXCERPT:
"""
${segmentExcerpt}
"""`;

    let refinementAttempts = 0;
    const maxRefinementRetries = 2;

    while (refinementAttempts < maxRefinementRetries) {
     try {
      const completion = await groq.chat.completions.create({
       messages: [
        {
         role: 'system',
         content: 'You are a precise video editor specializing in finding the best 60-90 second clips within longer content. Always respond with valid JSON containing optimal start and end times.',
        },
        {
         role: 'user',
         content: refinementPrompt,
        },
       ],
       model: 'llama-3.1-8b-instant', // Fast model for simple optimization task
       temperature: 0.1,
       max_tokens: 200,
       top_p: 0.8,
       stream: false,
      });

      const response = completion.choices[0]?.message?.content?.trim() || '';

      try {
       const refinedTiming = JSON.parse(response);

       if (refinedTiming.startTime && refinedTiming.endTime) {
        const refinedStartSeconds = parseTimeStringToSeconds(refinedTiming.startTime);
        const refinedEndSeconds = parseTimeStringToSeconds(refinedTiming.endTime);
        const refinedDuration = refinedEndSeconds - refinedStartSeconds;

        // Validate refined duration
        if (refinedDuration >= 60 && refinedDuration <= 95) {
         const refinedSegment: TableOfContentsEntry = {
          title: segment.title,
          startTime: refinedTiming.startTime,
          endTime: refinedTiming.endTime,
         };

         refinedSegments.push(refinedSegment);
         console.log(`[SEGMENT-REFINER] ✅ Refined "${segment.title}": ${duration}s → ${refinedDuration}s (${refinedTiming.startTime}-${refinedTiming.endTime})`);
         break; // Success
        } else {
         console.warn(`[SEGMENT-REFINER] ⚠️ Refined duration ${refinedDuration}s not in range, retrying...`);
         refinementAttempts++;
         continue;
        }
       }
      } catch (parseError) {
       console.warn(`[SEGMENT-REFINER] Parse error for "${segment.title}":`, parseError);
       refinementAttempts++;
       continue;
      }
     } catch (error: any) {
      refinementAttempts++;
      console.error(`[SEGMENT-REFINER] Error refining "${segment.title}" (attempt ${refinementAttempts}):`, error.message);

      // Handle rate limits in refinement phase
      if (error.response?.status === 429 || error.message?.includes('429')) {
       const waitTimeMatch = error.message?.match(/try again in (\d+(?:\.\d+)?)s/i);
       const waitTime = waitTimeMatch ? parseFloat(waitTimeMatch[1]) : 3;
       console.log(`[SEGMENT-REFINER] ⏳ Rate limit hit. Waiting ${waitTime + 1}s...`);
       await new Promise((resolve) => setTimeout(resolve, (waitTime + 1) * 1000));
       continue;
      }

      if (refinementAttempts >= maxRefinementRetries) {
       console.error(`[SEGMENT-REFINER] ❌ Failed to refine "${segment.title}" after ${maxRefinementRetries} attempts`);
       break;
      }
     }
    }

    // Add delay between refinement requests
    await new Promise((resolve) => setTimeout(resolve, 800));
   } catch (error: any) {
    console.error(`[SEGMENT-REFINER] Error processing "${segment.title}":`, error.message);
   }
  }
 }

 console.log(`[SEGMENT-REFINER] Refinement complete: ${refinedSegments.length} optimized segments from ${rawSegments.length} discovered topics`);

 return refinedSegments;
};

// ========================================================================================
// PART 2: VERBATIM TEXT EXTRACTOR FUNCTION
// ========================================================================================

/**
 * PHASE 2: Extract verbatim transcript text for a given time range
 * This ensures 100% accuracy to the original source material
 */
const extractVerbatimText = (fullTranscriptWithTimestamps: TranscriptSegment[], startTime: string, endTime: string): string => {
 // Convert MM:SS format to seconds
 const startSeconds = parseTimeStringToSeconds(startTime);
 const endSeconds = parseTimeStringToSeconds(endTime);

 console.log(`[VERBATIM-EXTRACTOR] Extracting text from ${startTime} (${startSeconds}s) to ${endTime} (${endSeconds}s)`);

 // Find all transcript segments that fall within the time range
 const relevantSegments = fullTranscriptWithTimestamps.filter((segment) => {
  const segmentStart = segment.start;
  const segmentEnd = segment.end;

  // Include segments that overlap with our time range
  return (segmentStart >= startSeconds && segmentStart <= endSeconds) || (segmentEnd >= startSeconds && segmentEnd <= endSeconds) || (segmentStart <= startSeconds && segmentEnd >= endSeconds);
 });

 if (relevantSegments.length === 0) {
  console.warn(`[VERBATIM-EXTRACTOR] No segments found for time range ${startTime}-${endTime}`);
  return '';
 }

 // Sort segments by start time to ensure proper order
 relevantSegments.sort((a, b) => a.start - b.start);

 // Join all text from relevant segments
 const verbatimText = relevantSegments.map((segment) => segment.text).join(' ');

 console.log(`[VERBATIM-EXTRACTOR] Extracted ${verbatimText.length} characters from ${relevantSegments.length} segments`);

 return verbatimText;
};

// ========================================================================================
// LEGACY SMART EXCERPT FUNCTION (kept for backward compatibility)
// ========================================================================================

const extractSmartExcerpt = (fullTranscript: string, startTime: number, endTime: number, segments?: TranscriptSegment[]): string => {
 if (segments && segments.length > 0) {
  // Use actual timing data
  const relevantSegments = segments.filter((seg) => (seg.start >= startTime && seg.start <= endTime) || (seg.end >= startTime && seg.end <= endTime) || (seg.start <= startTime && seg.end >= endTime));

  if (relevantSegments.length > 0) {
   let excerpt = relevantSegments.map((seg) => seg.text).join(' ');

   // Extend context if too short
   if (excerpt.length < 200) {
    const contextBefore = segments.filter((seg) => seg.end <= startTime).slice(-2);
    const contextAfter = segments.filter((seg) => seg.start >= endTime).slice(0, 2);

    excerpt = [...contextBefore.map((seg) => seg.text), excerpt, ...contextAfter.map((seg) => seg.text)].join(' ');
   }

   // Ensure natural ending
   excerpt = excerpt.substring(0, 500);
   const lastSentence = excerpt.lastIndexOf('.');
   if (lastSentence > 200) {
    excerpt = excerpt.substring(0, lastSentence + 1);
   }

   return excerpt;
  }
 }

 // Fallback: estimate position in transcript
 const videoDurationSec = segments ? segments[segments.length - 1]?.end || 600 : 600;
 const startRatio = startTime / videoDurationSec;
 const endRatio = endTime / videoDurationSec;

 const startChar = Math.floor(fullTranscript.length * startRatio);
 const endChar = Math.floor(fullTranscript.length * endRatio);

 let excerpt = fullTranscript.substring(startChar, endChar);

 // Extend if too short
 if (excerpt.length < 200) {
  const extensionSize = Math.floor((200 - excerpt.length) / 2);
  const extendedStart = Math.max(0, startChar - extensionSize);
  const extendedEnd = Math.min(fullTranscript.length, endChar + extensionSize);
  excerpt = fullTranscript.substring(extendedStart, extendedEnd);
 }

 // Clean up - find natural sentence boundaries
 const sentences = excerpt.split(/[.!?]+/);
 if (sentences.length > 1) {
  // Take complete sentences
  excerpt = sentences.slice(0, -1).join('.') + '.';
 }

 return excerpt.length > 500 ? excerpt.substring(0, 500) + '...' : excerpt;
};

// Helper function to detect repetitive text
const isRepetitive = (text: string): boolean => {
 const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
 if (sentences.length < 2) return false;

 const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
 return uniqueSentences.size < sentences.length * 0.7; // 70% threshold
};

// Language detection helper function
const detectLanguage = (transcript: string): {language: string; confidence: number} => {
 const text = transcript.toLowerCase();

 // Indonesian language indicators
 const indonesianIndicators = [
  'yang',
  'dan',
  'ini',
  'itu',
  'untuk',
  'dengan',
  'adalah',
  'tidak',
  'juga',
  'akan',
  'sudah',
  'atau',
  'ada',
  'dari',
  'ke',
  'di',
  'pada',
  'dalam',
  'seperti',
  'bisa',
  'gua',
  'gue',
  'nih',
  'sih',
  'kan',
  'dong',
  'ya',
  'lah',
  'banget',
  'gimana',
 ];

 // English language indicators
 const englishIndicators = ['the', 'and', 'this', 'that', 'for', 'with', 'is', 'not', 'also', 'will', 'have', 'or', 'there', 'from', 'to', 'in', 'on', 'like', 'can', 'would'];

 let indonesianScore = 0;
 let englishScore = 0;

 // Count occurrences of language indicators
 indonesianIndicators.forEach((indicator) => {
  const matches = text.match(new RegExp(`\\b${indicator}\\b`, 'g'));
  if (matches) indonesianScore += matches.length;
 });

 englishIndicators.forEach((indicator) => {
  const matches = text.match(new RegExp(`\\b${indicator}\\b`, 'g'));
  if (matches) englishScore += matches.length;
 });

 const totalScore = indonesianScore + englishScore;
 if (totalScore === 0) {
  return {language: 'unknown', confidence: 0};
 }

 if (indonesianScore > englishScore) {
  return {
   language: 'indonesian',
   confidence: Math.min(0.95, indonesianScore / totalScore),
  };
 } else {
  return {
   language: 'english',
   confidence: Math.min(0.95, englishScore / totalScore),
  };
 }
};

// Precision-focused prompt generator for accurate transcript extraction
const generatePrecisionPrompt = (transcriptData: EnhancedTranscriptData, videoDuration?: number): string => {
 if (!transcriptData?.transcript) {
  return 'Error: No transcript data provided';
 }

 const transcript = transcriptData.transcript;
 const segments = transcriptData.segments || [];
 const hasTimingData = segments.length > 0;
 const safeVideoDuration = videoDuration || Math.ceil((transcript.length / 2500) * 60);

 // Detect language for better AI understanding
 const languageDetection = detectLanguage(transcript);

 let languageContext: string;
 if (languageDetection.language === 'indonesian') {
  languageContext = 'The provided transcript is in Indonesian language.';
 } else if (languageDetection.language === 'english') {
  languageContext = 'The provided transcript is in English language.';
 } else {
  languageContext = 'The transcript language could not be determined reliably.';
 }

 // Calculate target segments based on video duration
 let targetSegments = Math.min(8, Math.max(3, Math.floor(safeVideoDuration / 180))); // 1 segment per 3 minutes

 // Prepare timing information for the AI
 let timingInstructions = '';
 if (hasTimingData) {
  // Show sample segments to demonstrate the timing format
  const sampleSegments = segments
   .slice(0, 10)
   .map((seg, idx) => {
    const startTime = new Date(seg.start * 1000).toISOString().substring(14, 19); // MM:SS format
    const endTime = new Date(seg.end * 1000).toISOString().substring(14, 19);
    return `Segment ${idx + 1}: [${startTime} - ${endTime}] "${seg.text.substring(0, 80)}..."`;
   })
   .join('\n');

  timingInstructions = `
TIMING DATA AVAILABLE - ${segments.length} timestamped segments provided.

Sample timing segments for reference:
${sampleSegments}

CRITICAL: Use the exact timing data from the segments above. Each segment contains:
- start: timestamp in seconds
- end: timestamp in seconds  
- text: the exact spoken words at that time

To extract a segment from 2:30 to 4:15, find segments where start >= 150 and end <= 255 seconds.
`;
 } else {
  timingInstructions = `
NO PRECISE TIMING DATA - Estimate based on transcript position.

Video duration: ${Math.floor(safeVideoDuration / 60)}:${String(safeVideoDuration % 60).padStart(2, '0')}
Transcript length: ${transcript.length} characters
Estimated rate: ~${Math.round(transcript.length / (safeVideoDuration / 60))} characters per minute

For timing estimation:
- Start of video (0-2 min): characters 0-${Math.floor(transcript.length * 0.15)}
- Early video (2-5 min): characters ${Math.floor(transcript.length * 0.15)}-${Math.floor(transcript.length * 0.35)}
- Middle video: characters ${Math.floor(transcript.length * 0.35)}-${Math.floor(transcript.length * 0.65)}
- Late video: characters ${Math.floor(transcript.length * 0.65)}-${Math.floor(transcript.length * 0.85)}
- End of video: characters ${Math.floor(transcript.length * 0.85)}-${transcript.length}
`;
 }

 return `You are a video segmentation expert. Your task is to analyze the provided transcript, which ${hasTimingData ? 'includes precise timestamps for every segment' : 'requires position-based timing estimation'}.

${languageContext}

VIDEO DETAILS:
- Duration: ${Math.floor(safeVideoDuration / 60)} minutes ${safeVideoDuration % 60} seconds
- Transcript length: ${transcript.length} characters
- Timing method: ${hasTimingData ? 'Precise timestamps available' : 'Position estimation required'}

${timingInstructions}

YOUR TASK:
Identify ${targetSegments} key topics or distinct segments from the transcript that would make good short videos (between 60-120 seconds each).

REQUIREMENTS FOR EACH SEGMENT:
1. Must be 60-120 seconds in duration
2. Must contain complete, self-contained content 
3. Must have clear start and end points that make narrative sense
4. Should be distributed evenly throughout the video (don't cluster all segments in the first few minutes)

FOR EACH SEGMENT YOU IDENTIFY, YOU MUST RETURN:
- title: A short, descriptive title (5-7 words) based on the segment's actual content
- startTime: Exact start time in MM:SS format (e.g., "05:30")
- endTime: Exact end time in MM:SS format (e.g., "07:15") 
- transcriptExcerpt: The verbatim, word-for-word transcript text of that specific segment, starting from the exact start time and ending at the exact end time

CRITICAL RULES:
- DO NOT summarize, paraphrase, or alter the original transcript text for the segments
- The transcriptExcerpt must be the actual spoken words from the specified time range
- ${hasTimingData ? 'Use the provided timing segments to extract the exact text' : 'Estimate the text position based on the character position guidelines above'}
- Ensure segments are spread throughout the video timeline
- Each segment must be standalone and understandable without additional context

FULL TRANSCRIPT FOR ANALYSIS:
"""
${transcript}
"""

OUTPUT FORMAT (Return ONLY valid JSON, no additional text):
[
  {
    "title": "Short descriptive title here",
    "startTime": "MM:SS",
    "endTime": "MM:SS", 
    "transcriptExcerpt": "The exact verbatim transcript text from startTime to endTime - no summaries or paraphrasing allowed"
  }
]

Remember: Extract the ACTUAL spoken words, not your interpretation or summary of them.`;
};

// ========================================================================================
// PART 3: MAIN AI FUNCTION - ORCHESTRATES THE TWO-PHASE WORKFLOW
// ========================================================================================

export const generateShortsIdeas = async (videoUrl: string, transcript?: string, videoDuration?: number, transcriptSegments?: TranscriptSegment[], retryCount = 0): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized. GROQ_API_KEY might be missing.');
 }

 // Validate transcript quality
 if (!transcript || transcript.length < 500) {
  console.error(`[TOC-WORKFLOW] ❌ Transcript too short or missing (${transcript?.length || 0} chars)`);
  throw new Error(`Transcript terlalu pendek atau tidak tersedia (${transcript?.length || 0} karakter). Pastikan backend extraction berhasil.`);
 }

 // Check if transcript is AI-generated placeholder
 if (transcript.includes('ai-generated transcript: this video appears to be') || transcript.includes('AI-generated content')) {
  console.error('[TOC-WORKFLOW] ❌ AI-generated placeholder transcript detected');
  throw new Error('Transcript adalah AI-generated placeholder. Gunakan backend transcript extraction yang sesungguhnya.');
 }

 console.log(`[TOC-WORKFLOW] 🚀 Starting Table of Contents workflow for transcript (${transcript.length} chars, ${transcriptSegments?.length || 0} segments)`);

 try {
  // Add delay between retries
  if (retryCount > 0) {
   const delay = Math.min(3000 * retryCount, 15000);
   console.log(`[TOC-WORKFLOW] Retrying in ${delay}ms... (attempt ${retryCount + 1})`);
   await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // ===== PHASE 1: Discovery Pass - Find Interesting Topics =====
  console.log(`[TOC-WORKFLOW] � PHASE 1: Topic Discovery with llama3-70b-8192...`);
  const rawTopics = await generateTableOfContents(transcript, videoDuration);

  if (rawTopics.length === 0) {
   console.warn(`[TOC-WORKFLOW] ⚠️ No interesting topics found in discovery phase`);
   throw new Error('No compelling topics could be identified from the transcript content. The content may not be suitable for short video segments.');
  }

  console.log(`[TOC-WORKFLOW] ✅ PHASE 1 Complete: Discovered ${rawTopics.length} raw topics`);

  // ===== PHASE 2: Refinement Pass - Optimize Segment Durations =====
  console.log(`[TOC-WORKFLOW] 🔧 PHASE 2: Segment Refinement with llama-3.1-8b-instant...`);
  const refinedTopics = await refineSegments(rawTopics, transcript);

  if (refinedTopics.length === 0) {
   console.warn(`[TOC-WORKFLOW] ⚠️ No topics could be refined to optimal duration`);
   throw new Error('No segments could be optimized to fit the 60-90 second duration constraints. The discovered content may not be suitable for short segments.');
  }

  console.log(`[TOC-WORKFLOW] ✅ PHASE 2 Complete: Refined ${refinedTopics.length} optimal segments from ${rawTopics.length} discoveries`);

  // ===== PHASE 3: Extract Verbatim Text for Each Refined Segment =====
  console.log(`[TOC-WORKFLOW] 📝 PHASE 3: Extracting verbatim text for refined segments...`);

  const finalSegments: any[] = [];

  for (const tocEntry of refinedTopics) {
   console.log(`[TOC-WORKFLOW] Processing: "${tocEntry.title}" (${tocEntry.startTime}-${tocEntry.endTime})`);

   let verbatimExcerpt = '';

   // Use verbatim extraction if we have timestamped segments
   if (transcriptSegments && transcriptSegments.length > 0) {
    verbatimExcerpt = extractVerbatimText(transcriptSegments, tocEntry.startTime, tocEntry.endTime);
   } else {
    // Fallback to smart excerpt extraction for plain text transcripts
    const startSeconds = parseTimeStringToSeconds(tocEntry.startTime);
    const endSeconds = parseTimeStringToSeconds(tocEntry.endTime);
    verbatimExcerpt = extractSmartExcerpt(transcript, startSeconds, endSeconds, transcriptSegments);
   }

   // Validate excerpt quality (duration was already validated in Phase 1)
   if (verbatimExcerpt && verbatimExcerpt.length >= 100) {
    const startSeconds = parseTimeStringToSeconds(tocEntry.startTime);
    const endSeconds = parseTimeStringToSeconds(tocEntry.endTime);
    const duration = endSeconds - startSeconds;

    // Final validation: Duration should already be 60-95s from refinement phase
    if (duration >= 60 && duration <= 95) {
     finalSegments.push({
      id: `toc-${Math.random().toString(36).substring(2, 11)}`,
      title: tocEntry.title,
      description: tocEntry.title, // Use title as description for two-pass approach
      startTimeSeconds: startSeconds,
      endTimeSeconds: endSeconds,
      duration: duration,
      transcriptExcerpt: verbatimExcerpt,
      appealReason: 'two-pass-optimized-segment',
     });

     console.log(`[TOC-WORKFLOW] ✅ Added refined segment: "${tocEntry.title}" (${duration}s, ${verbatimExcerpt.length} chars)`);
    } else {
     console.log(`[TOC-WORKFLOW] ❌ Rejected "${tocEntry.title}": duration validation failed (${duration}s not in 60-95s range)`);
    }
   } else {
    console.log(`[TOC-WORKFLOW] ❌ Rejected "${tocEntry.title}": excerpt too short (${verbatimExcerpt?.length || 0} chars)`);
   }
  }

  console.log(`[TOC-WORKFLOW] ✅ PHASE 3 Complete: Processed ${finalSegments.length} valid segments from ${refinedTopics.length} refined topics`);

  // FINAL VALIDATION - Clear error message for empty results
  if (finalSegments.length === 0) {
   throw new Error('No valid segments could be extracted with sufficient verbatim content. The refined segments may not contain enough substantial content for short videos.');
  }

  // Sort by start time and limit to top 10 segments
  finalSegments.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const limitedSegments = finalSegments.slice(0, 10);

  console.log(`[TOC-WORKFLOW] 🎯 Two-Pass Strategy Complete: ${limitedSegments.length} optimized segments (average duration: ${Math.round(limitedSegments.reduce((sum, s) => sum + s.duration, 0) / limitedSegments.length)}s)`);

  return limitedSegments;
 } catch (error: any) {
  console.error('[TOC-WORKFLOW] ❌ Two-Pass AI workflow error:', error);

  // Retry logic with fallback to legacy approach
  if (retryCount < 2) {
   console.log(`[TOC-WORKFLOW] 🔄 Retrying Two-Pass AI workflow (attempt ${retryCount + 2})`);
   return generateShortsIdeas(videoUrl, transcript, videoDuration, transcriptSegments, retryCount + 1);
  }

  // Final fallback: try legacy single-prompt approach for smaller transcripts
  if (retryCount >= 2 && transcript && transcript.length < 50000) {
   console.log(`[TOC-WORKFLOW] 🔄 Final fallback: attempting legacy single-prompt approach for smaller transcript`);
   return generateShortsIdeasLegacy(videoUrl, transcript, videoDuration, transcriptSegments);
  }

  throw new Error(`Two-Pass AI segmentation failed after ${retryCount + 1} attempts: ${error.message}`);
 }
};

// ========================================================================================
// LEGACY SINGLE-PROMPT APPROACH (fallback for smaller transcripts)
// ========================================================================================

const generateShortsIdeasLegacy = async (videoUrl: string, transcript: string, videoDuration?: number, transcriptSegments?: TranscriptSegment[]): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 console.log(`[LEGACY-FALLBACK] 🔄 Using legacy single-prompt approach as final fallback`);

 // Prepare enhanced transcript data
 const transcriptData: EnhancedTranscriptData = {
  transcript: transcript || '',
  segments: transcriptSegments || [],
  method: transcriptSegments && transcriptSegments.length > 0 ? 'With Timing Data' : 'Plain Text',
 };

 const prompt = generatePrecisionPrompt(transcriptData, videoDuration);

 try {
  const completion = await groq.chat.completions.create({
   messages: [
    {
     role: 'system',
     content:
      'You are a precise video segmentation expert specializing in accurate transcript extraction. Your role is to identify key segments and extract the EXACT spoken words from those segments without any summarization, paraphrasing, or creative interpretation. Always respond with valid JSON arrays containing verbatim transcript excerpts.',
    },
    {
     role: 'user',
     content: prompt,
    },
   ],
   model: 'llama-3.1-8b-instant', // Use faster model for fallback
   temperature: 0.1,
   max_tokens: 3000,
   top_p: 0.9,
   stream: false,
  });

  const rawText = completion.choices[0]?.message?.content?.trim() || '';

  // Enhanced JSON parsing logic
  let suggestions: GeminiShortSegmentSuggestion[] = [];

  try {
   // First try direct parse
   suggestions = JSON.parse(rawText);
  } catch (parseError) {
   console.error('[LEGACY-FALLBACK] JSON parse failed. Original text:', rawText);
   console.error('[LEGACY-FALLBACK] Parse error:', parseError);

   // Try to extract JSON array from response
   let jsonStrToParse = '';

   // Method 1: Look for complete JSON array
   const arrayRegex = /\[[\s\S]*\]/;
   const arrayMatch = arrayRegex.exec(rawText);
   if (arrayMatch) {
    jsonStrToParse = arrayMatch[0];
   } else {
    // Method 2: Extract between first [ and last ]
    const firstBracket = rawText.indexOf('[');
    const lastBracket = rawText.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket > firstBracket) {
     jsonStrToParse = rawText.substring(firstBracket, lastBracket + 1);
    } else {
     // Method 3: Try to extract JSON objects and wrap in array
     const objectMatches = rawText.match(/\{[^}]*\}/g);
     if (objectMatches && objectMatches.length > 0) {
      jsonStrToParse = '[' + objectMatches.join(',') + ']';
     } else {
      console.error('[LEGACY-FALLBACK] No JSON found in response. Full text:', rawText);
      throw new Error('Tidak ditemukan JSON di respons AI. AI mungkin mengembalikan text biasa atau format tidak sesuai.');
     }
    }
   }

   if (jsonStrToParse) {
    // Try to fix common JSON issues
    let fixedJsonStr = jsonStrToParse;

    // Fix trailing commas
    fixedJsonStr = fixedJsonStr.replace(/,(\s*[}\]])/g, '$1');

    // Fix single quotes to double quotes
    fixedJsonStr = fixedJsonStr.replace(/'/g, '"');

    // Fix unescaped quotes in strings
    fixedJsonStr = fixedJsonStr.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"');

    try {
     console.log('[LEGACY-FALLBACK] Trying to parse fixed JSON:', fixedJsonStr.substring(0, 200));
     suggestions = JSON.parse(fixedJsonStr);
     console.log('[LEGACY-FALLBACK] Successfully parsed fixed JSON');
    } catch (secondParseError) {
     console.error('[LEGACY-FALLBACK] Fixed JSON parse also failed:', secondParseError);
     throw new Error(`AI response tidak valid JSON. Respons asli: "${rawText.substring(0, 500)}...". Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
    }
   } else {
    throw new Error(`AI response tidak valid JSON. Respons asli: "${rawText.substring(0, 500)}...". Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
   }
  }

  if (!Array.isArray(suggestions)) {
   console.error('[LEGACY-FALLBACK] Groq response is not an array:', suggestions);
   throw new Error('AI response was not in the expected format (array of suggestions).');
  }

  console.log(`[LEGACY-FALLBACK] Generated ${suggestions.length} segments with legacy approach`);

  // Smart processing with excerpt enhancement
  const processedSuggestions = suggestions.map((suggestion) => {
   // Handle both new format (startTime/endTime) and old format (startTimeString/endTimeString)
   let startTimeString = suggestion.startTimeString || suggestion.startTime || '0:00';
   let endTimeString = suggestion.endTimeString || suggestion.endTime || '1:00';

   let startTimeSeconds = parseTimeStringToSeconds(startTimeString);
   let endTimeSeconds = parseTimeStringToSeconds(endTimeString);

   // Extract transcript excerpt (handle both field names)
   let smartExcerpt = (suggestion as any).transcriptExcerpt || (suggestion as any).transkripExcerpt || suggestion.description || '';

   // If AI excerpt is too short or repetitive, generate better one
   if (smartExcerpt.length < 150 || isRepetitive(smartExcerpt)) {
    console.log(`[LEGACY-FALLBACK] AI excerpt too short (${smartExcerpt.length} chars), generating smart excerpt for "${suggestion.title}"`);
    smartExcerpt = extractSmartExcerpt(transcriptData?.transcript || '', startTimeSeconds, endTimeSeconds, transcriptData?.segments);
    console.log(`[LEGACY-FALLBACK] Enhanced excerpt for "${suggestion.title}": ${smartExcerpt.substring(0, 100)}... (${smartExcerpt.length} chars)`);
   }

   console.log(`[LEGACY-FALLBACK] "${suggestion.title}" (${startTimeString}-${endTimeString}) = ${endTimeSeconds - startTimeSeconds}s | Excerpt: ${smartExcerpt ? smartExcerpt.substring(0, 50) + '...' : 'MISSING'}`);

   return {
    title: suggestion.title,
    description: suggestion.description || suggestion.title, // Fallback if no description
    startTimeString: startTimeString,
    endTimeString: endTimeString,
    transcriptExcerpt: smartExcerpt,
    appealReason: (suggestion as any).appealReason || 'legacy-fallback',
   };
  });

  // Smart processing with excerpt enhancement and duration validation
  const validatedSegments = processedSuggestions
   .filter((segment: any) => {
    if (!segment.transcriptExcerpt || segment.transcriptExcerpt.length < 100) {
     console.log(`[LEGACY-FALLBACK] ❌ Rejected segment "${segment.title}": excerpt too short (${segment.transcriptExcerpt?.length || 0} chars)`);
     return false;
    }

    const startSeconds = parseTimeStringToSeconds(segment.startTimeString);
    const endSeconds = parseTimeStringToSeconds(segment.endTimeString);
    const duration = endSeconds - startSeconds;

    if (duration < 30) {
     console.log(`[LEGACY-FALLBACK] ❌ Rejected segment "${segment.title}": too short (${duration}s < 30s minimum)`);
     return false;
    }

    if (duration > 120) {
     console.log(`[LEGACY-FALLBACK] ❌ Rejected segment "${segment.title}": too long (${duration}s > 120s maximum)`);
     return false;
    }

    console.log(`[LEGACY-FALLBACK] ✅ Validated segment "${segment.title}": ${duration}s duration, ${segment.transcriptExcerpt.length} char excerpt`);
    return true;
   })
   .slice(0, 10) // Maximum 10 quality segments
   .map((segment: any) => {
    const startSeconds = parseTimeStringToSeconds(segment.startTimeString);
    const endSeconds = parseTimeStringToSeconds(segment.endTimeString);

    return {
     id: `legacy-${Math.random().toString(36).substring(2, 11)}`,
     title: segment.title,
     description: segment.description,
     startTimeSeconds: startSeconds,
     endTimeSeconds: endSeconds,
     duration: endSeconds - startSeconds,
     transcriptExcerpt: segment.transcriptExcerpt,
     appealReason: segment.appealReason || 'legacy',
    };
   });

  console.log(`[LEGACY-FALLBACK] Final output: ${validatedSegments.length} validated segments (average duration: ${Math.round(validatedSegments.reduce((sum, s) => sum + s.duration, 0) / validatedSegments.length)}s)`);

  return validatedSegments;
 } catch (error: any) {
  console.error('[LEGACY-FALLBACK] Legacy generation error:', error);
  throw new Error(`Legacy AI segmentation failed: ${error.message}`);
 }
};
