import {GoogleGenAI, GenerateContentResponse} from '@google/genai';
import type {GeminiShortSegmentSuggestion, ShortVideo} from '../types';
import {parseTimeStringToSeconds} from '../utils/timeUtils';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
 console.error('Gemini API Key is not configured. Please set the API_KEY environment variable.');
}
const ai = API_KEY ? new GoogleGenAI({apiKey: API_KEY}) : null;

const generatePrompt = (videoUrlHint?: string, transcript?: string): string => {
 const videoContext = videoUrlHint ? `Video ini berasal dari URL berikut (gunakan untuk konteks topik secara umum jika memungkinkan): ${videoUrlHint}` : 'Video ini bertopik umum yang populer seperti vlog, tutorial, atau ulasan produk.';

 let transcriptContext = '';
 if (transcript && transcript.length > 100) {
  transcriptContext = `\n\nBerikut adalah transkrip otomatis video (gunakan untuk memahami isi dan membagi segmen):\n\"\"\"${transcript.slice(0, 12000)}${transcript.length > 12000 ? '... (transkrip dipotong)' : ''}\"\"\"\n`;
 }

 return `
Anda adalah asisten AI yang sangat ahli dalam membagi video YouTube berdurasi panjang menjadi SEBANYAK MUNGKIN segmen/klip pendek yang benar-benar menarik, viral, lucu, dramatis, informatif, atau penuh emosi.
${videoContext}
${transcriptContext}

INSTRUKSI PENTING:
- Bagi video menjadi highlight sebanyak mungkin, JANGAN batasi jumlah segmen!
- Setiap segmen HARUS berdurasi antara 30 detik hingga 2 menit, dan boleh bervariasi sesuai intensitas momen.
- Jika memungkinkan, bagi video menjadi minimal 8-15 segmen (atau lebih jika highlight memang banyak, terutama untuk video berdurasi 20 menit ke atas).
- Jangan takut membagi momen yang cukup panjang menjadi beberapa highlight berbeda jika memang menarik.
- Cari dan pilih SEMUA momen menarik, lucu, dramatis, informatif, puncak emosi, atau viral, bahkan jika jumlahnya lebih dari 10.
- Hindari bagian intro, outro, atau bagian yang tidak penting.
- Segmen boleh sedikit overlap jika memang momen menarik berdekatan.
- Gaya bahasa santai, tidak perlu emoji/hashtag/call-to-action.
- Tidak perlu alasan khusus, cukup judul dan deskripsi saja.
- Jika memungkinkan, sarankan framing video fokus ke wajah pembicara (auto reframe).
- Output HARUS dalam bahasa Indonesia.
- Judul dan deskripsi HARUS relevan dengan isi segmen pada transkrip.
- Pastikan setiap segmen unik dan tidak tumpang tindih secara berlebihan.
- Jika highlight tidak terlalu padat, tetap bagi video secara merata agar jumlah segmen cukup banyak.

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

Bagi video ini menjadi highlight sebanyak mungkin sesuai instruksi di atas.
`;
};

export const generateShortsIdeas = async (videoUrl: string, transcript?: string): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
 if (!ai) {
  throw new Error('Gemini API client is not initialized. API_KEY might be missing.');
 }
 const prompt = generatePrompt(videoUrl, transcript);

 try {
  const response: GenerateContentResponse = await ai.models.generateContent({
   model: 'gemini-2.5-flash-preview-04-17',
   contents: prompt,
   config: {
    responseMimeType: 'application/json',
    temperature: 0.75,
    topP: 0.95,
    topK: 40,
   },
  });

  // Tambahan: filter baris non-JSON sebelum parsing
  let rawText = (response.text || '').trim();
  // Hapus baris yang jelas bukan bagian JSON (misal: satu kata tanpa tanda kutip)
  rawText = rawText
   .split('\n')
   .filter((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith(']') || trimmed.startsWith('"') || trimmed.startsWith('}') || trimmed.includes(':');
   })
   .join('\n');

  // Extract only the first valid JSON array substring
  const firstBracket = rawText.indexOf('[');
  const lastBracket = rawText.indexOf(']');
  let jsonStrToParse = rawText;
  if (firstBracket !== -1 && lastBracket > firstBracket) {
   jsonStrToParse = rawText.substring(firstBracket, lastBracket + 1);
  } else {
   throw new Error('Tidak ditemukan array JSON di respons AI. Cek output Gemini.');
  }

  let suggestions: GeminiShortSegmentSuggestion[];
  try {
   suggestions = JSON.parse(jsonStrToParse);
  } catch (parseError) {
   console.error('Failed to parse JSON response from Gemini. Original full text:', response.text, 'Attempted to parse this substring:', jsonStrToParse, 'Parse error:', parseError);
   throw new Error('AI response was not valid JSON. The content might be incomplete or malformed. Please check the console for more details on the problematic response.');
  }

  if (!Array.isArray(suggestions)) {
   console.error('Gemini response, after parsing, is not an array:', suggestions);
   throw new Error('AI response was not in the expected format (array of suggestions).');
  }

  return suggestions
   .map((suggestion, index) => {
    const startTimeSeconds = parseTimeStringToSeconds(suggestion.startTimeString);
    let endTimeSeconds = parseTimeStringToSeconds(suggestion.endTimeString);

    if (isNaN(startTimeSeconds) || isNaN(endTimeSeconds)) {
     console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has invalid NaN timestamps (start: ${suggestion.startTimeString}, end: ${suggestion.endTimeString}). Skipping this segment.`);
     return null;
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
  if (error.message) {
   if (error.message.toLowerCase().includes('api key not valid')) {
    throw new Error("Invalid Gemini API Key. Please check your configuration and ensure it's correctly set.");
   }
   if (error.message.toLowerCase().includes('quota')) {
    throw new Error('API quota exceeded. Please check your Gemini API usage and limits.');
   }
   // Re-throw specific parsing errors with more context if they weren't caught above
   if (error.message.includes('AI response was not valid JSON')) {
    throw error;
   }
  }
  throw new Error(`Failed to get suggestions from AI: ${error.message || 'Unknown error occurred'}`);
 }
};
