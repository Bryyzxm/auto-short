import Groq from 'groq-sdk';
import type {GeminiShortSegmentSuggestion, ShortVideo} from '../types';
import {parseTimeStringToSeconds} from '../utils/timeUtils';

const GROQ_API_KEY = (import.meta as any).env.VITE_GROQ_API_KEY;

if (!GROQ_API_KEY) {
 console.error('Groq API Key is not configured. Please set the VITE_GROQ_API_KEY environment variable.');
}

const groq = GROQ_API_KEY ? new Groq({apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true}) : null;

const generatePrompt = (videoUrlHint?: string, transcript?: string, videoDuration?: number, isRetry = false): string => {
 const videoContext = videoUrlHint ? `Video ini berasal dari URL berikut (gunakan untuk konteks topik secara umum jika memungkinkan): ${videoUrlHint}` : 'Video ini bertopik umum yang populer seperti vlog, tutorial, atau ulasan produk.';

 let transcriptContext = '';
 if (transcript && transcript.length > 100) {
  const maxLength = isRetry ? 8000 : 12000; // Groq handles context well
  transcriptContext = `\n\nBerikut adalah transkrip otomatis video (gunakan untuk memahami isi dan membagi segmen):\n\"\"\"${transcript.slice(0, maxLength)}${transcript.length > maxLength ? '... (transkrip dipotong)' : ''}\"\"\"\n`;
 }

 // Calculate minimum segments based on video duration
 let minSegments = 8;
 if (videoDuration) {
  if (videoDuration > 3600) minSegments = isRetry ? 25 : 30; // 1+ jam: 25-30 segmen
  else if (videoDuration > 1800) minSegments = isRetry ? 18 : 22; // 30+ menit: 18-22 segmen
  else if (videoDuration > 900) minSegments = isRetry ? 12 : 16; // 15+ menit: 12-16 segmen
  else if (videoDuration > 600) minSegments = isRetry ? 10 : 14; // 10+ menit: 10-14 segmen
  else if (videoDuration > 300) minSegments = isRetry ? 8 : 10; // 5+ menit: 8-10 segmen
 }

 return `Anda adalah asisten AI yang sangat ahli dalam membagi video YouTube berdurasi panjang menjadi segmen/klip pendek yang PALING MENARIK, VIRAL, atau PUNCAK EMOSI, dengan kualitas highlight terbaik.

${videoContext}
${transcriptContext}

INSTRUKSI PENTING:
- Bagi video menjadi SEBANYAK MUNGKIN segmen menarik, dengan durasi SETIAP SEGMEN antara 30 hingga 120 detik (2 menit).
- MINIMAL WAJIB BUAT ${minSegments} SEGMEN YANG UNIK DAN MENARIK!
- PRIORITAS: Cari SEMUA momen menarik, jangan lewatkan bagian apapun yang bisa jadi viral!
- Pilih dan bagi video menjadi highlight yang PALING MENARIK, dramatis, lucu, informatif, viral, mengejutkan, emosional, atau bernilai edukasi.
- BUAT variasi durasi segmen! Jangan semua segmen berdurasi 30 detik. Usahakan ada segmen berdurasi 60–120 detik jika memungkinkan.
- Jika highlight cukup panjang, buat segmen lebih panjang (misal 90–120 detik), dan jika highlight pendek, boleh 30–45 detik.
- SCAN SELURUH VIDEO: Dari awal hingga akhir, cari semua bagian yang berpotensi menarik!
- Hindari bagian intro, outro, atau bagian yang tidak penting KECUALI jika mengandung informasi menarik.
- Output HARUS dalam bahasa Indonesia.
- Judul dan deskripsi HARUS relevan dengan isi segmen pada transkrip.

Contoh variasi durasi output:
[
  {"title": "Momen Lucu Banget", "description": "Bagian paling lucu dari video.", "startTimeString": "0m35s", "endTimeString": "1m10s"},
  {"title": "Puncak Emosi", "description": "Bagian paling dramatis.", "startTimeString": "2m00s", "endTimeString": "3m55s"},
  {"title": "Fakta Mengejutkan", "description": "Fakta menarik yang diungkap.", "startTimeString": "4m10s", "endTimeString": "5m30s"}
]

Untuk setiap segmen, berikan detail berikut (semua dalam bahasa Indonesia!):
1. \`title\`: Judul singkat dan menarik (maksimal 10 kata, HARUS sesuai isi segmen pada transkrip).
2. \`description\`: Deskripsi singkat (1-2 kalimat) yang menjelaskan mengapa segmen ini menarik.
3. \`startTimeString\`: Waktu mulai segmen (misal: "0m35s", "1m20s", "12s").
4. \`endTimeString\`: Waktu selesai segmen (misal: "1m5s", "2m45s", "1m30s").

Kembalikan HASIL AKHIR HANYA berupa array JSON valid, TANPA penjelasan, catatan, atau teks lain di luar array JSON.

Format output yang DIHARUSKAN:
[
  {
    "title": "string",
    "description": "string",
    "startTimeString": "string",
    "endTimeString": "string"
  }
]

PENTING: Pastikan Anda menghasilkan MINIMAL ${minSegments} segmen yang beragam dan menarik dari seluruh bagian video!`;
};

export const generateShortsIdeas = async (videoUrl: string, transcript?: string, videoDuration?: number, retryCount = 0): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 if (!groq) {
  throw new Error('Groq API client is not initialized. GROQ_API_KEY might be missing.');
 }

 const prompt = generatePrompt(videoUrl, transcript, videoDuration, retryCount > 0);

 try {
  console.log(`[GROQ] Generating segments (attempt ${retryCount + 1})`);

  // Add delay between retries
  if (retryCount > 0) {
   const delay = Math.min(3000 * retryCount, 15000); // Max 15s delay
   console.log(`[GROQ] Waiting ${delay}ms before retry...`);
   await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const completion = await groq.chat.completions.create({
   messages: [
    {
     role: 'system',
     content: 'You are an expert at analyzing video content and creating engaging short video segments. Always respond with valid JSON arrays only.',
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
  console.log('[GROQ DEBUG] Raw response text:', rawText.substring(0, 500) + (rawText.length > 500 ? '...' : ''));

  // Use same improved JSON parsing logic from Gemini service
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
    // Try to fix common JSON issues (same as Gemini)
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

  console.log(`[GROQ] Generated ${suggestions.length} segments`);

  return suggestions
   .map((suggestion, index) => {
    let startTimeSeconds = parseTimeStringToSeconds(suggestion.startTimeString);
    let endTimeSeconds = parseTimeStringToSeconds(suggestion.endTimeString);

    // Validation and correction logic (same as Gemini)
    if (isNaN(startTimeSeconds) || isNaN(endTimeSeconds)) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) memiliki timestamp tidak valid (start: ${suggestion.startTimeString}, end: ${suggestion.endTimeString}). Menggunakan placeholder.`);
     startTimeSeconds = index * 60; // Stagger start times
     endTimeSeconds = startTimeSeconds + 60;
    }

    if (endTimeSeconds <= startTimeSeconds) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has endTime <= startTime (start: ${startTimeSeconds}s, end: ${endTimeSeconds}s). Adjusting endTime to startTime + 30s.`);
     endTimeSeconds = startTimeSeconds + 30;
    }

    if (endTimeSeconds - startTimeSeconds > 120) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) exceeds 120s duration (is ${endTimeSeconds - startTimeSeconds}s). Truncating to 120s.`);
     endTimeSeconds = startTimeSeconds + 120;
    }

    if (endTimeSeconds - startTimeSeconds < 1) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has duration < 1s. Adjusting endTime to startTime + 1s.`);
     endTimeSeconds = startTimeSeconds + 1;
    }

    return {
     id: `short-${Date.now()}-${index}`,
     title: suggestion.title || 'Untitled Segment',
     description: suggestion.description || 'No description provided.',
     startTimeSeconds,
     endTimeSeconds,
     reasonForVertical: suggestion.reasonForVertical || 'Suitable for short-form content.',
    };
   })
   .filter((s) => s !== null) as Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[];
 } catch (error: any) {
  console.error('Error calling Groq API:', error);

  // Retry logic
  if (retryCount < 2) {
   console.log(`[GROQ] Retrying (attempt ${retryCount + 1}/2)...`);
   return await generateShortsIdeas(videoUrl, transcript, videoDuration, retryCount + 1);
  }

  // Enhanced error messages
  if (error.message?.includes('401') || error.message?.includes('authentication')) {
   throw new Error('🔑 Groq API key tidak valid. Periksa konfigurasi VITE_GROQ_API_KEY di file .env.local');
  }
  if (error.message?.includes('429') || error.message?.includes('rate limit')) {
   throw new Error('⏱️ Rate limit tercapai. Tunggu sebentar lalu coba lagi. (Groq: 30 request/menit)');
  }
  if (error.message?.includes('timeout')) {
   throw new Error('⏰ Request timeout. Coba lagi dengan video yang lebih pendek.');
  }
  if (error.message?.includes('model_decommissioned') || error.message?.includes('decommissioned')) {
   throw new Error('🔄 Model AI sedang dalam pemeliharaan. Mencoba model alternatif...');
  }

  throw new Error(`Groq API error: ${error.message || 'Unknown error occurred'}`);
 }
};
