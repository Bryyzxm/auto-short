# AI YouTube to Shorts Segmenter

An intelligent tool that automatically segments YouTube videos into short clips using AI-powered transcript analysis.

## Features

- **Primary Transcript Method**: yt-dlp for maximum reliability
- **AI-Powered Segmentation**: Uses Google Gemini AI for intelligent content analysis
- **Multiple Fallback Methods**: Ensures transcript availability
- **Enhanced Cookie Support**: Bypasses YouTube restrictions
- **Real-time Performance Monitoring**: Track transcript success rates

## Prerequisites

- **Node.js** (v16 or higher)
- **yt-dlp** (Primary transcript method - HIGHLY RECOMMENDED)
- **FFmpeg** (for video processing)

## Quick Setup

### 1. Install yt-dlp (Primary Transcript Method)

**Option A: Using pip (Recommended)**
```bash
pip install yt-dlp
```

**Option B: Download binary**
- Download from: https://github.com/yt-dlp/yt-dlp/releases
- Add to your system PATH

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Configure Environment
1. Copy `.env.example` to `.env`
2. Set your `VITE_GEMINI_API_KEY` in the `.env` file
3. (Optional) Configure `YOUTUBE_COOKIES` for enhanced access

### 4. Run the Application
```bash
npm run dev
```

## Transcript Method Priority

1. **yt-dlp** (Primary) - Most reliable, supports auto-generated and manual subtitles
2. **Enhanced yt-dlp** (Fallback) - Aggressive extraction with all subtitle formats
3. **TimedText API** (Secondary) - YouTube's native API
4. **LemnosLife API** (Tertiary) - Community API
5. **YouTube Data API v3** (Quaternary) - Official Google API
6. **Whisper.cpp + yt-dlp** (Last resort) - Audio transcription
# Force rebuild Tue, Jul  8, 2025 12:22:53 PM
