# 🎬 FFmpeg Installation & Monitoring Guide - Azure App Service

## 🎯 **SOLUTION SUMMARY**

We've implemented a **comprehensive timing-aware FFmpeg installation system** that handles the race condition between Azure App Service startup and background FFmpeg installation.

### **🔍 Root Cause Analysis**

**The Problem:**

1. ✅ `setup-ffmpeg.sh` starts FFmpeg installation in background (via package.json prestart)
2. ❌ `server.js` runs path resolution immediately during startup
3. ❌ FFmpeg binaries don't exist yet → Falls back to system `ffmpeg`/`ffprobe`
4. ✅ Installation completes 30-60 seconds later → But server already using system paths
5. ❌ Result: ENOENT errors because system FFmpeg doesn't exist

**The Solution:**

- **Delayed Detection**: Server.js now includes retry logic that checks for FFmpeg every 10 seconds
- **Automatic Updates**: When installation completes, paths are automatically updated
- **Background Installation**: Enhanced setup script with robust error handling
- **Real-time Monitoring**: New endpoints provide installation progress and status

## 🚀 **DEPLOYMENT STATUS**

✅ **Code Deployed**: Enhanced FFmpeg detection with retry logic
✅ **Monitoring Added**: /health and /api/ffmpeg-status endpoints  
✅ **Installation Logging**: Comprehensive progress tracking
✅ **Auto-Recovery**: Automatic path updates when installation completes

## 📊 **MONITORING INSTRUCTIONS**

### **1. Check Overall Application Health**

```bash
curl https://auto-short.azurewebsites.net/health
```

Look for the `ffmpeg` section in the response:

```json
{
 "status": "healthy",
 "ffmpeg": {
  "ffmpegPath": "/home/site/wwwroot/backend/vendor/ffmpeg/ffmpeg",
  "ffprobePath": "/home/site/wwwroot/backend/vendor/ffmpeg/ffprobe",
  "source": "vendor-delayed",
  "retryCount": 3,
  "available": true,
  "version": "ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers"
 }
}
```

### **2. Detailed FFmpeg Status**

```bash
curl https://auto-short.azurewebsites.net/api/ffmpeg-status
```

This provides comprehensive information:

- **Paths**: Current FFmpeg/FFprobe paths
- **Availability**: Whether binaries are functional
- **Retry Info**: Installation progress
- **Vendor Directory**: File listing and status
- **Install Log**: Recent installation log entries

### **3. Azure Log Monitoring**

Watch for these key log entries:

**✅ Expected Success Flow:**

```log
🔧 Enhanced FFmpeg Setup Check...
⚠️ FFmpeg not found, starting enhanced installation...
🔄 Installation started in background (PID: XXXX)
[FFMPEG-RETRY] 🕒 Starting delayed FFmpeg detection...
[FFMPEG-RETRY] 🔄 Recheck attempt 1/12 (10s intervals)
[FFMPEG-RETRY] 🎉 FFmpeg now available!
✅ FFmpeg installed successfully
```

**❌ Failure Indicators:**

```log
❌ FFmpeg installation failed - download error
❌ All download attempts failed
[FFMPEG-RETRY] ⏰ Stopped checking - maximum retries reached
```

## 🕒 **TIMING EXPECTATIONS**

### **Typical Installation Timeline:**

- **0-5s**: Server starts, FFmpeg not found, retry logic begins
- **5-60s**: Background installation downloads and extracts FFmpeg
- **10-120s**: Retry logic checks every 10 seconds (max 12 attempts = 2 minutes)
- **30-90s**: Installation completes, paths automatically updated
- **Result**: FFmpeg available for video processing

### **Status Transitions:**

1. **Initial State**: `source: "system"` or `source: "fallback"`
2. **Installation Progress**: `retryCount: 1, 2, 3...` (up to 12)
3. **Success**: `source: "vendor-delayed"`, `available: true`

## 🎯 **TESTING THE FIX**

### **1. Test Video Segment Download**

Try downloading a video segment to verify FFmpeg is working:

```bash
curl -X POST https://auto-short.azurewebsites.net/api/download-youtube \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

**✅ Success Indicators:**

- No ENOENT errors in response
- Video segments downloadable at 720p quality
- Proper video processing with FFmpeg

**❌ Failure Indicators:**

- `spawn ffmpeg ENOENT` errors
- Network errors during segment download
- Video processing failures

### **2. Monitor Real-time Status**

Check FFmpeg status periodically:

```bash
# Check every 30 seconds for 5 minutes
for i in {1..10}; do
  echo "=== Check $i/10 ==="
  curl -s https://auto-short.azurewebsites.net/api/ffmpeg-status | jq '.overall'
  sleep 30
done
```

## 🛠️ **TROUBLESHOOTING**

### **If FFmpeg Installation Fails:**

1. **Check Installation Log:**

   ```bash
   curl -s https://auto-short.azurewebsites.net/api/ffmpeg-status | jq '.installLog'
   ```

2. **Common Issues:**

   - **Network Timeout**: Download from johnvansickle.com failed
   - **Extraction Error**: Archive corruption or disk space
   - **Permission Error**: Binary not executable

3. **Force Retry**: Restart the Azure App Service to retry installation

### **If Retry Logic Stops:**

- **Max Retries Reached**: 12 attempts over 2 minutes failed
- **Check**: Vendor directory exists but binaries non-functional
- **Solution**: Manual restart triggers fresh installation

## 🎉 **SUCCESS CRITERIA**

### **✅ FFmpeg Installation Successful When:**

1. **Status Endpoint Shows:**

   ```json
   {
    "overall": {
     "ready": true,
     "message": "FFmpeg is ready for video processing"
    },
    "ffmpeg": {
     "available": true,
     "version": "ffmpeg version 7.1..."
    },
    "source": "vendor-delayed"
   }
   ```

2. **Video Processing Works:**

   - Segment downloads succeed
   - No ENOENT errors
   - 720p quality maintained

3. **Azure Logs Show:**
   ```log
   [FFMPEG-RETRY] 🎉 FFmpeg now available!
   ✅ FFmpeg installed successfully
   ```

## 🔄 **NEXT STEPS**

1. **Wait 2-3 minutes** after deployment for installation to complete
2. **Check status endpoints** to verify FFmpeg availability
3. **Test video processing** with a sample YouTube URL
4. **Monitor Azure logs** for any installation errors

The system is now **self-healing** and will automatically detect and use FFmpeg once installation completes, eliminating the ENOENT errors and enabling proper video segment downloads at 720p quality.

---

## 📞 **Quick Status Commands**

```bash
# Overall health check
curl -s https://auto-short.azurewebsites.net/health | jq '.ffmpeg'

# Detailed FFmpeg status
curl -s https://auto-short.azurewebsites.net/api/ffmpeg-status | jq '.overall'

# Installation progress
curl -s https://auto-short.azurewebsites.net/api/ffmpeg-status | jq '.retryInfo'

# Check if ready for video processing
curl -s https://auto-short.azurewebsites.net/api/ffmpeg-status | jq '.overall.ready'
```
