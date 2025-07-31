const ytdlp = require('yt-dlp-exec');
const fs = require('fs-extra');
const path = require('path');
const {v4: uuidv4} = require('uuid');

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

 try {
  await ytdlp.exec(args);

  if (await fs.pathExists(tempFile)) {
   const vttContent = await fs.readFile(tempFile, 'utf-8');
   const transcript = parseVTT(vttContent);
   console.log(`Alternative Transcript Service: Successfully extracted and parsed ${transcript.length} subtitle cues.`);
   return {segments: transcript, source: 'yt-dlp-alternative'};
  } else {
   console.error('Alternative Transcript Service: Subtitle file was not created.');
   throw new Error('Subtitle file not found after yt-dlp execution.');
  }
 } catch (error) {
  console.error('Alternative Transcript Service Error:', error.message);
  // Check for specific yt-dlp errors if needed
  if (error.stderr && error.stderr.includes('no suitable subtitles found')) {
   throw new Error('No English automatic captions available for this video.');
  }
  throw new Error(`Failed to extract subtitles using yt-dlp: ${error.message}`);
 } finally {
  if (await fs.pathExists(tempFile)) {
   await fs.remove(tempFile);
  }
 }
}

module.exports = {extract};
