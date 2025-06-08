import React, {useState, useCallback} from 'react';
import {YouTubeInputForm} from './components/YouTubeInputForm';
import {ShortVideoCard} from './components/ShortVideoCard';
import {LoadingSpinner} from './components/LoadingSpinner';
import {generateShortsIdeas} from './services/geminiService';
import type {ShortVideo} from './types';
import {getYouTubeVideoId} from './utils/youtubeUtils';
import {InfoIcon} from './components/icons';

const App: React.FC = () => {
 const [youtubeUrl, setYoutubeUrl] = useState<string>('');
 const [generatedShorts, setGeneratedShorts] = useState<ShortVideo[]>([]);
 const [isLoading, setIsLoading] = useState<boolean>(false);
 const [error, setError] = useState<string | null>(null);
 const [apiKeyError, setApiKeyError] = useState<string | null>(null);
 const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
 const [aspectRatio, setAspectRatio] = useState<string>('9:16');

 // Check for API key on mount
 React.useEffect(() => {
  if (!process.env.API_KEY) {
   setApiKeyError('Gemini API Key is not configured. Please set the API_KEY environment variable.');
   console.error('Gemini API Key is missing (process.env.API_KEY).');
  }
 }, []);

 // Utility: Clean transcript from duplicate lines/phrases (global, not just consecutive)
 function cleanTranscript(text: string): string {
  if (!text) return '';
  // Split berdasarkan kalimat (setelah titik, tanda seru, atau tanya)
  const lines = text.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (let line of lines) {
   let norm = line.trim().toLowerCase().replace(/\s+/g, ' ');
   // Hilangkan karakter non-alfabet dan angka agar normalisasi lebih kuat
   norm = norm.replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF ]/gi, '');
   // Abaikan frasa sangat pendek (<10 karakter) dari deduplikasi global
   if (norm.length < 10) {
    cleaned.push(line.trim());
    continue;
   }
   if (norm && !seen.has(norm)) {
    cleaned.push(line.trim());
    seen.add(norm);
   }
  }
  // Hapus duplikasi antar kalimat yang mirip (fuzzy, >80% sama)
  const final: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
   const cur = cleaned[i].toLowerCase();
   if (final.every((prev) => similarity(prev, cur) < 0.8)) {
    final.push(cleaned[i]);
   }
  }
  return final.join(' ');
 }

 // Fuzzy similarity sederhana (Jaccard)
 function similarity(a: string, b: string): number {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  return intersection.size / Math.max(setA.size, setB.size);
 }

 const fetchFullTranscript = async (videoId: string): Promise<string> => {
  const url = `http://localhost:5001/api/yt-transcript?videoId=${videoId}`;
  try {
   const res = await fetch(url);
   if (!res.ok) return '';
   const data = await res.json();
   if (!data || !data.segments || !Array.isArray(data.segments)) return '';
   const raw = data.segments.map((seg: any) => seg.text).join(' ');
   return cleanTranscript(raw);
  } catch {
   return '';
  }
 };

 // Ambil seluruh segmen subtitle lengkap (dengan timestamp)
 const fetchSubtitleSegments = async (videoId: string): Promise<Array<{start: string; end: string; text: string}>> => {
  const url = `http://localhost:5001/api/yt-transcript?videoId=${videoId}`;
  try {
   const res = await fetch(url);
   if (!res.ok) return [];
   const data = await res.json();
   if (!data || !data.segments || !Array.isArray(data.segments)) return [];
   return data.segments;
  } catch {
   return [];
  }
 };

 // Fungsi pencocokan subtitle yang memperluas rentang agar durasi wajar dan relevan dengan deskripsi
 function findBestSubtitleRange(subtitles: Array<{start: string; end: string; text: string}>, description: string, minDurationSec = 30, maxDurationSec = 120) {
  let bestIdx = 0;
  let bestScore = 0;
  const desc = description.toLowerCase();
  const descWords = desc.split(' ').filter((w) => w.length > 2);
  for (let i = 0; i < subtitles.length; i++) {
   const sub = subtitles[i].text.toLowerCase();
   const common = descWords.filter((word) => sub.includes(word)).length;
   if (common > bestScore) {
    bestScore = common;
    bestIdx = i;
   }
  }
  // Perluas rentang ke depan & belakang hingga durasi min tercapai dan kata kunci tercakup
  let startIdx = bestIdx,
   endIdx = bestIdx;
  let coveredWords = new Set(subtitles[bestIdx].text.toLowerCase().split(' '));
  const toSeconds = (vtt: string) => {
   const [h, m, s] = vtt.split(':');
   return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
  };
  let duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
  // Perluas ke depan
  while (duration < minDurationSec && endIdx < subtitles.length - 1 && endIdx - startIdx < 20) {
   endIdx++;
   subtitles[endIdx].text
    .toLowerCase()
    .split(' ')
    .forEach((w) => coveredWords.add(w));
   duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
  }
  // Perluas ke belakang
  while (duration < minDurationSec && startIdx > 0 && endIdx - startIdx < 20) {
   startIdx--;
   subtitles[startIdx].text
    .toLowerCase()
    .split(' ')
    .forEach((w) => coveredWords.add(w));
   duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
  }
  // Jika terlalu panjang, potong ke maxDurationSec
  while (duration > maxDurationSec && endIdx > startIdx) {
   endIdx--;
   duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
  }
  return {
   start: subtitles[startIdx].start,
   end: subtitles[endIdx].end,
   text: subtitles
    .slice(startIdx, endIdx + 1)
    .map((s) => s.text)
    .join(' '),
  };
 }

 const handleSubmit = useCallback(
  async (url: string, selectedAspectRatio: string) => {
   if (apiKeyError) return;

   setYoutubeUrl(url);
   setAspectRatio(selectedAspectRatio);
   setIsLoading(true);
   setError(null);
   setGeneratedShorts([]);
   setActivePlayerId(null); // Reset active player on new submission

   const videoId = getYouTubeVideoId(url);
   if (!videoId) {
    setError('Invalid YouTube URL. Please enter a valid URL.');
    setIsLoading(false);
    return;
   }

   let transcript = '';
   try {
    transcript = await fetchFullTranscript(videoId);
   } catch {}

   try {
    const ideas = await generateShortsIdeas(url, transcript); // Kirim transcript ke Gemini
    if (ideas.length === 0) {
     setError('No short video segments could be identified. Try a different video.');
    } else {
     // Ambil seluruh segmen subtitle lengkap
     const subtitleSegments = await fetchSubtitleSegments(videoId);

     // Untuk setiap segmen AI, cari subtitle yang paling mirip dan update waktu
     const shortsWithVideoId: ShortVideo[] = ideas.map((idea) => {
      let startTimeSeconds = 0;
      let endTimeSeconds = 0;
      if (subtitleSegments.length > 0) {
       let bestRange = findBestSubtitleRange(subtitleSegments, idea.description);
       // Jika durasi masih kurang dari 30 detik, perluas ke depan sebanyak mungkin
       const toSeconds = (vtt: string) => {
        const [h, m, s] = vtt.split(':');
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
       };
       let duration = toSeconds(bestRange.end) - toSeconds(bestRange.start);
       let endIdx = subtitleSegments.findIndex((s) => s.start === bestRange.start);
       let lastIdx = subtitleSegments.findIndex((s) => s.end === bestRange.end);
       while (duration < 30 && lastIdx < subtitleSegments.length - 1) {
        lastIdx++;
        bestRange.end = subtitleSegments[lastIdx].end;
        duration = toSeconds(bestRange.end) - toSeconds(bestRange.start);
       }
       startTimeSeconds = toSeconds(bestRange.start);
       endTimeSeconds = toSeconds(bestRange.end);
      } else {
       // fallback ke hasil AI
       startTimeSeconds = idea.startTimeSeconds;
       endTimeSeconds = idea.endTimeSeconds;
      }
      return {
       ...idea,
       youtubeVideoId: videoId,
       thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
       startTimeSeconds,
       endTimeSeconds,
      };
     });
     setGeneratedShorts(shortsWithVideoId);
    }
   } catch (e: any) {
    console.error('Error generating short video segments:', e);
    setError(e.message || 'Failed to identify short video segments. Check console for details.');
   } finally {
    setIsLoading(false);
   }
  },
  [apiKeyError]
 );

 return (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-gray-100 flex flex-col items-center p-4 sm:p-8 selection:bg-purple-500 selection:text-white">
   <header className="w-full max-w-4xl mb-8 text-center">
    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">AI YouTube to Shorts Segmenter</h1>
    <p className="mt-3 text-lg text-gray-300">Identifikasi segmen kunci dari video YouTube dan lihat konsep klip pendeknya langsung di sini. Ditenagai oleh AI.</p>
   </header>
   <main className="w-full max-w-4xl flex-1">
    <YouTubeInputForm
     onSubmit={handleSubmit}
     isLoading={isLoading}
    />
    {isLoading && <LoadingSpinner />}

    {error && (
     <div className="mt-6 p-4 bg-red-800 bg-opacity-70 text-red-200 border border-red-600 rounded-lg text-center">
      <p className="font-semibold">Error:</p>
      <p>{error}</p>
     </div>
    )}

    {generatedShorts.length > 0 && (
     <div className="mt-8">
      <h2 className="text-2xl font-semibold mb-6 text-gray-200 text-center">Konsep Klip Pendek yang Disarankan</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
       {' '}
       {/* Adjusted to 2 columns for better player fit */}
       {generatedShorts.map((short) => (
        <ShortVideoCard
         key={short.id}
         shortVideo={short}
         isActivePlayer={activePlayerId === short.id}
         setActivePlayerId={setActivePlayerId}
         aspectRatio={aspectRatio}
        />
       ))}
      </div>
     </div>
    )}

    {!isLoading && !error && generatedShorts.length === 0 && youtubeUrl && !apiKeyError && (
     <div className="mt-6 p-4 bg-gray-700 bg-opacity-50 text-gray-300 border border-gray-600 rounded-lg text-center">
      <p>Tidak ada hasil untuk ditampilkan. Masukkan URL YouTube dan klik "Generate Clip Segments" untuk melihat saran bertenaga AI.</p>
     </div>
    )}

    <div className="mt-10 p-4 bg-yellow-700 bg-opacity-30 text-yellow-200 border border-yellow-600 rounded-lg text-sm flex items-start space-x-3">
     <InfoIcon className="w-6 h-6 flex-shrink-0 mt-0.5 text-yellow-400" />
     <div>
      <h4 className="font-semibold text-yellow-100">Penting: Pratinjau Tertanam & Simulasi Unduhan</h4>
      <p>Aplikasi ini menggunakan AI untuk **mengidentifikasi segmen** video dan **menampilkannya sebagai konsep klip pendek** menggunakan pemutar YouTube yang disematkan.</p>
      <p className="mt-1">Setiap kartu akan menampilkan pemutar video untuk segmen yang disarankan. Anda dapat menonton konsep klip pendek ini langsung di sini.</p>
      <p className="mt-1">
       **Pengunduhan file video pendek secara langsung tidak dimungkinkan dalam demo ini** karena batasan teknis browser dan Ketentuan Layanan YouTube. Tombol "Download" bersifat simulasi dan akan memberikan detail segmen.
      </p>
      <p className="mt-1">Dalam aplikasi produksi penuh, fitur pengunduhan video memerlukan infrastruktur backend (server) untuk memproses dan menyediakan file video.</p>
     </div>
    </div>
   </main>

   <footer className="w-full max-w-4xl mt-12 text-center text-gray-500">
    <p>&copy; {new Date().getFullYear()} AI Shorts Segmenter. Demonstrasi Konsep.</p>
   </footer>
  </div>
 );
};

export default App;
