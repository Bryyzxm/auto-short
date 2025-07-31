import ytdlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript';
import { TranscriptDisabledError, NoValidTranscriptError } from './transcriptErrors.js';

const YT_DLP_PATH = process.platform === 'win32' ? path.join(process.cwd(), 'yt-dlp.exe') : 'yt-dlp';
const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || path.join(process.cwd(), 'cookies', 'cookies.txt');

async function extract(videoId, options = {}) {
  const { lang = ['en', 'id'] } = options;
  console.log(`[ROBUST-V2] Starting extraction for ${videoId}`);

  // Strategy 1: Try youtube-transcript API first
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: lang[0] });
    if (transcript && transcript.length > 0) {
      console.log(`[ROBUST-V2] ✅ Success with YouTube Transcript API for ${videoId}`);
      return { segments: transcript, source: 'youtube-transcript' };
    }
  } catch (error) {
    console.log(`[ROBUST-V2] YouTube Transcript API failed: ${error.message}`);
    if (/transcripts disabled/i.test(error.message)) {
      throw new TranscriptDisabledError(error.message);
    }
  }

  // Strategy 2: Fallback to yt-dlp with cookies
  console.log('[ROBUST-V2] Strategy 2: Enhanced yt-dlp');
  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error('Cookies file not found for robust extraction.');
  }

  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const tempFile = path.join(tempDir, `${videoId}-${Date.now()}`);

  const args = [
    `https://www.youtube.com/watch?v=${videoId}`,
    '--write-subs',
    '--write-auto-subs',
    '--sub-lang', lang.join(','),
    '--sub-format', 'srv3/ttml/vtt',
    '--skip-download',
    '--output', `${tempFile}.%(ext)s`,
    '--cookies', COOKIES_PATH,
  ];

  try {
    await ytdlp.exec(args, { shell: true });
    const vttFile = fs.readdirSync(tempDir).find(f => f.startsWith(path.basename(tempFile)) && f.endsWith('.vtt'));
    if (vttFile) {
      const vttContent = fs.readFileSync(path.join(tempDir, vttFile), 'utf-8');
      fs.unlinkSync(path.join(tempDir, vttFile)); // Clean up
      // Basic VTT to JSON conversion
      const segments = vttContent.split('\n\n').slice(1).map(block => {
        const lines = block.split('\n');
        const [start, end] = lines[0].split(' --> ');
        const text = lines.slice(1).join(' ');
        return { start, end, text };
      });
      console.log(`[ROBUST-V2] ✅ Success with yt-dlp for ${videoId}`);
      return { segments, source: 'yt-dlp' };
    }
  } catch (error) {
    console.error(`[ROBUST-V2] yt-dlp failed: ${error.message}`);
    if (/Sign in to confirm you’re not a bot/i.test(error.message)) {
        throw new Error('yt-dlp failed due to bot detection. Cookies may be invalid or expired.');
    }
  }

  throw new NoValidTranscriptError('All robust extraction strategies failed.');
}

export default {
  extract,
};
