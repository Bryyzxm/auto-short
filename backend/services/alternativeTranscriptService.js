const fs = require('fs-extra');
const path = require('path');
const {v4: uuidv4} = require('uuid');
const {executeYtDlpSecurely} = require('./ytdlpSecureExecutor');

// Cookies path configuration
const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || path.join(__dirname, '..', 'cookies.txt');

// A simple VTT parser
function parseVTT(vttContent) {
 const lines = vttContent.split('\n');
 const transcript = [];
 let currentCue = null;

 for (const line of lines) {
  if (line.includes('-->')) {
   const [start, end] = line.split(' --> ');
   currentCue = {
    start: formatTimestamp(start),
    duration: (parseTimestamp(end) - parseTimestamp(start)).toFixed(3),
    text: '',
   };
  } else if (currentCue && line.trim() !== '' && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
   currentCue.text += (currentCue.text ? ' ' : '') + line.trim();
  } else if (line.trim() === '' && currentCue) {
   if (currentCue.text) {
    transcript.push(currentCue);
   }
   currentCue = null;
  }
 }
 if (currentCue && currentCue.text) {
  transcript.push(currentCue);
 }

 return transcript;
}

function parseTimestamp(timestamp) {
 const parts = timestamp.split(':');
 const secondsParts = parts[parts.length - 1].split('.');
 let seconds = parseFloat(secondsParts[0]);
 if (secondsParts.length > 1) {
  seconds += parseFloat('0.' + secondsParts[1]);
 }
 if (parts.length > 1) {
  seconds += parseInt(parts[parts.length - 2], 10) * 60;
 }
 if (parts.length > 2) {
  seconds += parseInt(parts[parts.length - 3], 10) * 3600;
 }
 return seconds;
}

function formatTimestamp(timestamp) {
 return parseTimestamp(timestamp).toFixed(3);
}

async function extract(videoId) {
 console.log(`Alternative Transcript Service: Attempting to extract subtitles for videoId: ${videoId}`);
 const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
 const tempDir = path.join(__dirname, '..', 'temp');
 await fs.ensureDir(tempDir);
 const tempFile = path.join(tempDir, `${uuidv4()}.en.vtt`);

 const args = [
  '--write-auto-sub',
  '--sub-lang',
  'en',
  '--skip-download',
  '-o',
  tempFile.replace('.en.vtt', ''), // ytdlp appends lang and extension
  videoUrl,
 ];

 // Add cookies if available
 if (fs.existsSync(COOKIES_PATH)) {
  args.push('--cookies', COOKIES_PATH);
  console.log(`Alternative Transcript Service: Using cookies from ${COOKIES_PATH}`);
 } else {
  console.log(`Alternative Transcript Service: No cookies file found at ${COOKIES_PATH}`);
 }

 try {
  // Use the enhanced secure executor with anti-detection
  console.log('[ALT-TRANSCRIPT] Using enhanced anti-detection execution');

  const result = await executeYtDlpSecurely(args, {
   timeout: 30000,
   maxBuffer: 1024 * 1024 * 10, // 10MB buffer
   useCookies: true,
  });

  // Check if ytdlp completed successfully but found no subtitles
  if (result && result.stdout) {
   const stdout = result.stdout.toLowerCase();
   const stderr = result.stderr ? result.stderr.toLowerCase() : '';

   // Check for various "no subtitles" messages in output
   const noSubtitlesMessages = ['there are no subtitles for the requested languages', 'no automatic captions', 'no subtitles found', 'no suitable subtitles found', 'automatic captions for 1 languages are missing'];

   const foundNoSubtitlesMessage = noSubtitlesMessages.some((msg) => stdout.includes(msg) || stderr.includes(msg));

   if (foundNoSubtitlesMessage) {
    console.log(`Alternative Transcript Service: Video ${videoId} has no English subtitles available`);
    throw new Error('No English automatic captions available for this video.');
   }
  }

  if (await fs.pathExists(tempFile)) {
   const vttContent = await fs.readFile(tempFile, 'utf-8');
   const transcript = parseVTT(vttContent);
   console.log(`Alternative Transcript Service: Successfully extracted and parsed ${transcript.length} subtitle cues.`);
   return {segments: transcript, source: 'yt-dlp-alternative'};
  } else {
   console.error('Alternative Transcript Service: Subtitle file was not created.');
   throw new Error('No English automatic captions available for this video.');
  }
 } catch (error) {
  console.error('Alternative Transcript Service Error:', error.message);

  // If it's already our custom "no captions" error, re-throw it
  if (error.message.includes('No English automatic captions available')) {
   throw error;
  }

  // Check for specific yt-dlp errors in stderr
  if (error.stderr) {
   const stderr = error.stderr.toLowerCase();
   if (stderr.includes('no suitable subtitles found') || stderr.includes('there are no subtitles') || stderr.includes('sign in to confirm')) {
    throw new Error('No English automatic captions available for this video.');
   }
  }

  throw new Error(`Failed to extract subtitles using yt-dlp: ${error.message}`);
 } finally {
  if (await fs.pathExists(tempFile)) {
   await fs.remove(tempFile);
  }
 }
}

module.exports = {extract};
