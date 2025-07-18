import React, {useState, useCallback} from 'react';
import {YouTubeInputForm} from './components/YouTubeInputForm';
import {ShortVideoCard} from './components/ShortVideoCard';
import {LoadingSpinner} from './components/LoadingSpinner';
import {generateShortsIdeas} from './services/groqService';
import type {ShortVideo} from './types';
import {InfoIcon} from './components/icons';
import {generateYouTubeThumbnailUrl} from './utils/thumbnailUtils';

// Backend URL configuration with smart environment detection
const getBackendUrl = () => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 console.log(`[CONFIG] Environment: ${isDev ? 'development' : 'production'}`);
 console.log(`[CONFIG] VITE_BACKEND_URL from env: ${envUrl}`);

 // Smart backend selection:
 // 1. If environment variable is set, use it (allows override)
 // 2. If no env var, fallback to Railway production
 const backendUrl = envUrl || 'https://auto-short-production.up.railway.app';

 return backendUrl;
};

const BACKEND_URL = getBackendUrl();
console.log(`[CONFIG] Using backend URL: ${BACKEND_URL}`);

// Helper: ekstrak videoId dari berbagai format URL YouTube (termasuk live/replay)
function extractYouTubeVideoId(url: string): string | null {
 // Lebih sederhana dan aman
 const regExp = /(?:youtube\.com\/(?:.*[?&]v=|(?:v|e(?:mbed)?|live|shorts)\/)|youtu\.be\/)([\w-]{8,})/i;
 const match = regExp.exec(url);
 if (match?.[1]) return match[1];
 try {
  const u = new URL(url);
  if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
   return u.searchParams.get('v');
  }
  if (u.pathname.startsWith('/live/')) {
   const parts = u.pathname.split('/');
   if (parts[2] && parts[2].length >= 8) return parts[2];
  }
  if (u.pathname.startsWith('/shorts/')) {
   const parts = u.pathname.split('/');
   if (parts[2] && parts[2].length >= 8) return parts[2];
  }
 } catch {}
 return null;
}

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
  if (!(import.meta as any).env.VITE_GROQ_API_KEY) {
   setApiKeyError('Groq API Key is not configured. Please set the VITE_GROQ_API_KEY environment variable.');
   console.error('Groq API Key is missing (import.meta.env.VITE_GROQ_API_KEY).');
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
  type CleanedLine = string;
  const final: CleanedLine[] = [];
  for (const cur of cleaned.map((x) => x.toLowerCase())) {
   if (final.every((prev) => similarity(prev, cur) < 0.8)) {
    final.push(cur);
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
  const url = `${BACKEND_URL}/api/yt-transcript?videoId=${videoId}`;
  try {
   const res = await fetch(url);
   if (!res.ok) return '';
   const data = await res.json();
   if (!data?.segments || !Array.isArray(data.segments)) return '';
   const raw = data.segments.map((seg: any) => seg.text).join(' ');
   return cleanTranscript(raw);
  } catch {
   return '';
  }
 };

 // Ambil seluruh segmen subtitle lengkap (dengan timestamp)
 const fetchSubtitleSegments = async (videoId: string): Promise<Array<{start: string; end: string; text: string}>> => {
  const url = `${BACKEND_URL}/api/yt-transcript?videoId=${videoId}`;
  try {
   const res = await fetch(url);
   if (!res.ok) return [];
   const data = await res.json();
   if (!data?.segments || !Array.isArray(data.segments)) return [];
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
  async (url: string) => {
   if (apiKeyError) return;
   setYoutubeUrl(url);
   setIsLoading(true);
   setError(null);
   setGeneratedShorts([]);
   setActivePlayerId(null); // Reset active player on new submission

   const videoId = extractYouTubeVideoId(url);
   if (!videoId) {
    setError('URL YouTube tidak valid atau tidak didukung. Coba salin ulang URL video (termasuk live replay).');
    setIsLoading(false);
    return;
   }

   let transcript = '';
   try {
    transcript = await fetchFullTranscript(videoId);
   } catch {}

   let videoDuration = 0;
   // Fetch durasi video menggunakan backend endpoint untuk menghindari CORS
   try {
    console.log(`Fetching video metadata for: ${videoId}`);
    const metaRes = await fetch(`${BACKEND_URL}/api/video-metadata?videoId=${videoId}`);
    if (metaRes.ok) {
     const metadata = await metaRes.json();
     videoDuration = metadata.duration || 0;
     console.log(`Video duration fetched: ${videoDuration} seconds`);
    } else {
     console.warn('Failed to fetch video metadata from backend:', metaRes.status);
    }
   } catch (error) {
    console.error('Error fetching video metadata:', error);
   }

   if (!videoDuration || isNaN(videoDuration) || videoDuration < 30) {
    // fallback ke 10 menit
    console.log('Using fallback duration: 600 seconds');
    videoDuration = 600;
   }

   try {
    const ideas = await generateShortsIdeas(url, transcript, videoDuration); // Kirim transcript dan durasi ke Gemini
    console.log(`[AI SEGMENTS] Generated ${ideas.length} segments for video duration ${videoDuration}s`);
    let subtitleSegments = await fetchSubtitleSegments(videoId);
    // Fallback: jika subtitleSegments kosong, buat dummy segmentasi manual berdasarkan durasi video
    if (!subtitleSegments || subtitleSegments.length === 0) {
     const fallbackSegments = [];
     const segLength = videoDuration > 600 ? 90 : 60; // 90 detik default untuk video panjang
     for (let start = 0; start < videoDuration; start += segLength) {
      const end = Math.min(start + segLength, videoDuration);
      const toVtt = (sec: number) => {
       const h = Math.floor(sec / 3600)
        .toString()
        .padStart(2, '0');
       const m = Math.floor((sec % 3600) / 60)
        .toString()
        .padStart(2, '0');
       const s = (sec % 60).toFixed(3).padStart(6, '0');
       return `${h}:${m}:${s}`;
      };
      fallbackSegments.push({start: toVtt(start), end: toVtt(end), text: ''});
     }
     subtitleSegments = fallbackSegments;
    }
    // Fallback: jika hasil AI terlalu sedikit, generate segmen otomatis
    let shortsWithVideoId: ShortVideo[] = ideas.map((idea) => {
     let startTimeSeconds = 0;
     let endTimeSeconds = 0;
     if (subtitleSegments.length > 0) {
      let bestRange = findBestSubtitleRange(subtitleSegments, idea.description);
      const toSeconds = (vtt: string) => {
       const [h, m, s] = vtt.split(':');
       return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
      };
      let duration = toSeconds(bestRange.end) - toSeconds(bestRange.start);
      let endIdx = subtitleSegments.findIndex((s) => s.start === bestRange.start);
      let lastIdx = subtitleSegments.findIndex((s) => s.end === bestRange.end);
      const targetDuration = Math.max(30, Math.min(idea.endTimeSeconds - idea.startTimeSeconds, 120));
      while (duration < targetDuration && lastIdx < subtitleSegments.length - 1) {
       lastIdx++;
       bestRange.end = subtitleSegments[lastIdx].end;
       duration = toSeconds(bestRange.end) - toSeconds(bestRange.start);
      }
      while (duration > targetDuration && lastIdx > endIdx) {
       lastIdx--;
       bestRange.end = subtitleSegments[lastIdx].end;
       duration = toSeconds(bestRange.end) - toSeconds(bestRange.start);
      }
      startTimeSeconds = toSeconds(bestRange.start);
      endTimeSeconds = toSeconds(bestRange.end);
     } else {
      startTimeSeconds = idea.startTimeSeconds ?? 0;
      endTimeSeconds = idea.endTimeSeconds ?? 120;
      if (endTimeSeconds - startTimeSeconds < 30) endTimeSeconds = startTimeSeconds + 120;
     }
     return {
      ...idea,
      youtubeVideoId: videoId,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      customThumbnailUrl: generateYouTubeThumbnailUrl(videoId, startTimeSeconds),
      startTimeSeconds,
      endTimeSeconds,
     };
    });
    // Jika hasil AI terlalu sedikit untuk video panjang, fallback ke segmentasi otomatis
    let minSegmentsRequired = 5;
    if (videoDuration > 3600) {
     minSegmentsRequired = 20; // 1+ jam: minimal 20 segmen
    } else if (videoDuration > 1800) {
     minSegmentsRequired = 12; // 30+ menit: minimal 12 segmen
    } else if (videoDuration > 900) {
     minSegmentsRequired = 8; // 15+ menit: minimal 8 segmen
    } else if (videoDuration > 600) {
     minSegmentsRequired = 6; // 10+ menit: minimal 6 segmen
    }

    if (shortsWithVideoId.length < minSegmentsRequired && videoDuration > 600) {
     console.log(`[FALLBACK] AI generated ${shortsWithVideoId.length} segments, adding automatic segments to reach ${minSegmentsRequired}`);
     const fallbackShorts: ShortVideo[] = [...shortsWithVideoId]; // Keep AI segments
     const segLength = Math.max(45, Math.floor(videoDuration / Math.max(15, minSegmentsRequired)));
     let idx = shortsWithVideoId.length;

     // Add automatic segments to fill the gap
     const neededSegments = minSegmentsRequired - shortsWithVideoId.length;
     const intervalSize = Math.floor(videoDuration / neededSegments);

     for (let i = 0; i < neededSegments; i++) {
      const start = i * intervalSize;
      const end = Math.min(start + segLength, videoDuration);
      fallbackShorts.push({
       id: `auto-${idx}`,
       title: `Highlight ${idx + 1}`,
       description: `Segmen otomatis yang menarik dari menit ${Math.floor(start / 60)} hingga ${Math.floor(end / 60)}.`,
       startTimeSeconds: start,
       endTimeSeconds: end,
       youtubeVideoId: videoId,
       thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
       customThumbnailUrl: generateYouTubeThumbnailUrl(videoId, start),
      });
      idx++;
     }
     setGeneratedShorts(fallbackShorts);
     console.log(`[SUCCESS] Combined ${shortsWithVideoId.length} AI segments + ${neededSegments} automatic segments = ${fallbackShorts.length} total`);
     return;
    }
    // Jika hasil AI kosong, baru fallback ke segmentasi otomatis
    if (!shortsWithVideoId || shortsWithVideoId.length === 0) {
     const fallbackShorts: ShortVideo[] = [];
     const segLength = videoDuration > 600 ? 90 : 60;
     let idx = 0;
     for (let start = 0; start < videoDuration; start += segLength) {
      const end = Math.min(start + segLength, videoDuration);
      fallbackShorts.push({
       id: `fallback-${idx}`,
       title: `Segmen ${idx + 1}`,
       description: `Highlight otomatis dari detik ${start} hingga ${end}.`,
       startTimeSeconds: start,
       endTimeSeconds: end,
       youtubeVideoId: videoId,
       thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
       customThumbnailUrl: generateYouTubeThumbnailUrl(videoId, start),
      });
      idx++;
     }
     setGeneratedShorts(fallbackShorts);
     setError('AI tidak menghasilkan segmen. Ditampilkan segmentasi otomatis.');
     return;
    }
    setGeneratedShorts(shortsWithVideoId);

    // Tampilkan info jika segmen sedikit (tapi tidak error)
    const expectedSegments = Math.max(3, Math.floor(videoDuration / 300)); // 1 segmen per 5 menit, minimal 3
    if (shortsWithVideoId.length < expectedSegments) {
     console.log(`[INFO] Generated ${shortsWithVideoId.length} segments, expected ~${expectedSegments} for ${Math.floor(videoDuration / 60)} minute video`);
     // Tidak set error, hanya log info
    }
   } catch (e: any) {
    console.error('Error generating short video segments:', e);
    setError(e.message ?? 'Failed to identify short video segments. Check console for details.');
   } finally {
    setIsLoading(false);
   }
  },
  [apiKeyError]
 );

 return (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-gray-100 flex flex-col items-center p-4 sm:p-8 selection:bg-purple-500 selection:text-white">
   <header className="w-full max-w-4xl mb-8 text-center">
    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">AI Clipper (ALPHA)</h1>
    <p className="mt-3 text-lg text-gray-300">Identifikasi segmen kunci dari video YouTube dengan AI GRATIS tanpa batas. Ditenagai oleh Groq AI.</p>
    {/* Build: {new Date().toISOString()} */}
   </header>
   <main className="w-full max-w-4xl flex-1">
    <YouTubeInputForm
     onSubmit={handleSubmit}
     isLoading={isLoading}
     aspectRatio={aspectRatio}
     setAspectRatio={setAspectRatio}
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
    <p>&copy; {new Date().getFullYear()} AI Shorts Segmenter (Groq + Llama 3.3 70B). Demonstrasi Konsep.</p>
   </footer>
  </div>
 );
};

export default App;
