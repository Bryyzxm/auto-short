const ytdlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const {YoutubeTranscript} = require('youtube-transcript');
const {TranscriptDisabledError, NoValidTranscriptError} = require('./transcriptErrors.js');

const YT_DLP_PATH = process.platform === 'win32' ? path.join(process.cwd(), 'yt-dlp.exe') : 'yt-dlp';
const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || path.join(__dirname, '..', 'cookies', 'cookies.txt');

async function extract(videoId, options = {}) {
 const {lang = ['en', 'id']} = options;
 console.log(`[ROBUST-V2] Starting extraction for ${videoId}`);

 // Strategy 1: Try youtube-transcript API first
 try {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId, {lang: lang[0]});
  if (transcript && transcript.length > 0) {
   console.log(`[ROBUST-V2] ✅ Success with YouTube Transcript API for ${videoId}`);
   return {segments: transcript, source: 'youtube-transcript'};
  }
 } catch (error) {
  console.log(`[ROBUST-V2] YouTube Transcript API failed: ${error.message}`);
  if (/transcripts disabled/i.test(error.message)) {
   throw new TranscriptDisabledError(error.message);
  }
 }

 // Strategy 2: Fallback to yt-dlp with cookies
 console.log('[ROBUST-V2] Strategy 2: Enhanced yt-dlp');
 console.log(`[ROBUST-V2] Checking cookies path: ${COOKIES_PATH}`);
 console.log(`[ROBUST-V2] Cookies file exists: ${fs.existsSync(COOKIES_PATH)}`);
 if (!fs.existsSync(COOKIES_PATH)) {
  throw new Error('Cookies file not found for robust extraction.');
 }

 const tempDir = path.join(process.cwd(), 'temp');
 if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
 const tempFile = path.join(tempDir, `${videoId}-${Date.now()}`);

 try {
  await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
   'write-subs': true,
   'write-auto-subs': true,
   'sub-lang': lang.join(','),
   'sub-format': 'srv3/ttml/vtt',
   'skip-download': true,
   output: `${tempFile}.%(ext)s`,
   cookies: COOKIES_PATH,
  });

  console.log(`[ROBUST-V2] yt-dlp completed, checking for files...`);
 } catch (error) {
  console.error(`[ROBUST-V2] yt-dlp command failed: ${error.message}`);
 }

 // Always check for downloaded files, regardless of yt-dlp exit code
 try {
  const subtitleFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith(path.basename(tempFile)) && (f.endsWith('.vtt') || f.endsWith('.srv3') || f.endsWith('.ttml')));

  console.log(`[ROBUST-V2] Found ${subtitleFiles.length} subtitle files: ${subtitleFiles.join(', ')}`);

  if (subtitleFiles.length > 0) {
   const subtitleFile = subtitleFiles[0];
   const subtitlePath = path.join(tempDir, subtitleFile);
   const subtitleContent = fs.readFileSync(subtitlePath, 'utf-8');

   console.log(`[ROBUST-V2] Processing subtitle file: ${subtitleFile} (${subtitleContent.length} chars)`);

   // Clean up
   fs.unlinkSync(subtitlePath);

   // Simple text extraction for any format
   const segments = parseSubtitleContent(subtitleContent);

   console.log(`[ROBUST-V2] Parsed ${segments.length} segments from subtitle content`);

   if (segments && segments.length > 0) {
    console.log(`[ROBUST-V2] ✅ Success with yt-dlp for ${videoId}: ${segments.length} segments`);
    return {segments, source: 'yt-dlp'};
   } else {
    console.log(`[ROBUST-V2] ⚠️ No valid segments extracted from subtitle file`);
   }
  }
 } catch (recoveryError) {
  console.log(`[ROBUST-V2] File check failed: ${recoveryError.message}`);
 }

 throw new NoValidTranscriptError('All robust extraction strategies failed.');
}

// Helper function to parse various subtitle formats
function parseSubtitleContent(content) {
 const segments = [];

 // Debug: log first few lines to understand format
 const firstLines = content.split('\n').slice(0, 10);
 console.log(`[ROBUST-V2] First 10 lines of subtitle:`, firstLines);

 // Try SRV3 format first
 if (content.includes('<s t=') || content.includes('<s a=')) {
  console.log(`[ROBUST-V2] Detected SRV3 format, parsing...`);

  // More robust SRV3 parsing
  const segmentPattern = /<s t="(\d+)"[^>]*>(.*?)<\/s>/gs;
  let match;

  while ((match = segmentPattern.exec(content)) !== null) {
   const timeMs = parseInt(match[1]);
   const text = match[2].replace(/<[^>]*>/g, '').trim(); // Remove any remaining HTML tags

   if (text) {
    segments.push({
     start: (timeMs / 1000).toFixed(3),
     duration: 5,
     text: text,
    });
   }
  }

  console.log(`[ROBUST-V2] SRV3 parsing extracted ${segments.length} segments`);
 } else if (content.includes('-->')) {
  console.log(`[ROBUST-V2] Detected VTT format, parsing...`);

  // VTT format
  const blocks = content.split('\n\n').filter((block) => block.trim());
  for (const block of blocks) {
   const lines = block.split('\n');
   const timeLine = lines.find((line) => line.includes('-->'));
   if (timeLine) {
    const [start, end] = timeLine.split(' --> ');
    const text = lines
     .filter((line) => !line.includes('-->'))
     .join(' ')
     .trim();
    if (text && !text.startsWith('WEBVTT') && !text.startsWith('NOTE')) {
     segments.push({start, end, text});
    }
   }
  }

  console.log(`[ROBUST-V2] VTT parsing extracted ${segments.length} segments`);
 }

 // If no segments found, try extracting any text between XML-like tags
 if (segments.length === 0) {
  console.log(`[ROBUST-V2] No segments found with standard parsing, trying fallback...`);

  const textPattern = />([^<]+)</g;
  let match;
  let segmentIndex = 0;

  while ((match = textPattern.exec(content)) !== null) {
   const text = match[1].trim();
   if (text && text.length > 3) {
    // Only include meaningful text
    segments.push({
     start: (segmentIndex * 5).toFixed(3), // Fallback timing
     duration: 5,
     text: text,
    });
    segmentIndex++;

    if (segmentIndex >= 100) break; // Limit to first 100 segments for fallback
   }
  }

  console.log(`[ROBUST-V2] Fallback parsing extracted ${segments.length} segments`);
 }

 return segments;
}

module.exports = {
 extract,
};
