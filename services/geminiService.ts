
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import type { GeminiShortSegmentSuggestion, ShortVideo } from '../types';
import { parseTimeStringToSeconds } from '../utils/timeUtils';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Gemini API Key is not configured. Please set the API_KEY environment variable.");
}
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const generatePrompt = (videoUrlHint?: string): string => {
  const videoContext = videoUrlHint ? `The video is from this URL (use for general topic context if possible): ${videoUrlHint}` : "The video is on a general popular topic like a vlog, tutorial, or product review.";

  return `
You are an AI assistant specialized in identifying highly engaging segments from long-form YouTube videos to create a collection of compelling short vertical clips (like TikToks, Instagram Reels, or YouTube Shorts).

${videoContext}

Your task is to suggest 5 to 7 distinct segments from this conceptual video.
Each segment MUST be a maximum of 90 seconds long.
For each segment, provide the following details:
1.  A catchy and concise \`title\` (max 10 words) for the short clip.
2.  A brief \`description\` (1-2 sentences) explaining why this segment is engaging or interesting (e.g., highlights a key moment, a surprising event, a valuable tip, or a humorous part).
3.  A \`startTimeString\` indicating when the segment begins (e.g., "0m35s", "1m20s", "12s").
4.  An \`endTimeString\` indicating when the segment ends (e.g., "1m5s", "2m45s", "1m30s").
5.  A \`reasonForVertical\` (string, 1-2 sentences) explaining why this segment is well-suited for a vertical 9:16 aspect ratio (e.g., "Main subject is well-centered, allowing for tight vertical cropping.", "Action is contained and visually appealing in a narrow frame.", "Good for a close-up shot on the speaker's expressions.").

IMPORTANT CONSTRAINTS:
- The duration between \`startTimeString\` and \`endTimeString\` for each segment must NOT exceed 90 seconds.
- Ensure \`endTimeString\` is always greater than \`startTimeString\`.
- Provide plausible and varied timestamps as if analyzing a typical YouTube video that could be several minutes to an hour long.
- Ensure each suggested segment is distinct and offers unique value.

Return the output strictly as a valid JSON array of objects. Each object in the array must follow this exact structure:
{
  "title": "string",
  "description": "string",
  "startTimeString": "string",
  "endTimeString": "string",
  "reasonForVertical": "string"
}

Example of a single object in the JSON array:
{
  "title": "Epic Fail & Recovery",
  "description": "A surprising mistake leads to a hilarious recovery, making it very shareable.",
  "startTimeString": "2m15s",
  "endTimeString": "3m00s",
  "reasonForVertical": "The action is centrally framed, making it ideal for vertical focus."
}

Now, generate the list of segments based on these instructions.
`;
};

export const generateShortsIdeas = async (videoUrl: string): Promise<Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[]> => {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. API_KEY might be missing.");
  }

  const prompt = generatePrompt(videoUrl);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.75, 
        topP: 0.95,
        topK: 40,
      }
    });
    
    let rawText = response.text.trim();
    
    // Attempt to remove markdown fences first
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const fenceMatch = rawText.match(fenceRegex);
    if (fenceMatch && fenceMatch[1]) {
      rawText = fenceMatch[1].trim();
    }

    // Now, try to extract the main JSON array/object content
    // This helps to strip leading/trailing non-JSON text that might remain
    let jsonStrToParse = rawText;
    const firstBracket = rawText.indexOf('[');
    const lastBracket = rawText.lastIndexOf(']');
    const firstBrace = rawText.indexOf('{'); // In case it's a single object not in an array
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBracket !== -1 && lastBracket > firstBracket) {
        // Likely an array, as requested from the prompt
        jsonStrToParse = rawText.substring(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1 && lastBrace > firstBrace && firstBracket === -1) { 
        // Fallback: if no array found, try to get a single object (less likely given the prompt)
        jsonStrToParse = rawText.substring(firstBrace, lastBrace + 1);
    }
    // If neither array nor object delimiters are found in a plausible way, 
    // jsonStrToParse remains as rawText (after fence removal), 
    // and JSON.parse will likely fail, caught by the catch block.

    let suggestions: GeminiShortSegmentSuggestion[];
    try {
      suggestions = JSON.parse(jsonStrToParse);
    } catch (parseError) {
      console.error("Failed to parse JSON response from Gemini. Original full text:", response.text, "Attempted to parse this substring:", jsonStrToParse, "Parse error:", parseError);
      throw new Error("AI response was not valid JSON. The content might be incomplete or malformed. Please check the console for more details on the problematic response.");
    }


    if (!Array.isArray(suggestions)) {
        console.error("Gemini response, after parsing, is not an array:", suggestions);
        throw new Error("AI response was not in the expected format (array of suggestions).");
    }

    return suggestions.map((suggestion, index) => {
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

      if (endTimeSeconds - startTimeSeconds > 90) {
        console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) exceeds 90s duration (is ${endTimeSeconds - startTimeSeconds}s). Truncating to 90s.`);
        endTimeSeconds = startTimeSeconds + 90;
      }
      
      if (endTimeSeconds - startTimeSeconds < 1) {
        console.warn(`Segment "${suggestion.title || 'Untitled'}" (index ${index}) has duration < 1s. Adjusting endTime to startTime + 1s.`);
        endTimeSeconds = startTimeSeconds + 1;
      }
      
      return {
        id: `short-${Date.now()}-${index}`,
        title: suggestion.title || "Untitled Segment",
        description: suggestion.description || "No description provided.",
        startTimeSeconds,
        endTimeSeconds,
        reasonForVertical: suggestion.reasonForVertical || "No specific reason for vertical suitability provided.",
      };
    }).filter(s => s !== null) as Omit<ShortVideo, 'youtubeVideoId' | 'thumbnailUrl'>[];

  } catch (error: any) {
    console.error("Error calling Gemini API or processing response:", error);
    if (error.message) {
        if (error.message.toLowerCase().includes("api key not valid")) {
            throw new Error("Invalid Gemini API Key. Please check your configuration and ensure it's correctly set.");
        }
        if (error.message.toLowerCase().includes("quota")) {
            throw new Error("API quota exceeded. Please check your Gemini API usage and limits.");
        }
        // Re-throw specific parsing errors with more context if they weren't caught above
        if (error.message.includes("AI response was not valid JSON")) {
            throw error; 
        }
    }
    throw new Error(`Failed to get suggestions from AI: ${error.message || 'Unknown error occurred'}`);
  }
};
