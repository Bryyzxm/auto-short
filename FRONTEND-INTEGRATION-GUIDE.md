# 🔗 **Frontend Integration Guide - Migrasi ke Fly.io**

## Overview

Panduan lengkap untuk mengupdate frontend (Vercel) agar dapat berkomunikasi dengan backend yang telah dimigrasi ke Fly.io.

## 🚀 **Langkah-Langkah Update Frontend**

### **1. Update Environment Variables di Vercel**

#### **Melalui Vercel Dashboard:**

1. Login ke [Vercel Dashboard](https://vercel.com/dashboard)
2. Pilih project `auto-short`
3. Klik **Settings** → **Environment Variables**
4. Update variabel berikut:

```bash
# Before (Railway)
VITE_BACKEND_URL=https://auto-short-production.up.railway.app

# After (Fly.io)
VITE_BACKEND_URL=https://ai-youtube-shorts-backend.fly.dev
```

#### **Melalui Vercel CLI:**

```powershell
# Install Vercel CLI jika belum
npm i -g vercel

# Login
vercel login

# Set environment variable
vercel env add VITE_BACKEND_URL production
# Masukkan: https://ai-youtube-shorts-backend.fly.dev

# Verify
vercel env ls
```

### **2. Update Local Development Environment**

#### **File: `.env.local`**

```bash
# Update untuk development
VITE_BACKEND_URL=https://ai-youtube-shorts-backend.fly.dev
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

#### **Test Local Development:**

```powershell
# Test dengan backend Fly.io
npm run dev

# Buka browser dan test functionality
# Frontend seharusnya berkomunikasi dengan Fly.io backend
```

### **3. Verifikasi Konfigurasi Backend URL**

#### **File: `App.tsx` - Verification Code**

```typescript
// Tambahkan logging untuk verifikasi
const getBackendUrl = () => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 console.log(`[CONFIG] Environment: ${isDev ? 'development' : 'production'}`);
 console.log(`[CONFIG] VITE_BACKEND_URL from env: ${envUrl}`);
 console.log(`[CONFIG] Expected: https://ai-youtube-shorts-backend.fly.dev`);

 if (isDev && !envUrl) {
  const localhostUrl = 'http://localhost:5001';
  console.log(`[CONFIG] Development mode - using localhost: ${localhostUrl}`);
  return localhostUrl;
 }

 const backendUrl = envUrl || 'https://ai-youtube-shorts-backend.fly.dev';
 console.log(`[CONFIG] Final backend URL: ${backendUrl}`);

 return backendUrl;
};
```

### **4. Update API Client Configuration**

#### **File: `utils/apiClient.ts`**

```typescript
// Update default fallback URL
const getBackendUrl = (): string => {
 const envUrl = (import.meta as any).env.VITE_BACKEND_URL;
 const isDev = (import.meta as any).env.DEV;

 if (isDev && !envUrl) {
  return 'http://localhost:5001';
 }

 // Update fallback to Fly.io
 return envUrl || 'https://ai-youtube-shorts-backend.fly.dev';
};
```

### **5. Test Integration dengan PowerShell**

```powershell
# Test script untuk memverifikasi frontend-backend integration
$frontendUrl = "https://auto-short.vercel.app"
$backendUrl = "https://ai-youtube-shorts-backend.fly.dev"

Write-Host "🧪 Testing Frontend-Backend Integration..." -ForegroundColor Yellow

# Test 1: Backend accessibility from frontend
Write-Host "`n1. Testing backend accessibility..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "$backendUrl/health"
    Write-Host "✅ Backend accessible: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend not accessible: $_" -ForegroundColor Red
}

# Test 2: CORS configuration
Write-Host "`n2. Testing CORS for Vercel domain..." -ForegroundColor Cyan
try {
    $headers = @{
        'Origin' = $frontendUrl
        'Access-Control-Request-Method' = 'POST'
    }
    $response = Invoke-WebRequest -Uri "$backendUrl/health" -Method OPTIONS -Headers $headers -UseBasicParsing

    if ($response.Headers['Access-Control-Allow-Origin']) {
        Write-Host "✅ CORS configured correctly" -ForegroundColor Green
    } else {
        Write-Host "❌ CORS not configured for Vercel domain" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ CORS test failed: $_" -ForegroundColor Red
}

# Test 3: API endpoints
$testEndpoints = @(
    "/api/video-metadata?videoId=dQw4w9WgXcQ",
    "/api/yt-transcript?videoId=dQw4w9WgXcQ",
    "/api/debug/environment"
)

Write-Host "`n3. Testing API endpoints..." -ForegroundColor Cyan
foreach ($endpoint in $testEndpoints) {
    try {
        $response = Invoke-RestMethod -Uri "$backendUrl$endpoint" -TimeoutSec 30
        Write-Host "✅ $endpoint - OK" -ForegroundColor Green
    } catch {
        Write-Host "❌ $endpoint - Failed: $_" -ForegroundColor Red
    }
}
```

### **6. Redeploy Frontend**

#### **Melalui Vercel CLI:**

```powershell
# Deploy production
vercel --prod

# Monitor deployment
vercel logs
```

#### **Melalui Git Push:**

```powershell
# Commit perubahan (jika ada)
git add .
git commit -m "Update backend URL to Fly.io"
git push origin main

# Vercel akan otomatis deploy dari Git
```

### **7. Verify Deployment**

```powershell
# Test complete integration
Write-Host "🌐 Testing complete frontend integration..." -ForegroundColor Yellow

# Test frontend dapat memuat
try {
    $response = Invoke-WebRequest -Uri "https://auto-short.vercel.app" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Frontend accessible" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Frontend not accessible: $_" -ForegroundColor Red
}

# Test browser console untuk errors
Write-Host "`n📝 Manual Testing Checklist:" -ForegroundColor Yellow
Write-Host "1. Buka https://auto-short.vercel.app" -ForegroundColor Cyan
Write-Host "2. Buka Developer Tools (F12)" -ForegroundColor Cyan
Write-Host "3. Check Console tab untuk error messages" -ForegroundColor Cyan
Write-Host "4. Verify backend URL di console logs" -ForegroundColor Cyan
Write-Host "5. Test video processing functionality" -ForegroundColor Cyan
```

## 🔧 **Troubleshooting Common Issues**

### **Issue: CORS Errors**

```powershell
# Update backend CORS configuration
flyctl secrets set CORS_ORIGINS="https://auto-short.vercel.app,https://auto-short-git-main-bryyzxms-projects.vercel.app"

# Redeploy backend
flyctl deploy
```

### **Issue: Environment Variable Tidak Terupdate**

```powershell
# Force redeploy Vercel
vercel --force

# Check environment variables
vercel env ls
```

### **Issue: Backend URL Salah**

```typescript
// Debug di browser console
console.log('Backend URL:', (import.meta as any).env.VITE_BACKEND_URL);

// Seharusnya menampilkan: https://ai-youtube-shorts-backend.fly.dev
```

### **Issue: API Timeout**

```typescript
// Increase timeout di frontend
const response = await fetch(url, {
 ...options,
 timeout: 120000, // 2 minutes for video processing
});
```

## 🎯 **Testing Checklist Frontend**

### **Automated Tests:**

```powershell
# Run test script
.\test-frontend-integration.ps1
```

### **Manual Tests:**

- [ ] Frontend memuat tanpa error
- [ ] Console tidak menampilkan CORS errors
- [ ] Backend URL benar di console logs
- [ ] Input YouTube URL berfungsi
- [ ] Generate shorts berfungsi
- [ ] Download video berfungsi
- [ ] Error handling berfungsi dengan baik

### **Performance Tests:**

- [ ] Loading time reasonable (< 3 detik)
- [ ] API response time acceptable
- [ ] No memory leaks di browser
- [ ] Mobile responsiveness tetap baik

## 📊 **Performance Comparison**

### **Before (Railway):**

```
Backend URL: https://auto-short-production.up.railway.app
Typical Response Times:
- Health: ~500ms
- Metadata: ~2000ms
- Transcript: ~3000ms
- Video Processing: ~45000ms
```

### **After (Fly.io):**

```
Backend URL: https://ai-youtube-shorts-backend.fly.dev
Expected Response Times:
- Health: ~300ms (Singapore region closer to Indonesia)
- Metadata: ~1500ms
- Transcript: ~2500ms
- Video Processing: ~40000ms
```

## 🚀 **Deployment Commands Summary**

```powershell
# Complete frontend update process
Write-Host "🚀 Complete Frontend Update Process" -ForegroundColor Green

# 1. Update environment variables
vercel env add VITE_BACKEND_URL production
# Enter: https://ai-youtube-shorts-backend.fly.dev

# 2. Deploy with new configuration
vercel --prod

# 3. Test integration
Invoke-RestMethod -Uri "https://auto-short.vercel.app"

# 4. Monitor for issues
vercel logs --follow

Write-Host "✅ Frontend update completed!" -ForegroundColor Green
```

## 🔄 **Rollback Plan**

Jika terjadi masalah, rollback dengan langkah berikut:

```powershell
# 1. Restore Railway backend URL
vercel env add VITE_BACKEND_URL production
# Enter: https://auto-short-production.up.railway.app

# 2. Redeploy frontend
vercel --prod

# 3. Verify functionality
Write-Host "🔄 Rollback completed - frontend using Railway backend" -ForegroundColor Yellow
```

## 📈 **Monitoring dan Maintenance**

### **Regular Health Checks:**

```powershell
# Daily health check script
function Test-FrontendHealth {
    $frontendUrl = "https://auto-short.vercel.app"
    $backendUrl = "https://ai-youtube-shorts-backend.fly.dev"

    # Test frontend
    try {
        $frontend = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing
        Write-Host "✅ Frontend: $($frontend.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Frontend: Failed" -ForegroundColor Red
    }

    # Test backend
    try {
        $backend = Invoke-RestMethod -Uri "$backendUrl/health"
        Write-Host "✅ Backend: $($backend.status)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Backend: Failed" -ForegroundColor Red
    }
}

# Run daily
Test-FrontendHealth
```

### **Performance Monitoring:**

```typescript
// Add to frontend for performance tracking
const trackApiPerformance = (endpoint: string, startTime: number) => {
 const endTime = performance.now();
 const duration = endTime - startTime;

 console.log(`[PERF] ${endpoint}: ${Math.round(duration)}ms`);

 // Alert if performance degrades
 if (duration > 10000) {
  // 10 seconds
  console.warn(`[PERF] Slow API response: ${endpoint} took ${Math.round(duration)}ms`);
 }
};
```

## ✅ **Success Criteria**

Frontend migration is successful when:

- ✅ Environment variables updated correctly
- ✅ No CORS errors in browser console
- ✅ All API endpoints respond correctly
- ✅ Video processing functionality works
- ✅ Performance is maintained or improved
- ✅ Error handling works properly
- ✅ Mobile compatibility maintained
- ✅ No regression in user experience

---

**🎉 Setelah mengikuti panduan ini, frontend Vercel akan berhasil terintegrasi dengan backend Fly.io yang baru!**
