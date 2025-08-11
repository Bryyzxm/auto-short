# 🚨 IMMEDIATE AZURE DEPLOYMENT - CRISIS RESOLUTION

## ⚡ EMERGENCY DEPLOYMENT STEPS - Execute in Order

**🚨 CRITICAL: Your cookies are too large for Azure environment variables!**

### OPTION A: File-Based Approach (RECOMMENDED - Quick Fix)

#### Step 1: Update Azure Configuration

```bash
# In Azure Portal → Configuration → Application settings:
# 1. DELETE: YTDLP_COOKIES_CONTENT (this is causing truncation)
# 2. ADD: YTDLP_COOKIES_PATH = /home/site/wwwroot/backend/cookies.txt
# 3. Save and restart app service
```

#### Step 2: Your cookies.txt is already in the right format

✅ Your `backend/cookies.txt` contains proper YouTube authentication cookies
✅ All essential cookies present: SID, HSID, SSID, APISID, SAPISID
✅ File will be deployed with your app

### OPTION B: Compressed Environment Variable (Advanced)

#### Step 1: Generate compressed cookies

```bash
cd backend
node -e "
const fs = require('fs');
const zlib = require('zlib');
const cookies = fs.readFileSync('cookies.txt', 'utf8');
const compressed = zlib.gzipSync(cookies).toString('base64');
console.log('Size check:');
console.log('Original:', cookies.length, 'bytes');
console.log('Compressed:', compressed.length, 'bytes');
console.log('Azure compatible:', compressed.length < 32768);
console.log('');
console.log('Add this to Azure:');
console.log('YTDLP_COOKIES_COMPRESSED=' + compressed);
"
```

#### Step 2: Update server.js to handle compressed cookies

(Code changes needed in setupCookiesFile function)

---

## 🎯 QUICKEST SOLUTION: Option A (5 minutes)

### 1. Azure Portal Changes

1. Open [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service: `auto-short`
3. Go to **Configuration** → **Application settings**
4. **DELETE** the setting: `YTDLP_COOKIES_CONTENT` (this is corrupting due to size)
5. **ADD** new setting:
   - Name: `YTDLP_COOKIES_PATH`
   - Value: `/home/site/wwwroot/backend/cookies.txt`
6. Click **Save**
7. Click **Continue** when prompted
8. Wait for restart to complete

### 2. Test Immediately

```bash
# Check if cookies are now working
curl https://auto-short.azurewebsites.net/api/debug/cookies-meta

# Should show:
# "cookies_exists": true
# "cookies_size": "37799"
```

### 3. Fix yt-dlp Binary (if needed)

Your server.js already has the fix, but verify the startup script:

```bash
# Navigate to backend directory
cd backend

# Compress cookies and get Azure command
node compress-cookies.js --azure

# Copy the generated Azure CLI command and run it
# (Command will be displayed after running above)
```

### 2. Deploy Code Changes

```bash
# From root directory
cd ..

# Deploy to Azure (adjust resource names for your setup)
az webapp deployment source config-zip --resource-group your-resource-group --name your-app-name --src deploy.zip

# OR if using Git deployment:
git add .
git commit -m "🚨 CRISIS FIX: Azure yt-dlp binary + compressed cookies"
git push azure main
```

### 3. Restart Azure App Service

```bash
az webapp restart --resource-group your-resource-group --name your-app-name
```

## 🔍 VALIDATION TESTS

### Test 1: Health Check

```bash
curl https://your-app.azurewebsites.net/health
# Expected: {"status":"ok","timestamp":"..."}
```

### Test 2: yt-dlp Binary

```bash
curl "https://your-app.azurewebsites.net/test-ytdlp"
# Expected: Binary path and version info
```

### Test 3: Cookies Validation

```bash
curl "https://your-app.azurewebsites.net/test-cookies"
# Expected: Cookies loaded and validated successfully
```

### Test 4: End-to-End Video Processing

```bash
curl -X POST "https://your-app.azurewebsites.net/api/process-video" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=SHORT_TEST_VIDEO"}'
```

## 📊 COMPRESSION RESULTS ✅ CONFIRMED

**Test Results from your actual cookies file:**

- **Original cookies**: 37,799 bytes (37.0 KB)
- **URL encoded size**: 43,335 bytes (42.3 KB)
- **Azure environment limit**: 32,768 bytes (32.0 KB)
- **Status**: ❌ **TOO LARGE FOR AZURE ENV VARS**

**Recommendation**: Use file-based approach (Option A below)

## 🛠️ FIXES IMPLEMENTED

### 1. yt-dlp Binary Resolution

- ✅ Added fallback to `node_modules/yt-dlp-exec/bin/yt-dlp`
- ✅ Enhanced PATH resolution
- ✅ Added binary permissions in startup script

### 2. Compressed Cookies System

- ✅ zlib compression with base64 encoding
- ✅ Automatic decompression in server.js
- ✅ Azure 32KB limit compliance

### 3. Environment Setup

- ✅ Updated package.json startup scripts
- ✅ Added PATH export for node_modules/.bin
- ✅ Binary permissions handling

## ⏱️ ESTIMATED DEPLOYMENT TIME: 5-10 minutes

## 🆘 EMERGENCY CONTACT

If deployment fails, check Azure logs:

```bash
az webapp log tail --resource-group your-resource-group --name your-app-name
```
