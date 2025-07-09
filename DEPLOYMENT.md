# Deployment Guide

## GitHub Pages Deployment

Aplikasi ini sudah dikonfigurasi untuk deployment otomatis ke GitHub Pages menggunakan GitHub Actions.

### Setup

1. **Fork atau Clone Repository**
   ```bash
   git clone https://github.com/bryyzxm/ai-youtube-to-shorts-segmenter.git
   cd ai-youtube-to-shorts-segmenter
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment Variables di GitHub**
   - Buka repository di GitHub
   - Pergi ke Settings > Secrets and variables > Actions
   - Tambahkan secrets berikut:
     - `VITE_GEMINI_API_KEY`: API key untuk Google Gemini
     - `VITE_API_URL`: URL backend Railway (opsional)

4. **Enable GitHub Pages**
   - Pergi ke Settings > Pages
   - Source: Deploy from a branch
   - Branch: gh-pages
   - Folder: / (root)

### Manual Deployment

Jika ingin deploy manual:

```bash
# Build aplikasi
npm run build

# Deploy ke GitHub Pages
npm run deploy
```

## Backend Configuration

Backend sudah di-deploy di Railway dengan URL:
`https://auto-short-backend-production.up.railway.app`

Frontend sudah dikonfigurasi untuk menggunakan URL ini secara otomatis.

## Environment Variables

### Frontend (.env)
```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Backend (Railway)
```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=5001
```

## URLs

- **Frontend (GitHub Pages)**: https://bryyzxm.github.io/ai-youtube-to-shorts-segmenter
- **Backend (Railway)**: https://auto-short-backend-production.up.railway.app
- **API Documentation**: https://auto-short-backend-production.up.railway.app/api/docs

## Features

- ✅ Multi-source transcript fetching
- ✅ AI-powered content segmentation
- ✅ Real-time statistics and monitoring
- ✅ Proxy rotation for reliability
- ✅ Comprehensive error handling
- ✅ Cache management
- ✅ Performance analytics

## API Endpoints

- `GET /api/transcript-stats` - Get transcript statistics
- `POST /api/transcript` - Get video transcript
- `POST /api/segment` - Segment content with AI
- `GET /api/performance` - Get performance metrics
- `POST /api/reset-stats` - Reset statistics
- `DELETE /api/cache` - Clear cache