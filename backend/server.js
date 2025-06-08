// Simple Express backend for YouTube video download & segment cut
import express from 'express';
import cors from 'cors';
import {execFile} from 'child_process';
import {v4 as uuidv4} from 'uuid';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 5001;
const OUTPUT_DIR = path.join(process.cwd(), 'outputs');

app.use(cors());
app.use(express.json());

if (!fs.existsSync(OUTPUT_DIR)) {
 fs.mkdirSync(OUTPUT_DIR);
}

// Endpoint: POST /api/shorts
// Body: { youtubeUrl, start, end }
app.post('/api/shorts', async (req, res) => {
 const {youtubeUrl, start, end, aspectRatio} = req.body;
 if (!youtubeUrl || typeof start !== 'number' || typeof end !== 'number') {
  return res.status(400).json({error: 'youtubeUrl, start, end (in seconds) required'});
 }
 const id = uuidv4();
 const tempFile = path.join(OUTPUT_DIR, `${id}.mp4`);

 // Compose yt-dlp command
 const ytDlpArgs = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '-o', tempFile, youtubeUrl];

 execFile('yt-dlp', ytDlpArgs, (err) => {
  if (err) {
   return res.status(500).json({error: 'yt-dlp failed', details: err.message});
  }
  // After download, cut segment
  const cutFile = path.join(OUTPUT_DIR, `${id}-short.mp4`);
  // ffmpeg: crop to 9:16, cut segment
  let ffmpegArgs;
  if (aspectRatio === 'original') {
   // Hanya cut, tidak crop
   ffmpegArgs = ['-y', '-i', tempFile, '-ss', String(start), '-to', String(end), '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', cutFile];
  } else {
   // Default: crop ke 9:16
   ffmpegArgs = ['-y', '-i', tempFile, '-ss', String(start), '-to', String(end), '-vf', 'crop=in_h*9/16:in_h', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', cutFile];
  }
  execFile('ffmpeg', ffmpegArgs, (err2) => {
   // Clean up tempFile
   fs.unlink(tempFile, () => {});
   if (err2) {
    return res.status(500).json({error: 'ffmpeg failed', details: err2.message});
   }
   // Respond with download link
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

// Endpoint: GET /api/yt-transcript?videoId=...
app.get('/api/yt-transcript', async (req, res) => {
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});
 const id = uuidv4();
 const outputVtt = path.join(OUTPUT_DIR, `${id}.vtt`);
 // yt-dlp --write-auto-subs --sub-lang=id,en --skip-download -o <output> <url>
 const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
 const subLang = lang ? String(lang) : 'id,en';
 const ytDlpArgs = ['--write-auto-subs', '--sub-lang', subLang, '--skip-download', '-o', path.join(OUTPUT_DIR, `${id}`), ytUrl];
 execFile('yt-dlp', ytDlpArgs, async (err) => {
  if (err) {
   return res.status(500).json({error: 'yt-dlp subtitle fetch failed', details: err.message});
  }
  // Cari file .id.vtt (Indonesia) lebih dulu, jika tidak ada baru cari .en.vtt
  let vttFile = null;
  const files = fs.readdirSync(OUTPUT_DIR);
  for (const file of files) {
   if (file.startsWith(id) && file.endsWith('.id.vtt')) {
    vttFile = path.join(OUTPUT_DIR, file);
    break;
   }
  }
  // Jika tidak ada .id.vtt, cari .en.vtt
  if (!vttFile) {
   for (const file of files) {
    if (file.startsWith(id) && file.endsWith('.en.vtt')) {
     vttFile = path.join(OUTPUT_DIR, file);
     break;
    }
   }
  }
  if (!vttFile) {
   return res.status(404).json({error: 'Subtitle file not found (no .vtt generated for id or en)'});
  }
  // Baca dan parse VTT
  try {
   let vttContent = fs.readFileSync(vttFile, 'utf-8');
   // Hapus file setelah dibaca
   fs.unlinkSync(vttFile);
   // Bersihkan metadata WebVTT
   vttContent = vttContent
    .replace(/align:[^\n]+/g, '')
    .replace(/position:[^\n]+/g, '')
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<c>|<\/c>/g, '')
    .replace(/WEBVTT[^\n]*\n/g, '')
    .replace(/NOTE[^\n]*\n/g, '')
    .replace(/\n{2,}/g, '\n');
   // Parse VTT ke array segmen {start, end, text}
   const segments = [];
   const regex = /([0-9:.]+) --> ([0-9:.]+)\s+([\s\S]*?)(?=\n\d|$)/g;
   let match;
   while ((match = regex.exec(vttContent)) !== null) {
    // Bersihkan spasi ekstra
    const cleanText = match[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanText) {
     segments.push({
      start: match[1],
      end: match[2],
      text: cleanText,
     });
    }
   }
   res.json({segments});
  } catch (e) {
   return res.status(500).json({error: 'Failed to parse VTT', details: e.message});
  }
 });
});

// Serve outputs statically
app.use('/outputs', express.static(OUTPUT_DIR));

app.listen(PORT, () => {
 console.log(`Backend server running on http://localhost:${PORT}`);
});
