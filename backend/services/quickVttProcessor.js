/**
 * QUICK VTT PROCESSOR
 *
 * This service monitors the temp directory for VTT files and processes them
 * immediately when they become available, rather than waiting for yt-dlp
 * to fully complete. This significantly reduces processing time.
 */

const fs = require('fs');
const path = require('path');

class QuickVttProcessor {
 constructor() {
  this.tempDir = path.join(__dirname, '../temp');
  this.watchers = new Map();
 }

 /**
  * Monitor for VTT files and process as soon as available
  */
 async monitorAndProcess(videoId, maxWaitTime = 120000) {
  // 2 minutes max
  console.log(`[QUICK-VTT] 👀 Monitoring for VTT files for ${videoId}`);

  return new Promise((resolve, reject) => {
   const startTime = Date.now();

   // Check immediately for existing files
   const existingFile = this.findExistingVttFile(videoId);
   if (existingFile) {
    console.log(`[QUICK-VTT] ⚡ Found existing VTT file: ${existingFile}`);
    const result = this.processVttFile(existingFile, videoId);
    if (result) {
     resolve(result);
     return;
    }
   }

   // Set up polling for new files
   const pollInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;

    if (elapsed > maxWaitTime) {
     clearInterval(pollInterval);
     reject(new Error(`VTT monitoring timeout after ${maxWaitTime}ms`));
     return;
    }

    const vttFile = this.findExistingVttFile(videoId);
    if (vttFile) {
     clearInterval(pollInterval);
     console.log(`[QUICK-VTT] ⚡ VTT file detected after ${elapsed}ms: ${vttFile}`);

     const result = this.processVttFile(vttFile, videoId);
     if (result) {
      resolve(result);
     } else {
      reject(new Error('Failed to process VTT file'));
     }
    }
   }, 2000); // Check every 2 seconds
  });
 }

 /**
  * Find existing VTT files for the video
  */
 findExistingVttFile(videoId) {
  if (!fs.existsSync(this.tempDir)) {
   return null;
  }

  const patterns = [
   `${videoId}_plugin.id.vtt`, // Indonesian - highest priority
   `${videoId}_tv_embedded.id.vtt`,
   `${videoId}_web_embedded.id.vtt`,
   `${videoId}_plugin.en.vtt`, // English fallback
   `${videoId}_tv_embedded.en.vtt`,
   `${videoId}_web_embedded.en.vtt`,
  ];

  for (const pattern of patterns) {
   const filePath = path.join(this.tempDir, pattern);
   if (fs.existsSync(filePath)) {
    try {
     const stats = fs.statSync(filePath);
     if (stats.size > 100) {
      // File has content
      return filePath;
     }
    } catch (error) {
     console.log(`[QUICK-VTT] ⚠️ Error checking file ${pattern}: ${error.message}`);
    }
   }
  }

  return null;
 }

 /**
  * Process VTT file into segments
  */
 processVttFile(filePath, videoId) {
  try {
   const content = fs.readFileSync(filePath, 'utf8');
   const segments = this.parseVttContent(content);

   if (!segments || segments.length === 0) {
    console.log(`[QUICK-VTT] ❌ No segments found in ${filePath}`);
    return null;
   }

   const isIndonesian = filePath.includes('.id.vtt');
   const detectedLanguage = isIndonesian ? 'indonesian' : 'english';

   console.log(`[QUICK-VTT] ✅ Processed ${segments.length} segments from ${path.basename(filePath)} (${detectedLanguage})`);

   return {
    segments: segments.map((seg) => ({
     text: seg.text,
     start: seg.start,
     duration: seg.end - seg.start,
     end: seg.end,
    })),
    language: detectedLanguage,
    hasRealTiming: true,
    source: 'quick-vtt-processor',
    file: path.basename(filePath),
    extractedAt: new Date().toISOString(),
   };
  } catch (error) {
   console.error(`[QUICK-VTT] ❌ Error processing VTT file ${filePath}:`, error);
   return null;
  }
 }

 /**
  * Parse VTT content into segments
  */
 parseVttContent(content) {
  const segments = [];
  const lines = content.split('\n');
  let currentSegment = null;

  const isHeaderOrEmpty = (line) =>
    !line || line === 'WEBVTT' || line.startsWith('NOTE');

  const isTimeLine = (line) =>
    line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);

  const isSegmentNumber = (line) => /^\d+$/.test(line);

  const handleTimeMatch = (timeMatch) => {
    if (currentSegment && currentSegment.text.trim()) {
      segments.push(currentSegment);
    }
    currentSegment = {
      start: this.timeToSeconds(timeMatch[1]),
      end: this.timeToSeconds(timeMatch[2]),
      text: '',
    };
  };

  const handleTextLine = (line) => {
    if (currentSegment && line && !isSegmentNumber(line)) {
      currentSegment.text += (currentSegment.text ? ' ' : '') + line;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (isHeaderOrEmpty(line)) continue;

    const timeMatch = isTimeLine(line);
    if (timeMatch) {
      handleTimeMatch(timeMatch);
    } else {
      handleTextLine(line);
    }
  }

  if (currentSegment && currentSegment.text.trim()) {
    segments.push(currentSegment);
  }

  return segments;
 }

 /**
  * Convert VTT time format to seconds
  */
 timeToSeconds(timeStr) {
  const [hours, minutes, secondsMs] = timeStr.split(':');
  const [seconds, milliseconds] = secondsMs.split('.');

  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
 }

 /**
  * Clean up watchers
  */
 cleanup() {
  for (const [videoId, watcher] of this.watchers) {
   try {
    watcher.close();
   } catch (error) {
    console.log(`[QUICK-VTT] ⚠️ Error closing watcher for ${videoId}: ${error.message}`);
   }
  }
  this.watchers.clear();
 }
}

module.exports = QuickVttProcessor;
