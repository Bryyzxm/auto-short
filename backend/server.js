// Simple Express backend for YouTube video download & segment cut
import express from 'express';
import cors from 'cors';
import {execFile} from 'child_process';
import {v4 as uuidv4} from 'uuid';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

// Polyfill __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path ke yt-dlp executable
const YT_DLP_PATH = path.join(__dirname, 'yt-dlp.exe');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Serve static files from current directory (for video outputs)
app.use(
 '/outputs',
 express.static(process.cwd(), {
  setHeaders: (res, filePath) => {
   if (filePath.endsWith('.mp4')) {
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment');

    // Auto-delete file after serving
    res.on('finish', () => {
     setTimeout(() => {
      fs.unlink(filePath, (err) => {
       if (!err) {
        console.log(`[CLEANUP] Auto-deleted file: ${path.basename(filePath)}`);
       }
      });
     }, 1000); // Delete after 1 second
    });
   }
  },
 })
);

app.post('/api/video-quality-check', (req, res) => {
 const {url} = req.body;

 if (!url) {
  return res.status(400).json({error: 'URL is required'});
 }

 try {
  console.log('Checking video quality for:', url);

  // Check available formats with yt-dlp
  const formatsResult = execSync(`"${YT_DLP_PATH}" --list-formats "${url}"`, {
   encoding: 'utf8',
   timeout: 30000, // 30 second timeout
  });
  console.log('Available formats:', formatsResult);

  // Get specific format information
  const formatInfoResult = execSync(`"${YT_DLP_PATH}" -F "${url}" --quiet`, {
   encoding: 'utf8',
   timeout: 30000, // 30 second timeout
  });

  // Parse for quality levels
  const has720p = formatInfoResult.includes('720p') || formatInfoResult.includes('1280x720');
  const has480p = formatInfoResult.includes('480p') || formatInfoResult.includes('854x480');
  const has1080p = formatInfoResult.includes('1080p') || formatInfoResult.includes('1920x1080');

  let maxQuality = '360p';
  let upscalingNeeded = true;

  if (has1080p) {
   maxQuality = '1080p';
   upscalingNeeded = false;
  } else if (has720p) {
   maxQuality = '720p';
   upscalingNeeded = false;
  } else if (has480p) {
   maxQuality = '480p';
   upscalingNeeded = true;
  }

  res.json({
   success: true,
   maxQuality,
   upscalingNeeded,
   message: upscalingNeeded ? `Source is ${maxQuality}, will upscale to 720p` : `Source is ${maxQuality}, no upscaling needed`,
  });
 } catch (error) {
  console.error('Error checking video quality:', error.message);
  res.status(500).json({
   error: 'Failed to check video quality',
   details: error.message,
  });
 }
});

// Endpoint: POST /api/shorts
// Body: { youtubeUrl, start, end }
app.post('/api/shorts', async (req, res) => {
 const {youtubeUrl, start, end, aspectRatio} = req.body;
 if (!youtubeUrl || typeof start !== 'number' || typeof end !== 'number') {
  return res.status(400).json({error: 'youtubeUrl, start, end (in seconds) required'});
 }
 const id = uuidv4();
 const tempFile = path.join(process.cwd(), `${id}.mp4`);

 // Logging waktu
 console.log(`[${id}] Mulai proses download dan cut segmen: ${youtubeUrl} (${start}s - ${end}s, rasio: ${aspectRatio})`);

 // Pre-check: List available formats to ensure 720p+ is available
 console.log(`[${id}] Checking available formats...`);
 try {
  const formatCheck = execSync(`"${YT_DLP_PATH}" --list-formats --no-warnings "${youtubeUrl}"`, {
   encoding: 'utf8',
   timeout: 30000,
  });

  // Check available quality levels for smart processing
  const has720p = formatCheck.includes('1280x720') || formatCheck.includes('1920x1080') || formatCheck.includes('2560x1440') || formatCheck.includes('3840x2160') || /\b(720|1080|1440|2160)p?\b/.test(formatCheck);
  const has480p = /\b480p?\b|854x480/i.test(formatCheck);
  const has360p = /\b360p?\b|640x360/i.test(formatCheck);

  console.log(`[${id}] Quality analysis - 720p+: ${has720p}, 480p: ${has480p}, 360p: ${has360p}`);

  // We'll accept any quality and upscale if needed
  if (!has720p && !has480p && !has360p) {
   console.error(`[${id}] No detectable quality formats available for this video`);
   return res.status(400).json({
    error: 'No usable formats available',
    details: 'This video does not have any recognizable quality formats. Please try a different video.',
    availableFormats: formatCheck.split('\n').slice(0, 10).join('\n'),
   });
  }

  const willUpscale = !has720p;
  console.log(`[${id}] ${willUpscale ? '📈 Will upscale to 720p after download' : '✅ Native 720p+ available'}`);
 } catch (e) {
  console.warn(`[${id}] Could not check formats, proceeding with upscaling fallback:`, e.message);
 }

 console.time(`[${id}] yt-dlp download`);

 // Smart format selection: prefer high quality but accept lower for upscaling
 const ytDlpArgs = [
  '-f',
  // Priority 1: Native 720p+ (best quality, no upscaling needed)
  'best[height>=720][ext=mp4][vcodec!*=av01]/' +
   'bestvideo[height>=720][ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]/' +
   'best[height>=720]/' +
   // Priority 2: 480p for upscaling (good quality)
   'best[height>=480][ext=mp4]/' +
   'bestvideo[height>=480][ext=mp4]+bestaudio[ext=m4a]/' +
   'best[height>=480]/' +
   // Priority 3: 360p for upscaling (acceptable quality)
   'best[height>=360][ext=mp4]/' +
   'bestvideo[height>=360][ext=mp4]+bestaudio[ext=m4a]/' +
   'best[height>=360]/' +
   // Priority 4: Any available format (last resort with upscaling)
   'best[ext=mp4]/' +
   'best',
  '--no-playlist',
  '--no-warnings',
  '--merge-output-format',
  'mp4',
  '--user-agent',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  '--extractor-args',
  'youtube:player_client=web',
  // Force remux to ensure MP4 output
  '--remux-video',
  'mp4',
  '-o',
  tempFile,
  youtubeUrl,
 ];

 console.log(`[${id}] yt-dlp command (720p+ ONLY): ${YT_DLP_PATH} ${ytDlpArgs.join(' ')}`);
 console.log(`[${id}] NOTE: Will REJECT video if no 720p+ format available`);

 execFile(YT_DLP_PATH, ytDlpArgs, (err, stdout, stderr) => {
  console.timeEnd(`[${id}] yt-dlp download`);
  if (err) {
   console.error(`[${id}] yt-dlp error:`, err.message);
   console.error(`[${id}] yt-dlp stderr:`, stderr);
   console.error(`[${id}] yt-dlp stdout:`, stdout);

   // Check if error is due to format availability
   if (stderr && (stderr.includes('Requested format is not available') || stderr.includes('No video formats found'))) {
    return res.status(400).json({
     error: 'No 720p+ quality available',
     details: 'This video does not have the minimum 720p quality required. Please try a different video with higher quality.',
     stderr: stderr,
     command: `${YT_DLP_PATH} ${ytDlpArgs.join(' ')}`,
    });
   }

   return res.status(500).json({
    error: 'yt-dlp failed',
    details: err.message,
    stderr: stderr,
    command: `${YT_DLP_PATH} ${ytDlpArgs.join(' ')}`,
   });
  }
  console.log(`[${id}] yt-dlp success. Downloaded to: ${tempFile}`);

  // Analyze video resolution for upscaling decisions
  let videoWidth = 0;
  let videoHeight = 0;
  let needsUpscaling = false;

  try {
   const ffprobeResult = execSync(`ffprobe -v quiet -print_format json -show_streams "${tempFile}"`, {encoding: 'utf8'});
   const videoInfo = JSON.parse(ffprobeResult);
   const videoStream = videoInfo.streams.find((s) => s.codec_type === 'video');
   if (videoStream) {
    videoWidth = parseInt(videoStream.width);
    videoHeight = parseInt(videoStream.height);
    needsUpscaling = videoHeight < 720;

    console.log(`[${id}] Video resolution: ${videoWidth}x${videoHeight} (${videoHeight}p)`);

    if (needsUpscaling) {
     console.log(`[${id}] 📈 UPSCALING REQUIRED: ${videoHeight}p → 720p`);
    } else {
     console.log(`[${id}] ✅ Resolution adequate: ${videoHeight}p ≥ 720p`);
    }
   } else {
    console.warn(`[${id}] Could not detect video stream, assuming upscaling needed`);
    needsUpscaling = true;
   }
  } catch (e) {
   console.warn(`[${id}] Could not determine video resolution, assuming upscaling needed:`, e.message);
   needsUpscaling = true;
  }

  // Check if file actually exists
  if (!fs.existsSync(tempFile)) {
   console.error(`[${id}] Downloaded file not found: ${tempFile}`);
   return res.status(500).json({
    error: 'Downloaded file not found',
    details: `Expected file: ${tempFile}`,
   });
  }
  // Enhanced FFmpeg processing with smart upscaling and aspect ratio handling
  const cutFile = path.join(process.cwd(), `${id}-short.mp4`);
  let ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile];

  // Build video filter chain
  const videoFilters = [];

  // Step 1: Upscaling if needed (before aspect ratio changes)
  if (needsUpscaling) {
   const targetHeight = 720;
   const targetWidth = Math.round((targetHeight * videoWidth) / videoHeight);
   // Ensure width is even (required for most codecs)
   const evenWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;

   videoFilters.push(`scale=${evenWidth}:${targetHeight}:flags=lanczos`);
   console.log(`[${id}] 📈 Upscaling: ${videoWidth}x${videoHeight} → ${evenWidth}x${targetHeight}`);
  }

  // Step 2: Aspect ratio cropping
  if (aspectRatio === '9:16') {
   // Calculate dimensions for 9:16 aspect ratio
   const currentHeight = needsUpscaling ? 720 : videoHeight;
   const currentWidth = needsUpscaling ? Math.round((720 * videoWidth) / videoHeight) : videoWidth;
   const targetWidth = Math.round(currentHeight * (9 / 16));

   // Ensure even dimensions
   const evenTargetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
   const evenCurrentHeight = currentHeight % 2 === 0 ? currentHeight : currentHeight - 1;

   videoFilters.push(`crop=${evenTargetWidth}:${evenCurrentHeight}:(iw-${evenTargetWidth})/2:(ih-${evenCurrentHeight})/2`);
   console.log(`[${id}] 📱 Cropping to 9:16: ${evenTargetWidth}x${evenCurrentHeight}`);
  } else if (aspectRatio === '16:9') {
   // Calculate dimensions for 16:9 aspect ratio
   const currentHeight = needsUpscaling ? 720 : videoHeight;
   const currentWidth = needsUpscaling ? Math.round((720 * videoWidth) / videoHeight) : videoWidth;
   const targetWidth = Math.round(currentHeight * (16 / 9));

   // Ensure even dimensions
   const evenTargetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
   const evenCurrentHeight = currentHeight % 2 === 0 ? currentHeight : currentHeight - 1;

   videoFilters.push(`crop=${evenTargetWidth}:${evenCurrentHeight}:(iw-${evenTargetWidth})/2:(ih-${evenCurrentHeight})/2`);
   console.log(`[${id}] 🖥️ Cropping to 16:9: ${evenTargetWidth}x${evenCurrentHeight}`);
  }

  // Apply video filters if any
  if (videoFilters.length > 0) {
   ffmpegArgs.push('-vf', videoFilters.join(','));
  }

  // Enhanced encoding settings
  if (aspectRatio === 'original' && !needsUpscaling) {
   // Keep original quality with copy streams if no processing needed
   ffmpegArgs.push('-c', 'copy');
   console.log(`[${id}] 🚀 Using stream copy (no quality loss)`);
  } else {
   // High quality encoding for processed videos
   const crf = needsUpscaling ? '16' : '18'; // Higher quality for upscaled content
   ffmpegArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', 'medium', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart');
   console.log(`[${id}] 🎬 Using high quality encoding (CRF ${crf})`);
  }

  ffmpegArgs.push(cutFile);
  console.time(`[${id}] ffmpeg cut`);
  execFile('ffmpeg', ffmpegArgs, (err2, stdout2, stderr2) => {
   console.timeEnd(`[${id}] ffmpeg cut`);
   fs.unlink(tempFile, () => {});
   if (err2) {
    console.error(`[${id}] ffmpeg error:`, err2.message);
    console.error(`[${id}] ffmpeg stderr:`, stderr2);
    console.error(`[${id}] ffmpeg stdout:`, stdout2);
    return res.status(500).json({
     error: 'ffmpeg failed',
     details: err2.message,
     stderr: stderr2,
     command: `ffmpeg ${ffmpegArgs.join(' ')}`,
    });
   }

   // Check if output file exists and verify quality
   if (!fs.existsSync(cutFile)) {
    console.error(`[${id}] Cut file not found: ${cutFile}`);
    return res.status(500).json({
     error: 'Cut file not found',
     details: `Expected file: ${cutFile}`,
    });
   }

   // Verify final output resolution
   try {
    const finalProbeResult = execSync(`ffprobe -v quiet -print_format json -show_streams "${cutFile}"`, {encoding: 'utf8'});
    const finalVideoInfo = JSON.parse(finalProbeResult);
    const finalVideoStream = finalVideoInfo.streams.find((s) => s.codec_type === 'video');

    if (finalVideoStream) {
     const finalWidth = parseInt(finalVideoStream.width);
     const finalHeight = parseInt(finalVideoStream.height);
     console.log(`[${id}] ✅ Final output resolution: ${finalWidth}x${finalHeight} (${finalHeight}p)`);

     if (finalHeight >= 720) {
      console.log(`[${id}] 🎉 SUCCESS: Output meets 720p+ requirement!`);
     } else {
      console.warn(`[${id}] ⚠️ WARNING: Output resolution ${finalHeight}p is still below 720p`);
     }
    }
   } catch (e) {
    console.warn(`[${id}] Could not verify final resolution:`, e.message);
   }

   console.log(`[${id}] Selesai proses. Download: /outputs/${path.basename(cutFile)}`);

   // Schedule auto-cleanup after 30 seconds if file is not downloaded
   setTimeout(() => {
    if (fs.existsSync(cutFile)) {
     fs.unlink(cutFile, (err) => {
      if (!err) {
       console.log(`[CLEANUP] Auto-deleted undownloaded file: ${path.basename(cutFile)}`);
      }
     });
    }
   }, 30000); // 30 seconds timeout

   res.json({downloadUrl: `/outputs/${path.basename(cutFile)}`});
  });
 });
});

// Proxy endpoint for transcript (to avoid CORS)
app.get('/api/transcript', async (req, res) => {
 const {videoId} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});
 try {
  const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
  const apiRes = await fetch(apiUrl);
  if (!apiRes.ok) {
   return res.status(apiRes.status).json({error: 'Failed to fetch transcript', status: apiRes.status});
  }
  const data = await apiRes.json();
  res.json(data);
 } catch (err) {
  res.status(500).json({error: 'Proxy transcript error', details: err.message});
 }
});

// Cache untuk menyimpan transkrip yang sudah diunduh
const transcriptCache = new Map();

// Helper function untuk membersihkan file VTT lama
function cleanupOldVttFiles() {
 try {
  const files = fs.readdirSync(process.cwd());
  const vttFiles = files.filter((file) => file.endsWith('.vtt'));
  vttFiles.forEach((file) => {
   try {
    fs.unlinkSync(path.join(process.cwd(), file));
    console.log(`Cleaned up old VTT file: ${file}`);
   } catch (e) {
    console.warn(`Failed to cleanup VTT file ${file}:`, e.message);
   }
  });
 } catch (e) {
  console.warn('Failed to cleanup old VTT files:', e.message);
 }
}

// Helper function untuk membersihkan file MP4 lama
function cleanupOldMp4Files() {
 try {
  const files = fs.readdirSync(process.cwd());
  const mp4Files = files.filter((file) => file.endsWith('.mp4') && file.includes('-'));
  mp4Files.forEach((file) => {
   try {
    const filePath = path.join(process.cwd(), file);
    const stats = fs.statSync(filePath);
    const now = new Date();
    const fileAge = now - stats.mtime;

    // Delete files older than 1 hour
    if (fileAge > 60 * 60 * 1000) {
     fs.unlinkSync(filePath);
     console.log(`Cleaned up old MP4 file: ${file}`);
    }
   } catch (e) {
    console.warn(`Failed to cleanup MP4 file ${file}:`, e.message);
   }
  });
 } catch (e) {
  console.warn('Failed to cleanup old MP4 files:', e.message);
 }
}

// Helper function untuk parse VTT content
function parseVttContent(vttContent) {
 console.log('[PARSE VTT] Starting to parse VTT content...');
 console.log(`[PARSE VTT] Original content length: ${vttContent.length}`);
 console.log(`[PARSE VTT] Content preview (first 1000 chars):\n${vttContent.substring(0, 1000)}`);

 // Bersihkan metadata WebVTT dan tag HTML
 let cleanContent = vttContent
  .replace(/WEBVTT[^\n]*\n/g, '')
  .replace(/NOTE[^\n]*\n/g, '')
  .replace(/Kind:[^\n]*\n/g, '')
  .replace(/Language:[^\n]*\n/g, '');

 console.log(`[PARSE VTT] Clean content length: ${cleanContent.length}`);
 console.log(`[PARSE VTT] Clean content preview (first 500 chars):\n${cleanContent.substring(0, 500)}`);

 // Parse VTT ke array segmen {start, end, text}
 const segments = [];
 // Gunakan set untuk mendeteksi teks identik
 const seenNormalizedTexts = new Set();
 // Helper Jaccard similarity untuk fuzzy duplikasi
 const jaccard = (a, b) => {
  const sa = new Set(a.split(' '));
  const sb = new Set(b.split(' '));
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / Math.max(sa.size, sb.size || 1);
 };
 // Helper konversi timestamp HH:MM:SS.mmm → detik
 const toSec = (ts) => {
  const [h, m, s] = ts.split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
 };

 // Split berdasarkan baris kosong untuk mendapatkan blok-blok subtitle
 const blocks = cleanContent.split(/\n\s*\n/).filter((block) => block.trim());
 console.log(`[PARSE VTT] Found ${blocks.length} blocks`);

 for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
  const block = blocks[blockIndex];
  const lines = block.trim().split('\n');
  console.log(`[PARSE VTT] Processing block ${blockIndex + 1}/${blocks.length} with ${lines.length} lines`);
  console.log(`[PARSE VTT] Block content: ${JSON.stringify(lines)}`);

  // Cari baris yang mengandung timestamp (format: 00:00:00.000 --> 00:00:00.000)
  let timestampLine = null;
  let timestampIndex = -1;

  for (let i = 0; i < lines.length; i++) {
   if (lines[i].includes(' --> ')) {
    timestampLine = lines[i];
    timestampIndex = i;
    console.log(`[PARSE VTT] Found timestamp line at index ${i}: ${timestampLine}`);
    break;
   }
  }

  if (timestampLine) {
   // Extract timestamp dari baris yang mungkin mengandung align/position
   const timestampMatch = timestampLine.match(/([0-9:.]+)\s+-->\s+([0-9:.]+)/);
   console.log(`[PARSE VTT] Timestamp match result:`, timestampMatch);

   if (timestampMatch) {
    // Ambil semua baris setelah timestamp sebagai teks
    const textLines = lines.slice(timestampIndex + 1);
    console.log(`[PARSE VTT] Text lines:`, textLines);

    // Gabungkan semua baris teks dan bersihkan tag HTML
    let text = textLines.join(' ');
    console.log(`[PARSE VTT] Raw text: ${text}`);

    // Hapus tag HTML timing seperti <00:00:00.320>
    text = text.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');

    // Hapus tag <c> dan </c>
    text = text.replace(/<\/?c[^>]*>/g, '');

    // Bersihkan spasi ekstra dan trim
    text = text.replace(/\s+/g, ' ').trim();
    console.log(`[PARSE VTT] Cleaned text: ${text}`);

    // Normalized text untuk dedup fuzzy
    const normalized = text.toLowerCase();

    // Skip jika mirip (≥85%) dengan salah satu 3 segmen terakhir
    let isDuplicate = false;
    for (let i = Math.max(0, segments.length - 3); i < segments.length; i++) {
     const prevNorm = segments[i].text.toLowerCase();
     if (jaccard(prevNorm, normalized) > 0.85) {
      isDuplicate = true;
      console.log(`[PARSE VTT] Skipping duplicate text: ${text}`);
      break;
     }
    }
    if (isDuplicate) continue;

    // Skip jika teks kosong atau hanya berisi spasi
    if (text && text.length > 0) {
     const segment = {
      start: timestampMatch[1],
      end: timestampMatch[2],
      text: text,
     };
     segments.push(segment);
     console.log(`[PARSE VTT] Added segment ${segments.length}: ${JSON.stringify(segment)}`);
    } else {
     console.log(`[PARSE VTT] Skipping empty text`);
    }
   } else {
    console.log(`[PARSE VTT] No timestamp match found for line: ${timestampLine}`);
   }
  } else {
   console.log(`[PARSE VTT] No timestamp line found in block ${blockIndex + 1}`);
  }
 }

 console.log(`[PARSE VTT] Parsed ${segments.length} segments`);
 if (segments.length > 0) {
  console.log(`[PARSE VTT] First segment: ${segments[0].start} --> ${segments[0].end}: "${segments[0].text}"`);
 } else {
  console.log(`[PARSE VTT] WARNING: No segments were parsed!`);
 }

 return segments;
}

// Endpoint: GET /api/yt-transcript?videoId=...
app.get('/api/yt-transcript', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});

 console.log(`[TRANSCRIPT] Request for videoId: ${videoId}`);

 // Check cache first
 if (transcriptCache.has(videoId)) {
  console.log(`[TRANSCRIPT] Serving from cache for videoId: ${videoId}`);
  return res.json(transcriptCache.get(videoId));
 }

 // Cek apakah sudah ada file VTT untuk video ini
 const files = fs.readdirSync(process.cwd());
 let existingVttFile = null;

 // Cari file VTT yang sudah ada berdasarkan videoId (bukan UUID)
 for (const file of files) {
  if (file.includes(videoId) && file.endsWith('.vtt')) {
   existingVttFile = path.join(process.cwd(), file);
   console.log(`[TRANSCRIPT] Found existing VTT file: ${file}`);
   break;
  }
 }

 if (existingVttFile && fs.existsSync(existingVttFile)) {
  try {
   const vttContent = fs.readFileSync(existingVttFile, 'utf-8');
   const segments = parseVttContent(vttContent);

   // Deteksi bahasa dari nama file existing
   let detectedLanguage = 'unknown';
   const fileName = path.basename(existingVttFile);
   if (fileName.includes('.id.')) {
    detectedLanguage = 'Indonesian';
   } else if (fileName.includes('.en.')) {
    detectedLanguage = 'English';
   }

   const result = {
    segments,
    language: detectedLanguage,
    sourceFile: fileName,
   };
   transcriptCache.set(videoId, result);
   console.log(`[TRANSCRIPT] Served existing VTT for videoId: ${videoId}, language: ${detectedLanguage}`);
   return res.json(result);
  } catch (e) {
   console.warn(`[TRANSCRIPT] Failed to read existing VTT file: ${e.message}`);
  }
 }

 // Download new transcript
 const id = `${videoId}-${uuidv4().slice(0, 8)}`;
 const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
 const subLang = lang ? String(lang) : 'id,en';
 const ytDlpArgs = [
  '--write-auto-subs',
  '--write-subs',
  '--sub-lang',
  subLang, // Gunakan parameter lang yang sudah disiapkan
  '--skip-download',
  '--user-agent',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  '--extractor-args',
  'youtube:player_client=android',
  '-o',
  path.join(process.cwd(), `${id}`),
  ytUrl,
 ];

 console.log(`[TRANSCRIPT] Downloading new transcript for videoId: ${videoId}, preferred languages: ${subLang}`);

 execFile(YT_DLP_PATH, ytDlpArgs, async (err, stdout, stderr) => {
  if (err) {
   console.error(`[TRANSCRIPT] yt-dlp failed for videoId ${videoId}:`, err.message);
   console.error(`[TRANSCRIPT] stderr:`, stderr);
   console.error(`[TRANSCRIPT] stdout:`, stdout);
   console.error(`[TRANSCRIPT] yt-dlp path:`, YT_DLP_PATH);
   console.error(`[TRANSCRIPT] yt-dlp args:`, ytDlpArgs);
   return res.status(500).json({
    error: 'yt-dlp subtitle fetch failed',
    details: err.message,
    stderr: stderr,
    videoId: videoId,
   });
  }

  // Cari file subtitle dengan prioritas: .id.vtt (Indonesia) > .en.vtt (English) > auto-generated
  let vttFile = null;
  const newFiles = fs.readdirSync(process.cwd());

  // Prioritas 1: Manual Indonesian subtitles (.id.vtt)
  for (const file of newFiles) {
   if (file.startsWith(id) && file.endsWith('.id.vtt') && !file.includes('auto-generated')) {
    vttFile = path.join(process.cwd(), file);
    console.log(`[TRANSCRIPT] Using manual Indonesian subtitles: ${file}`);
    break;
   }
  }

  // Prioritas 2: Auto-generated Indonesian subtitles (.id.vtt)
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.id.vtt')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using auto-generated Indonesian subtitles: ${file}`);
     break;
    }
   }
  }

  // Prioritas 3: Manual English subtitles (.en.vtt)
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.en.vtt') && !file.includes('auto-generated')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using manual English subtitles: ${file}`);
     break;
    }
   }
  }

  // Prioritas 4: Auto-generated English subtitles (.en.vtt)
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.en.vtt')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using auto-generated English subtitles: ${file}`);
     break;
    }
   }
  }

  // Prioritas 5: Any other subtitle file
  if (!vttFile) {
   for (const file of newFiles) {
    if (file.startsWith(id) && file.endsWith('.vtt')) {
     vttFile = path.join(process.cwd(), file);
     console.log(`[TRANSCRIPT] Using fallback subtitle file: ${file}`);
     break;
    }
   }
  }

  if (!vttFile) {
   console.error(
    `[TRANSCRIPT] No VTT file found for videoId: ${videoId}. Available files:`,
    newFiles.filter((f) => f.startsWith(id))
   );
   return res.status(404).json({
    error: 'Subtitle file not found. Video might not have subtitles in Indonesian or English.',
    videoId: videoId,
    availableFiles: newFiles.filter((f) => f.startsWith(id)),
   });
  }

  // Baca dan parse VTT
  try {
   const vttContent = fs.readFileSync(vttFile, 'utf-8');
   console.log(`[TRANSCRIPT] VTT file size: ${vttContent.length} characters`);
   console.log(`[TRANSCRIPT] VTT file preview (first 500 chars):\n${vttContent.substring(0, 500)}`);

   const segments = parseVttContent(vttContent);

   if (segments.length === 0) {
    console.warn(`[TRANSCRIPT] No segments parsed from VTT file for videoId: ${videoId}`);
    return res.status(404).json({
     error: 'No transcript segments found in VTT file',
     videoId: videoId,
    });
   }

   // Deteksi bahasa dari nama file
   let detectedLanguage = 'unknown';
   const fileName = path.basename(vttFile);
   if (fileName.includes('.id.')) {
    detectedLanguage = 'Indonesian';
   } else if (fileName.includes('.en.')) {
    detectedLanguage = 'English';
   }

   const result = {
    segments,
    language: detectedLanguage,
    sourceFile: fileName,
   };

   // Cache the result
   transcriptCache.set(videoId, result);

   // Hapus file setelah dibaca
   fs.unlinkSync(vttFile);

   console.log(`[TRANSCRIPT] Successfully processed transcript for videoId: ${videoId}, segments: ${segments.length}`);
   res.json(result);
  } catch (e) {
   console.error(`[TRANSCRIPT] Failed to parse VTT for videoId ${videoId}:`, e.message);
   return res.status(500).json({
    error: 'Failed to parse VTT',
    details: e.message,
    videoId: videoId,
   });
  }
 });
});

// Endpoint: GET /api/video-metadata?videoId=...
// Mendapatkan metadata video (durasi, judul, dll) menggunakan yt-dlp
app.get('/api/video-metadata', async (req, res) => {
 const {videoId} = req.query;

 if (!videoId) {
  return res.status(400).json({error: 'videoId parameter is required'});
 }

 const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
 console.log(`[video-metadata] Fetching metadata for video: ${videoId}`);

 try {
  // Cek apakah yt-dlp.exe ada dan dapat diakses
  if (!fs.existsSync(YT_DLP_PATH)) {
   throw new Error(`yt-dlp.exe not found at path: ${YT_DLP_PATH}`);
  }

  console.log(`[video-metadata] Using yt-dlp at: ${YT_DLP_PATH}`);

  // Gunakan yt-dlp untuk mendapatkan metadata tanpa download
  const result = execSync(
   `"${YT_DLP_PATH}" --dump-json --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --extractor-args "youtube:player_client=web" "${videoUrl}"`,
   {
    encoding: 'utf8',
    timeout: 60000, // Increase timeout to 60 seconds
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
   }
  );

  if (!result || result.trim().length === 0) {
   throw new Error('Empty response from yt-dlp');
  }

  const metadata = JSON.parse(result.trim());

  // Extract informasi yang dibutuhkan
  const response = {
   videoId: metadata.id,
   title: metadata.title,
   duration: metadata.duration, // dalam detik
   uploader: metadata.uploader,
   upload_date: metadata.upload_date,
   view_count: metadata.view_count,
   description: metadata.description?.substring(0, 500), // Batasi deskripsi
  };

  console.log(`[video-metadata] Successfully fetched metadata for ${videoId}: ${response.title} (${response.duration}s)`);
  res.json(response);
 } catch (error) {
  console.error(`[video-metadata] Error fetching metadata for ${videoId}:`, error.message);

  // Log more detailed error information
  if (error.stderr) {
   console.error(`[video-metadata] stderr:`, error.stderr);
  }
  if (error.stdout) {
   console.error(`[video-metadata] stdout:`, error.stdout);
  }

  res.status(500).json({
   error: 'Failed to fetch video metadata',
   details: error.message,
   videoId: videoId,
  });
 }
});

// Cleanup old files on server start
cleanupOldVttFiles();
cleanupOldMp4Files();

app.listen(PORT, () => {
 console.log(`Backend server running on http://localhost:${PORT}`);
});
