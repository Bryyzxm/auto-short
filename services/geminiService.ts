import type { ShortVideo } from '../types';
import { parseTimeStringToSeconds } from '../utils/timeUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const generateShortsIdeas = async (videoUrl: string, transcript?: string): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
  const response = await fetch(`${API_URL}/api/generate-segments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoUrl, transcript }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to get a valid error response from the server.' }));
    throw new Error(errorData.error || `Failed to get suggestions from AI: ${response.statusText}`);
  }

  const suggestions = await response.json();

  if (!Array.isArray(suggestions)) {
    console.error('API response, after parsing, is not an array:', suggestions);
    throw new Error('API response was not in the expected format (array of suggestions).');
  }

  return suggestions
    .map((suggestion, index) => {
      const startTimeSeconds = parseTimeStringToSeconds(suggestion.startTimeString);
      let endTimeSeconds = parseTimeStringToSeconds(suggestion.endTimeString);

      if (isNaN(startTimeSeconds) || isNaN(endTimeSeconds)) {
        console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has invalid NaN timestamps (start: ${suggestion.startTimeString}, end: ${suggestion.endTimeString}). Skipping this segment.`);
        return null;
      }

      if (endTimeSeconds <= startTimeSeconds) {
        console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has endTime <= startTime (start: ${startTimeSeconds}s, end: ${endTimeSeconds}s). Adjusting endTime to startTime + 15s.`);
        endTimeSeconds = startTimeSeconds + 15;
      }

      if (endTimeSeconds - startTimeSeconds > 120) {
        console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) exceeds 120s duration (is ${endTimeSeconds - startTimeSeconds}s). Truncating to 120s.`);
        endTimeSeconds = startTimeSeconds + 120;
      }

      if (endTimeSeconds - startTimeSeconds < 1) {
        console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has duration < 1s. Adjusting endTime to startTime + 1s.`);
        endTimeSeconds = startTimeSeconds + 1;
      }

      return {
        id: `short-${Date.now()}-${index}`,
        title: suggestion.title || 'Untitled Segment',
        description: suggestion.description || 'No description provided.',
        startTimeSeconds,
        endTimeSeconds,
        reasonForVertical: suggestion.reasonForVertical || 'No specific reason for vertical suitability provided.',
      };
    })
    .filter((s) => s !== null) as Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[];
};