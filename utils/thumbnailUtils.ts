// Utility functions for generating YouTube thumbnail URLs

export const generateYouTubeThumbnailUrl = (videoId: string, _timeInSeconds: number): string => {
 // YouTube provides several thumbnail sizes
 // We'll use maxresdefault for best quality
 // Note: YouTube doesn't provide timestamp-specific thumbnails via static API
 return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
};

export const generateCustomThumbnailUrl = (videoId: string, startTime: number): string => {
 // Alternative method: Generate thumbnail URL with timestamp parameter
 // This doesn't work with YouTube's static API but good for future implementation
 return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg?t=${startTime}`;
};

export const getYouTubeThumbnailVariants = (videoId: string) => {
 return {
  maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  standard: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
  high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
 };
};

export const extractVideoIdFromUrl = (url: string): string | null => {
 const regExp = /(?:youtube\.com\/(?:.*[?&]v=|(?:v|e(?:mbed)?|live|shorts)\/)|youtu\.be\/)([\w-]{8,})/i;
 const match = regExp.exec(url);
 return match?.[1] || null;
};

export const formatTime = (seconds: number): string => {
 const mins = Math.floor(seconds / 60);
 const secs = Math.floor(seconds % 60);
 return `${mins}:${secs.toString().padStart(2, '0')}`;
};
