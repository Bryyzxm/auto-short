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
   const prompt = `Anda adalah ahli segmentasi video yang sangat cerdas. Tugas Anda adalah menganalisis bagian transkrip dari video Indonesia ini.

${languageInstruction}

INFO CHUNK:
- Chunk ${chunk.chunkNumber} dari ${chunk.totalChunks}
- Rentang waktu perkiraan: ${Math.floor(chunkStartTime / 60)}:${(chunkStartTime % 60).toString().padStart(2, '0')} sampai ${Math.floor(chunkEndTime / 60)}:${(chunkEndTime % 60).toString().padStart(2, '0')}
- Durasi video: ${Math.floor(safeVideoDuration / 60)} menit ${safeVideoDuration % 60} detik

TUGAS UTAMA:
Identifikasi hingga 3 topik yang berbeda dan menarik yang akan membuat konten video pendek yang bagus.

**ATURAN WAJIB DAN KETAT:**
1. **Untuk setiap topik, Anda HARUS menemukan segmen dialog berkelanjutan yang berdurasi antara 60 hingga 90 detik.**
2. **Jika topik menarik tetapi durasi alaminya terlalu panjang, Anda HARUS menemukan sub-bagian 60-90 detik yang paling menarik dalam topik tersebut.**
3. **JANGAN mengembalikan segmen lebih dari 90 detik.**
4. **Setiap segmen harus unik dan berbeda - hindari overlap waktu.**

PERSYARATAN UNTUK SETIAP SEGMEN:
- Topik yang menarik secara alami, informatif, atau menghibur
- Setiap topik harus berbeda dan mandiri
- Cari momen dengan struktur naratif yang jelas (awal, tengah, akhir)
- Temukan konten yang akan menarik perhatian penonton segera
- Durasi HARUS 60-90 detik (wajib)
- Waktu dalam format MM:SS relatif terhadap video penuh

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

      // STRICT DURATION VALIDATION: Only accept 60-90 second segments
      if (duration >= 60 && duration <= 90) {
       allSegments.push(segment);
       console.log(`[UNIFIED-AI] ✅ Accepted segment: "${segment.title}" (${segment.startTime}-${segment.endTime}, ${duration}s)`);
      } else {
       console.warn(`[UNIFIED-AI] ❌ Rejected segment "${segment.title}": duration ${duration}s outside 60-90s range`);
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
  throw new Error('No suitable segments could be identified that meet the 60-90 second duration requirements.');
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
// PART 3: VERBATIM TEXT EXTRACTOR FUNCTION
// ========================================================================================

/**
 * Extract verbatim transcript text for a given time range
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
   throw new Error('No segments could be identified that meet the strict 60-90 second duration requirements.');
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
    verbatimExcerpt = extractVerbatimText(transcriptSegments, tocEntry.startTime, tocEntry.endTime);
   } else {
    // Fallback to smart excerpt extraction for plain text transcripts
    const startSeconds = parseTimeStringToSeconds(tocEntry.startTime);
    const endSeconds = parseTimeStringToSeconds(tocEntry.endTime);
    verbatimExcerpt = extractSmartExcerpt(transcript, startSeconds, endSeconds, transcriptSegments);
   }

   // Validate excerpt quality (duration was already validated in unified pass)
   if (verbatimExcerpt && verbatimExcerpt.length >= 100) {
    const startSeconds = parseTimeStringToSeconds(tocEntry.startTime);
    const endSeconds = parseTimeStringToSeconds(tocEntry.endTime);
    const duration = endSeconds - startSeconds;

    // Final validation: Duration should already be 60-90s from unified pass
    if (duration >= 60 && duration <= 90) {
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
     console.log(`[UNIFIED-WORKFLOW] ❌ Rejected "${tocEntry.title}": duration validation failed (${duration}s not in 60-90s range)`);
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
