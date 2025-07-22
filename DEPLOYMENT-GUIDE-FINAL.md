# 🚀 **Panduan Deployment Lengkap - AI YouTube to Shorts**

## **1. Konfigurasi Backend di Railway (PALING KRITIS)**

### **a. Dockerfile Optimized untuk Production**

File `backend/Dockerfile` sudah dikonfigurasi dengan:

- ✅ Node.js 18 LTS dengan base image slim
- ✅ FFmpeg dan yt-dlp terbaru (2025.07.21)
- ✅ Security dengan non-root user
- ✅ Health check endpoint
- ✅ Optimisasi size dan performance

### **b. Environment Variables di Railway Dashboard**

```bash
NODE_ENV=production
PORT=${PORT}
CORS_ORIGINS=https://your-vercel-app.vercel.app,https://your-vercel-app-git-main-username.vercel.app
GROQ_API_KEY=your_groq_key_here  # Optional untuk AI features
```

**PENTING:** Ganti `your-vercel-app` dengan nama project Vercel Anda yang sebenarnya!

### **c. Deploy ke Railway**

1. Connect repository ke Railway
2. Set build source ke `backend/` folder
3. Railway akan otomatis detect `Dockerfile`
4. Set environment variables seperti di atas
5. Deploy akan berjalan otomatis

---

## **2. Konfigurasi Frontend di Vercel**

### **a. Settings di Vercel Dashboard**

- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Root Directory:** `./` (root project)

### **b. Environment Variables di Vercel**

```bash
VITE_BACKEND_URL=https://your-railway-app.up.railway.app
VITE_GROQ_API_KEY=your_groq_key_here
VITE_GEMINI_API_KEY=your_gemini_key_here
```

**Cara mendapat Railway URL:** Railway Dashboard → Your Project → Copy deployment URL

### **c. Deploy ke Vercel**

```bash
# Install Vercel CLI (optional)
npm i -g vercel

# Deploy (atau gunakan Git integration)
vercel --prod
```

---

## **3. Checklist Verifikasi Final**

### **✅ Pre-Deployment**

- [ ] Backend `Dockerfile` sudah dioptimalkan
- [ ] Environment variables Railway sudah diset
- [ ] Environment variables Vercel sudah diset
- [ ] CORS_ORIGINS sesuai dengan domain Vercel Anda

### **✅ Post-Deployment Testing**

#### **Test 1: Backend Health Check**

```bash
curl https://your-railway-app.up.railway.app/health
```

Expected: `{"status":"healthy",...}`

#### **Test 2: Frontend Loading**

Buka `https://your-vercel-app.vercel.app` dan check console:

```
[CONFIG] Using backend URL: https://your-railway-app.up.railway.app
```

#### **Test 3: CORS Working**

Dari browser di domain Vercel, buka Developer Console:

```javascript
fetch('https://your-railway-app.up.railway.app/health')
 .then((r) => r.json())
 .then(console.log);
```

Tidak boleh ada CORS error.

#### **Test 4: Video Processing**

Gunakan form di frontend untuk test download video YouTube.

---

## **🐛 Common Issues & Quick Fixes**

### **❌ CORS Error**

**Problem:** `Access to fetch blocked by CORS policy`
**Solution:**

```bash
# Railway Environment Variables
CORS_ORIGINS=https://exact-vercel-domain.vercel.app
```

### **❌ Backend 500 Error**

**Problem:** Server error saat process video
**Solution:** Check Railway logs:

```bash
railway logs --tail
```

Common fix: Pastikan FFmpeg dan yt-dlp terinstall di Docker.

### **❌ Environment Variable Not Found**

**Problem:** `VITE_BACKEND_URL is undefined`
**Solution:**

- Vercel: Pastikan prefix `VITE_`
- Railway: Pastikan uppercase `NODE_ENV` bukan `node_env`

### **❌ Railway Cold Start**

**Problem:** First request timeout
**Solution:** Normal behavior, tunggu 10-15 detik untuk warm up.

---

## **🚀 Ready to Go!**

Jika semua checklist ✅ dan testing berhasil, aplikasi Anda siap production!

**Live URLs:**

- Frontend: `https://your-app.vercel.app`
- Backend API: `https://your-app.up.railway.app`
- Health Check: `https://your-app.up.railway.app/health`

**Monitoring:**

- Railway: Dashboard → Metrics & Logs
- Vercel: Dashboard → Analytics & Functions

---

## **📞 Emergency Troubleshooting**

1. **Check environment variables** (90% masalah ada di sini)
2. **Verify CORS configuration**
3. **Test API endpoints individually**
4. **Check Railway/Vercel deployment logs**
5. **Verify Docker build success**

**Pro Tip:** Gunakan Railway health endpoint untuk monitoring uptime dan Vercel analytics untuk performance tracking.
