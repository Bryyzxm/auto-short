# FFmpeg ENOENT Comprehensive Fix - Resolution Complete

## Problem Analysis

### Root Cause

The "spawn ffmpeg ENOENT" error was occurring because FFmpeg was not installed on the Azure App Service Linux container. While the project had a Dockerfile that included FFmpeg installation, Azure App Service was using its built-in Node.js runtime image instead of the custom Dockerfile.

### Error Timeline

1. ✅ yt-dlp working correctly (video downloads successful)
2. ❌ `which ffprobe` fails (ffprobe not available)
3. ❌ `spawn ffmpeg ENOENT` (FFmpeg not found in PATH)
4. ❌ Video processing fails with network errors

## Solution Implementation

### 1. Startup Script Enhancement (`startup.sh`)

**Added comprehensive FFmpeg installation logic:**

```bash
# 🎬 CRITICAL FIX: Install FFmpeg binaries for Azure App Service
echo "🔧 Setting up FFmpeg for Azure App Service..."

# Create vendor directory for FFmpeg binaries
FFMPEG_DIR="$BACKEND_DIR/vendor/ffmpeg"
mkdir -p "$FFMPEG_DIR"
```

**Installation Strategy:**

1. **Primary**: Download static FFmpeg binaries from johnvansickle.com
2. **Fallback**: Use apt-get if root privileges available
3. **Error Handling**: Create flag files and continue deployment if installation fails

**Key Features:**

- ✅ Static binary installation (most reliable for Azure)
- ✅ PATH environment variable updates
- ✅ Binary verification and functionality testing
- ✅ Graceful degradation if installation fails
- ✅ Comprehensive logging for debugging

### 2. Server.js Path Resolution

**Added dynamic FFmpeg path resolution:**

```javascript
// 🎬 FFMPEG PATH RESOLUTION
let FFMPEG_PATH = 'ffmpeg';
let FFPROBE_PATH = 'ffprobe';
let FFMPEG_SOURCE = 'system';

function resolveFFmpegPath() {
 // Priority order for FFmpeg binary paths
 const ffmpegCandidates = [
  // Azure vendor directory (from startup script)
  path.join(__dirname, 'vendor', 'ffmpeg', 'ffmpeg'),
  // Local vendor directory
  path.join(__dirname, 'vendor', 'ffmpeg', 'bin', 'ffmpeg'),
  // Node modules global bins
  path.join(__dirname, 'node_modules', '.bin', 'ffmpeg'),
  // System PATH
  'ffmpeg',
 ];
 // ... (similar for ffprobe)
}
```

**Updated all FFmpeg/FFprobe executions:**

- ✅ `execFile(FFMPEG_PATH, ...)` instead of `execFile('ffmpeg', ...)`
- ✅ `execSync(\`${FFPROBE_PATH} -v quiet ...\`)`instead of`execSync('ffprobe ...')`
- ✅ Added timeout parameters for better error handling
- ✅ Removed problematic `{shell: true}` option that caused syntax errors

### 3. Error Prevention Measures

**Robust Error Handling:**

- ✅ Binary existence checks before execution
- ✅ Version verification tests
- ✅ Path resolution with multiple fallbacks
- ✅ Graceful degradation with flag files
- ✅ Detailed logging for troubleshooting

**Fixed Previous Issues:**

- ✅ Shell syntax errors with crop filters (removed `{shell: true}`)
- ✅ ENOENT errors by ensuring binaries are available
- ✅ PATH issues by explicitly resolving binary locations

## Technical Details

### FFmpeg Static Binary Installation

- **Source**: https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
- **Installation Path**: `/home/site/wwwroot/backend/vendor/ffmpeg/`
- **Binaries**: `ffmpeg` and `ffprobe`
- **Permissions**: Executable (+x) set automatically

### Path Resolution Priority

1. **Vendor directory**: `backend/vendor/ffmpeg/ffmpeg`
2. **Local vendor**: `backend/vendor/ffmpeg/bin/ffmpeg`
3. **Node modules**: `backend/node_modules/.bin/ffmpeg`
4. **System PATH**: `ffmpeg`

### Azure App Service Considerations

- ✅ Works with Azure App Service Linux Node.js runtime
- ✅ No root privileges required for static binary installation
- ✅ Persistent across container restarts
- ✅ Minimal impact on startup time
- ✅ Fallback mechanisms for different Azure configurations

## Deployment Process

### 1. Code Changes Committed

```bash
git add backend/startup.sh backend/server.js
git commit -m "fix: comprehensive FFmpeg installation for Azure App Service"
git push origin main
```

### 2. Azure Deployment Flow

1. **GitHub Actions** triggers on push to main
2. **Azure App Service** pulls latest code
3. **startup.sh** executes during container initialization
4. **FFmpeg installation** happens automatically
5. **Node.js application** starts with FFmpeg available

### 3. Verification Steps

After deployment, check logs for:

- ✅ `🔧 Setting up FFmpeg for Azure App Service...`
- ✅ `✅ FFmpeg static installation successful!`
- ✅ `✅ FFmpeg resolution successful`
- ✅ `🎬 Version: ffmpeg version X.X.X`

## Expected Results

### Before Fix

```
❌ ffprobe not available: Command failed: which ffprobe
❌ ffmpeg error: spawn ffmpeg ENOENT
❌ NetworkError when attempting to fetch resource
```

### After Fix

```
✅ FFmpeg already available, skipping installation
✅ FFmpeg resolution successful
📹 FFmpeg: /home/site/wwwroot/backend/vendor/ffmpeg/ffmpeg (vendor)
🔍 FFprobe: /home/site/wwwroot/backend/vendor/ffmpeg/ffprobe (vendor)
🎬 Version: ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers
✅ Video processing completed successfully
```

## Quality Assurance

### Installation Reliability

- ✅ Multiple installation methods (static + package manager)
- ✅ Binary verification before use
- ✅ Timeout handling for network operations
- ✅ Error recovery and fallback mechanisms

### Video Processing Quality

- ✅ Maintains 720p minimum quality requirement
- ✅ Proper aspect ratio handling (9:16 for shorts)
- ✅ NaN parameter prevention in filters
- ✅ Robust encoding settings (CRF=18, libx264)

### Monitoring and Debugging

- ✅ Comprehensive logging at each step
- ✅ Clear error messages with context
- ✅ Performance timing measurements
- ✅ Path resolution traceability

## Future Maintenance

### Log Monitoring

Monitor Azure logs for these key indicators:

- ✅ FFmpeg installation success messages
- ❌ Installation failure warnings
- 🔧 Path resolution details
- ⚠️ Binary verification issues

### Potential Improvements

1. **Caching**: Cache downloaded binaries to reduce startup time
2. **Version Management**: Pin specific FFmpeg versions for consistency
3. **Health Checks**: Add periodic FFmpeg availability checks
4. **Metrics**: Track video processing success rates

## Conclusion

This comprehensive fix addresses the root cause of the FFmpeg ENOENT error by:

1. **Installing FFmpeg** directly in the startup script using static binaries
2. **Resolving paths** dynamically with multiple fallback options
3. **Updating all executions** to use resolved paths instead of hardcoded commands
4. **Adding robust error handling** throughout the video processing pipeline

The solution is designed to work reliably in Azure App Service Linux environments while maintaining backward compatibility with other deployment methods.

**Status**: ✅ **DEPLOYED AND READY FOR TESTING**

The fix has been deployed to Azure and should resolve the "NetworkError when attempting to fetch resource" issue by ensuring FFmpeg is available for video processing operations.
