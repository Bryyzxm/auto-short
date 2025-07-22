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

// Enhanced prompt generator with timing awareness
const generateEnhancedPrompt = (videoUrl?: string, transcriptData?: EnhancedTranscriptData, videoDuration?: number, isRetry = false): string => {
 const videoContext = videoUrl ? `Video URL: ${videoUrl}` : 'Video YouTube dengan konten menarik';

 if (!transcriptData?.transcript) {
  return 'Error: No transcript data provided';
 }

 const transcript = transcriptData.transcript;
 const segments = transcriptData.segments || [];
 const hasTimingData = segments.length > 0;

 const safeVideoDuration = videoDuration || Math.ceil((transcript.length / 2500) * 60);

 // Only log if transcript is suspiciously short (AI generated)
 if (transcript.length < 1000) {
  console.warn(`[GROQ] ⚠️ Short transcript detected (${transcript.length} chars) - may be AI generated`);
 }

 // Calculate target segments based on video duration - more conservative for quality
 let targetSegments = 8;
 if (safeVideoDuration > 3600) targetSegments = 12; // 60+ menit: max 12 segmen (5+ menit per segmen)
 else if (safeVideoDuration > 2400) targetSegments = 10; // 40+ menit: max 10 segmen (4+ menit per segmen)
 else if (safeVideoDuration > 1800) targetSegments = 9; // 30+ menit: max 9 segmen (3+ menit per segmen)
 else if (safeVideoDuration > 1200) targetSegments = 8; // 20+ menit: max 8 segmen (2.5+ menit per segmen)
 else if (safeVideoDuration > 900) targetSegments = 7; // 15+ menit: max 7 segmen (2+ menit per segmen)
 else if (safeVideoDuration > 600) targetSegments = 6; // 10+ menit: max 6 segmen (90+ detik per segmen)
 else if (safeVideoDuration > 300) targetSegments = 4; // 5+ menit: max 4 segmen (75+ detik per segmen)
 else targetSegments = 3; // Video pendek: max 3 segmen (60+ detik per segmen) // Only show targeting info for significant videos
 if (transcript.length >= 1000) {
  console.log(`[GROQ] Video ${Math.floor(safeVideoDuration / 60)}m${safeVideoDuration % 60}s -> targeting ${targetSegments} segments`);
 }

 const maxLength = isRetry ? 8000 : 15000;
 const transcriptForAI = transcript.length > maxLength ? transcript.slice(0, maxLength) + '... (transkrip dipotong untuk efisiensi)' : transcript;

 let timingInfo = '';
 if (hasTimingData) {
  // Show first 15 segments as examples for AI
  const sampleSegments = segments
   .slice(0, 15)
   .map((seg) => {
    const startMin = Math.floor(seg.start / 60);
    const startSec = Math.floor(seg.start % 60);
    const endMin = Math.floor(seg.end / 60);
    const endSec = Math.floor(seg.end % 60);
    return `[${startMin}:${String(startSec).padStart(2, '0')} - ${endMin}:${String(endSec).padStart(2, '0')}] ${seg.text.substring(0, 120)}...`;
   })
   .join('\n');

  timingInfo = `
TIMING SEGMENTS TERSEDIA (${segments.length} total segments):
${sampleSegments}

PENTING: Gunakan timing data yang akurat di atas! Jangan gunakan timing default 0-1 menit untuk semua segmen.
Distribusikan segmen secara merata dari menit 0 hingga menit ${Math.floor(safeVideoDuration / 60)}.
`;
 } else {
  // When no timing data, provide transcript position estimation
  const charsPerMinute = transcript.length / (safeVideoDuration / 60);
  const samplePositions = [];
  for (let i = 0; i < Math.min(10, Math.floor(safeVideoDuration / 180)); i++) {
   const timePos = (i + 1) * (safeVideoDuration / 10);
   const charPos = Math.floor((timePos * charsPerMinute) / 60);
   const textSample = transcript.substring(charPos, charPos + 100);
   const timeMin = Math.floor(timePos / 60);
   const timeSec = Math.floor(timePos % 60);
   samplePositions.push(`[≈${timeMin}:${String(timeSec).padStart(2, '0')}] ${textSample}...`);
  }

  timingInfo = `
ESTIMASI TIMING BERDASARKAN POSISI TEKS (${Math.floor(charsPerMinute)} chars/min):
${samplePositions.join('\n')}

PENTING: Karena tidak ada data timing tepat, gunakan posisi dalam transkrip untuk estimasi timing.
Transkrip awal = menit 0-5, transkrip tengah = menit ${Math.floor(safeVideoDuration / 4 / 60)}-${Math.floor((3 * safeVideoDuration) / 4 / 60)}, transkrip akhir = menit ${Math.floor(safeVideoDuration / 60) - 5}-${Math.floor(
   safeVideoDuration / 60
  )}.
`;
 }

 return `Anda adalah expert video content analyst yang mengidentifikasi momen viral untuk YouTube Shorts.

${videoContext}
Durasi video: ${Math.floor(safeVideoDuration / 60)} menit ${safeVideoDuration % 60} detik
Transkrip: ${transcript.length} karakter
Timing data: ${hasTimingData ? 'TERSEDIA' : 'ESTIMASI'}

${timingInfo}

ANALISIS TRANSCRIPT PER SECTION (untuk membantu ekstraksi yang akurat):

SECTION 1 (0-${Math.floor(safeVideoDuration / 5 / 60)}m): ${transcript
  .substring(0, Math.floor(transcript.length / 5))
  .replace(/\n/g, ' ')
  .substring(0, 200)}...

SECTION 2 (${Math.floor(safeVideoDuration / 5 / 60)}m-${Math.floor((2 * safeVideoDuration) / 5 / 60)}m): ${transcript
  .substring(Math.floor(transcript.length / 5), Math.floor((2 * transcript.length) / 5))
  .replace(/\n/g, ' ')
  .substring(0, 200)}...

SECTION 3 (${Math.floor((2 * safeVideoDuration) / 5 / 60)}m-${Math.floor((3 * safeVideoDuration) / 5 / 60)}m): ${transcript
  .substring(Math.floor((2 * transcript.length) / 5), Math.floor((3 * transcript.length) / 5))
  .replace(/\n/g, ' ')
  .substring(0, 200)}...

SECTION 4 (${Math.floor((3 * safeVideoDuration) / 5 / 60)}m-${Math.floor((4 * safeVideoDuration) / 5 / 60)}m): ${transcript
  .substring(Math.floor((3 * transcript.length) / 5), Math.floor((4 * transcript.length) / 5))
  .replace(/\n/g, ' ')
  .substring(0, 200)}...

SECTION 5 (${Math.floor((4 * safeVideoDuration) / 5 / 60)}m-${Math.floor(safeVideoDuration / 60)}m): ${transcript
  .substring(Math.floor((4 * transcript.length) / 5))
  .replace(/\n/g, ' ')
  .substring(0, 200)}...

INSTRUKSI EKSTRAKSI TRANSCRIPT EXCERPT (CRITICAL):
REQUIREMENTS:
- MINIMUM 200 karakter, MAXIMUM 500 karakter per excerpt
- HARUS natural dan lengkap - JANGAN potong di tengah kalimat  
- AMBIL konteks penuh dari timing yang diminta
- JANGAN ulangi kalimat yang sama - cari variasi dalam konten
- SERTAKAN konteks sebelum dan sesudah untuk pemahaman lengkap

CONTOH EXCERPT YANG BAIK (200-500 karakter):
"Gua yakin hidup itu seperti matahari ya. Kadang terbit, kadang juga terbenam. Kadang ada pagi, kadang ada malam. Dan dalam perjalanan hidup ini, kita akan menghadapi berbagai macam tantangan. Ada kalanya kita merasakan kebahagiaan seperti saat matahari terbit, tapi ada kalanya juga kita merasakan kesedihan seperti saat matahari terbenam. Yang penting adalah bagaimana kita bisa tetap kuat dan terus berjuang menghadapi semua itu."

CONTOH EXCERPT YANG BURUK:
"Gua yakin hidup itu seperti matahari ya. Gua yakin hidup itu seperti matahari ya." (terlalu repetitif dan pendek)

EXTRACTION METHOD:
${
 hasTimingData
  ? `
1. Gunakan timing segments yang tersedia untuk lokasi yang tepat
2. Cari dalam segments array untuk timing yang sesuai
3. Ambil text dari beberapa segments berurutan untuk konteks lengkap (200-500 karakter)
`
  : `
1. Estimasi posisi dalam transcript berdasarkan timing
2. Video ${Math.floor(safeVideoDuration / 60)} menit = ${transcript.length} karakter  
3. Timing 2m30s ≈ karakter ${Math.floor(((transcript.length * 2.5) / safeVideoDuration) * 60)}
4. Ambil ±300 karakter dari posisi estimasi untuk konteks lengkap
`
}

FULL TRANSCRIPT UNTUK ANALISIS:
"""
${transcriptForAI}
"""

TUGAS ANDA:
Analisis konten dan identifikasi maksimal ${targetSegments} segmen video pendek yang paling menarik untuk YouTube Shorts.

KRITERIA SEGMEN MENARIK:
1. EMOTIONAL PEAKS: Momen lucu, mengejutkan, menginspirasi, atau emosional tinggi
2. VALUABLE INFO: Fakta menarik, tips berguna, insight berharga
3. CLIMAX MOMENTS: Puncak cerita, reveal, plot twist, breakthrough
4. QUOTABLE LINES: Kutipan viral, one-liner memorable
5. VISUAL HIGHLIGHTS: Demonstrasi, aksi menarik, showcase

REQUIREMENTS:
- Pilih ${Math.max(3, Math.floor(targetSegments * 0.8))} segmen TERBAIK dan TERSEBAR merata sepanjang video
- JANGAN semua segmen di 0-2 menit pertama! 
- DURASI MINIMUM KETAT: 30-90 detik per segmen (ideal 45-75 detik):
  * Insight/tips: 35-60 detik (actionable dengan konteks)
  * Penjelasan penting: 45-75 detik (comprehensive)
  * Cerita/pengalaman: 50-90 detik (full narrative)
  * Demonstrasi: 40-70 detik (step by step complete)
  * Momen viral: 30-50 detik (complete joke/reaction)
- WAJIB minimum 30 detik - JANGAN buat segmen < 30 detik
- HINDARI > 90 detik kecuali benar-benar exceptional content
- Self-contained (bisa dipahami tanpa konteks)
- High viral potential dengan durasi yang cukup untuk engagement
- Timing AKURAT ${hasTimingData ? 'berdasarkan data timing' : 'berdasarkan posisi dalam transkrip'}

CONTOH DURASI YANG DIINGINKAN:
- Segment 1: 42 detik (momen lucu dengan setup+punchline+reaction)
- Segment 2: 58 detik (penjelasan tips lengkap dengan contoh)
- Segment 3: 65 detik (cerita menarik dengan beginning-middle-end)
- Segment 4: 38 detik (fakta mengejutkan dengan elaborasi)

KUALITAS > KUANTITAS: Lebih baik ${Math.max(3, Math.floor(targetSegments * 0.7))} segmen berkualitas tinggi 45+ detik daripada ${targetSegments} segmen biasa 20-30 detik. 
- Segment 3: 23 detik (highlight singkat tapi impactful)
- Segment 4: 89 detik (cerita dengan natural conclusion)
- Segment 5: 52 detik (tips dengan natural flow)
- Segment 6: 31 detik (punchline dengan perfect timing)

PENTING: IKUTI natural flow konten! Jangan potong di tengah kalimat atau paksa ke durasi bulat.

PENTING: VARIASIKAN durasi berdasarkan tipe konten! Jangan gunakan 45 detik untuk semua segmen.

CRITICAL: TRANSCRIPT EXCERPT HARUS AKURAT!
- Untuk setiap segmen yang Anda pilih (mis: 10m40s-12m10s), Anda HARUS mengambil teks yang BENAR-BENAR ada pada posisi waktu tersebut dalam transkrip
- ${
  hasTimingData
   ? 'Gunakan timing segments di atas untuk mencari teks yang tepat'
   : 'Estimasi posisi teks: awal video = karakter 0-' +
     Math.floor(transcript.length * 0.2) +
     ', tengah = karakter ' +
     Math.floor(transcript.length * 0.3) +
     '-' +
     Math.floor(transcript.length * 0.7) +
     ', akhir = karakter ' +
     Math.floor(transcript.length * 0.8) +
     '-' +
     transcript.length
 }
- Jangan asal copy text dari bagian lain transkrip - harus sesuai timing!
- Excerpt minimum 50 kata, jelaskan konteks dengan lengkap

OUTPUT FORMAT JSON (WAJIB):
[
  {
    "title": "Judul Clickbait Menarik (max 60 karakter)",
    "description": "Deskripsi engaging yang menjelaskan mengapa menarik",
    "startTimeString": "2m15s",
    "endTimeString": "3m45s", 
    "transcriptExcerpt": "WAJIB 200-500 karakter! Ambil EXACT teks yang diucapkan pada timing 2m15s-3m45s. ${
     hasTimingData ? 'Gunakan timing segments untuk mencari teks yang tepat pada menit tersebut' : 'Estimasi posisi: 2m15s ≈ 4% dari transcript, 3m45s ≈ 7% dari transcript'
    }. Pastikan natural, lengkap, tidak repetitif, dan ada konteks yang cukup untuk dipahami standalone.",
    "appealReason": "lucu/mengejutkan/edukatif/inspiratif/viral"
  }
]

${hasTimingData ? 'GUNAKAN TIMING YANG AKURAT dari data timing segments di atas!' : 'ESTIMASI timing berdasarkan posisi konten dalam transkrip, distribusikan merata dari 0 hingga ' + Math.floor(safeVideoDuration / 60) + ' menit'}

PENTING: Berikan HANYA array JSON, tanpa penjelasan tambahan!`;
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

 const prompt = generateEnhancedPrompt(videoUrl, transcriptData, videoDuration, retryCount > 0);

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
      'You are an expert video content analyst specializing in identifying viral moments for YouTube Shorts. You understand Indonesian content and can identify emotionally engaging, surprising, funny, and valuable moments that would perform well as short-form content. Always respond with valid JSON arrays only.',
    },
    {
     role: 'user',
     content: prompt,
    },
   ],
   model: retryCount > 1 ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile', // Fallback to faster model on retry
   temperature: retryCount > 0 ? 0.3 : 0.7,
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
   let startTimeSeconds = parseTimeStringToSeconds(suggestion.startTimeString);
   let endTimeSeconds = parseTimeStringToSeconds(suggestion.endTimeString);

   // Extract transcript excerpt (handle both field names)
   let smartExcerpt = (suggestion as any).transcriptExcerpt || (suggestion as any).transkripExcerpt || '';

   // If AI excerpt is too short or repetitive, generate better one
   if (smartExcerpt.length < 150 || isRepetitive(smartExcerpt)) {
    console.log(`[GROQ] AI excerpt too short (${smartExcerpt.length} chars), generating smart excerpt for "${suggestion.title}"`);
    smartExcerpt = extractSmartExcerpt(transcriptData?.transcript || '', startTimeSeconds, endTimeSeconds, transcriptData?.segments);
    console.log(`[GROQ] Enhanced excerpt for "${suggestion.title}": ${smartExcerpt.substring(0, 100)}... (${smartExcerpt.length} chars)`);
   }

   console.log(`[GROQ] "${suggestion.title}" (${suggestion.startTimeString}-${suggestion.endTimeString}) = ${endTimeSeconds - startTimeSeconds}s | Excerpt: ${smartExcerpt ? smartExcerpt.substring(0, 50) + '...' : 'MISSING'}`);

   return {
    title: suggestion.title,
    description: suggestion.description,
    startTimeString: suggestion.startTimeString,
    endTimeString: suggestion.endTimeString,
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
