/**
 * API Client Configuration untuk Production
 * Mengatur koneksi ke backend Azure dengan error handling
 */

// Konfigurasi Backend URL dengan fallback
const getBackendUrl = (): string => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 if (isDev && !envUrl) {
  // Development: coba localhost dulu
  return 'http://localhost:5001';
 }

 // Production: wajib menggunakan environment variable
 return envUrl || 'https://auto-short.azurewebsites.net';
};

const BACKEND_URL = getBackendUrl();
console.log(`[API Client] Backend URL: ${BACKEND_URL}`);

// Generic fetch wrapper dengan error handling
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
 const url = `${BACKEND_URL}${endpoint}`;

 const defaultOptions: RequestInit = {
  headers: {
   'Content-Type': 'application/json',
   Accept: 'application/json',
  },
  ...options,
 };

 console.log(`[API] ${options.method || 'GET'} ${endpoint}`);

 try {
  const response = await fetch(url, defaultOptions);

  if (!response.ok) {
   // Enhanced error messages
   if (response.status === 404) {
    throw new Error('Endpoint tidak ditemukan. Backend mungkin sedang update.');
   } else if (response.status === 500) {
    throw new Error('Server error. Tim development sudah diberitahu.');
   } else if (response.status === 429) {
    throw new Error('Terlalu banyak request. Tunggu beberapa menit.');
   }
   throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  console.log(`[API] ✅ ${response.status} ${endpoint}`);
  return response;
 } catch (error) {
  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
   throw new Error('Backend server tidak dapat diakses. Silakan coba lagi.');
  }
  throw error;
 }
};

// API Methods dengan TypeScript support
export const api = {
 // Health check
 healthCheck: async () => {
  const response = await apiRequest('/health');
  return response.json();
 },

 // Video processing
 createShort: async (data: {youtubeUrl: string; start: number; end: number; aspectRatio?: string}) => {
  const response = await apiRequest('/api/shorts', {
   method: 'POST',
   body: JSON.stringify(data),
  });
  return response.json();
 },

 // Transcript services
 getTranscript: async (videoId: string, lang = 'id,en') => {
  const response = await apiRequest(`/api/yt-transcript?videoId=${videoId}&lang=${lang}`);
  return response.json();
 },

 // Video metadata
 getVideoMetadata: async (videoId: string) => {
  const response = await apiRequest(`/api/video-metadata?videoId=${videoId}`);
  return response.json();
 },

 // Quality check
 checkVideoQuality: async (url: string) => {
  const response = await apiRequest('/api/video-quality-check', {
   method: 'POST',
   body: JSON.stringify({url}),
  });
  return response.json();
 },

 // Intelligent segments
 getIntelligentSegments: async (videoId: string) => {
  const response = await apiRequest(`/api/intelligent-segments?videoId=${videoId}`);
  return response.json();
 },
};

export default api;
