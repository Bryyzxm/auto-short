import React, { useState, useCallback } from "react";
import { YouTubeInputForm } from "./components/YouTubeInputForm";
import { ShortVideoCard } from "./components/ShortVideoCard";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { generateShortsIdeas } from "./services/geminiService";
import type { ShortVideo } from "./types";
import { InfoIcon } from "./components/icons";

const BASE_API_URL = "https://auto-short-backend-production.up.railway.app";

// Helper: ekstrak videoId dari berbagai format URL YouTube (termasuk live/replay)
function extractYouTubeVideoId(url: string): string | null {
  // Lebih sederhana dan aman
  const regExp =
    /(?:youtube\.com\/(?:.*[?&]v=|(?:v|e(?:mbed)?|live|shorts)\/)|youtu\.be\/)([\w-]{8,})/i;
  const match = regExp.exec(url);
  if (match?.[1]) return match[1];
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }
    if (u.pathname.startsWith("/live/")) {
      const parts = u.pathname.split("/");
      if (parts[2] && parts[2].length >= 8) return parts[2];
    }
    if (u.pathname.startsWith("/shorts/")) {
      const parts = u.pathname.split("/");
      if (parts[2] && parts[2].length >= 8) return parts[2];
    }
  } catch {}
  return null;
}

const App: React.FC = () => {
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [generatedShorts, setGeneratedShorts] = useState<ShortVideo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");

  // Check for API key on mount
  React.useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyError(
        "Gemini API Key is not configured. Please set the API_KEY environment variable."
      );
      console.error("Gemini API Key is missing (process.env.API_KEY).");
    }
  }, []);

  // Utility: Clean transcript from duplicate lines/phrases (global, not just consecutive)
  function cleanTranscript(text: string): string {
    if (!text) return "";
    // Split ke kata
    const words = text.split(/\s+/);
    const ngramSet = new Set<string>();
    const cleaned: string[] = [];
    let i = 0;
    while (i < words.length) {
      // Ambil n-gram 6 kata (bisa diubah sesuai kebutuhan)
      const n = 6;
      const ngram = words
        .slice(i, i + n)
        .join(" ")
        .toLowerCase();
      if (ngramSet.has(ngram)) {
        // Jika sudah pernah muncul, skip n kata ke depan
        i += n;
        continue;
      }
      ngramSet.add(ngram);
      cleaned.push(words[i]);
      i++;
    }
    return cleaned.join(" ");
  }

  const fetchFullTranscript = async (videoId: string): Promise<string> => {
    const url = `${BASE_API_URL}/api/yt-transcript?videoId=${videoId}`;
    try {
      console.log(`🔍 Fetching transcript from: ${url}`);
      const res = await fetch(url);
      console.log(`📡 Transcript API response status: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ Transcript API error: ${res.status} - ${errorText}`);
        return "";
      }
      
      const data = await res.json();
      console.log(`📊 Transcript API response:`, {
        hasSegments: !!data?.segments,
        segmentCount: data?.segments?.length || 0,
        hasMetadata: !!data?.metadata,
        source: data?.metadata?.source
      });
      
      if (!data?.segments || !Array.isArray(data.segments)) {
        console.warn(`⚠️ Invalid transcript data structure`);
        return "";
      }
      
      if (data.segments.length === 0) {
        console.warn(`⚠️ No transcript segments found`);
        return "";
      }
      
      const raw = data.segments.map((seg: any) => seg.text).join(" ");
      const cleaned = cleanTranscript(raw);
      console.log(`✅ Transcript processed: ${cleaned.length} characters`);
      return cleaned;
    } catch (error) {
      console.error(`❌ Error fetching transcript:`, error);
      return "";
    }
  };

  // Ambil seluruh segmen subtitle lengkap (dengan timestamp)
  const fetchSubtitleSegments = async (
    videoId: string
  ): Promise<Array<{ start: string; end: string; text: string }>> => {
    const url = `${BASE_API_URL}/api/yt-transcript?videoId=${videoId}`;
    try {
      console.log(`🔍 Fetching subtitle segments from: ${url}`);
      const res = await fetch(url);
      console.log(`📡 Subtitle segments API response status: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ Subtitle segments API error: ${res.status} - ${errorText}`);
        return [];
      }
      
      const data = await res.json();
      console.log(`📊 Subtitle segments API response:`, {
        hasSegments: !!data?.segments,
        segmentCount: data?.segments?.length || 0,
        hasMetadata: !!data?.metadata,
        source: data?.metadata?.source
      });
      
      if (!data?.segments || !Array.isArray(data.segments)) {
        console.warn(`⚠️ Invalid subtitle segments data structure`);
        return [];
      }
      
      console.log(`✅ Subtitle segments fetched: ${data.segments.length} segments`);
      return data.segments;
    } catch (error) {
      console.error(`❌ Error fetching subtitle segments:`, error);
      return [];
    }
  };

  // Fungsi pencocokan subtitle yang memperluas rentang agar durasi wajar dan relevan dengan deskripsi
  function findBestSubtitleRange(
    subtitles: Array<{ start: string; end: string; text: string }>,
    description: string,
    minDurationSec = 30,
    maxDurationSec = 120
  ) {
    // Temukan subtitle yang paling relevan
    let bestIdx = 0;
    let bestScore = 0;
    const desc = description.toLowerCase();
    const descWords = desc.split(" ").filter((w) => w.length > 2);
    for (let i = 0; i < subtitles.length; i++) {
      const sub = subtitles[i].text.toLowerCase();
      const common = descWords.filter((word) => sub.includes(word)).length;
      if (common > bestScore) {
        bestScore = common;
        bestIdx = i;
      }
    }
    // Helper untuk konversi waktu
    const toSeconds = (vtt: string) => {
      const [h, m, s] = vtt.split(":");
      return (
        parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(",", "."))
      );
    };
    // Perluas rentang ke depan & belakang hingga durasi min tercapai
    let startIdx = bestIdx;
    let endIdx = bestIdx;
    let duration =
      toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
    // Perluas ke depan
    while (
      duration < minDurationSec &&
      endIdx < subtitles.length - 1 &&
      endIdx - startIdx < 20
    ) {
      endIdx++;
      duration =
        toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
    }
    // Perluas ke belakang
    while (
      duration < minDurationSec &&
      startIdx > 0 &&
      endIdx - startIdx < 20
    ) {
      startIdx--;
      duration =
        toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
    }
    // Jika terlalu panjang, potong ke maxDurationSec
    while (duration > maxDurationSec && endIdx > startIdx) {
      endIdx--;
      duration =
        toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
    }
    return {
      start: subtitles[startIdx].start,
      end: subtitles[endIdx].end,
      text: subtitles
        .slice(startIdx, endIdx + 1)
        .map((s) => s.text)
        .join(" "),
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
        setError(
          "URL YouTube tidak valid atau tidak didukung. Coba salin ulang URL video (termasuk live replay)."
        );
        setIsLoading(false);
        return;
      }

      let transcript = "";
      let transcriptAvailable = false;
      
      try {
        console.log(`🔍 Fetching transcript for videoId: ${videoId}`);
        transcript = await fetchFullTranscript(videoId);
        if (transcript && transcript.trim().length > 0) {
          transcriptAvailable = true;
          console.log(`✅ Transcript available, length: ${transcript.length}`);
        } else {
          console.log(`⚠️ Transcript is empty or null`);
        }
      } catch (error) {
        console.error(`❌ Error fetching transcript:`, error);
      }

      // If transcript is not available, try to get it anyway for segmentation
      if (!transcriptAvailable) {
        console.log(`🔄 Transcript not available, trying to fetch segments directly...`);
        try {
          const subtitleSegments = await fetchSubtitleSegments(videoId);
          if (subtitleSegments && subtitleSegments.length > 0) {
            // Create a basic transcript from segments for AI processing
            transcript = subtitleSegments.map(seg => seg.text).join(' ');
            transcriptAvailable = true;
            console.log(`✅ Created transcript from segments, length: ${transcript.length}`);
          }
        } catch (segmentError) {
          console.error(`❌ Error fetching subtitle segments:`, segmentError);
        }
      }

      // If still no transcript, use automatic segmentation
      if (!transcriptAvailable || !transcript || transcript.trim().length === 0) {
        console.log(`⚠️ No transcript available, using automatic segmentation`);
        const videoDuration = await getVideoDuration(videoId);
        setGeneratedShorts(generateAutoSegments(videoDuration, videoId));
        setError("Transkrip tidak tersedia untuk video ini. Ditampilkan segmentasi otomatis berdasarkan durasi video.");
        setIsLoading(false);
        return;
      }

      let videoDuration = await getVideoDuration(videoId);

      try {
        const ideas = await generateShortsIdeas(url, transcript); // Kirim transcript ke Gemini
        let subtitleSegments = await fetchSubtitleSegments(videoId);
        subtitleSegments = ensureSubtitleSegments(
          subtitleSegments,
          videoDuration
        );
        // Patch: tambahkan youtubeVideoId dan thumbnailUrl jika belum ada
        const ideasWithMeta = ideas.map((idea, idx) => ({
          ...idea,
          youtubeVideoId: videoId,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          id: idea.id || `short-${Date.now()}-${idx}`,
        }));
        const shortsWithVideoId = buildShortsWithVideoId(
          ideasWithMeta,
          subtitleSegments,
          videoId
        );
        if (shouldFallbackToAutoSegments(shortsWithVideoId, videoDuration)) {
          setGeneratedShorts(generateAutoSegments(videoDuration, videoId));
          setError(
            "AI hanya menghasilkan sedikit segmen. Ditambahkan segmentasi otomatis agar total minimal 10 segmen."
          );
          return;
        }
        if (!shortsWithVideoId || shortsWithVideoId.length === 0) {
          setGeneratedShorts(generateAutoSegments(videoDuration, videoId));
          setError(
            "AI tidak menghasilkan segmen. Ditampilkan segmentasi otomatis."
          );
          return;
        }
        setGeneratedShorts(shortsWithVideoId);
        if (shortsWithVideoId.length < Math.floor(videoDuration / 180)) {
          setError(
            "Segmen yang dihasilkan sangat sedikit untuk durasi video ini. Coba ulangi proses, gunakan video lain, atau pastikan video memiliki transkrip yang jelas."
          );
        }
      } catch (e: any) {
        console.error("Error generating short video segments:", e);
        setError(
          e.message ??
            "Failed to identify short video segments. Check console for details."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [apiKeyError]
  );

  function ensureSubtitleSegments(
    subtitleSegments: Array<{ start: string; end: string; text: string }>,
    videoDuration: number
  ) {
    if (!subtitleSegments || subtitleSegments.length === 0) {
      const fallbackSegments = [];
      const segLength = videoDuration > 600 ? 90 : 60;
      for (let start = 0; start < videoDuration; start += segLength) {
        const end = Math.min(start + segLength, videoDuration);
        fallbackSegments.push({
          start: toVtt(start),
          end: toVtt(end),
          text: "",
        });
      }
      return fallbackSegments;
    }
    return subtitleSegments;
  }

  function buildShortsWithVideoId(
    ideas: ShortVideo[],
    subtitleSegments: Array<{ start: string; end: string; text: string }>,
    videoId: string
  ): ShortVideo[] {
    return ideas.map((idea) => {
      let startTimeSeconds = 0;
      let endTimeSeconds = 0;
      if (subtitleSegments.length > 0) {
        let bestRange = findBestSubtitleRange(
          subtitleSegments,
          idea.description
        );
        const toSeconds = (vtt: string) => {
          const [h, m, s] = vtt.split(":");
          return (
            parseInt(h) * 3600 +
            parseInt(m) * 60 +
            parseFloat(s.replace(",", "."))
          );
        };
        let duration = toSeconds(bestRange.end) - toSeconds(bestRange.start);
        let endIdx = subtitleSegments.findIndex(
          (s) => s.start === bestRange.start
        );
        let lastIdx = subtitleSegments.findIndex(
          (s) => s.end === bestRange.end
        );
        const targetDuration = Math.max(
          30,
          Math.min(idea.endTimeSeconds - idea.startTimeSeconds, 120)
        );
        while (
          duration < targetDuration &&
          lastIdx < subtitleSegments.length - 1
        ) {
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
        if (endTimeSeconds - startTimeSeconds < 30)
          endTimeSeconds = startTimeSeconds + 120;
      }
      return {
        ...idea,
        youtubeVideoId: videoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        startTimeSeconds,
        endTimeSeconds,
      };
    });
  }

  function shouldFallbackToAutoSegments(
    shortsWithVideoId: ShortVideo[],
    videoDuration: number
  ) {
    return shortsWithVideoId.length < 10 && videoDuration > 600;
  }

  function generateAutoSegments(
    videoDuration: number,
    videoId: string
  ): ShortVideo[] {
    const fallbackShorts: ShortVideo[] = [];
    const segLength = Math.max(30, Math.floor(videoDuration / 10));
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
      });
      idx++;
    }
    return fallbackShorts;
  }

  async function getVideoDuration(videoId: string): Promise<number> {
    let videoDuration = 0;
    const url = `${BASE_API_URL}/api/video-meta?videoId=${videoId}`;
    
    try {
      console.log(`🔍 Fetching video duration from: ${url}`);
      const metaRes = await fetch(url);
      console.log(`📡 Video meta API response status: ${metaRes.status}`);
      
      if (metaRes.ok) {
        const data = await metaRes.json();
        console.log(`📊 Video meta API response:`, data);
        
        if (data.duration && !isNaN(data.duration)) {
          videoDuration = data.duration;
          console.log(`✅ Video duration found: ${videoDuration} seconds`);
        } else {
          console.warn(`⚠️ Invalid duration in response: ${data.duration}`);
        }
      } else {
        const errorText = await metaRes.text();
        console.error(`❌ Video meta API error: ${metaRes.status} - ${errorText}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching video duration:`, error);
    }
    
    if (!videoDuration || isNaN(videoDuration) || videoDuration < 30) {
      console.log(`⚠️ Using default duration: 600 seconds`);
      videoDuration = 600;
    }
    
    return videoDuration;
  }

  function toVtt(sec: number) {
    const h = Math.floor(sec / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((sec % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toFixed(3).padStart(6, "0");
    return `${h}:${m}:${s}`;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-gray-100 flex flex-col items-center p-4 sm:p-8 selection:bg-purple-500 selection:text-white">
      <header className="w-full max-w-4xl mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">
          AI Clipper (ALPHA)
        </h1>
        <p className="mt-3 text-lg text-gray-300">
          Identifikasi segmen kunci dari video YouTube dan lihat konsep klip
          pendeknya langsung di sini. Ditenagai oleh AI.
        </p>
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
            <h2 className="text-2xl font-semibold mb-6 text-gray-200 text-center">
              Konsep Klip Pendek yang Disarankan
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {" "}
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

        {!isLoading && !error && generatedShorts.length === 0 && youtubeUrl && (
          <div className="mt-6 p-4 bg-gray-700 bg-opacity-50 text-gray-300 border border-gray-600 rounded-lg text-center">
            <p>
              Tidak ada hasil untuk ditampilkan. Masukkan URL YouTube dan klik
              "Generate Clip Segments" untuk melihat saran bertenaga AI.
            </p>
          </div>
        )}

        <div className="mt-10 p-4 bg-yellow-700 bg-opacity-30 text-yellow-200 border border-yellow-600 rounded-lg text-sm flex items-start space-x-3">
          <InfoIcon className="w-6 h-6 flex-shrink-0 mt-0.5 text-yellow-400" />
          <div>
            <h4 className="font-semibold text-yellow-100">
              Penting: Pratinjau Tertanam & Simulasi Unduhan
            </h4>
            <p>
              Aplikasi ini menggunakan AI untuk **mengidentifikasi segmen**
              video dan **menampilkannya sebagai konsep klip pendek**
              menggunakan pemutar YouTube yang disematkan.
            </p>
            <p className="mt-1">
              Setiap kartu akan menampilkan pemutar video untuk segmen yang
              disarankan. Anda dapat menonton konsep klip pendek ini langsung di
              sini.
            </p>
            <p className="mt-1">
              **Pengunduhan file video pendek secara langsung tidak dimungkinkan
              dalam demo ini** karena batasan teknis browser dan Ketentuan
              Layanan YouTube. Tombol "Download" bersifat simulasi dan akan
              memberikan detail segmen.
            </p>
            <p className="mt-1">
              Dalam aplikasi produksi penuh, fitur pengunduhan video memerlukan
              infrastruktur backend (server) untuk memproses dan menyediakan
              file video.
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-4xl mt-12 text-center text-gray-500">
        <p>
          &copy; {new Date().getFullYear()} AI Shorts Segmenter. Demonstrasi
          Konsep.
        </p>
      </footer>
    </div>
  );
};

export default App;
