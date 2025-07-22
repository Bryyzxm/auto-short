# 🚀 **Checklist Deployment Lengkap**

## ✅ **Pre-Deployment Checklist**

### **Backend (Railway) Setup**

- [ ] **Docker Configuration**

  - [ ] `backend/Dockerfile` sudah optimal untuk production
  - [ ] FFmpeg dan yt-dlp terinstall dengan benar
  - [ ] Health check endpoint `/health` berfungsi
  - [ ] Non-root user configuration untuk security

- [ ] **Environment Variables di Railway**

  ```bash
  NODE_ENV=production
  PORT=${PORT}  # Railway auto-assigns
  CORS_ORIGINS=https://auto-short.vercel.app,https://auto-short-git-main-bryyzxms-projects.vercel.app
  GROQ_API_KEY=your_groq_key_here  # Optional untuk AI features
  ```

- [ ] **Railway Configuration**
  - [ ] Repository connected ke Railway
  - [ ] `railway.toml` file sudah dikonfigurasi
  - [ ] Deploy branch set ke `main`

### **Frontend (Vercel) Setup**

- [ ] **Environment Variables di Vercel**

  ```bash
  VITE_BACKEND_URL=https://your-railway-app.up.railway.app
  VITE_GROQ_API_KEY=your_groq_key_here
  VITE_GEMINI_API_KEY=your_gemini_key_here  # Backup AI
  ```

- [ ] **Vercel Configuration**
  - [ ] Repository connected ke Vercel
  - [ ] Build Command: `npm run build`
  - [ ] Output Directory: `dist`
  - [ ] Framework Preset: `Vite`

## 🔍 **Post-Deployment Verification**

### **1. Backend Health Check**

```bash
# Test endpoint utama
curl https://your-railway-app.up.railway.app/health

# Expected Response:
{
  "status": "healthy",
  "uptime": 123.45,
  "memory": {...},
  "timestamp": "2025-01-22T..."
}
```

### **2. CORS Verification**

```javascript
// Test dari browser console di domain Vercel Anda
fetch('https://your-railway-app.up.railway.app/health')
 .then((r) => r.json())
 .then(console.log)
 .catch(console.error);
```

### **3. Video Processing Test**

```bash
# Test download + cut functionality
curl -X POST https://your-railway-app.up.railway.app/api/shorts \
  -H "Content-Type: application/json" \
  -d '{
    "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "start": 10,
    "end": 30,
    "aspectRatio": "9:16"
  }'
```

### **4. Frontend Integration Test**

- [ ] Akses `https://your-vercel-app.vercel.app`
- [ ] Cek Console untuk "Using backend URL: ..." message
- [ ] Test input YouTube URL
- [ ] Verifikasi API calls berhasil (Network tab)

## 🐛 **Common Issues & Solutions**

### **CORS Errors**

```bash
# Pastikan CORS_ORIGINS di Railway sesuai domain Vercel
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

### **Backend 500 Errors**

```bash
# Check Railway logs
railway logs --tail

# Common fixes:
# 1. yt-dlp not installed → Check Dockerfile
# 2. FFmpeg missing → Verify apt-get install
# 3. File permissions → Use non-root user in Docker
```

### **Environment Variables Missing**

```bash
# Vercel: Pastikan VITE_ prefix
VITE_BACKEND_URL=https://...

# Railway: Check uppercase/lowercase
NODE_ENV=production  # Bukan node_env
```

### **Railway Cold Start**

```bash
# First request mungkin lambat (cold start)
# Solusi: Implement health check di frontend dengan retry logic
```

## ⚡ **Performance Optimization**

### **Backend (Railway)**

- [ ] Memory usage monitoring < 512MB
- [ ] Request timeout configured (60s untuk video processing)
- [ ] File cleanup automation active
- [ ] CORS origins restrictive (tidak wildcard \*)

### **Frontend (Vercel)**

- [ ] Static assets cached (automatic)
- [ ] Build bundle < 2MB
- [ ] Environment variables loaded correctly
- [ ] API client dengan proper error handling

## 🔐 **Security Checklist**

- [ ] **Secrets Management**

  - [ ] Tidak ada API keys di git repository
  - [ ] Environment variables set di platform dashboards
  - [ ] `.env` files di `.gitignore`

- [ ] **CORS Security**

  - [ ] Specific origins (tidak menggunakan `*`)
  - [ ] Credentials: false (kecuali diperlukan)
  - [ ] Methods restrictive

- [ ] **Docker Security**
  - [ ] Non-root user di container
  - [ ] Minimal base image (node:18-slim)
  - [ ] No secrets dalam Dockerfile

## 🚀 **Ready to Deploy**

Jika semua checklist ✅, Anda siap untuk deploy:

```bash
# Deploy ke Railway (automatic dari git push)
git add .
git commit -m "🚀 Production deployment ready"
git push origin main

# Deploy ke Vercel (automatic atau manual)
vercel --prod
```

## 📊 **Post-Deployment Monitoring**

### **Railway Metrics**

- CPU usage < 80%
- Memory usage < 400MB
- Response time < 5s (normal requests)
- Response time < 60s (video processing)

### **Vercel Analytics**

- Build success rate: 100%
- Function execution time < 10s
- Core Web Vitals: Good

---

## 🆘 **Emergency Contacts & Resources**

- **Railway Logs**: `railway logs --tail`
- **Vercel Logs**: Dashboard → Functions → View Details
- **Health Endpoints**:
  - Backend: `https://your-app.up.railway.app/health`
  - Frontend: `https://your-app.vercel.app` (should load React app)

**Troubleshooting Priority:**

1. Check environment variables
2. Verify CORS configuration
3. Test API endpoints individually
4. Check Railway/Vercel logs
5. Verify Docker build success
