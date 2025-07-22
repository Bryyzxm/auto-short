/**
 * Contoh Penggunaan API Client yang Sudah Diperbaiki
 * Untuk mengganti implementasi lama di komponen React Anda
 */

import {api} from './utils/apiClient';

// Contoh implementasi dalam komponen React
export const ExampleUsage = () => {
 // 1. Health Check
 const checkBackendHealth = async () => {
  try {
   const health = await api.healthCheck();
   console.log('Backend healthy:', health);
  } catch (error) {
   console.error('Backend health check failed:', error.message);
  }
 };

 // 2. Create Short Video
 const createShortVideo = async (youtubeUrl: string, start: number, end: number) => {
  try {
   const result = await api.createShort({
    youtubeUrl,
    start,
    end,
    aspectRatio: '9:16',
   });
   console.log('Short created:', result);
   return result;
  } catch (error) {
   console.error('Failed to create short:', error.message);
   throw error; // Re-throw untuk handling di UI
  }
 };

 // 3. Get Video Transcript
 const getVideoTranscript = async (videoId: string) => {
  try {
   const transcript = await api.getTranscript(videoId, 'id,en');
   console.log('Transcript received:', transcript);
   return transcript;
  } catch (error) {
   console.error('Failed to get transcript:', error.message);
   throw error;
  }
 };

 // 4. Check Video Quality
 const checkQuality = async (youtubeUrl: string) => {
  try {
   const quality = await api.checkVideoQuality(youtubeUrl);
   console.log('Video quality:', quality);
   return quality;
  } catch (error) {
   console.error('Failed to check quality:', error.message);
   throw error;
  }
 };

 return null; // This is just an example component
};

// Contoh dengan error handling yang proper
export const robustApiCall = async (youtubeUrl: string) => {
 try {
  // 1. Check quality first
  const quality = await api.checkVideoQuality(youtubeUrl);

  // 2. Get video metadata
  const videoId = extractVideoId(youtubeUrl); // Implement this helper
  const metadata = await api.getVideoMetadata(videoId);

  // 3. Get transcript
  const transcript = await api.getTranscript(videoId);

  // 4. Get intelligent segments
  const segments = await api.getIntelligentSegments(videoId);

  return {quality, metadata, transcript, segments};
 } catch (error) {
  // Centralized error handling
  if (error.message.includes('tidak dapat diakses')) {
   // Backend down
   alert('Server sedang maintenance. Coba lagi nanti.');
  } else if (error.message.includes('rate limiting')) {
   // Too many requests
   alert('Terlalu banyak request. Tunggu beberapa menit.');
  } else {
   // Generic error
   alert(`Error: ${error.message}`);
  }
  throw error;
 }
};

// Helper function untuk extract video ID
const extractVideoId = (url: string): string => {
 const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
 const match = url.match(regex);
 return match?.[1] || '';
};
