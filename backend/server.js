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

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization']}));
app.use(express.json());

// Fallback: tambahkan header CORS manual untuk semua response
app.use((req, res, next) => {
 res.header('Access-Control-Allow-Origin', '*');
 res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
 res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
 next();
});

// Fungsi untuk menghapus duplikasi frasa antar segmen subtitle
function cleanSegments(segments) {
 const seen = new Set();
 return segments.filter((seg) => {
  const norm = seg.text
   .toLowerCase()
   .replace(/[^a-z0-9 ]/gi, '')
   .replace(/\s+/g, ' ');
  if (seen.has(norm)) return false;
  seen.add(norm);
  return true;
 });
}

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
 console.time(`[${id}] yt-dlp download`);

 // Compose yt-dlp command (download full video)
 const ytDlpArgs = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '-o', tempFile, youtubeUrl];

 execFile('yt-dlp', ytDlpArgs, (err) => {
  console.timeEnd(`[${id}] yt-dlp download`);
  if (err) {
   return res.status(500).json({error: 'yt-dlp failed', details: err.message});
  }
  // After download, cut segment
  const cutFile = path.join(process.cwd(), `${id}-short.mp4`);
  let ffmpegArgs;
  if (aspectRatio === 'original') {
   ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile, '-c', 'copy', cutFile];
  } else {
   ffmpegArgs = ['-y', '-ss', String(start), '-to', String(end), '-i', tempFile, '-vf', 'crop=in_h*9/16:in_h', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', cutFile];
  }
  console.time(`[${id}] ffmpeg cut`);
  execFile('ffmpeg', ffmpegArgs, (err2) => {
   console.timeEnd(`[${id}] ffmpeg cut`);
   fs.unlink(tempFile, () => {});
   if (err2) {
    return res.status(500).json({error: 'ffmpeg failed', details: err2.message});
   }
   console.log(`[${id}] Selesai proses. Download: /outputs/${path.basename(cutFile)}`);
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
 res.setHeader('Access-Control-Allow-Origin', '*');
 const {videoId, lang} = req.query;
 if (!videoId) return res.status(400).json({error: 'videoId required'});
 const id = uuidv4();
 const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
 const subLang = lang ? String(lang) : 'id,en';
 const ytDlpArgs = ['--write-auto-subs', '--sub-lang', subLang, '--skip-download', '-o', path.join(process.cwd(), `${id}`), ytUrl];
 try {
  await new Promise((resolve, reject) => {
   execFile('yt-dlp', ytDlpArgs, (err) => {
    if (err) reject(err);
    else resolve();
   });
  });
  // Cari file .id.vtt (Indonesia) lebih dulu, jika tidak ada baru cari .en.vtt
  let vttFile = null;
  const files = fs.readdirSync(process.cwd());
  for (const file of files) {
   if (file.startsWith(id) && file.endsWith('.id.vtt')) {
    vttFile = path.join(process.cwd(), file);
    break;
   }
  }
  if (!vttFile) {
   for (const file of files) {
    if (file.startsWith(id) && file.endsWith('.en.vtt')) {
     vttFile = path.join(process.cwd(), file);
     break;
    }
   }
  }
  if (!vttFile) {
   throw new Error('Subtitle file not found (no .vtt generated for id or en)');
  }
  // Baca dan parse VTT
  let vttContent = fs.readFileSync(vttFile, 'utf-8');
  fs.unlinkSync(vttFile);
  vttContent = vttContent
   .replace(/align:[^\n]+/g, '')
   .replace(/position:[^\n]+/g, '')
   .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
   .replace(/<c>|<\/c>/g, '')
   .replace(/WEBVTT[^\n]*\n/g, '')
   .replace(/NOTE[^\n]*\n/g, '')
   .replace(/\n{2,}/g, '\n');
  const segments = [];
  const regex = /([0-9:.]+) --> ([0-9:.]+)\s+([\s\S]*?)(?=\n\d|$)/g;
  let match;
  while ((match = regex.exec(vttContent)) !== null) {
   const cleanText = match[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
   if (cleanText) {
    segments.push({
     start: match[1],
     end: match[2],
     text: cleanText,
    });
   }
  }
  res.json({segments: cleanSegments(segments)});
 } catch (e) {
  console.error('yt-dlp transcript fetch failed:', e);
  // Fallback: coba fetch dari LemnosLife API
  try {
   const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
   const apiRes = await fetch(apiUrl);
   if (!apiRes.ok) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(apiRes.status).json({error: 'Failed to fetch transcript from LemnosLife', status: apiRes.status});
   }
   const data = await apiRes.json();
   if (!data || !data.transcript || !Array.isArray(data.transcript)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({error: 'No transcript found from LemnosLife'});
   }
   // LemnosLife format: {transcript: [{text, offset, duration}]}
   const segments = data.transcript.map((seg) => ({
    start: seg.offset,
    end: seg.offset + seg.duration,
    text: seg.text,
   }));
   res.json({segments: cleanSegments(segments)});
  } catch (fallbackErr) {
   console.error('Fallback LemnosLife transcript fetch failed:', fallbackErr);
   res.setHeader('Access-Control-Allow-Origin', '*');
   return res.status(500).json({error: 'Failed to fetch transcript from both yt-dlp and LemnosLife', details: fallbackErr.message});
  }
 }
});

// Endpoint baru: Mendapatkan durasi video dari file .vtt
app.get('/api/video-meta', async (req, res) => {
 res.setHeader('Access-Control-Allow-Origin', '*');
 const id = req.query.videoId;
 if (!id) return res.status(400).json({error: 'videoId is required'});
 // Cari file .id.vtt atau .en.vtt
 let vttFile = null;
 const files = fs.readdirSync(process.cwd());
 for (const file of files) {
  if (file.startsWith(id) && (file.endsWith('.id.vtt') || file.endsWith('.en.vtt'))) {
   vttFile = path.join(process.cwd(), file);
   break;
  }
 }
 if (!vttFile) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(404).json({error: 'Subtitle file not found for this videoId'});
 }
 try {
  const vttContent = fs.readFileSync(vttFile, 'utf-8');
  // Cari timestamp terakhir di file VTT
  const matches = [...vttContent.matchAll(/([0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}) --> ([0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3})/g)];
  if (matches.length === 0) return res.status(400).json({error: 'No segments found in VTT'});
  const last = matches[matches.length - 1][2]; // ambil end time segmen terakhir
  // Konversi ke detik
  const [h, m, s] = last.split(':');
  const duration = Math.round(parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s));
  res.json({duration});
 } catch (e) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(500).json({error: 'Failed to read VTT', details: e.message});
 }
});

app.listen(PORT, () => {
 console.log(`Backend server running on http://localhost:${PORT}`);
});
