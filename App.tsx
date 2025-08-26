import React, {useState, useCallback} from 'react';
import {YouTubeInputForm} from './components/YouTubeInputForm';
import {ShortVideoCard} from './components/ShortVideoCard';
import {LoadingSpinner} from './components/LoadingSpinner';
// Manual transcript upload feature removed. Transcript extraction relies on automated backends.
import {generateShortsIdeas} from './services/groqService';
import type {ShortVideo} from './types';
import {InfoIcon} from './components/icons';
import {generateYouTubeThumbnailUrl} from './utils/thumbnailUtils';
import transcriptManager from './services/transcriptService';

// Backend URL configuration with smart environment detection
const getBackendUrl = () => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 // Smart backend selection:
 // 1. Development: use localhost only if no env var is set
 // 2. If environment variable is set, always use it (for both dev and prod)
 // 3. If no env var, fallback to Azure production

 if (isDev && !envUrl) {
  // Development without explicit env var: use localhost
  const localhostUrl = 'http://localhost:5001';
  console.log(`[CONFIG] Development mode - using localhost: ${localhostUrl}`);
  return localhostUrl;
 }

 const backendUrl = envUrl || 'https://auto-short.azurewebsites.net';

 return backendUrl;
};

const BACKEND_URL = getBackendUrl();
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
 const [transcriptUploadError, setTranscriptUploadError] = useState<string | null>(null);
 const [showManualUpload, setShowManualUpload] = useState<boolean>(false);
 const [backendStatus, setBackendStatus] = useState<{isOnline: boolean; url: string; lastChecked?: Date}>({
  isOnline: false,
  url: BACKEND_URL,
 });

 // Check backend status
 const checkBackendStatus = async () => {
  try {
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

   const response = await fetch(`${BACKEND_URL}/`, {
    signal: controller.signal,
   });

   clearTimeout(timeoutId);

   if (response.ok) {
    setBackendStatus({isOnline: true, url: BACKEND_URL, lastChecked: new Date()});
   } else {
    setBackendStatus({isOnline: false, url: BACKEND_URL, lastChecked: new Date()});
   }
  } catch (error) {
   console.log(`[APP] Backend ${BACKEND_URL} is offline:`, error);
   setBackendStatus({isOnline: false, url: BACKEND_URL, lastChecked: new Date()});
  }
 };

 // Check for API key on mount
 React.useEffect(() => {
  if (!(import.meta as any).env.VITE_GROQ_API_KEY) {
   setApiKeyError('Groq API Key is not configured. Please set the VITE_GROQ_API_KEY environment variable.');
   console.error('Groq API Key is missing (import.meta.env.VITE_GROQ_API_KEY).');
  }

  // Check backend status
  checkBackendStatus();
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
  const backendUrl = BACKEND_URL;

  const handleBackendResponse = async (response: Response) => {
   if (response.ok) {
    const data = await response.json();
    return {
     transcript: data.segments ? data.segments.map((s: any) => s.text).join(' ') : data.transcript || '',
     segments: data.segments || [],
     method: data.method || 'Enhanced Backend',
    };
   }
   try {
    const errorData = await response.json();
    if (errorData.error) {
     if (errorData.error.includes('A valid transcript is not available for this video')) {
      throw new Error(errorData.error);
     }
    }
   } catch {}
   return null;
  };

  const handleEmergencyResponse = async (response: Response) => {
   if (response.ok || response.status === 206) {
    const emergencyData = await response.json();
    return {
     transcript: emergencyData.segments ? emergencyData.segments.map((s: any) => s.text).join(' ') : '',
     segments: emergencyData.segments || [],
     method: emergencyData.method || 'Emergency Fallback',
    };
   }
   try {
    const errorData = await response.json();
    if (errorData.error && errorData.error.includes('A valid transcript is not available for this video')) {
     throw new Error(errorData.error);
    }
   } catch {}
   return null;
  };

  try {
   console.log(`[APP] Fetching enhanced transcript with timing for ${videoId}`);

   // Try backend with timing first
   const enhancedUrl = `${backendUrl}/api/enhanced-transcript/${videoId}`;
   console.log(`[APP] Trying enhanced backend endpoint: ${enhancedUrl}`);
   const response = await fetch(enhancedUrl);
   const backendResult = await handleBackendResponse(response);
   if (backendResult) {
    console.log(`[APP] Enhanced backend success: ${backendResult.transcript.length} chars, ${backendResult.segments.length} segments, method: ${backendResult.method}`);
    return backendResult;
   }
   console.log(`[APP] Enhanced backend failed with status: ${response.status}`);

   // Emergency fallback endpoint
   console.log(`[APP] Trying emergency transcript endpoint...`);
   const emergencyResponse = await fetch(`${backendUrl}/api/emergency-transcript/${videoId}`);
   const emergencyResult = await handleEmergencyResponse(emergencyResponse);
   if (emergencyResult) {
    console.log(`[APP] Emergency endpoint success: ${emergencyResult.segments.length} segments, method: ${emergencyResult.method}`);
    if ((emergencyResult as any).isFallback) {
     console.warn(`[APP] ⚠️ Using fallback transcript data for ${videoId}`);
    }
    return emergencyResult;
   }
   console.log(`[APP] Emergency endpoint failed with status: ${emergencyResponse.status}`);

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

 // Fetch intelligent segments with real timing and enhanced Indonesian support
 // Helper for error handling
 function handleIntelligentSegmentsError(errorData: any) {
  if (!errorData || !errorData.error) return;
  console.log(`[APP] Intelligent segments error: ${errorData.error}`);

  if (errorData.indonesianFriendly) {
   throw new Error(errorData.message);
  }
  if (errorData.errorType === 'transcript_disabled') {
   throw new Error('Transkrip dinonaktifkan oleh pemilik video. Silakan coba video lain atau gunakan fitur upload manual.');
  }
  if (errorData.errorType === 'temporary_failure') {
   throw new Error('Layanan sementara tidak tersedia. Silakan coba lagi dalam beberapa menit.');
  }
  if (errorData.errorType === 'processing_timeout') {
   throw new Error('Video membutuhkan waktu lebih lama untuk diproses karena pembatasan YouTube. Silakan tunggu dan coba lagi dalam beberapa menit.');
  }
  if (errorData.error.includes('A valid transcript is not available for this video')) {
   throw new Error('Transkrip tidak tersedia untuk video ini. Video mungkin tidak memiliki subtitle Indonesia.');
  }
 }

 // Helper for mapping segments
 function mapSegments(data: any, videoId: string): ShortVideo[] {
  return data.segments.map((segment: any, index: number) => ({
   id: segment.id,
   title: segment.title || `Segment ${index + 1}`,
   description: segment.description || `Segmen cerdas dengan durasi ${segment.duration}s`,
   startTimeSeconds: segment.startTimeSeconds,
   endTimeSeconds: segment.endTimeSeconds,
   youtubeVideoId: videoId,
   thumbnailUrl: segment.thumbnailUrl,
   transcriptExcerpt: segment.transcriptExcerpt,
   hasRealTiming: segment.hasRealTiming,
   duration: segment.duration,
  }));
 }

 const fetchIntelligentSegments = async (videoId: string, targetCount: number = 15): Promise<ShortVideo[]> => {
  console.log(`[APP] Fetching intelligent segments for ${videoId} with Indonesian priority (target: ${targetCount})`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  try {
   const response = await fetch(`${BACKEND_URL}/api/intelligent-segments`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
     videoId,
     targetSegmentCount: targetCount,
     prioritizeIndonesian: true,
    }),
    signal: controller.signal,
   });

   clearTimeout(timeoutId);

   if (!response.ok) {
    try {
     const errorData = await response.json();
     handleIntelligentSegmentsError(errorData);
    } catch {}
    throw new Error(`API gagal merespons: ${response.status}. Silakan coba lagi.`);
   }

   const data = await response.json();
   console.log(`[APP] 🔍 Response received:`, {
    hasSegments: !!data.segments,
    segmentCount: data.segments?.length || 0,
    totalSegments: data.totalSegments,
    responseKeys: Object.keys(data),
   });

   if (data.segments && data.segments.length > 0) {
    console.log(`[APP] ✅ Got ${data.segments.length} intelligent segments (avg: ${data.averageDuration}s, quality: ${data.transcriptQuality})`);
    if (data.language === 'indonesian' || data.method?.includes('indonesian')) {
     console.log(`[APP] 🇮🇩 Indonesian content successfully processed using: ${data.method}`);
    }
    return mapSegments(data, videoId);
   }
   throw new Error('Tidak ada segmen yang berhasil dibuat. Video mungkin terlalu pendek atau tidak memiliki konten yang sesuai.');
  } catch (error: any) {
   console.error(`[APP] Intelligent segments failed for ${videoId}:`, error);
   if (error.name === 'AbortError') {
    throw new Error('Permintaan membutuhkan waktu lebih lama dari biasanya karena pembatasan YouTube. Silakan tunggu atau coba lagi dalam beberapa menit.');
   }
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

 // Handler for manual transcript file upload (new feature)
 const handleTranscriptUploadSuccess = useCallback((updatedSegments: ShortVideo[]) => {
  console.log(`[APP] ✅ Manual transcript upload successful: ${updatedSegments.length} segments updated`);
  setGeneratedShorts(updatedSegments);
  setTranscriptUploadError(null);
  setShowManualUpload(false);
 }, []);

 const handleTranscriptUploadError = useCallback((errorMessage: string) => {
  console.error('[APP] ❌ Manual transcript upload failed:', errorMessage);
  setTranscriptUploadError(errorMessage);
 }, []);

 const toggleManualUpload = useCallback(() => {
  setShowManualUpload(!showManualUpload);
  setTranscriptUploadError(null);
 }, [showManualUpload]);

 // Handle URL changes to extract video ID immediately for transcript upload
 const handleUrlChange = useCallback((url: string) => {
  if (!url.trim()) {
   setCurrentVideoId(null);
   return;
  }

  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
   setCurrentVideoId(videoId);
   console.log(`[APP] Video ID extracted from URL: ${videoId}`);
  } else {
   setCurrentVideoId(null);
  }
 }, []);

 const handleSubmit = useCallback(
  async (url: string, aspectRatio: string) => {
   if (apiKeyError) return;
   setYoutubeUrl(url);
   setIsLoading(true);
   setError(null);
   setGeneratedShorts([]);
   setActivePlayerId(null);

   const videoId = extractYouTubeVideoId(url);
   if (!videoId) {
    setError('URL YouTube tidak valid atau tidak didukung. Coba salin ulang URL video (termasuk live replay).');
    setIsLoading(false);
    return;
   }
   setCurrentVideoId(videoId);

   const targetSegmentCount = aspectRatio === '16:9' ? 18 : 15;

   // Helper: handle errors from intelligent segmentation
   const handleIntelligentSegmentationError = (errorMessage: string) => {
    // Enhanced error handling with specific user guidance
    console.log(`[APP] Intelligent segments error: ${errorMessage}`);

    // Check for bot detection errors
    if (errorMessage.includes('bot detection') || errorMessage.includes('Sign in to confirm') || errorMessage.includes('BOT_DETECTION')) {
     setError('YouTube sementara memblokir permintaan otomatis. Silakan tunggu beberapa menit dan coba lagi.');
     setIsLoading(false);
     return true;
    }

    // Check for temporary service issues (503 errors)
    if (errorMessage.includes('Service temporarily unavailable') || errorMessage.includes('503') || errorMessage.includes('EXTRACTION_FAILED')) {
     setError('Layanan ekstraksi transkrip sementara tidak tersedia. Silakan coba lagi dalam beberapa menit.');
     setIsLoading(false);
     return true;
    }

    // Check for processing timeout
    if (errorMessage.includes('processing timeout') || errorMessage.includes('timeout')) {
     setError('Video membutuhkan waktu lebih lama untuk diproses karena pembatasan YouTube. Silakan tunggu dan coba lagi dalam beberapa menit.');
     setIsLoading(false);
     return true;
    }

    if (errorMessage.includes('Transkrip tidak tersedia') || errorMessage.includes('tidak memiliki subtitle') || errorMessage.includes('A valid transcript is not available for this video')) {
     setError('Transkrip otomatis tidak tersedia untuk video ini. Silakan coba video lain atau unggah file transkrip secara manual.');
     setCurrentVideoId(videoId);
     setShowTranscriptUpload(true);
     setIsLoading(false);
     return true;
    }
    if (errorMessage.includes('dinonaktifkan oleh pemilik') || errorMessage.includes('disabled')) {
     setError('Transkrip dinonaktifkan oleh pemilik video. Silakan coba video lain atau gunakan fitur upload manual.');
     setCurrentVideoId(videoId);
     setShowTranscriptUpload(true);
     setIsLoading(false);
     return true;
    }
    if (errorMessage.includes('sementara tidak tersedia') || errorMessage.includes('timeout')) {
     setError('Layanan sementara tidak tersedia. Silakan coba lagi dalam beberapa menit atau gunakan fitur upload manual.');
     setCurrentVideoId(videoId);
     setShowTranscriptUpload(true);
     setIsLoading(false);
     return true;
    }
    return false;
   };

   // Helper: get video duration
   const getVideoDuration = async (videoId: string, transcriptData: {transcript: string; segments: any[]; method: string}) => {
    let videoDuration = 0;
    try {
     const metaRes = await fetch(`${BACKEND_URL}/api/video-metadata?videoId=${videoId}`);
     if (metaRes.ok) {
      const metadata = await metaRes.json();
      videoDuration = metadata.duration || 0;
     }
    } catch {}
    if (!videoDuration || isNaN(videoDuration) || videoDuration <= 600) {
     if (transcriptData.segments && transcriptData.segments.length > 0) {
      const lastSegment = transcriptData.segments[transcriptData.segments.length - 1];
      videoDuration = Math.ceil(lastSegment.end || 600);
     } else if (transcriptData.transcript.length > 50000) {
      const estimatedMinutes = Math.max(10, transcriptData.transcript.length / 2500);
      videoDuration = Math.ceil(estimatedMinutes * 60);
     }
    }
    return videoDuration;
   };

   // Helper: legacy fallback segmentation
   const legacySegmentation = async (videoId: string, url: string) => {
    let transcriptData: {transcript: string; segments: any[]; method: string} = {transcript: '', segments: [], method: ''};
    try {
     transcriptData = await fetchEnhancedTranscript(videoId);
    } catch (error: any) {
     const errorMessage = error?.message || String(error);
     if (errorMessage.includes('A valid transcript is not available for this video')) {
      setError('Maaf, transkrip otomatis tidak tersedia untuk video ini. Silakan coba video lain atau unggah file transkrip secara manual.');
      setCurrentVideoId(videoId);
      setShowTranscriptUpload(true);
      setIsLoading(false);
      return true;
     }
     if (errorMessage.includes('All transcript extraction services failed') || errorMessage.includes('YouTube is blocking') || errorMessage.includes('bot protection')) {
      setCurrentVideoId(videoId);
      setShowTranscriptUpload(true);
      setIsLoading(false);
      return true;
     }
     setError('Transkrip tidak tersedia untuk video ini. Silakan coba video lain.');
     setIsLoading(false);
     return true;
    }
    if (!transcriptData.transcript || transcriptData.transcript.length < 100) {
     setError('Transkrip video terlalu pendek atau tidak tersedia. Video mungkin tidak memiliki subtitle.');
     setIsLoading(false);
     return true;
    }
    const videoDuration = await getVideoDuration(videoId, transcriptData);
    try {
     const ideas = await generateShortsIdeas(url, transcriptData.transcript, videoDuration, transcriptData.segments);
     if (!ideas || ideas.length === 0) {
      setError('AI tidak dapat mengidentifikasi segmen menarik dari video ini. Video mungkin tidak cocok untuk format pendek.');
      setIsLoading(false);
      return true;
     }
     const shortsWithVideoId: ShortVideo[] = ideas.map((idea, index) => ({
      ...idea,
      id: idea.id || `ai-segment-${index}`,
      youtubeVideoId: videoId,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      customThumbnailUrl: generateYouTubeThumbnailUrl(videoId, idea.startTimeSeconds),
     }));
     setGeneratedShorts(shortsWithVideoId);
     setCurrentVideoId(videoId);
    } catch (e: any) {
     setError(e.message ?? 'Terjadi kesalahan saat menganalisis video dengan AI. Silakan coba lagi.');
    } finally {
     setIsLoading(false);
    }
    return false;
   };

   // Main logic
   try {
    const intelligentSegments = await fetchIntelligentSegments(videoId, targetSegmentCount);
    setGeneratedShorts(intelligentSegments);
    setCurrentVideoId(videoId);
    setIsLoading(false);
    return;
   } catch (intelligentError: any) {
    const errorMessage = intelligentError?.message || String(intelligentError);
    if (handleIntelligentSegmentationError(errorMessage)) return;
   }
   await legacySegmentation(videoId, url);
  },
  [apiKeyError]
 );

 return (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-gray-100 flex flex-col items-center p-4 sm:p-8 selection:bg-purple-500 selection:text-white">
   <header className="w-full max-w-4xl mb-8 text-center">
    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">AI Clipper (0.1)</h1>
    <p className="mt-3 text-lg text-gray-300">Identifikasi segmen kunci dari video YouTube dengan AI GRATIS tanpa batas. Ditenagai oleh Groq AI.</p>

    {/* Backend Status Indicator */}
    <div className="mt-4 flex items-center justify-center space-x-2">
     <div className={`w-2 h-2 rounded-full ${backendStatus.isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
     <span className={`text-xs ${backendStatus.isOnline ? 'text-green-400' : 'text-red-400'}`}>
      Backend: {backendStatus.isOnline ? 'Online' : 'Offline'} ({backendStatus.url.includes('localhost') ? 'Local' : 'Azure'})
     </span>
     {!backendStatus.isOnline && (
      <button
       onClick={checkBackendStatus}
       className="text-xs text-blue-400 hover:text-blue-300 underline ml-2"
      >
       Retry
      </button>
     )}
    </div>

    {/* Build: {new Date().toISOString()} */}
   </header>
   <main className="w-full max-w-4xl flex-1">
    <YouTubeInputForm
     onSubmit={handleSubmit}
     onUrlChange={handleUrlChange}
     isLoading={isLoading}
     aspectRatio={aspectRatio}
     setAspectRatio={setAspectRatio}
    />
    {isLoading && <LoadingSpinner />}
    {/* Show error if transcript extraction fails; manual upload is no longer available */}
    {showTranscriptUpload && currentVideoId && (
     <div className="mt-6 p-4 bg-yellow-900 rounded-lg text-yellow-200">
      <p>Transcript extraction failed. Please try again later or use a different video. Manual transcript upload is no longer supported.</p>
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
    {/* ...existing code... */}
   </main>

   <footer className="w-full max-w-4xl mt-12 text-center text-gray-500">
    <p>&copy; {new Date().getFullYear()} AI Shorts Segmenter (Groq + Llama 3.3 70B). Beta 0.1</p>
   </footer>
  </div>
 );
};

export default App;
