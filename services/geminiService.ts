import {GoogleGenAI, GenerateContentResponse} from '@google/genai';
import type {GeminiShortSegmentSuggestion, ShortVideo} from '../types';
import {parseTimeStringToSeconds} from '../utils/timeUtils';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
 console.error('Gemini API Key is not configured. Please set the API_KEY environment variable.');
}
const ai = API_KEY ? new GoogleGenAI({apiKey: API_KEY}) : null;

const generatePrompt = (videoUrlHint?: string, transcript?: string, videoDuration?: number, isRetry = false): string => {
 const videoContext = videoUrlHint ? `Video ini berasal dari URL berikut (gunakan untuk konteks topik secara umum jika memungkinkan): ${videoUrlHint}` : 'Video ini bertopik umum yang populer seperti vlog, tutorial, atau ulasan produk.';

 let transcriptContext = '';
 if (transcript && transcript.length > 100) {
  const maxLength = isRetry ? 6000 : 10000; // Shorter transcript to save tokens
  transcriptContext = `\n\nBerikut adalah transkrip otomatis video (gunakan untuk memahami isi dan membagi segmen):\n\"\"\"${transcript.slice(0, maxLength)}${transcript.length > maxLength ? '... (transkrip dipotong)' : ''}\"\"\"\n`;
 }

 // Calculate minimum segments based on video duration (reduced for quota saving)
 let minSegments = 6;
 if (videoDuration) {
  if (videoDuration > 3600) minSegments = isRetry ? 15 : 20; // Reduced from 30
  else if (videoDuration > 1800) minSegments = isRetry ? 12 : 15; // Reduced from 20
  else if (videoDuration > 900) minSegments = isRetry ? 8 : 12; // Reduced from 15
  else if (videoDuration > 600) minSegments = isRetry ? 6 : 10; // Reduced from 12
 }

 return `
Anda adalah asisten AI yang sangat ahli dalam membagi video YouTube berdurasi panjang menjadi segmen/klip pendek yang PALING MENARIK, VIRAL, atau PUNCAK EMOSI, dengan kualitas highlight terbaik.
${videoContext}
${transcriptContext}

INSTRUKSI PENTING:
- Bagi video menjadi SEBANYAK MUNGKIN segmen menarik, dengan durasi SETIAP SEGMEN antara 30 hingga 120 detik (2 menit).
- Untuk video berdurasi lebih dari 10 menit, WAJIB membagi menjadi MINIMAL 15 segmen yang berbeda-beda.
- Untuk video berdurasi lebih dari 30 menit, WAJIB membagi menjadi MINIMAL 20 segmen yang berbeda-beda.
- Untuk video berdurasi lebih dari 60 menit, WAJIB membagi menjadi MINIMAL 30 segmen yang berbeda-beda.
- MINIMAL WAJIB BUAT ${minSegments} SEGMEN YANG UNIK DAN MENARIK!
- Pilih dan bagi video menjadi highlight yang PALING MENARIK, dramatis, lucu, informatif, atau viral, utamakan momen yang benar-benar menonjol dan berpotensi viral.
- JANGAN SKIP bagian-bagian video. Cari momen menarik di SELURUH durasi video, tidak hanya di awal atau tengah saja.
- BUAT variasi durasi segmen! Jangan semua segmen berdurasi 30 detik. Usahakan ada segmen berdurasi 60–120 detik jika memungkinkan.
- Jika highlight cukup panjang, buat segmen lebih panjang (misal 90–120 detik), dan jika highlight pendek, boleh 30–45 detik.
- Jangan buat segmen terlalu pendek (<30 detik) atau terlalu panjang (>120 detik).
- Jika highlight panjang, bagi menjadi beberapa segmen yang tetap menarik dan tidak tumpang tindih berlebihan.
- Hindari bagian intro, outro, atau bagian yang tidak penting.
- Segmen boleh sedikit overlap jika memang momen menarik berdekatan, tapi jangan duplikat.
- Gaya bahasa santai, tidak perlu emoji/hashtag/call-to-action.
- Output HARUS dalam bahasa Indonesia.
- Judul dan deskripsi HARUS relevan dengan isi segmen pada transkrip.
- Pastikan setiap segmen unik, tidak tumpang tindih berlebihan, dan benar-benar menarik.

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

Bagi video ini menjadi highlight paling menarik dan konsisten sesuai instruksi di atas.

PENTING: Pastikan Anda menghasilkan MINIMAL ${minSegments} segmen yang beragam dan menarik dari seluruh bagian video! Jika tidak ada cukup highlight unik, buat segmen dari momen-momen informatif, transisi menarik, atau bagian penting lainnya untuk memenuhi jumlah minimal.
`;
};

export const generateShortsIdeas = async (videoUrl: string, transcript?: string, videoDuration?: number, retryCount = 0): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 if (!ai) {
  throw new Error('Gemini API client is not initialized. API_KEY might be missing.');
 }
 const prompt = generatePrompt(videoUrl, transcript, videoDuration, retryCount > 0);

 // Define available models in order of preference (free tier friendly)
 const availableModels = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro'];
 const modelToUse = retryCount > 0 ? availableModels[1] : availableModels[0];

 try {
  console.log(`[GEMINI] Using model: ${modelToUse} (attempt ${retryCount + 1})`);

  // Add delay between requests to respect rate limits
  if (retryCount > 0) {
   const delay = Math.min(5000 * retryCount, 30000); // Max 30s delay
   console.log(`[GEMINI] Waiting ${delay}ms before retry...`);
   await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
   model: modelToUse,
   contents: prompt,
   config: {
    responseMimeType: 'application/json',
    temperature: retryCount > 0 ? 0.5 : 0.7, // Lower temperature
    topP: 0.9, // Reduced from 0.95
    topK: 40, // Reduced from 50
    maxOutputTokens: retryCount > 0 ? 4096 : 6144, // Reduced tokens to save quota
   },
  });

  // Improved JSON extraction from AI response
  let rawText = (response.text || '').trim();
  console.log('[GEMINI DEBUG] Raw response text:', rawText.substring(0, 500) + (rawText.length > 500 ? '...' : ''));

  // Try to find JSON array in the response
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
     console.error('[GEMINI DEBUG] No JSON found in response. Full text:', rawText);
     throw new Error('Tidak ditemukan JSON di respons AI. AI mungkin mengembalikan text biasa atau format tidak sesuai.');
    }
   }
  }

  console.log('[GEMINI DEBUG] Extracted JSON string:', jsonStrToParse.substring(0, 300) + (jsonStrToParse.length > 300 ? '...' : ''));

  let suggestions: GeminiShortSegmentSuggestion[];
  try {
   suggestions = JSON.parse(jsonStrToParse);
  } catch (parseError) {
   console.error('[GEMINI DEBUG] JSON parse failed. Original text:', rawText);
   console.error('[GEMINI DEBUG] Attempted to parse:', jsonStrToParse);
   console.error('[GEMINI DEBUG] Parse error:', parseError);

   // Try to fix common JSON issues
   let fixedJsonStr = jsonStrToParse;

   // Fix trailing commas
   fixedJsonStr = fixedJsonStr.replace(/,(\s*[}\]])/g, '$1');

   // Fix single quotes to double quotes
   fixedJsonStr = fixedJsonStr.replace(/'/g, '"');

   // Fix unescaped quotes in strings
   fixedJsonStr = fixedJsonStr.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"');

   try {
    console.log('[GEMINI DEBUG] Trying to parse fixed JSON:', fixedJsonStr.substring(0, 200));
    suggestions = JSON.parse(fixedJsonStr);
    console.log('[GEMINI DEBUG] Successfully parsed fixed JSON');
   } catch (secondParseError) {
    console.error('[GEMINI DEBUG] Fixed JSON parse also failed:', secondParseError);
    throw new Error(`AI response tidak valid JSON. Respons asli: "${rawText.substring(0, 500)}...". Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
   }
  }

  if (!Array.isArray(suggestions)) {
   console.error('Gemini response, after parsing, is not an array:', suggestions);
   throw new Error('AI response was not in the expected format (array of suggestions).');
  }

  return suggestions
   .map((suggestion, index) => {
    let startTimeSeconds = parseTimeStringToSeconds(suggestion.startTimeString);
    let endTimeSeconds = parseTimeStringToSeconds(suggestion.endTimeString);

    if (isNaN(startTimeSeconds) || isNaN(endTimeSeconds)) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) memiliki timestamp tidak valid (start: ${suggestion.startTimeString}, end: ${suggestion.endTimeString}). Menggunakan placeholder 0 detik dan 60 detik.`);
     startTimeSeconds = 0;
     endTimeSeconds = 60;
    }

    if (endTimeSeconds <= startTimeSeconds) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has endTime <= startTime (start: ${startTimeSeconds}s, end: ${endTimeSeconds}s). Adjusting endTime to startTime + 15s.`);
     endTimeSeconds = startTimeSeconds + 15;
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
     reasonForVertical: suggestion.reasonForVertical || 'No specific reason for vertical suitability provided.',
    };
   })
   .filter((s) => s !== null) as Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[];
 } catch (error: any) {
  console.error('Error calling Gemini API or processing response:', error);

  // Handle quota exceeded error specifically
  if (error.message?.includes('quota') || error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
   console.log(`[GEMINI] Quota exceeded, attempting retry with delay...`);

   // Extract retry delay from error if available
   let retryDelay = 30000; // Default 30s
   try {
    const retryInfo = error.message.match(/retryDelay":"(\d+)s/);
    if (retryInfo) {
     retryDelay = parseInt(retryInfo[1]) * 1000;
    }
   } catch (e) {
    // Use default delay
   }

   if (retryCount < 3) {
    // Increased retry limit for quota errors
    console.log(`[GEMINI] Waiting ${retryDelay}ms before retry (attempt ${retryCount + 1}/3)...`);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    return await generateShortsIdeas(videoUrl, transcript, videoDuration, retryCount + 1);
   } else {
    throw new Error(
     '⚠️ API quota habis! Solusi:\n\n1. Tunggu beberapa menit lalu coba lagi\n2. Gunakan video yang lebih pendek (<30 menit)\n3. Upgrade ke Gemini API Paid Plan untuk quota unlimited\n\nFree tier terbatas: 15 request/menit, 1500 request/hari.'
    );
   }
  }

  // Handle model not found error specifically
  if (error.message?.includes('is not found') || error.message?.includes('NOT_FOUND')) {
   console.log(`[GEMINI] Model ${modelToUse} not available, trying fallback model`);
   if (retryCount < 2) {
    // Try with different model
    const fallbackModel = availableModels[2]; // gemini-pro
    try {
     console.log(`[GEMINI] Attempting fallback with model: ${fallbackModel}`);
     const fallbackResponse: GenerateContentResponse = await ai.models.generateContent({
      model: fallbackModel,
      contents: prompt,
      config: {
       responseMimeType: 'application/json',
       temperature: 0.7,
       topP: 0.9,
       topK: 40,
       maxOutputTokens: 4096,
      },
     });

     // Process fallback response (reuse the same parsing logic)
     let rawText = (fallbackResponse.text || '').trim();
     console.log('[GEMINI FALLBACK] Raw response text:', rawText.substring(0, 300));

     // Continue with existing JSON parsing...
     let jsonStrToParse = '';
     const arrayMatch = rawText.match(/\[[\s\S]*\]/);
     if (arrayMatch) {
      jsonStrToParse = arrayMatch[0];
     } else {
      const firstBracket = rawText.indexOf('[');
      const lastBracket = rawText.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
       jsonStrToParse = rawText.substring(firstBracket, lastBracket + 1);
      } else {
       throw new Error('No valid JSON found in fallback response');
      }
     }

     const suggestions = JSON.parse(jsonStrToParse);
     if (!Array.isArray(suggestions)) {
      throw new Error('Fallback response not an array');
     }

     return suggestions.map((suggestion, index) => ({
      id: `short-${Date.now()}-${index}`,
      title: suggestion.title || 'Untitled Segment',
      description: suggestion.description || 'No description provided.',
      startTimeSeconds: parseTimeStringToSeconds(suggestion.startTimeString) || 0,
      endTimeSeconds: parseTimeStringToSeconds(suggestion.endTimeString) || 60,
      reasonForVertical: suggestion.reasonForVertical || 'No specific reason provided.',
     }));
    } catch (fallbackError) {
     console.error('[GEMINI FALLBACK] Fallback also failed:', fallbackError);
    }
   }
  }

  // Retry logic for JSON parsing errors
  if (error.message?.includes('AI response tidak valid JSON') && retryCount < 2) {
   console.log(`[GEMINI RETRY] Retrying with simplified prompt (attempt ${retryCount + 1}/2)`);
   try {
    return await generateShortsIdeas(videoUrl, transcript, videoDuration, retryCount + 1);
   } catch (retryError) {
    console.error('[GEMINI RETRY] Retry also failed:', retryError);
    // Continue to original error handling
   }
  }

  if (error.message) {
   if (error.message.toLowerCase().includes('api key not valid')) {
    throw new Error("Invalid Gemini API Key. Please check your configuration and ensure it's correctly set.");
   }
   if (error.message.toLowerCase().includes('quota')) {
    throw new Error('API quota exceeded. Please check your Gemini API usage and limits.');
   }
   if (error.message.includes('is not found') || error.message.includes('NOT_FOUND')) {
    throw new Error(`Model tidak tersedia. Coba lagi nanti atau periksa availability model Gemini. Error: ${error.message}`);
   }
   // Re-throw specific parsing errors with more context if they weren't caught above
   if (error.message.includes('AI response tidak valid JSON')) {
    throw new Error(`AI gagal menghasilkan format JSON yang valid setelah ${retryCount + 1} percobaan. Error: ${error.message}`);
   }
  }
  throw new Error(`Failed to get suggestions from AI: ${error.message || 'Unknown error occurred'}`);
 }
};
