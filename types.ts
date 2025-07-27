export interface ShortVideo {
 id: string;
 title: string;
 description: string;
 startTimeSeconds: number;
 endTimeSeconds: number;
 youtubeVideoId: string;
 thumbnailUrl: string; // URL for a placeholder image
 reasonForVertical?: string; // AI's reasoning for vertical suitability
 customThumbnailUrl?: string; // Custom thumbnail URL for immediate display
 transcriptExcerpt?: string; // AI-generated transcript excerpt for this specific segment
}

// Structure expected from Gemini after parsing its JSON output
export interface GeminiShortSegmentSuggestion {
 title: string;
 description?: string;
 // Support both old format (startTimeString/endTimeString) and new format (startTime/endTime)
 startTimeString?: string; // e.g., "1m20s" or "35s" or "1:20"
 endTimeString?: string; // e.g., "2m45s" or "2:45"
 startTime?: string; // New format: "MM:SS" format like "01:20"
 endTime?: string; // New format: "MM:SS" format like "02:45"
 reasonForVertical?: string; // e.g., "Main subject is centered"
 transcriptExcerpt?: string; // Verbatim transcript text for this segment
 appealReason?: string; // Why this segment would be appealing for shorts
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
