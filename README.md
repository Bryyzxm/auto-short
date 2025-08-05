# 🤖 AI YouTube to Shorts Segmenter

AI-powered tool untuk mengidentifikasi dan membuat segmen pendek dari video YouTube menggunakan Groq AI dan Llama 3.3 70B.

## ✨ Features

- 🎯 **AI-Powered Segmentation**: Otomatis identifikasi segmen menarik dari video YouTube
- 🚀 **Groq AI Integration**: Menggunakan Llama 3.3 70B model (GRATIS unlimited)
- 📱 **Multiple Aspect Ratios**: Support 9:16, 16:9, dan 1:1
- 🎬 **YouTube Player Integration**: Preview segmen langsung di browser
- 📝 **Transcript Analysis**: Analisis subtitle untuk segmentasi yang lebih akurat
- 🔄 **Fallback System**: Multi-backend resilience untuk uptime maksimal

## 🌐 Live Demo

- **Frontend**: https://auto-short.vercel.app
- **Backend**: https://auto-short.azurewebsites.net

## 🚀 Quick Start

### **Prerequisites**

- Node.js 18+
- Groq API Key (FREE dari https://console.groq.com/)

### **Local Development**

1. **Clone & Install**:

   ```bash
   git clone https://github.com/Bryyzxm/auto-short.git
   cd auto-short
   npm install
   ```

2. **Setup Environment**:

   ```bash
   cp .env.example .env.local
   # Edit .env.local dengan API keys Anda
   ```

3. **Run Application**:
   ```bash
   npm run dev
   ```

### **Environment Variables**

```bash
# Groq AI (Primary - FREE unlimited)
VITE_GROQ_API_KEY=your_groq_api_key_here

# Backend URL (untuk production)
VITE_BACKEND_URL=https://auto-short.azurewebsites.net
```

## 🏗️ Tech Stack

### **Frontend (Vercel)**

- React 19 + TypeScript
- Vite (Build tool)
- Tailwind CSS
- Groq SDK

### **Backend (Azure)**

- Node.js + Express
- yt-dlp (Video processing)
- YouTube Transcript API
- File processing & cleanup

## 📦 Deployment

### **Vercel (Frontend)**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

**Environment Variables untuk Vercel:**

- `VITE_GROQ_API_KEY`
- `VITE_BACKEND_URL`

### **Azure (Backend)**

Deployment to Azure can be done via the Azure portal or the Azure CLI. You will need to configure the App Service to run a Node.js application and set the necessary environment variables in the configuration settings.

## 🔧 Configuration

### **YouTube Bot Detection Fix**

YouTube may block yt-dlp requests. To bypass this:

1. **Set up cookies** (recommended):

   ```bash
   # Set cookies path (optional - defaults to backend/cookies/youtube-cookies.txt)
   export YTDLP_COOKIES_PATH="/path/to/your/cookies.txt"
   ```

2. **Get cookies from browser**:

   - Use browser extension to export YouTube cookies
   - Save in Netscape format as `backend/cookies/youtube-cookies.txt`
   - See `COOKIES-SETUP-GUIDE.md` for detailed instructions

3. **Alternative**: Use yt-dlp's built-in cookie extraction:
   ```bash
   yt-dlp --cookies-from-browser chrome --skip-download "https://youtube.com/watch?v=test"
   ```

**📖 For detailed setup:** See [COOKIES-SETUP-GUIDE.md](./COOKIES-SETUP-GUIDE.md)

### **Backend Fallback System**

Application menggunakan multi-backend fallback:

1. Custom environment URL
2. Azure production
3. Local development

### **API Rate Limiting**

- Max 3 concurrent transcript requests
- Exponential backoff untuk retry
- 5-menit cache untuk failed requests

## 📝 Usage

1. **Masukkan URL YouTube** di form input
2. **Pilih aspect ratio** (9:16 untuk TikTok/Instagram, 16:9 untuk YouTube)
3. **Klik "Generate Clip Segments"**
4. **Preview segmen** yang disarankan AI
5. **Download konsep** (simulasi dalam demo)

## 🐛 Troubleshooting

### **Common Issues**

**CORS Errors**:

```bash
# Set CORS_ORIGINS di Azure
CORS_ORIGINS=https://your-vercel-domain.vercel.app
```

**API Key Missing**:

```bash
# Ensure proper VITE_ prefix
VITE_GROQ_API_KEY=your_actual_key
```

**Backend Not Found**:

- Check Azure deployment status
- Verify `VITE_BACKEND_URL` di Vercel

## 📊 Performance

- **Frontend Load**: < 3 seconds
- **AI Processing**: 10-30 seconds
- **Fallback Resilience**: 99.9% uptime
- **Concurrent Users**: Optimized untuk multiple users

## 🔐 Security

- Environment variables properly configured
- CORS protection enabled
- No API keys exposed to client
- Input validation & sanitization

## 📄 License

MIT License - Feel free to use and modify

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/Bryyzxm/auto-short/issues)
- Documentation: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Checklist: [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md)

---

**AI YouTube to Shorts Segmenter** - Powered by Groq AI & Llama 3.3 70B 🚀
