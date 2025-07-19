# 🚀 **Deployment Configuration Guide**

## 📋 **Environment Variables untuk Production**

### **Vercel (Frontend)**

Set di Vercel Dashboard → Project Settings → Environment Variables:

```bash
# Groq API (Primary AI Service - FREE)
VITE_GROQ_API_KEY=your_groq_api_key_here

# Gemini API (Backup AI Service)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Backend URL (Railway)
VITE_BACKEND_URL=https://auto-short-production.up.railway.app
```

### **Railway (Backend)**

Set di Railway Dashboard → Variables:

```bash
# Port configuration
PORT=5001

# Node environment
NODE_ENV=production

# CORS origins (comma separated)
CORS_ORIGINS=https://auto-short.vercel.app,https://your-vercel-domain.vercel.app
```

---

## 🔧 **Vercel Configuration**

### **vercel.json**

```json
{
 "buildCommand": "npm run build",
 "outputDirectory": "dist",
 "framework": "vite",
 "rewrites": [
  {
   "source": "/api/(.*)",
   "destination": "/api/$1"
  }
 ],
 "functions": {
  "app.js": {
   "maxDuration": 30
  }
 }
}
```

---

## 🚂 **Railway Configuration**

### **Dockerfile** (if using Docker)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5001

CMD ["node", "server.js"]
```

### **railway.json**

```json
{
 "$schema": "https://railway.app/railway.schema.json",
 "build": {
  "builder": "NIXPACKS"
 },
 "deploy": {
  "startCommand": "node server.js",
  "restartPolicyType": "ON_FAILURE",
  "restartPolicyMaxRetries": 10
 }
}
```

---

## 🌍 **Domain Setup**

### **Production URLs**

- **Frontend (Vercel)**: `https://auto-short.vercel.app`
- **Backend (Railway)**: `https://auto-short-production.up.railway.app`

### **Custom Domain (Optional)**

1. **Vercel**: Add custom domain di Project Settings
2. **Railway**: Add custom domain di Project Settings

---

## ⚡ **Performance Optimizations**

### **Frontend (Vercel)**

- ✅ Static file caching (automatic)
- ✅ CDN distribution (automatic)
- ✅ Build optimization (Vite)
- ✅ Environment variable caching

### **Backend (Railway)**

- ✅ Keep-alive connections
- ✅ Response compression
- ✅ File cleanup automation
- ✅ Memory usage optimization

---

## 🔍 **Health Check URLs**

### **Frontend Health**

```
GET https://auto-short.vercel.app/
Response: 200 OK (React app loads)
```

### **Backend Health**

```
GET https://auto-short-production.up.railway.app/
Response: {"status":"ok","message":"AI YouTube to Shorts Backend is running"}
```

### **API Endpoints**

```
GET https://auto-short-production.up.railway.app/api/yt-transcript?videoId=dQw4w9WgXcQ
POST https://auto-short-production.up.railway.app/api/shorts
GET https://auto-short-production.up.railway.app/api/video-metadata?videoId=dQw4w9WgXcQ
```

---

## 🐛 **Troubleshooting**

### **Common Issues**

1. **CORS Error**

   ```bash
   # Add to Railway environment variables
   CORS_ORIGINS=https://auto-short.vercel.app
   ```

2. **API Key Missing**

   ```bash
   # Set in Vercel environment variables
   VITE_GROQ_API_KEY=your_key_here
   ```

3. **Backend Not Found**

   ```bash
   # Check Railway deployment status
   # Verify VITE_BACKEND_URL in Vercel
   ```

4. **Build Failures**
   ```bash
   # Clear cache and rebuild
   npm run build
   ```

---

## 📊 **Monitoring**

### **Vercel Analytics**

- Function logs: Vercel Dashboard → Functions
- Build logs: Vercel Dashboard → Deployments
- Performance metrics: Built-in analytics

### **Railway Metrics**

- CPU/Memory usage: Railway Dashboard → Metrics
- Request logs: Railway Dashboard → Logs
- Deployment status: Railway Dashboard → Deployments

---

## 🔐 **Security**

### **Environment Variables**

- ✅ Never commit `.env` files
- ✅ Use `VITE_` prefix for frontend vars
- ✅ Set production values in platform dashboards

### **CORS Configuration**

```javascript
// backend/server.js
app.use(
 cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
 })
);
```

---

## 🚀 **Deployment Commands**

### **Vercel Deployment**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Or via Git (automatic)
git push origin main
```

### **Railway Deployment**

```bash
# Connect GitHub repo
# Automatic deployment on push

# Or via Railway CLI
railway deploy
```

---

_Configuration optimized for production deployment with fallback systems and error handling._
