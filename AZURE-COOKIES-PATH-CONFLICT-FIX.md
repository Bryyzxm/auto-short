# Azure Cookies Path Conflict Resolution

## Problem Analysis

Based on the Azure log stream analysis, we identified two critical issues causing persistent bot detection errors:

### Issue 1: Cookies File Path Conflict

- **Problem**: Azure creating valid cookies at `/home/data/cookies.txt` (2573 bytes, 5/5 essential cookies) but yt-dlp using old file at `/home/site/wwwroot/backend/cookies.txt` (735 bytes, 0/5 cookies)
- **Root Cause**: Path precedence conflict in Azure environment where multiple cookies files exist

### Issue 2: Multi-Client Configuration Incompatibility

- **Problem**: YouTube rejecting android/ios clients when cookies are present
- **Evidence**: Azure logs show "Skipping client 'android' since it does not support cookies" and "Request is missing required authentication credential" errors

## Implemented Solutions

### 1. Cookies Path Precedence Fix

#### Enhanced Global Variable Update (server.js line ~865)

```javascript
// Step 8: Update global variables with Azure precedence fix
if (azureEnv.isAzure) {
 // Force yt-dlp to use the valid cookies file path
 console.log(`[COOKIES-SETUP] 🔧 Azure path precedence fix: forcing ${cookiesFilePath}`);

 // Update both environment and global variables
 process.env.YTDLP_COOKIES_PATH = cookiesFilePath;
 YTDLP_COOKIES_PATH = cookiesFilePath;

 // Check for and relocate conflicting files
 const potentialConflictPaths = ['/home/site/wwwroot/backend/cookies.txt', '/home/site/wwwroot/cookies.txt', path.join(__dirname, 'cookies.txt')];

 // Move conflicting files to prevent interference
 for (const conflictPath of potentialConflictPaths) {
  if (conflictPath !== cookiesFilePath && fs.existsSync(conflictPath)) {
   const backupPath = conflictPath + '.backup.' + Date.now();
   fs.renameSync(conflictPath, backupPath);
  }
 }
}
```

#### Azure Configuration Enhancement (server.js line ~100)

```javascript
getOptimalCookiesPath(config) {
  const candidatePaths = [
    path.join(config.paths.data, 'cookies.txt'), // PREFERRED: /home/data/cookies.txt
    // ... other paths
  ];

  // Force Azure to use the preferred path for cookies
  const preferredPath = candidatePaths[0];

  // Set environment variable to ensure consistency
  if (!process.env.YTDLP_COOKIES_PATH) {
    process.env.YTDLP_COOKIES_PATH = preferredPath;
  }

  return candidatePaths;
}
```

### 2. Optimized Multi-Client Configuration

#### Dynamic Client Selection (server.js line ~1590)

```javascript
// CRITICAL FIX: Add optimized extractor args based on cookies availability
if (!finalArgs.includes('--extractor-args')) {
 let extractorArgs;
 if (cookiesUsed) {
  // When cookies are available, use only web and tv clients (avoid android/ios)
  extractorArgs = 'youtube:player_client=web,tv;innertube_host=youtubei.googleapis.com';
  console.log('[YT-DLP-EXEC] 🔧 Using cookies-compatible clients: web,tv (excluding android,ios)');
 } else {
  // When no cookies, use all clients for maximum compatibility
  extractorArgs = 'youtube:player_client=android,web,tv,ios;innertube_host=youtubei.googleapis.com';
  console.log('[YT-DLP-EXEC] 🔧 Using all clients: android,web,tv,ios (no cookies mode)');
 }

 finalArgs.push('--extractor-args', extractorArgs);
}
```

### 3. Enhanced Azure Environment Debugging

#### Comprehensive Environment Logging (server.js line ~5010)

```javascript
if (azureEnv.isAzure) {
 console.log('\n🔍 AZURE ENVIRONMENT DEBUG INFORMATION:');
 console.log(`📍 YTDLP_COOKIES_PATH (env): ${process.env.YTDLP_COOKIES_PATH || 'not set'}`);
 console.log(`📍 YTDLP_COOKIES_PATH (global): ${YTDLP_COOKIES_PATH || 'not set'}`);

 // Check Azure-specific paths
 const azurePaths = ['/home/data/cookies.txt', '/home/site/wwwroot/backend/cookies.txt', '/home/site/wwwroot/cookies.txt'];

 azurePaths.forEach((testPath) => {
  const exists = fs.existsSync(testPath);
  console.log(`📍 ${testPath}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
  if (exists) {
   const stats = fs.statSync(testPath);
   console.log(`  📊 Size: ${stats.size} bytes, Modified: ${stats.mtime.toISOString()}`);
  }
 });
}
```

## Expected Results

### Immediate Fixes

1. **Path Resolution**: yt-dlp will now consistently use `/home/data/cookies.txt` (the valid cookies file)
2. **Conflict Prevention**: Old conflicting cookies files will be moved to backup locations
3. **Client Optimization**: When cookies are present, only web+tv clients will be used (avoiding android/ios rejection)

### Observable Improvements

1. **Reduced Bot Detection**: Proper cookies utilization should significantly reduce "Login to confirm that you are not a bot" errors
2. **Improved Authentication**: YouTube API calls should succeed with proper cookie authentication
3. **Better Debugging**: Enhanced logging will show exact paths and files being used

### Log Monitoring

After deployment, monitor Azure logs for:

- ✅ `[COOKIES-SETUP] 🔧 Azure path precedence fix: forcing /home/data/cookies.txt`
- ✅ `[YT-DLP-EXEC] 🔧 Using cookies-compatible clients: web,tv`
- ✅ `[YT-DLP-EXEC] ✅ Cookies file validation passed`
- ❌ Elimination of "Skipping client 'android' since it does not support cookies" warnings

## Technical Details

### Files Modified

- `backend/server.js`: Core fixes for path precedence and client optimization

### Key Functions Enhanced

- `setupCookiesFromEnvironment()`: Enhanced Azure path handling
- `executeYtDlpSecurely()`: Optimized multi-client configuration
- `AzureEnvironmentManager.getOptimalCookiesPath()`: Forced preferred path usage

### Azure-Specific Considerations

- Persistent data folder (`/home/data/`) is now prioritized over application folder
- Environment variables are set early to prevent path resolution conflicts
- Conflicting files are automatically backed up to prevent interference

## Validation Steps

1. **Deploy to Azure**: Push the updated `server.js` to Azure App Service
2. **Monitor Startup Logs**: Check for proper path resolution in Azure logs
3. **Test YouTube API**: Verify that transcript extraction works without bot detection
4. **Validate Cookies**: Confirm that `/home/data/cookies.txt` is being used consistently

This comprehensive fix addresses both the root cause (path conflicts) and the symptom (client rejection) identified in the Azure log analysis.
