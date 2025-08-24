import React, {useEffect, useRef, useState} from 'react';
import type {ShortVideo} from '../types';
import {PlayIcon, DownloadIcon, InfoIcon, StopIcon} from './icons';
import {formatTime} from '../utils/timeUtils';
import transcriptManager from '../services/transcriptService';

// Backend URL for metadata fetching only (transcript handled by transcriptService)
const getBackendUrl = () => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 // Smart backend selection for consistency with App.tsx
 if (isDev && !envUrl) {
  // Development without explicit env var: use localhost
  const localhostUrl = 'http://localhost:5001';
  console.log(`[ShortVideoCard] Development mode - using: ${localhostUrl}`);
  return localhostUrl;
 }

 const backendUrl = envUrl || 'https://auto-short.azurewebsites.net';
 return backendUrl;
};

const BACKEND_URL = getBackendUrl();

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
  if (!window.YT?.Player) {
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
    try {
     if (typeof playerRef.current.destroy === 'function') {
      playerRef.current.destroy();
     }
    } catch (e) {
     console.warn('Error destroying YouTube player:', e);
    } finally {
     playerRef.current = null;
    }
   }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [showPlayer, shortVideo.youtubeVideoId]); // REMOVED timestamps to prevent infinite loop

 useEffect(() => {
  if (isActivePlayer && playerRef.current && isPlayerReady && typeof playerRef.current.playVideo === 'function') {
   playerRef.current.seekTo(shortVideo.startTimeSeconds, true);
   playerRef.current.playVideo();
  } else if (!isActivePlayer && playerRef.current && isPlaying && typeof playerRef.current.pauseVideo === 'function') {
   playerRef.current.pauseVideo();
  }
 }, [isActivePlayer, isPlayerReady, isPlaying]); // REMOVED startTimeSeconds to prevent infinite loop

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

 // SMART TRANSCRIPT FETCHING: Using SmartTranscriptManager with multiple strategies
 useEffect(() => {
  let isMounted = true;
  let debounceTimer: NodeJS.Timeout;

  if (!shortVideo.youtubeVideoId) return;

  // DEBUG: Log transcript excerpt availability
  console.log(`[TRANSCRIPT] Card "${shortVideo.title}": excerpt=${shortVideo.transcriptExcerpt ? 'YES' : 'NO'} (${shortVideo.transcriptExcerpt?.length || 0} chars)`);

  // Skip transcript fetching if we already have an AI excerpt
  if (shortVideo.transcriptExcerpt && shortVideo.transcriptExcerpt.length > 10) {
   console.log(`[TRANSCRIPT] Using full transcript for "${shortVideo.title}" (${shortVideo.transcriptExcerpt.length} chars)`);
   setTranscript(shortVideo.transcriptExcerpt);
   setTranscriptLoading(false);
   return;
  }

  console.log(`[TRANSCRIPT] Component requesting transcript for ${shortVideo.youtubeVideoId}`);

  // Set loading state
  if (isMounted) {
   setTranscriptLoading(true);
   setTranscript('');
  }

  // Debounced transcript fetch - wait 3 seconds to prevent React Strict Mode issues
  debounceTimer = setTimeout(async () => {
   if (!isMounted) return;

   try {
    const result = await transcriptManager.fetchTranscript(shortVideo.youtubeVideoId);

    if (isMounted) {
     if (result && result.length > 0) {
      setTranscript(result);
     } else {
      setTranscript('Transkrip tidak tersedia untuk video ini.');
     }
    }
   } catch (error: any) {
    console.error('[TRANSCRIPT] Component error:', error);
    if (isMounted) {
     setTranscript('Gagal memuat transkrip.');
    }
   } finally {
    if (isMounted) {
     setTranscriptLoading(false);
    }
   }
  }, 3000); // 3 second debounce delay to prevent multiple calls

  return () => {
   isMounted = false;
   if (debounceTimer) {
    clearTimeout(debounceTimer);
   }
  };
 }, [shortVideo.youtubeVideoId]); // Only depend on videoId

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
    <div className="mb-2 text-xs">
     {transcriptLoading ? (
      <div className="text-blue-400 flex items-center">
       <svg
        className="animate-spin w-3 h-3 mr-1"
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
       Memuat transkrip dengan multi-strategy...
      </div>
     ) : shortVideo.transcriptExcerpt || (transcript && transcript.length > 0 && !transcript.includes('tidak tersedia')) ? (
      <div className="text-gray-400">
       <div className="flex items-center mb-1">
        <span className="text-green-400 mr-1">✅</span>
        <span className="text-xs text-green-400">{shortVideo.transcriptExcerpt ? 'Transkrip lengkap tersedia' : 'Transkrip berhasil dimuat'}</span>
       </div>
       {(() => {
        const displayText = shortVideo.transcriptExcerpt || transcript;
        const isLongText = displayText.length > 200; // Increase threshold to 200 chars

        return showFullTranscript || !isLongText ? (
         <span>{displayText}</span>
        ) : (
         <span>
          {displayText.slice(0, 200)}
          {isLongText ? '...' : ''}
         </span>
        );
       })()}
       {(() => {
        const displayText = shortVideo.transcriptExcerpt || transcript;
        const isLongText = displayText.length > 200;

        return (
         isLongText && (
          <button
           className="ml-2 text-blue-400 underline hover:text-blue-300 focus:outline-none text-xs"
           onClick={() => setShowFullTranscript((v) => !v)}
          >
           {showFullTranscript ? 'Sembunyikan' : 'Selengkapnya'}
          </button>
         )
        );
       })()}
      </div>
     ) : (
      <div className="text-yellow-400 flex items-center">
       <span className="mr-1">⚠️</span>
       <span>Transkrip tidak tersedia (YouTube bot protection)</span>
      </div>
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
