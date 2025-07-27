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

// Smart Excerpt Extraction Function
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
 const languageContext =
  languageDetection.language === 'indonesian'
   ? 'The provided transcript is in Indonesian language.'
   : languageDetection.language === 'english'
   ? 'The provided transcript is in English language.'
   : 'The transcript language could not be determined reliably.';

 // Calculate target segments based on video duration
 let targetSegments = Math.min(8, Math.max(3, Math.floor(safeVideoDuration / 180))); // 1 segment per 3 minutes

 // Prepare timing information for the AI
 let timingInstructions = '';
 if (hasTimingData) {
  // Show sample segments to demonstrate the timing format
  const sampleSegments = segments
   .slice(0, 10)
   .map((seg, idx) => {
    const startTime = new Date(seg.start * 1000).toISOString().substr(14, 5); // MM:SS format
    const endTime = new Date(seg.end * 1000).toISOString().substr(14, 5);
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

export const generateShortsIdeas = async (videoUrl: string, transcript?: string, videoDuration?: number, transcriptSegments?: TranscriptSegment[], retryCount = 0): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized. GROQ_API_KEY might be missing.');
 }

 // Validate transcript quality
 if (!transcript || transcript.length < 500) {
  console.error(`[GROQ] ❌ Transcript too short or missing (${transcript?.length || 0} chars)`);
  throw new Error(`Transcript terlalu pendek atau tidak tersedia (${transcript?.length || 0} karakter). Pastikan backend extraction berhasil.`);
 }

 // Check if transcript is AI-generated placeholder
 if (transcript.includes('ai-generated transcript: this video appears to be') || transcript.includes('AI-generated content')) {
  console.error('[GROQ] ❌ AI-generated placeholder transcript detected');
  throw new Error('Transcript adalah AI-generated placeholder. Gunakan backend transcript extraction yang sesungguhnya.');
 }

 // Prepare enhanced transcript data
 const transcriptData: EnhancedTranscriptData = {
  transcript: transcript || '',
  segments: transcriptSegments || [],
  method: transcriptSegments && transcriptSegments.length > 0 ? 'With Timing Data' : 'Plain Text',
 };

 const prompt = generatePrecisionPrompt(transcriptData, videoDuration);

 try {
  console.log(`[GROQ] Generating segments (attempt ${retryCount + 1})`);

  // Add delay between retries
  if (retryCount > 0) {
   const delay = Math.min(3000 * retryCount, 15000);
   console.log(`[GROQ] Retrying in ${delay}ms...`);
   await new Promise((resolve) => setTimeout(resolve, delay));
  }
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
   model: retryCount > 1 ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
   temperature: 0.1, // Very low temperature for precision
   max_tokens: retryCount > 0 ? 3000 : 4000,
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
   console.error('[GROQ DEBUG] JSON parse failed. Original text:', rawText);
   console.error('[GROQ DEBUG] Parse error:', parseError);

   // Try to extract JSON array from response
   let jsonStrToParse = '';

   // Method 1: Look for complete JSON array
   const arrayMatch = rawText.match(/\[[\s\S]*\]/);
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
      console.error('[GROQ DEBUG] No JSON found in response. Full text:', rawText);
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
     console.log('[GROQ DEBUG] Trying to parse fixed JSON:', fixedJsonStr.substring(0, 200));
     suggestions = JSON.parse(fixedJsonStr);
     console.log('[GROQ DEBUG] Successfully parsed fixed JSON');
    } catch (secondParseError) {
     console.error('[GROQ DEBUG] Fixed JSON parse also failed:', secondParseError);
     throw new Error(`AI response tidak valid JSON. Respons asli: "${rawText.substring(0, 500)}...". Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
    }
   } else {
    throw new Error(`AI response tidak valid JSON. Respons asli: "${rawText.substring(0, 500)}...". Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
   }
  }

  if (!Array.isArray(suggestions)) {
   console.error('Groq response is not an array:', suggestions);
   throw new Error('AI response was not in the expected format (array of suggestions).');
  }

  console.log(`[GROQ] Generated ${suggestions.length} segments with natural durations`);

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
    console.log(`[GROQ] AI excerpt too short (${smartExcerpt.length} chars), generating smart excerpt for "${suggestion.title}"`);
    smartExcerpt = extractSmartExcerpt(transcriptData?.transcript || '', startTimeSeconds, endTimeSeconds, transcriptData?.segments);
    console.log(`[GROQ] Enhanced excerpt for "${suggestion.title}": ${smartExcerpt.substring(0, 100)}... (${smartExcerpt.length} chars)`);
   }

   console.log(`[GROQ] "${suggestion.title}" (${startTimeString}-${endTimeString}) = ${endTimeSeconds - startTimeSeconds}s | Excerpt: ${smartExcerpt ? smartExcerpt.substring(0, 50) + '...' : 'MISSING'}`);

   return {
    title: suggestion.title,
    description: suggestion.description || suggestion.title, // Fallback if no description
    startTimeString: startTimeString,
    endTimeString: endTimeString,
    transcriptExcerpt: smartExcerpt,
    appealReason: (suggestion as any).appealReason || 'viral',
   };
  });

  // Smart processing with excerpt enhancement and duration validation
  const validatedSegments = processedSuggestions
   .filter((segment: any) => {
    if (!segment.transcriptExcerpt || segment.transcriptExcerpt.length < 100) {
     console.log(`[GROQ] ❌ Rejected segment "${segment.title}": excerpt too short (${segment.transcriptExcerpt?.length || 0} chars)`);
     return false;
    }

    const startSeconds = parseTimeStringToSeconds(segment.startTimeString);
    const endSeconds = parseTimeStringToSeconds(segment.endTimeString);
    const duration = endSeconds - startSeconds;

    if (duration < 30) {
     console.log(`[GROQ] ❌ Rejected segment "${segment.title}": too short (${duration}s < 30s minimum)`);
     return false;
    }

    if (duration > 120) {
     console.log(`[GROQ] ❌ Rejected segment "${segment.title}": too long (${duration}s > 120s maximum)`);
     return false;
    }

    console.log(`[GROQ] ✅ Validated segment "${segment.title}": ${duration}s duration, ${segment.transcriptExcerpt.length} char excerpt`);
    return true;
   })
   .slice(0, 10) // Maximum 10 quality segments
   .map((segment: any) => {
    const startSeconds = parseTimeStringToSeconds(segment.startTimeString);
    const endSeconds = parseTimeStringToSeconds(segment.endTimeString);

    return {
     id: `enhanced-${Math.random().toString(36).substr(2, 9)}`,
     title: segment.title,
     description: segment.description,
     startTimeSeconds: startSeconds,
     endTimeSeconds: endSeconds,
     duration: endSeconds - startSeconds,
     transcriptExcerpt: segment.transcriptExcerpt,
     appealReason: segment.appealReason || 'viral',
    };
   });

  console.log(`[GROQ] Final output: ${validatedSegments.length} validated segments (average duration: ${Math.round(validatedSegments.reduce((sum, s) => sum + s.duration, 0) / validatedSegments.length)}s)`);

  return validatedSegments;
 } catch (error: any) {
  console.error('[GROQ] Enhanced generation error:', error);

  // Retry logic
  if (retryCount < 2) {
   console.log(`[GROQ] Retrying enhanced generation (attempt ${retryCount + 1})`);
   return generateShortsIdeas(videoUrl, transcript, videoDuration, transcriptSegments, retryCount + 1);
  }

  throw new Error(`Enhanced AI segmentation failed after ${retryCount + 1} attempts: ${error.message}`);
 }
};
