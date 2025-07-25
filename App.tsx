import React, {useState, useCallback} from 'react';
import {YouTubeInputForm} from './components/YouTubeInputForm';
import {ShortVideoCard} from './components/ShortVideoCard';
import {LoadingSpinner} from './components/LoadingSpinner';
import {TranscriptErrorHandler} from './components/TranscriptUploadFallback';
import {generateShortsIdeas} from './services/groqService';
import type {ShortVideo} from './types';
import {InfoIcon} from './components/icons';
import {generateYouTubeThumbnailUrl} from './utils/thumbnailUtils';
import transcriptManager from './services/transcriptService';

// Backend URL configuration with smart environment detection
const getBackendUrl = () => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 console.log(`[CONFIG] Environment: ${isDev ? 'development' : 'production'}`);
 console.log(`[CONFIG] VITE_BACKEND_URL from env: ${envUrl}`);

 // Smart backend selection:
 // 1. Development: use localhost only if no env var is set
 // 2. If environment variable is set, always use it (for both dev and prod)
 // 3. If no env var, fallback to Railway production

 if (isDev && !envUrl) {
  // Development without explicit env var: use localhost
  const localhostUrl = 'http://localhost:5001';
  console.log(`[CONFIG] Development mode - using localhost: ${localhostUrl}`);
  return localhostUrl;
 }

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
 const [showTranscriptUpload, setShowTranscriptUpload] = useState<boolean>(false);
 const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

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

 // const fetchFullTranscript = async (videoId: string): Promise<string> => {
 //  try {
 //   console.log(`[APP] Fetching transcript for ${videoId} using smart transcript manager`);
 //   const transcript = await transcriptManager.fetchTranscript(videoId);
 //   if (transcript && transcript.length > 0) {
 //    console.log(`[APP] Successfully fetched transcript: ${transcript.length} characters`);
 //    return cleanTranscript(transcript);
 //   }
 //   console.log(`[APP] No transcript found for ${videoId}`);
 //   return '';
 //  } catch (error) {
 //   console.error(`[APP] Error fetching transcript for ${videoId}:`, error);
 //   return '';
 //  }
 // };

 // Enhanced transcript fetching with emergency fallback
 const fetchEnhancedTranscript = async (videoId: string): Promise<{transcript: string; segments: any[]; method: string}> => {
  try {
   console.log(`[APP] Fetching enhanced transcript with timing for ${videoId}`);

   // Try backend with timing first
   const backendUrl = BACKEND_URL;
   const enhancedUrl = `${backendUrl}/api/enhanced-transcript/${videoId}`;

   console.log(`[APP] Trying enhanced backend endpoint: ${enhancedUrl}`);
   const response = await fetch(enhancedUrl);

   if (response.ok) {
    const data = await response.json();
    console.log(`[APP] Enhanced backend success: ${data.transcript?.length || 0} chars, ${data.segments?.length || 0} segments, method: ${data.method}`);
    return {
     transcript: data.segments ? data.segments.map((s: any) => s.text).join(' ') : data.transcript || '',
     segments: data.segments || [],
     method: data.method || 'Enhanced Backend',
    };
   } else {
    // Check for specific error responses from backend
    try {
     const errorData = await response.json();
     if (errorData.error) {
      console.log(`[APP] Enhanced backend error: ${errorData.error}`);
      // Propagate specific backend errors
      if (errorData.error.includes('A valid transcript is not available for this video')) {
       throw new Error(errorData.error);
      }
     }
    } catch (parseError) {
     // JSON parsing failed, continue with status-based handling
    }
    console.log(`[APP] Enhanced backend failed with status: ${response.status}`);
   }

   // Emergency fallback endpoint
   console.log(`[APP] Trying emergency transcript endpoint...`);
   const emergencyResponse = await fetch(`${backendUrl}/api/emergency-transcript/${videoId}`);

   if (emergencyResponse.ok || emergencyResponse.status === 206) {
    // Accept partial content
    const emergencyData = await emergencyResponse.json();
    console.log(`[APP] Emergency endpoint success: ${emergencyData.segments?.length || 0} segments, method: ${emergencyData.method}`);

    if (emergencyData.isFallback) {
     console.warn(`[APP] ⚠️ Using fallback transcript data for ${videoId}`);
    }

    return {
     transcript: emergencyData.segments ? emergencyData.segments.map((s: any) => s.text).join(' ') : '',
     segments: emergencyData.segments || [],
     method: emergencyData.method || 'Emergency Fallback',
    };
   } else {
    // Check for specific error responses from emergency endpoint
    try {
     const errorData = await emergencyResponse.json();
     if (errorData.error && errorData.error.includes('A valid transcript is not available for this video')) {
      console.log(`[APP] Emergency endpoint - NoValidTranscriptError: ${errorData.error}`);
      throw new Error(errorData.error);
     }
    } catch (parseError) {
     // JSON parsing failed, continue
    }
    console.log(`[APP] Emergency endpoint failed with status: ${emergencyResponse.status}`);
   }

   // Fallback to transcriptManager
   console.log(`[APP] Falling back to transcript manager...`);
   const plainTranscript = await transcriptManager.fetchTranscript(videoId);
   if (plainTranscript && plainTranscript.length > 0) {
    console.log(`[APP] Transcript manager success: ${plainTranscript.length} characters`);
    return {
     transcript: cleanTranscript(plainTranscript),
     segments: [],
     method: 'TranscriptManager (No Timing)',
    };
   }

   throw new Error('No transcript available from any source');
  } catch (error) {
   console.error(`[APP] Error fetching enhanced transcript for ${videoId}:`, error);
   throw error;
  }
 };

 // Fetch intelligent segments with real timing
 const fetchIntelligentSegments = async (videoId: string, targetCount: number = 8): Promise<ShortVideo[]> => {
  console.log(`[APP] Fetching intelligent segments for ${videoId}`);

  try {
   const response = await fetch(`${BACKEND_URL}/api/intelligent-segments`, {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
    },
    body: JSON.stringify({
     videoId: videoId,
     targetSegmentCount: targetCount,
    }),
   });

   if (!response.ok) {
    // Try to get specific error message from backend
    try {
     const errorData = await response.json();
     if (errorData.error) {
      console.log(`[APP] Intelligent segments error: ${errorData.error}`);
      // Propagate specific backend errors like NoValidTranscriptError
      if (errorData.error.includes('A valid transcript is not available for this video')) {
       throw new Error(errorData.error);
      }
     }
    } catch (parseError) {
     // JSON parsing failed, use generic error
    }
    throw new Error(`Intelligent segments API failed: ${response.status}`);
   }

   const data = await response.json();

   if (data.segments && data.segments.length > 0) {
    console.log(`[APP] ✅ Got ${data.segments.length} intelligent segments (avg: ${data.averageDuration}s, quality: ${data.transcriptQuality})`);

    return data.segments.map((segment: any, index: number) => ({
     id: segment.id,
     title: segment.title || `Segment ${index + 1}`,
     description: segment.description || `Smart segment with ${segment.duration}s duration`,
     startTimeSeconds: segment.startTimeSeconds,
     endTimeSeconds: segment.endTimeSeconds,
     youtubeVideoId: videoId,
     thumbnailUrl: segment.thumbnailUrl,
     transcriptExcerpt: segment.transcriptExcerpt,
     hasRealTiming: segment.hasRealTiming,
     duration: segment.duration,
    }));
   } else {
    throw new Error('No intelligent segments returned');
   }
  } catch (error) {
   console.error(`[APP] Intelligent segments failed for ${videoId}:`, error);
   throw error;
  }
 };
 // const fetchSubtitleSegments = async (videoId: string): Promise<Array<{start: string; end: string; text: string}>> => {
 //  try {
 //   console.log(`[APP] Fetching subtitle segments for ${videoId} from backend`);
 //   const url = `${BACKEND_URL}/api/yt-transcript?videoId=${videoId}`;
 //   const res = await fetch(url);
 //   if (!res.ok) {
 //    console.log(`[APP] Backend subtitle segments failed: ${res.status}`);
 //    return [];
 //   }
 //   const data = await res.json();
 //   if (!data?.segments || !Array.isArray(data.segments)) {
 //    console.log(`[APP] No segments in backend response`);
 //    return [];
 //   }
 //   console.log(`[APP] Successfully fetched ${data.segments.length} subtitle segments`);
 //   return data.segments;
 //  } catch (error) {
 //   console.error(`[APP] Error fetching subtitle segments for ${videoId}:`, error);
 //   return [];
 //  }
 // };

 // Fungsi pencocokan subtitle yang memperluas rentang agar durasi wajar dan relevan dengan deskripsi
 // function findBestSubtitleRange(subtitles: Array<{start: string; end: string; text: string}>, description: string, minDurationSec = 30, maxDurationSec = 120) {
 //  let bestIdx = 0;
 //  let bestScore = 0;
 //  const desc = description.toLowerCase();
 //  const descWords = desc.split(' ').filter((w) => w.length > 2);
 //  for (let i = 0; i < subtitles.length; i++) {
 //   const sub = subtitles[i].text.toLowerCase();
 //   const common = descWords.filter((word) => sub.includes(word)).length;
 //   if (common > bestScore) {
 //    bestScore = common;
 //    bestIdx = i;
 //   }
 //  }
 //  // Perluas rentang ke depan & belakang hingga durasi min tercapai dan kata kunci tercakup
 //  let startIdx = bestIdx,
 //   endIdx = bestIdx;
 //  let coveredWords = new Set(subtitles[bestIdx].text.toLowerCase().split(' '));
 //  const toSeconds = (vtt: string) => {
 //   const [h, m, s] = vtt.split(':');
 //   return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
 //  };
 //  let duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
 //  // Perluas ke depan
 //  while (duration < minDurationSec && endIdx < subtitles.length - 1 && endIdx - startIdx < 20) {
 //   endIdx++;
 //   subtitles[endIdx].text
 //    .toLowerCase()
 //    .split(' ')
 //    .forEach((w) => coveredWords.add(w));
 //   duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
 //  }
 //  // Perluas ke belakang
 //  while (duration < minDurationSec && startIdx > 0 && endIdx - startIdx < 20) {
 //   startIdx--;
 //   subtitles[startIdx].text
 //    .toLowerCase()
 //    .split(' ')
 //    .forEach((w) => coveredWords.add(w));
 //   duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
 //  }
 //  // Jika terlalu panjang, potong ke maxDurationSec
 //  while (duration > maxDurationSec && endIdx > startIdx) {
 //   endIdx--;
 //   duration = toSeconds(subtitles[endIdx].end) - toSeconds(subtitles[startIdx].start);
 //  }
 //  return {
 //   start: subtitles[startIdx].start,
 //   end: subtitles[endIdx].end,
 //   text: subtitles
 //    .slice(startIdx, endIdx + 1)
 //    .map((s) => s.text)
 //    .join(' '),
 //  };
 // }

 // Handler for manual transcript upload
 const handleManualTranscript = useCallback(
  async (manualData: {transcript: string; segments: any[]; videoId: string}) => {
   setIsLoading(true);
   setError(null);
   setShowTranscriptUpload(false);

   try {
    console.log(`[APP] 🎯 Processing manual transcript for ${manualData.videoId}`);
    console.log(`[APP] Manual transcript length: ${manualData.transcript.length} chars`);

    // Use the manual transcript data with Groq AI to generate shorts
    const promptIdeas = await generateShortsIdeas(manualData.transcript, aspectRatio);

    // Convert to ShortVideo format
    const manualShorts: ShortVideo[] = promptIdeas.map((idea, index) => ({
     id: `manual-${index}`,
     title: idea.title,
     description: idea.description,
     startTimeSeconds: idea.startTimeSeconds || index * 60, // Fallback timing
     endTimeSeconds: idea.endTimeSeconds || (index + 1) * 60,
     youtubeVideoId: manualData.videoId,
     thumbnailUrl: generateYouTubeThumbnailUrl(manualData.videoId, 0),
    }));

    console.log(`[APP] ✅ Generated ${manualShorts.length} shorts from manual transcript`);
    setGeneratedShorts(manualShorts);
   } catch (error) {
    console.error('[APP] ❌ Manual transcript processing failed:', error);

    // Provide more specific error message based on the error type
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('API key')) {
     setError('API key error occurred while processing transcript. Please check your configuration.');
    } else if (errorMessage.includes('too short') || errorMessage.includes('insufficient')) {
     setError('The transcript provided is too short to generate meaningful segments. Please provide a longer transcript.');
    } else {
     setError('Failed to process manual transcript. Please try again or check the transcript format.');
    }
   } finally {
    setIsLoading(false);
   }
  },
  [aspectRatio]
 );

 const handleSubmit = useCallback(
  async (url: string, aspectRatio: string) => {
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

   try {
    console.log(`[APP] ✅ NEW APPROACH: Using intelligent segments with real timing for ${videoId}`);

    // Get target segment count based on aspect ratio or default
    const targetSegmentCount = aspectRatio === '16:9' ? 10 : 8;

    // Use NEW intelligent segmentation API
    const intelligentSegments = await fetchIntelligentSegments(videoId, targetSegmentCount);

    console.log(`[APP] ✅ Intelligent segmentation complete: ${intelligentSegments.length} segments`);
    intelligentSegments.forEach((segment, index) => {
     const duration = segment.endTimeSeconds - segment.startTimeSeconds;
     const startTime = Math.floor(segment.startTimeSeconds / 60) + ':' + String(Math.floor(segment.startTimeSeconds % 60)).padStart(2, '0');
     const endTime = Math.floor(segment.endTimeSeconds / 60) + ':' + String(Math.floor(segment.endTimeSeconds % 60)).padStart(2, '0');
     console.log(`[APP] Segment ${index + 1}: "${segment.title}" (${startTime} - ${endTime}, ${Math.round(duration)}s)`);
    });

    setGeneratedShorts(intelligentSegments);
    setIsLoading(false);
    return; // Success - no need for legacy fallback
   } catch (intelligentError: any) {
    console.error(`[APP] ❌ Intelligent segmentation failed:`, intelligentError);

    // Check for specific error types
    const errorMessage = intelligentError?.message || String(intelligentError);

    // Check for NoValidTranscriptError - don't fallback, show manual upload immediately
    if (errorMessage.includes('A valid transcript is not available for this video')) {
     console.log(`[APP] 🚨 NoValidTranscriptError from intelligent segments - showing manual upload`);
     setError('Maaf, transkrip otomatis tidak tersedia untuk video ini. Silakan coba video lain atau unggah file transkrip secara manual.');
     setCurrentVideoId(videoId);
     setShowTranscriptUpload(true);
     setIsLoading(false);
     return;
    }

    // Other specific error messages for better user experience
    if (errorMessage.includes('Real timing data required')) {
     console.log(`[APP] 🔄 Falling back to legacy AI method due to timing issues...`);
    } else if (errorMessage.includes('No intelligent segments returned')) {
     console.log(`[APP] 🔄 No intelligent segments found, falling back to legacy method...`);
    } else {
     console.log(`[APP] 🔄 Falling back to legacy AI method due to: ${errorMessage}`);
    }
   }

   // LEGACY FALLBACK CODE (only runs if intelligent segments fail)
   let transcriptData: {transcript: string; segments: any[]; method: string} = {transcript: '', segments: [], method: ''};
   try {
    console.log(`[APP] Starting enhanced transcript extraction for ${videoId}`);
    transcriptData = await fetchEnhancedTranscript(videoId);
    console.log(`[APP] Enhanced transcript loaded: ${transcriptData.transcript.length} chars, ${transcriptData.segments.length} segments, method: ${transcriptData.method}`);
   } catch (error: any) {
    console.error(`[APP] Enhanced transcript extraction failed:`, error);

    // Check for specific error types and provide appropriate user feedback
    const errorMessage = error?.message || String(error);

    // Check for NoValidTranscriptError from backend
    if (errorMessage.includes('A valid transcript is not available for this video')) {
     console.log(`[APP] 🚨 NoValidTranscriptError detected - transcript unavailable`);
     setError('Maaf, transkrip otomatis tidak tersedia untuk video ini. Silakan coba video lain atau unggah file transkrip secara manual.');
     setCurrentVideoId(videoId);
     setShowTranscriptUpload(true);
     setIsLoading(false);
     return;
    }

    // Check if this is a YouTube blocking issue
    if (errorMessage.includes('All transcript extraction services failed') || errorMessage.includes('YouTube is blocking') || errorMessage.includes('bot protection')) {
     // YouTube blocking detected - show manual upload option
     console.log(`[APP] 🚨 YouTube blocking detected - showing manual transcript option`);
     setCurrentVideoId(videoId);
     setShowTranscriptUpload(true);
     setIsLoading(false);
     return;
    }

    // Generic error for other transcript issues
    setError('Transkrip tidak tersedia untuk video ini. Silakan coba video lain.');
    setIsLoading(false);
    return;
   }

   // Validate transcript
   if (!transcriptData.transcript || transcriptData.transcript.length < 100) {
    console.error(`[APP] Transcript too short or empty: ${transcriptData.transcript.length} chars`);
    setError('Transkrip video terlalu pendek atau tidak tersedia. Video mungkin tidak memiliki subtitle.');
    setIsLoading(false);
    return;
   }

   let videoDuration = 0;
   // Fetch durasi video menggunakan backend endpoint untuk menghindari CORS
   try {
    console.log(`Fetching video metadata for: ${videoId}`);
    const metaRes = await fetch(`${BACKEND_URL}/api/video-metadata?videoId=${videoId}`);
    if (metaRes.ok) {
     const metadata = await metaRes.json();
     videoDuration = metadata.duration || 0;
     console.log(`Video duration from backend: ${videoDuration} seconds`);
    } else {
     console.warn('Failed to fetch video metadata from backend:', metaRes.status);
    }
   } catch (error) {
    console.error('Error fetching video metadata:', error);
   }

   // Smart duration fallback using transcript data
   if (!videoDuration || isNaN(videoDuration) || videoDuration <= 600) {
    // Changed: treat 600s as suspicious for long content
    // Try to estimate duration from transcript segments if available
    if (transcriptData.segments && transcriptData.segments.length > 0) {
     const lastSegment = transcriptData.segments[transcriptData.segments.length - 1];
     const estimatedDuration = Math.ceil(lastSegment.end || 600);
     console.log(`Transcript-based duration estimate: ${estimatedDuration} seconds (from ${transcriptData.segments.length} segments)`);
     videoDuration = estimatedDuration;
    } else if (transcriptData.transcript.length > 50000) {
     // Long transcript = long video
     // Estimate from transcript length (rough: 130k chars ≈ 52 minutes)
     const estimatedMinutes = Math.max(10, transcriptData.transcript.length / 2500); // ~2500 chars per minute
     const estimatedDuration = Math.ceil(estimatedMinutes * 60);
     console.log(`Length-based duration estimate: ${estimatedDuration} seconds (${estimatedMinutes.toFixed(1)} min from ${transcriptData.transcript.length} chars)`);
     videoDuration = estimatedDuration;
    }
   }

   console.log(`[APP] Final video duration: ${videoDuration}s (${Math.floor(videoDuration / 60)}m${videoDuration % 60}s)`);

   try {
    console.log(`[APP] Starting enhanced AI segmentation for ${videoId}`);
    console.log(`[APP] Video duration: ${videoDuration}s, Transcript: ${transcriptData.transcript.length} chars, Timing segments: ${transcriptData.segments.length}`);

    // Call enhanced generateShortsIdeas with timing segments
    const ideas = await generateShortsIdeas(
     url,
     transcriptData.transcript,
     videoDuration,
     transcriptData.segments // Pass timing segments to AI
    );

    console.log(`[AI SEGMENTS] Enhanced AI generated ${ideas.length} intelligent segments for video duration ${videoDuration}s`);

    if (!ideas || ideas.length === 0) {
     console.error(`[APP] AI returned no segments`);
     setError('AI tidak dapat mengidentifikasi segmen menarik dari video ini. Video mungkin tidak cocok untuk format pendek.');
     setIsLoading(false);
     return;
    }

    // Convert AI results to ShortVideo format with proper metadata
    const shortsWithVideoId: ShortVideo[] = ideas.map((idea, index) => ({
     ...idea,
     id: idea.id || `ai-segment-${index}`,
     youtubeVideoId: videoId,
     thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
     customThumbnailUrl: generateYouTubeThumbnailUrl(videoId, idea.startTimeSeconds),
    }));

    console.log(`[APP] ✅ Enhanced AI segmentation complete: ${shortsWithVideoId.length} segments`);
    shortsWithVideoId.forEach((segment, i) => {
     console.log(
      `[APP] Segment ${i + 1}: "${segment.title}" (${Math.floor(segment.startTimeSeconds / 60)}:${String(segment.startTimeSeconds % 60).padStart(2, '0')} - ${Math.floor(segment.endTimeSeconds / 60)}:${String(
       segment.endTimeSeconds % 60
      ).padStart(2, '0')})`
     );
    });

    setGeneratedShorts(shortsWithVideoId);
   } catch (e: any) {
    console.error('Enhanced AI segmentation error:', e);
    setError(e.message ?? 'Terjadi kesalahan saat menganalisis video dengan AI. Silakan coba lagi.');
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

    {/* Show transcript upload interface when YouTube is blocking */}
    {showTranscriptUpload && currentVideoId && (
     <div className="mt-6">
      <TranscriptErrorHandler
       error="All transcript extraction services failed"
       videoId={currentVideoId}
       onRetry={handleManualTranscript}
      />
     </div>
    )}

    {error && !showTranscriptUpload && (
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
