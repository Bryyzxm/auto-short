import React, {useEffect, useRef, useState} from 'react';
import type {ShortVideo} from '../types';
import {PlayIcon, DownloadIcon, InfoIcon, StopIcon} from './icons';
import {formatTime} from '../utils/timeUtils';

// Backend URL configuration
const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:5001';

// Cache untuk transcript video
const transcriptCache = new Map<string, any[]>();
// Cache untuk failed requests
const failedRequestsCache = new Map<string, number>();

// Helper: fetch transcript for a segment
async function fetchTranscript(videoId: string, start: number, end: number): Promise<string> {
 // Check failed cache first - if we recently failed, don't retry for 5 minutes
 const failedTime = failedRequestsCache.get(videoId);
 if (failedTime && Date.now() - failedTime < 300000) {
  // 5 minutes
  return 'Transkrip tidak tersedia untuk video ini.';
 }

 // Check cache first
 let fullTranscript = transcriptCache.get(videoId);

 if (!fullTranscript) {
  // Fetch transcript via backend yt-dlp proxy dengan prioritas bahasa Indonesia
  const url = `${BACKEND_URL}/api/yt-transcript?videoId=${videoId}&lang=id,en`;
  try {
   const res = await fetch(url);
   if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error('Gagal fetch transkrip (yt-dlp):', res.status, res.statusText, url);
    console.error('Error details:', errorData);

    // Cache failed request to prevent retries
    failedRequestsCache.set(videoId, Date.now());

    // Return a more specific error message based on status
    if (res.status === 404) {
     return 'Transkrip tidak tersedia untuk video ini.';
    } else if (res.status === 500) {
     return 'Sedang memproses transkrip, coba lagi dalam beberapa saat.';
    }
    return 'Transkrip tidak tersedia.';
   }
   const data = await res.json();
   if (!data?.segments || !Array.isArray(data.segments)) {
    console.warn('Format transkrip yt-dlp tidak sesuai atau kosong:', data);
    failedRequestsCache.set(videoId, Date.now());
    return 'Transkrip tidak tersedia.';
   }

   const segments = data.segments;
   fullTranscript = segments;
   // Cache it for future use
   transcriptCache.set(videoId, segments);
   console.log(`[TRANSCRIPT] Cached transcript for videoId: ${videoId}, segments: ${segments.length}, language: ${data.language || 'unknown'}`);
  } catch (err) {
   console.error('Error fetchTranscript (yt-dlp):', err, url);
   failedRequestsCache.set(videoId, Date.now());
   return 'Gagal memuat transkrip.';
  }
 }

 // Return early if still no transcript
 if (!fullTranscript) {
  return 'Transkrip tidak tersedia.';
 }

 // VTT: start dan end dalam format "00:00:00.000"
 // Ubah ke detik untuk filter
 const toSeconds = (vtt: string) => {
  const [h, m, s] = vtt.split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
 };
 const filtered = fullTranscript.filter((seg: any) => {
  const segStart = toSeconds(seg.start);
  const segEnd = toSeconds(seg.end);
  return segEnd > start && segStart < end;
 });

 const transcriptText = filtered.map((seg: any) => seg.text).join(' ');
 console.log(`[TRANSCRIPT] Retrieved cached transcript for videoId: ${videoId}, filtered segments: ${filtered.length}`);
 return transcriptText || 'Transkrip tidak tersedia untuk segmen ini.';
}

interface ShortVideoCardProps {
 shortVideo: ShortVideo;
 isActivePlayer: boolean;
 setActivePlayerId: (id: string | null) => void;
 aspectRatio: string;
}

declare global {
 interface Window {
  YT: any;
  onYouTubeIframeAPIReady?: () => void;
 }
}

export const ShortVideoCard: React.FC<ShortVideoCardProps> = ({shortVideo, isActivePlayer, setActivePlayerId, aspectRatio}) => {
 const playerRef = useRef<any>(null); // To store the YT.Player instance
 const playerDivRef = useRef<HTMLDivElement>(null); // To store the div for the player
 const [isPlayerReady, setIsPlayerReady] = useState(false);
 const [showPlayer, setShowPlayer] = useState(false);
 const [isPlaying, setIsPlaying] = useState(false);
 const [playerError, setPlayerError] = useState(false);
 const [isDownloading, setIsDownloading] = useState(false);
 const [downloadError, setDownloadError] = useState<string | null>(null);
 const [transcript, setTranscript] = useState<string>('');
 const [transcriptLoading, setTranscriptLoading] = useState(false);
 const [showFullTranscript, setShowFullTranscript] = useState(false);

 const uniquePlayerId = `ytplayer-${shortVideo.id}`;

 useEffect(() => {
  if (!showPlayer) return;
  if (!window.YT || !window.YT.Player) {
   // If YT API is not ready, wait for it. This might happen on first load.
   // A more robust solution might involve a global ready state for the API.
   const interval = setInterval(() => {
    if (window.YT && window.YT.Player) {
     clearInterval(interval);
     initializePlayer();
    }
   }, 100);
   return () => clearInterval(interval);
  } else {
   initializePlayer();
  }

  return () => {
   if (playerRef.current) {
    playerRef.current.destroy();
    playerRef.current = null;
   }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [showPlayer, shortVideo.youtubeVideoId, shortVideo.startTimeSeconds, shortVideo.endTimeSeconds]);

 useEffect(() => {
  if (isActivePlayer && playerRef.current && isPlayerReady && typeof playerRef.current.playVideo === 'function') {
   playerRef.current.seekTo(shortVideo.startTimeSeconds, true);
   playerRef.current.playVideo();
  } else if (!isActivePlayer && playerRef.current && isPlaying && typeof playerRef.current.pauseVideo === 'function') {
   playerRef.current.pauseVideo();
  }
 }, [isActivePlayer, isPlayerReady, shortVideo.startTimeSeconds, isPlaying]);

 const initializePlayer = () => {
  if (playerRef.current || !playerDivRef.current) return;
  setPlayerError(false);
  try {
   playerRef.current = new window.YT.Player(playerDivRef.current, {
    height: '100%', // Will be controlled by container aspect ratio
    width: '100%', // Will be controlled by container aspect ratio
    videoId: shortVideo.youtubeVideoId,
    playerVars: {
     autoplay: 0, // Don't autoplay initially
     controls: 0, // Hide YouTube controls for a cleaner look
     modestbranding: 1,
     rel: 0, // Don't show related videos
     start: shortVideo.startTimeSeconds,
     // end: shortVideo.endTimeSeconds, // 'end' param might not always stop it cleanly for looping.
     playsinline: 1,
    },
    events: {
     onReady: onPlayerReady,
     onStateChange: onPlayerStateChange,
     onError: onPlayerError,
    },
   });
  } catch (e) {
   console.error('Error initializing YouTube player:', e);
   setPlayerError(true);
  }
 };

 const onPlayerReady = (event: any) => {
  setIsPlayerReady(true);
  if (isActivePlayer) {
   event.target.seekTo(shortVideo.startTimeSeconds, true);
   event.target.playVideo();
  }
 };

 const onPlayerError = (event: any) => {
  console.error('YouTube Player Error:', event.data, 'for video:', shortVideo.title);
  setPlayerError(true);
  setIsPlaying(false);
 };

 const onPlayerStateChange = (event: any) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
   setIsPlaying(true);
   // Check if current time exceeds endTimeSeconds and stop
   const checkTimeInterval = setInterval(() => {
    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
     const currentTime = playerRef.current.getCurrentTime();
     if (currentTime >= shortVideo.endTimeSeconds) {
      playerRef.current.pauseVideo(); // or stopVideo()
      setIsPlaying(false); // Manually set isPlaying to false
      if (isActivePlayer) {
       // Check if still the active one
       setActivePlayerId(null); // Allow re-trigger if needed
      }
      clearInterval(checkTimeInterval);
     }
    } else {
     clearInterval(checkTimeInterval); // Player gone or not ready
    }
   }, 250);
  } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
   setIsPlaying(false);
   if (isActivePlayer && event.data !== window.YT.PlayerState.BUFFERING) {
    // Check if still the active one
    // setActivePlayerId(null); // Debounce or manage state to prevent quick re-trigger
   }
  }
 };

 const handleTogglePlay = () => {
  if (!showPlayer) {
   setShowPlayer(true); // This will trigger useEffect to initialize player
   setActivePlayerId(shortVideo.id); // Set this as active when first interaction
  } else if (playerRef.current && isPlayerReady) {
   if (isPlaying && isActivePlayer) {
    playerRef.current.pauseVideo();
    setActivePlayerId(null); // Deactivate
   } else {
    setActivePlayerId(shortVideo.id); // Activate this player
    // Ensure it seeks to start time, especially if re-playing
    playerRef.current.seekTo(shortVideo.startTimeSeconds, true);
    playerRef.current.playVideo();
   }
  } else if (playerError) {
   // Attempt to reinitialize if there was an error
   setShowPlayer(false); // Hide
   setTimeout(() => {
    // Then show again to trigger reinitialization
    setShowPlayer(true);
    setActivePlayerId(shortVideo.id);
   }, 50);
  }
 };

 // Helper to get full YouTube URL from videoId
 const getYoutubeUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

 const handleDownload = async () => {
  setIsDownloading(true);
  setDownloadError(null);
  try {
   const response = await fetch(`${BACKEND_URL}/api/shorts`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
     youtubeUrl: getYoutubeUrl(shortVideo.youtubeVideoId),
     start: shortVideo.startTimeSeconds,
     end: shortVideo.endTimeSeconds,
     aspectRatio: aspectRatio,
    }),
   });
   if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal memproses video.');
   }
   const data = await response.json();
   if (data.downloadUrl) {
    window.open(`${BACKEND_URL}${data.downloadUrl}`, '_blank');
   } else {
    throw new Error('Link unduhan tidak ditemukan.');
   }
  } catch (e: any) {
   setDownloadError(e.message || 'Terjadi kesalahan saat mengunduh.');
  } finally {
   setIsDownloading(false);
  }
 };

 const duration = shortVideo.endTimeSeconds - shortVideo.startTimeSeconds;

 useEffect(() => {
  // Only fetch transcript for YouTube videos - with debounce to prevent multiple calls
  let isCancelled = false;

  // Check if transcript is already cached globally
  const cachedTranscript = transcriptCache.get(shortVideo.youtubeVideoId);
  if (cachedTranscript) {
   const toSeconds = (vtt: string) => {
    const [h, m, s] = vtt.split(':');
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
   };
   const filtered = cachedTranscript.filter((seg: any) => {
    const segStart = toSeconds(seg.start);
    const segEnd = toSeconds(seg.end);
    return segEnd > shortVideo.startTimeSeconds && segStart < shortVideo.endTimeSeconds;
   });
   const transcriptText = filtered.map((seg: any) => seg.text).join(' ');
   setTranscript(transcriptText || 'Transkrip tidak tersedia untuk segmen ini.');
   setTranscriptLoading(false);
   return;
  }

  setTranscript('');
  setTranscriptLoading(true);

  // Debounce transcript fetching per video to prevent spam
  const timeoutId = setTimeout(() => {
   if (isCancelled) return;

   fetchTranscript(shortVideo.youtubeVideoId, shortVideo.startTimeSeconds, shortVideo.endTimeSeconds)
    .then((txt) => {
     if (!isCancelled) {
      setTranscript(txt);
     }
    })
    .finally(() => {
     if (!isCancelled) {
      setTranscriptLoading(false);
     }
    });
  }, 500); // Increased debounce to 500ms

  return () => {
   isCancelled = true;
   clearTimeout(timeoutId);
  };
 }, [shortVideo.youtubeVideoId, shortVideo.startTimeSeconds, shortVideo.endTimeSeconds]);

 return (
  <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-purple-500/30 hover:ring-2 hover:ring-purple-500">
   <div className="yt-embed-container group">
    {/* Always show YouTube embed/thumbnail */}
    {!showPlayer ? (
     <>
      <img
       src={shortVideo.thumbnailUrl || `https://picsum.photos/seed/${shortVideo.id}/270/480?grayscale&blur=1`}
       alt={shortVideo.title}
       className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
       onError={(e) => {
        (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${shortVideo.id}/270/480?grayscale&blur=1`;
       }}
      />
      <div
       className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
       onClick={handleTogglePlay}
      >
       <PlayIcon className="w-16 h-16 text-white opacity-80 drop-shadow-lg cursor-pointer" />
      </div>
     </>
    ) : playerError ? (
     <div className="w-full h-full flex flex-col items-center justify-center bg-black text-red-400 p-4">
      <p className="text-sm">Error memuat pratinjau video.</p>
      <button
       onClick={handleTogglePlay}
       className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
      >
       Coba Lagi
      </button>
     </div>
    ) : (
     <div
      ref={playerDivRef}
      id={uniquePlayerId}
      className="w-full h-full"
     ></div>
    )}
    <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">{formatTime(duration)}</div>
   </div>

   <div className="p-4 flex flex-col flex-grow">
    <h3
     className="text-md font-semibold text-purple-300 mb-1 truncate"
     title={shortVideo.title}
    >
     {shortVideo.title}
    </h3>
    {/* Tampilkan label waktu segmen yang akurat */}
    <p className="text-xs text-gray-400 mb-2">
     Klip dari: {formatTime(shortVideo.startTimeSeconds)} - {formatTime(shortVideo.endTimeSeconds)}
    </p>
    <div className="mb-2 text-xs text-gray-400">
     {transcriptLoading ? (
      'Memuat transkrip...'
     ) : transcript && transcript.length > 0 ? (
      <>
       {showFullTranscript ? (
        <span>{transcript}</span>
       ) : (
        <span>
         {transcript.slice(0, 120)}
         {transcript.length > 120 ? '...' : ''}
        </span>
       )}
       {transcript.length > 120 && (
        <button
         className="ml-2 text-blue-400 underline hover:text-blue-300 focus:outline-none text-xs"
         onClick={() => setShowFullTranscript((v) => !v)}
        >
         {showFullTranscript ? 'Sembunyikan' : 'Selengkapnya'}
        </button>
       )}
      </>
     ) : (
      'Transkrip tidak tersedia.'
     )}
    </div>
    <p
     className="text-sm text-gray-300 mb-3 flex-grow text-ellipsis overflow-hidden"
     style={{display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'}}
     title={shortVideo.description}
    >
     {shortVideo.description}
    </p>

    {shortVideo.reasonForVertical && (
     <div className="mb-3 p-2 bg-gray-700/50 rounded text-xs text-gray-400 border border-gray-600/50">
      <p className="font-semibold text-purple-400/80 flex items-center">
       <InfoIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" /> Saran Vertikal:
      </p>
      <p className="pl-1 mt-0.5">{shortVideo.reasonForVertical}</p>
     </div>
    )}

    <div className="mt-auto flex space-x-3 pt-2 border-t border-gray-700/50">
     <button
      onClick={handleTogglePlay}
      title={showPlayer && isPlaying && isActivePlayer ? 'Jeda Pratinjau' : 'Mulai Pratinjau Segmen'}
      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-colors disabled:opacity-50"
      disabled={showPlayer && !isPlayerReady && !playerError}
     >
      {showPlayer && isActivePlayer && isPlaying ? <StopIcon className="w-4 h-4 mr-2" /> : <PlayIcon className="w-4 h-4 mr-2" />}
      {showPlayer && isActivePlayer && isPlaying ? 'Jeda' : 'Pratinjau'}
     </button>
     <button
      onClick={handleDownload}
      title="Unduh video pendek hasil backend (otomatis)"
      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 transition-colors disabled:opacity-50"
      disabled={isDownloading}
     >
      {isDownloading ? (
       <svg
        className="animate-spin w-4 h-4 mr-2 text-white"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
       >
        <circle
         className="opacity-25"
         cx="12"
         cy="12"
         r="10"
         stroke="currentColor"
         strokeWidth="4"
        ></circle>
        <path
         className="opacity-75"
         fill="currentColor"
         d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
       </svg>
      ) : (
       <DownloadIcon className="w-4 h-4 mr-2" />
      )}
      {isDownloading ? 'Memproses...' : 'Download'}
     </button>
    </div>
    {downloadError && <div className="mt-2 text-xs text-red-400">{downloadError}</div>}
   </div>
  </div>
 );
};
