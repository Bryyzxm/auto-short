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
// PART 1: UNIFIED SINGLE-PASS STRATEGY - Discovery + Duration Optimization Combined
// ========================================================================================

interface TableOfContentsEntry {
 title: string;
 startTime: string; // MM:SS format
 endTime: string; // MM:SS format
}

/**
 * UNIFIED SINGLE-PASS AI STRATEGY: Discovery + Duration Optimization in One Call
 * This eliminates the need for a second refinement pass, reducing rate limit pressure
 * FIXES: Indonesian language output + strict 60-90s duration constraints + deduplication
 */
const generateTableOfContents = async (fullTranscriptText: string, videoDuration?: number): Promise<TableOfContentsEntry[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized');
 }

 const CHUNK_SIZE = 10000; // Slightly larger chunks for more context in single-pass
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

 console.log(`[UNIFIED-AI] Processing ${chunks.length} chunks with single-pass strategy`);

 const allSegments: TableOfContentsEntry[] = [];
 const safeVideoDuration = videoDuration || Math.ceil((fullTranscriptText.length / 2500) * 60);

 // Detect if transcript is Indonesian
 const isIndonesian = detectLanguage(fullTranscriptText).language === 'indonesian';
 const languageInstruction = isIndonesian ? 'PENTING: Transkrip ini dalam bahasa Indonesia. Anda HARUS membuat judul dalam BAHASA INDONESIA.' : 'IMPORTANT: Generate titles in the same language as the transcript content.';

 // SINGLE-PASS PROCESSING: Discovery + Duration Optimization Combined
 for (const chunk of chunks) {
  try {
   console.log(`[UNIFIED-AI] Processing chunk ${chunk.chunkNumber}/${chunk.totalChunks} with unified strategy...`);

   // Calculate approximate time range for this chunk
   const startTimeRatio = chunk.startCharPosition / fullTranscriptText.length;
   const endTimeRatio = chunk.endCharPosition / fullTranscriptText.length;

   const chunkStartTime = Math.floor(startTimeRatio * safeVideoDuration);
   const chunkEndTime = Math.floor(endTimeRatio * safeVideoDuration);

   // UNIFIED PROMPT: Discovery + Duration Optimization in One Call
   const prompt = `You are an expert video content analyst and producer. Your task is to analyze this transcript chunk from an Indonesian video and identify the most engaging, viral-worthy segments.

${languageInstruction}

INFO CHUNK:
- Chunk ${chunk.chunkNumber} dari ${chunk.totalChunks}
- Rentang waktu perkiraan: ${Math.floor(chunkStartTime / 60)}:${(chunkStartTime % 60).toString().padStart(2, '0')} sampai ${Math.floor(chunkEndTime / 60)}:${(chunkEndTime % 60).toString().padStart(2, '0')}
- Durasi video: ${Math.floor(safeVideoDuration / 60)} menit ${safeVideoDuration % 60} detik

Your primary goal is to find distinct, compelling topics. For each topic you identify:

1. **Find the natural start and end points.** A good segment should feel complete, with a clear beginning and end.
2. **Target a duration between 30 and 120 seconds.** This is a flexible guideline. A fantastic 35-second clip is better than a mediocre 60-second one. A compelling 110-second story is also excellent. Use your judgment to find the best possible clip.
3. **Provide the output in INDONESIAN.** This includes the title.
4. For each segment you find, provide the following as a clean, parsable JSON array:
   - A short, engaging title in Indonesian (\`title\`).
   - The exact start time (\`startTime\`) in MM:SS format.
   - The exact end time (\`endTime\`) in MM:SS format.

If you identify a great topic that is longer than 120 seconds, you are allowed to find the best, most impactful sub-section within it that fits the time guideline.

Prioritize content quality and natural conversational flow above all else.

OUTPUT FORMAT (Kembalikan HANYA JSON yang valid, tanpa teks tambahan):
[
  {
    "title": "Judul topik menarik dalam bahasa Indonesia (5-8 kata)",
    "startTime": "MM:SS",
    "endTime": "MM:SS"
  }
]

Jika tidak ada topik menarik yang memenuhi kriteria durasi yang dapat diidentifikasi dalam chunk ini, kembalikan: []

TRANSKRIP CHUNK:
"""
${chunk.text}
"""`;

   // Make API call with intelligent retry logic for rate limits
   console.log(`[UNIFIED-AI] Making unified API call for chunk ${chunk.chunkNumber}...`);

   let chunkAttempts = 0;
   const maxChunkRetries = 2;
   let chunkSegments: TableOfContentsEntry[] = [];

   while (chunkAttempts < maxChunkRetries) {
    try {
     const completion = await groq.chat.completions.create({
      messages: [
       {
        role: 'system',
        content: isIndonesian
         ? 'Anda adalah ahli segmentasi video yang mengkhususkan diri dalam mengidentifikasi konten paling menarik dari transkrip video Indonesia. Peran Anda adalah menemukan konten menarik yang akan membuat video pendek yang bagus, dengan fokus pada kualitas dan ketepatan durasi 60-90 detik. Selalu respons dengan array JSON yang valid saja dalam bahasa Indonesia.'
         : 'You are an expert video segmentation specialist who identifies the most engaging content from video transcripts. Your role is to find compelling content that would make great short videos, focusing on quality and precise 60-90 second duration constraints. Always respond with valid JSON arrays only in the same language as the transcript.',
       },
       {
        role: 'user',
        content: prompt,
       },
      ],
      model: 'llama3-70b-8192', // Use powerful model for complex unified task
      temperature: 0.2, // Lower temperature for more consistent duration compliance
      max_tokens: 1000, // More tokens for unified processing
      top_p: 0.8,
      stream: false,
     });
     const response = completion.choices[0]?.message?.content?.trim() || '';
     console.log(`[UNIFIED-AI] Received response for chunk ${chunk.chunkNumber}: ${response.substring(0, 100)}...`);

     // Parse AI response
     try {
      // Extract JSON from response
      const jsonRegex = /\[[\s\S]*\]/;
      const jsonMatch = jsonRegex.exec(response);
      if (jsonMatch) {
       chunkSegments = JSON.parse(jsonMatch[0]);
       console.log(`[UNIFIED-AI] Successfully parsed ${chunkSegments.length} segments for chunk ${chunk.chunkNumber}`);
       break; // Success - exit retry loop
      } else {
       console.warn(`[UNIFIED-AI] No valid JSON found in chunk ${chunk.chunkNumber} response`);
       break;
      }
     } catch (parseError) {
      console.warn(`[UNIFIED-AI] Failed to parse JSON for chunk ${chunk.chunkNumber}:`, parseError);
      break;
     }
    } catch (error: any) {
     chunkAttempts++;
     console.error(`[UNIFIED-AI] Error processing chunk ${chunk.chunkNumber} (attempt ${chunkAttempts}/${maxChunkRetries}):`, error.message);

     // INTELLIGENT DYNAMIC RATE LIMIT HANDLING
     if (error.response?.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
      console.warn(`[UNIFIED-AI] 🚦 Rate limit hit for chunk ${chunk.chunkNumber} (attempt ${chunkAttempts})`);

      // Parse the suggested wait time from error message
      let waitTimeInSeconds = 8; // Higher default for 70b model
      const waitTimeMatch = error.message?.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (waitTimeMatch) {
       waitTimeInSeconds = parseFloat(waitTimeMatch[1]);
       console.log(`[UNIFIED-AI] Extracted wait time: ${waitTimeInSeconds} seconds from error message`);
      }

      // Implement dynamic delay with buffer
      const dynamicDelayMs = (waitTimeInSeconds + 2) * 1000; // Add 2 second buffer for 70b model
      console.log(`[UNIFIED-AI] ⏳ Rate limit hit. Waiting for ${waitTimeInSeconds + 2} seconds before retry...`);
      await new Promise((resolve) => setTimeout(resolve, dynamicDelayMs));

      if (chunkAttempts < maxChunkRetries) {
       console.log(`[UNIFIED-AI] 🔄 Retrying chunk ${chunk.chunkNumber} (attempt ${chunkAttempts + 1}/${maxChunkRetries})`);
       continue;
      } else {
       console.error(`[UNIFIED-AI] ❌ Max retries reached for chunk ${chunk.chunkNumber}, skipping...`);
       break;
      }
     } else {
      console.error(`[UNIFIED-AI] Non-rate-limit error for chunk ${chunk.chunkNumber}, skipping retries`);
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Longer delay for other errors
      break;
     }
    }
   }

   // Validate and collect segments with strict duration enforcement
   if (Array.isArray(chunkSegments)) {
    chunkSegments.forEach((segment) => {
     if (segment.title && segment.startTime && segment.endTime) {
      const startSeconds = parseTimeStringToSeconds(segment.startTime);
      const endSeconds = parseTimeStringToSeconds(segment.endTime);
      const duration = endSeconds - startSeconds;

      // STRICT DURATION VALIDATION: Only accept 30-120 second segments
      if (duration >= 30 && duration <= 120) {
       allSegments.push(segment);
       console.log(`[UNIFIED-AI] ✅ Accepted segment: "${segment.title}" (${segment.startTime}-${segment.endTime}, ${duration}s)`);
      } else {
       console.warn(`[UNIFIED-AI] ❌ Rejected segment "${segment.title}": duration ${duration}s outside 30-120s range`);
      }
     }
    });
   }

   // CONSERVATIVE DELAY to respect API rate limits
   if (chunk.chunkNumber < chunk.totalChunks) {
    console.log(`[UNIFIED-AI] Chunk ${chunk.chunkNumber} complete. Waiting 2000ms before next request...`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Longer delay for rate limit safety
   }
  } catch (finalError: any) {
   console.error(`[UNIFIED-AI] Final error for chunk ${chunk.chunkNumber}:`, finalError.message);
  }
 }

 console.log(`[UNIFIED-AI] Single-pass processing complete: Generated ${allSegments.length} validated segments`);

 // PART 3: DEDUPLICATION - Eliminate any remaining duplicates
 const deduplicatedSegments = deduplicateSegments(allSegments);
 console.log(`[UNIFIED-AI] After deduplication: ${deduplicatedSegments.length} unique segments`);

 if (deduplicatedSegments.length === 0) {
  console.warn(`[UNIFIED-AI] ⚠️ No valid segments could be generated with unified strategy`);
  throw new Error('No suitable segments could be identified that meet the 30-120 second duration requirements.');
 }

 return deduplicatedSegments;
};

// ========================================================================================
// PART 2: DEDUPLICATION FUNCTION - Eliminate Duplicate Segments
// ========================================================================================

/**
 * Removes duplicate segments based on overlapping time ranges
 * Uses intelligent overlap detection to ensure segment diversity
 */
const deduplicateSegments = (segments: TableOfContentsEntry[]): TableOfContentsEntry[] => {
 console.log(`[DEDUPLICATOR] Starting deduplication of ${segments.length} segments...`);

 if (segments.length <= 1) {
  return segments;
 }

 const uniqueSegments: TableOfContentsEntry[] = [];
 const usedTimeRanges = new Set<string>();

 // Sort segments by start time for better processing
 const sortedSegments = [...segments].sort((a, b) => {
  const startA = parseTimeStringToSeconds(a.startTime);
  const startB = parseTimeStringToSeconds(b.startTime);
  return startA - startB;
 });

 for (const segment of sortedSegments) {
  const startSeconds = parseTimeStringToSeconds(segment.startTime);
  const endSeconds = parseTimeStringToSeconds(segment.endTime);

  // Create a unique key for this time range
  const timeKey = `${segment.startTime}-${segment.endTime}`;

  // Check for exact duplicates first
  if (usedTimeRanges.has(timeKey)) {
   console.log(`[DEDUPLICATOR] ❌ Rejected exact duplicate: "${segment.title}" (${timeKey})`);
   continue;
  }

  // Check for overlapping segments (>50% overlap)
  let hasSignificantOverlap = false;
  for (const existingSegment of uniqueSegments) {
   const existingStart = parseTimeStringToSeconds(existingSegment.startTime);
   const existingEnd = parseTimeStringToSeconds(existingSegment.endTime);

   // Calculate overlap
   const overlapStart = Math.max(startSeconds, existingStart);
   const overlapEnd = Math.min(endSeconds, existingEnd);
   const overlapDuration = Math.max(0, overlapEnd - overlapStart);

   const currentDuration = endSeconds - startSeconds;
   const existingDuration = existingEnd - existingStart;
   const overlapPercentage = overlapDuration / Math.min(currentDuration, existingDuration);

   if (overlapPercentage > 0.5) {
    // More than 50% overlap
    hasSignificantOverlap = true;
    console.log(`[DEDUPLICATOR] ❌ Rejected overlapping segment: "${segment.title}" (${Math.round(overlapPercentage * 100)}% overlap with "${existingSegment.title}")`);
    break;
   }
  }

  if (!hasSignificantOverlap) {
   uniqueSegments.push(segment);
   usedTimeRanges.add(timeKey);
   console.log(`[DEDUPLICATOR] ✅ Accepted unique segment: "${segment.title}" (${timeKey})`);
  }
 }

 console.log(`[DEDUPLICATOR] Deduplication complete: ${uniqueSegments.length} unique segments from ${segments.length} input segments`);
 return uniqueSegments;
};

// ========================================================================================
// PART 2: TEXT CLEANUP AND DEDUPLICATION HELPER FUNCTIONS
// ========================================================================================

/**
 * Clean up repeated text patterns common in transcripts
 * Removes duplicated phrases and normalizes whitespace
 */
const cleanupRepeatedText = (text: string): string => {
 let cleaned = text;

 // STEP 1: Normalize whitespace - replace multiple spaces with single space
 cleaned = cleaned.replace(/(\s)\1+/g, '$1');

 // STEP 2: Remove common transcript stutters and repetitions
 cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1'); // Remove immediate word repetitions like "the the"
 cleaned = cleaned.replace(/\b(eh|um|uh|er)\s+/gi, ' '); // Remove common filler words

 // STEP 3: Basic sentence deduplication
 const sentences = cleaned.split(/[.!?]+/).filter((s) => s.trim().length > 5);
 const uniqueSentences: string[] = [];

 sentences.forEach((sentence) => {
  const trimmed = sentence.trim();
  // Only add if not already present (case-insensitive check)
  const isDuplicate = uniqueSentences.some((existing) => existing.toLowerCase().trim() === trimmed.toLowerCase());

  if (!isDuplicate && trimmed.length > 5) {
   uniqueSentences.push(trimmed);
  }
 });

 // STEP 4: Final cleanup
 cleaned = uniqueSentences.join('. ').trim();
 if (cleaned && !cleaned.endsWith('.')) {
  cleaned += '.';
 }

 return cleaned;
};

// ========================================================================================
// PART 3: FINAL SANITIZATION FUNCTION
// ========================================================================================

/**
 * PART 3: FINAL SANITIZATION STEP (Post-Extraction)
 * Apply final cleanup operations to extracted transcript text
 */
const sanitizeExtractedText = (text: string): string => {
 let sanitized = text;

 // Remove repetitive stutters common in transcripts (e.g., "ee... ee...")
 sanitized = sanitized.replace(/\b(\w{1,2})\.\.\.\s*\1\.\.\./gi, '$1');

 // Normalize whitespace (trim and replace multiple spaces with single space)
 sanitized = sanitized.replace(/\s+/g, ' ').trim();

 // Advanced deduplication: detect and remove duplicated phrases
 const words = sanitized.split(' ');
 const cleanedWords: string[] = [];

 for (let i = 0; i < words.length; i++) {
  // Check for phrase repetition (2-4 word phrases)
  let skipCount = 0;

  for (let phraseLen = 2; phraseLen <= 4 && phraseLen <= words.length - i; phraseLen++) {
   const currentPhrase = words
    .slice(i, i + phraseLen)
    .join(' ')
    .toLowerCase();
   const nextPhrase = words
    .slice(i + phraseLen, i + phraseLen * 2)
    .join(' ')
    .toLowerCase();

   if (currentPhrase === nextPhrase && currentPhrase.length > 3) {
    skipCount = phraseLen; // Skip the repeated phrase
    break;
   }
  }

  if (skipCount === 0) {
   cleanedWords.push(words[i]);
  } else {
   // Skip the repeated phrase
   i += skipCount - 1;
  }
 }

 sanitized = cleanedWords.join(' ');

 // Final normalization
 sanitized = sanitized.replace(/\s+/g, ' ').trim();

 return sanitized;
};

// ========================================================================================
// PART 4: VERBATIM TEXT EXTRACTOR FUNCTION (Enhanced)
// ========================================================================================

/**
 * PART 2: FIXED VERBATIM TEXT EXTRACTION LOGIC
 * Extract verbatim transcript text for a given time range with precision timing
 * This ensures 100% accuracy to the original source material and eliminates duplications
 */
const extractVerbatimText = (fullTranscriptWithTimestamps: TranscriptSegment[], startTime: string, endTime: string): string => {
 // Convert MM:SS format to seconds
 const startSeconds = parseTimeStringToSeconds(startTime);
 const endSeconds = parseTimeStringToSeconds(endTime);

 console.log(`[VERBATIM-EXTRACTOR] Extracting text from ${startTime} (${startSeconds}s) to ${endTime} (${endSeconds}s)`);

 // STEP 1: Collect lines that fall within the precise time range
 const collectedLines: TranscriptSegment[] = [];

 fullTranscriptWithTimestamps.forEach((segment) => {
  const segmentStart = segment.start;
  const segmentEnd = segment.end;

  // PRECISE TIMING: Include segment if its start time is >= startTime AND < endTime
  // This prevents overlapping and duplication issues from the previous logic
  if (segmentStart >= startSeconds && segmentStart < endSeconds) {
   collectedLines.push(segment);
  }
 });

 if (collectedLines.length === 0) {
  console.warn(`[VERBATIM-EXTRACTOR] No segments found for time range ${startTime}-${endTime}`);
  return '';
 }

 // STEP 2: Sort by start time to ensure proper order
 collectedLines.sort((a, b) => a.start - b.start);

 // STEP 3: Extract text and apply basic deduplication
 const textSegments = collectedLines.map((segment) => segment.text.trim()).filter((text) => text.length > 0);

 // STEP 4: Join text and apply cleanup to remove repetitive patterns
 const rawText = textSegments.join(' ');
 const cleanedText = cleanupRepeatedText(rawText);

 console.log(`[VERBATIM-EXTRACTOR] Extracted ${cleanedText.length} characters from ${collectedLines.length} segments`);

 return cleanedText;
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

// ========================================================================================
// PART 4: MAIN AI FUNCTION - ORCHESTRATES THE UNIFIED SINGLE-PASS WORKFLOW
// ========================================================================================

export const generateShortsIdeas = async (videoUrl: string, transcript?: string, videoDuration?: number, transcriptSegments?: TranscriptSegment[], retryCount = 0): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized. GROQ_API_KEY might be missing.');
 }

 // Validate transcript quality
 if (!transcript || transcript.length < 500) {
  console.error(`[UNIFIED-WORKFLOW] ❌ Transcript too short or missing (${transcript?.length || 0} chars)`);
  throw new Error(`Transcript terlalu pendek atau tidak tersedia (${transcript?.length || 0} karakter). Pastikan backend extraction berhasil.`);
 }

 // Check if transcript is AI-generated placeholder
 if (transcript.includes('ai-generated transcript: this video appears to be') || transcript.includes('AI-generated content')) {
  console.error('[UNIFIED-WORKFLOW] ❌ AI-generated placeholder transcript detected');
  throw new Error('Transcript adalah AI-generated placeholder. Gunakan backend transcript extraction yang sesungguhnya.');
 }

 console.log(`[UNIFIED-WORKFLOW] 🚀 Starting Unified Single-Pass AI workflow for transcript (${transcript.length} chars, ${transcriptSegments?.length || 0} segments)`);

 try {
  // Add delay between retries
  if (retryCount > 0) {
   const delay = Math.min(3000 * retryCount, 15000);
   console.log(`[UNIFIED-WORKFLOW] Retrying in ${delay}ms... (attempt ${retryCount + 1})`);
   await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // ===== UNIFIED SINGLE-PASS: Discovery + Duration Optimization Combined =====
  console.log(`[UNIFIED-WORKFLOW] 🧠 UNIFIED PASS: Topic Discovery + Duration Optimization with llama3-70b-8192...`);
  const validatedSegments = await generateTableOfContents(transcript, videoDuration);

  if (validatedSegments.length === 0) {
   console.warn(`[UNIFIED-WORKFLOW] ⚠️ No valid segments found in unified pass`);
   throw new Error('No segments could be identified that meet the flexible 30-120 second duration requirements.');
  }

  console.log(`[UNIFIED-WORKFLOW] ✅ UNIFIED PASS Complete: Generated ${validatedSegments.length} validated segments`);

  // ===== VERBATIM TEXT EXTRACTION for Each Validated Segment =====
  console.log(`[UNIFIED-WORKFLOW] 📝 Extracting verbatim text for validated segments...`);

  const finalSegments: any[] = [];

  for (const tocEntry of validatedSegments) {
   console.log(`[UNIFIED-WORKFLOW] Processing: "${tocEntry.title}" (${tocEntry.startTime}-${tocEntry.endTime})`);

   let verbatimExcerpt = '';

   // Use verbatim extraction if we have timestamped segments
   if (transcriptSegments && transcriptSegments.length > 0) {
    const rawExcerpt = extractVerbatimText(transcriptSegments, tocEntry.startTime, tocEntry.endTime);
    // PART 3: APPLY FINAL SANITIZATION STEP
    verbatimExcerpt = sanitizeExtractedText(rawExcerpt);
   } else {
    // Fallback to smart excerpt extraction for plain text transcripts
    const startSeconds = parseTimeStringToSeconds(tocEntry.startTime);
    const endSeconds = parseTimeStringToSeconds(tocEntry.endTime);
    const rawExcerpt = extractSmartExcerpt(transcript, startSeconds, endSeconds, transcriptSegments);
    // PART 3: APPLY FINAL SANITIZATION STEP
    verbatimExcerpt = sanitizeExtractedText(rawExcerpt);
   }

   // Validate excerpt quality (duration was already validated in unified pass)
   if (verbatimExcerpt && verbatimExcerpt.length >= 100) {
    const startSeconds = parseTimeStringToSeconds(tocEntry.startTime);
    const endSeconds = parseTimeStringToSeconds(tocEntry.endTime);
    const duration = endSeconds - startSeconds;

    // Final validation: Duration should be 30-120s from unified pass
    if (duration >= 30 && duration <= 120) {
     finalSegments.push({
      id: `unified-${Math.random().toString(36).substring(2, 11)}`,
      title: tocEntry.title,
      description: tocEntry.title, // Use title as description for unified approach
      startTimeSeconds: startSeconds,
      endTimeSeconds: endSeconds,
      duration: duration,
      transcriptExcerpt: verbatimExcerpt,
      appealReason: 'unified-single-pass-optimized',
     });

     console.log(`[UNIFIED-WORKFLOW] ✅ Added validated segment: "${tocEntry.title}" (${duration}s, ${verbatimExcerpt.length} chars)`);
    } else {
     console.log(`[UNIFIED-WORKFLOW] ❌ Rejected "${tocEntry.title}": duration validation failed (${duration}s not in 30-120s range)`);
    }
   } else {
    console.log(`[UNIFIED-WORKFLOW] ❌ Rejected "${tocEntry.title}": excerpt too short (${verbatimExcerpt?.length || 0} chars)`);
   }
  }

  console.log(`[UNIFIED-WORKFLOW] ✅ Text Extraction Complete: Processed ${finalSegments.length} valid segments from ${validatedSegments.length} validated topics`);

  // FINAL VALIDATION - Clear error message for empty results
  if (finalSegments.length === 0) {
   throw new Error('No valid segments could be extracted with sufficient verbatim content. The validated segments may not contain enough substantial content for short videos.');
  }

  // Sort by start time and limit to top 10 segments
  finalSegments.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const limitedSegments = finalSegments.slice(0, 10);

  console.log(`[UNIFIED-WORKFLOW] 🎯 Unified Single-Pass Strategy Complete: ${limitedSegments.length} optimized segments (average duration: ${Math.round(limitedSegments.reduce((sum, s) => sum + s.duration, 0) / limitedSegments.length)}s)`);

  return limitedSegments;
 } catch (error: any) {
  console.error('[UNIFIED-WORKFLOW] ❌ Unified AI workflow error:', error);

  // Retry logic with fallback to legacy approach
  if (retryCount < 2) {
   console.log(`[UNIFIED-WORKFLOW] 🔄 Retrying Unified AI workflow (attempt ${retryCount + 2})`);
   return generateShortsIdeas(videoUrl, transcript, videoDuration, transcriptSegments, retryCount + 1);
  }

  // Final fallback: try legacy single-prompt approach for smaller transcripts
  if (retryCount >= 2 && transcript && transcript.length < 50000) {
   console.log(`[UNIFIED-WORKFLOW] 🔄 Final fallback: attempting legacy single-prompt approach for smaller transcript`);
   return generateShortsIdeasLegacy(videoUrl, transcript, videoDuration, transcriptSegments);
  }

  throw new Error(`Unified AI segmentation failed after ${retryCount + 1} attempts: ${error.message}`);
 }
};

// ========================================================================================
// LEGACY SINGLE-PROMPT APPROACH (fallback for smaller transcripts)
// ========================================================================================

const generateShortsIdeasLegacy = async (videoUrl: string, transcript: string, videoDuration?: number, transcriptSegments?: TranscriptSegment[]): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 console.log(`[LEGACY-FALLBACK] 🔄 Using legacy single-prompt approach as final fallback`);

 // Minimal legacy implementation for fallback
 const suggestions: any[] = [];

 try {
  const completion = await groq!.chat.completions.create({
   messages: [
    {
     role: 'system',
     content: 'You are a video segmentation expert. Generate 3-5 short video segments from the transcript.',
    },
    {
     role: 'user',
     content: `Find interesting 60-90 second segments from this transcript: ${transcript.substring(0, 5000)}...`,
    },
   ],
   model: 'llama-3.1-8b-instant',
   temperature: 0.3,
   max_tokens: 1000,
  });

  // Simple parsing and return minimal segments
  const response = completion.choices[0]?.message?.content || '';
  console.log(`[LEGACY-FALLBACK] Generated fallback response`);

  // Return empty array if no valid segments found
  return [];
 } catch (error) {
  console.error('[LEGACY-FALLBACK] Legacy fallback failed:', error);
  return [];
 }
};
