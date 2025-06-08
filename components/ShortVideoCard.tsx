
import React, { useEffect, useRef, useState } from 'react';
import type { ShortVideo } from '../types';
import { PlayIcon, DownloadIcon, InfoIcon, StopIcon } from './icons'; // Added StopIcon
import { formatTime } from '../utils/timeUtils';

interface ShortVideoCardProps {
  shortVideo: ShortVideo;
  isActivePlayer: boolean;
  setActivePlayerId: (id: string | null) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const ShortVideoCard: React.FC<ShortVideoCardProps> = ({ shortVideo, isActivePlayer, setActivePlayerId }) => {
  const playerRef = useRef<any>(null); // To store the YT.Player instance
  const playerDivRef = useRef<HTMLDivElement>(null); // To store the div for the player
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(false);

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
        width: '100%',  // Will be controlled by container aspect ratio
        videoId: shortVideo.youtubeVideoId,
        playerVars: {
          autoplay: 0, // Don't autoplay initially
          controls: 0, // Hide YouTube controls for a cleaner look
          modestbranding: 1,
          rel: 0, // Don't show related videos
          start: shortVideo.startTimeSeconds,
          // end: shortVideo.endTimeSeconds, // 'end' param might not always stop it cleanly for looping.
          playsinline: 1
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
    } catch (e) {
      console.error("Error initializing YouTube player:", e);
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
    console.error("YouTube Player Error:", event.data, "for video:", shortVideo.title);
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
            if (isActivePlayer) { // Check if still the active one
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
       if (isActivePlayer && event.data !== window.YT.PlayerState.BUFFERING) { // Check if still the active one
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
      setTimeout(() => { // Then show again to trigger reinitialization
        setShowPlayer(true);
        setActivePlayerId(shortVideo.id);
      }, 50);
    }
  };

  const handleDownloadSimulation = () => {
    const segmentDetails = `
      Judul: ${shortVideo.title}
      ID Video Asli: ${shortVideo.youtubeVideoId}
      Segmen yang Disarankan: ${formatTime(shortVideo.startTimeSeconds)} - ${formatTime(shortVideo.endTimeSeconds)}
      Durasi: ${shortVideo.endTimeSeconds - shortVideo.startTimeSeconds}s
      Deskripsi: ${shortVideo.description}
      Alasan Vertikal: ${shortVideo.reasonForVertical || 'T/A'}
    `;
    alert(
      "SIMULASI FITUR UNDUH & PEMROSESAN VIDEO:\n\n" +
      "Ini adalah demonstrasi konseptual.\n" +
      "Dalam aplikasi produksi penuh, tindakan ini akan memicu backend untuk mengunduh video asli, memotong segmen ini, memformatnya ke 9:16, dan menyediakan file video pendek untuk diunduh.\n\n" +
      "DETAIL SEGMEN YANG DIKONSEPTUALISASIKAN:\n" +
      "------------------------------------\n" +
      segmentDetails.trim() +
      "\n------------------------------------\n" +
      "PENTING: Pemrosesan video aktual (pengunduhan dari YouTube, pemotongan, konversi ke 9:16) tidak dilakukan di demo frontend-only ini karena batasan teknis browser dan Ketentuan Layanan YouTube. Demo ini berfokus pada identifikasi segmen oleh AI dan pratinjau konsep."
    );
  };

  const duration = shortVideo.endTimeSeconds - shortVideo.startTimeSeconds;

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-purple-500/30 hover:ring-2 hover:ring-purple-500">
      <div className="yt-embed-container group">
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                 onClick={handleTogglePlay}>
                <PlayIcon className="w-16 h-16 text-white opacity-80 drop-shadow-lg cursor-pointer" />
            </div>
          </>
        ) : playerError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black text-red-400 p-4">
            <p className="text-sm">Error memuat pratinjau video.</p>
            <button 
              onClick={handleTogglePlay}
              className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
              Coba Lagi
            </button>
          </div>
        ) : (
          <div ref={playerDivRef} id={uniquePlayerId} className="w-full h-full"></div>
        )}
         <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {formatTime(duration)}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-md font-semibold text-purple-300 mb-1 truncate" title={shortVideo.title}>
          {shortVideo.title}
        </h3>
        <p className="text-xs text-gray-400 mb-2">
          Klip dari: {formatTime(shortVideo.startTimeSeconds)} - {formatTime(shortVideo.endTimeSeconds)}
        </p>
        <p className="text-sm text-gray-300 mb-3 flex-grow text-ellipsis overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={shortVideo.description}>
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
            title={showPlayer && isPlaying && isActivePlayer ? "Jeda Pratinjau" : "Mulai Pratinjau Segmen"}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-colors disabled:opacity-50"
            disabled={showPlayer && !isPlayerReady && !playerError} // Disable if player is loading but not ready
          >
            {showPlayer && isActivePlayer && isPlaying ? <StopIcon className="w-4 h-4 mr-2" /> : <PlayIcon className="w-4 h-4 mr-2" />}
            {showPlayer && isActivePlayer && isPlaying ? 'Jeda' : 'Pratinjau'}
          </button>
          <button
            onClick={handleDownloadSimulation}
            title="Simulasikan pengunduhan video pendek (info lebih lanjut)"
            className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 transition-colors"
          >
            <DownloadIcon className="w-4 h-4 mr-2" />
            Download (Simulasi)
          </button>
        </div>
      </div>
    </div>
  );
};
