
export interface ShortVideo {
  id: string;
  title: string;
  description: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  youtubeVideoId: string;
  thumbnailUrl: string; // URL for a placeholder image
  reasonForVertical?: string; // AI's reasoning for vertical suitability
}

// Structure expected from Gemini after parsing its JSON output
export interface GeminiShortSegmentSuggestion {
  title: string;
  description: string;
  startTimeString: string; // e.g., "1m20s" or "35s"
  endTimeString: string;   // e.g., "2m45s"
  reasonForVertical: string; // e.g., "Main subject is centered"
}

// Structure for grounding metadata chunks if used (not in this version, but good to have)
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  // Other types of chunks can be defined here
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  // Other grounding metadata fields
}
