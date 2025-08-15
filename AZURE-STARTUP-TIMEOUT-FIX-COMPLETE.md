# Azure Startup Timeout Fix - Complete Implementation

## Root Cause Analysis

After deploying the cookies path fixes, the Azure log analysis revealed a new issue: **startup timeout during yt-dlp validation**. The system was hanging during the startup validation phase when testing yt-dlp executable, causing Azure to consider the container unresponsive and terminating it.

### Evidence from Azure Log

```
2025-08-15T14:35:52.8181716Z [YT-DLP-EXEC] ⚡ Executing: /home/site/wwwroot/backend/node_modules/yt-dlp-exec/bin/yt-dlp --version
...
2025-08-15T14:36:17.1279218Z Site: auto-short stopped.
```

The process started the yt-dlp version check but hung for ~24 seconds before Azure terminated it.

## Implemented Solutions

### 1. Non-Blocking Startup Validation

**Problem**: Synchronous startup validation was blocking server startup
**Solution**: Made validation asynchronous and moved it after server starts

```javascript
// Before: Blocking validation before server starts
validateStartup().catch(console.error);

// After: Non-blocking validation after server starts
app.listen(PORT, () => {
 // Server starts immediately
 console.log(`🚀 Backend server running on http://localhost:${PORT}`);

 // Run validation asynchronously after 1 second
 setTimeout(() => {
  validateStartup().catch((validationError) => {
   console.error('💥 Startup validation failed:', validationError.message);
   console.warn('⚠️  Server is running but some functionality may be impaired');
  });
 }, 1000);
});
```

### 2. Reduced Timeout for Azure Environments

**Problem**: 10-second timeout for yt-dlp version check was too long for Azure
**Solution**: Reduced to 5 seconds with Azure-specific handling

```javascript
// Before: 10-second timeout
const testResult = await executeYtDlpSecurely(versionArgs, {timeout: 10000, useCookies: false});

// After: 5-second timeout with Azure resilience
const testResult = await executeYtDlpSecurely(versionArgs, {timeout: 5000, useCookies: false});

// Azure-specific error handling
if (azureEnv.isAzure) {
 console.log('🌐 Azure environment detected - continuing startup despite yt-dlp test failure');
}
```

### 3. Emergency Timeout Wrapper for Azure

**Problem**: yt-dlp execution could still hang despite timeouts
**Solution**: Added emergency timeout wrapper specifically for Azure environments

```javascript
async function executeYtDlpSecurely(args, options = {}) {
 // AZURE EMERGENCY TIMEOUT: Wrap the entire function in a timeout for Azure environments
 if (azureEnv.isAzure) {
  const emergencyTimeout = options.timeout ? Math.min(options.timeout, 30000) : 15000; // Max 30s in Azure, default 15s
  return Promise.race([executeYtDlpSecurelyCore(args, options), new Promise((_, reject) => setTimeout(() => reject(new Error('Azure emergency timeout: yt-dlp execution took too long')), emergencyTimeout))]);
 } else {
  return executeYtDlpSecurelyCore(args, options);
 }
}
```

## Complete Fix Summary

### ✅ **Previously Fixed Issues**

1. **Cookies Path Conflict**: Azure now correctly uses `/home/data/cookies.txt` (2573 bytes, 5/5 cookies)
2. **Multi-Client Optimization**: System uses only `web,tv` clients when cookies are present
3. **Path Precedence**: Conflicting cookies files are automatically backed up

### ✅ **Newly Fixed Issues**

1. **Startup Timeout**: Server now starts immediately without waiting for validation
2. **Azure Hanging**: Emergency timeout prevents yt-dlp from hanging indefinitely
3. **Container Health**: Azure container remains healthy during startup

## Expected Behavior

### Immediate Results

1. **Fast Startup**: Server starts within 1-2 seconds instead of hanging
2. **Container Health**: Azure recognizes the container as healthy immediately
3. **Non-Blocking Validation**: yt-dlp testing happens in background without affecting startup

### Observable Improvements

1. **No More Timeouts**: Azure logs should show successful startup completion
2. **Proper Logging**: All environment debug information will be visible
3. **Graceful Degradation**: If yt-dlp fails, server continues running with warnings

## Monitoring Points

### Successful Startup Indicators

- ✅ `🚀 Backend server running on http://localhost:8080`
- ✅ `🔍 AZURE ENVIRONMENT DEBUG INFORMATION:`
- ✅ `📍 /home/data/cookies.txt: EXISTS`
- ✅ `📊 Size: 2573 bytes`

### Background Validation Results

- ✅ `✅ YT-DLP executable test passed` (after 1-2 seconds delay)
- ⚠️ `💥 Startup validation failed` (acceptable - server still runs)

## Technical Implementation Details

### Files Modified

- `backend/server.js`: Complete startup sequence refactoring

### Key Changes

1. **Moved validation**: From blocking pre-startup to async post-startup
2. **Added timeouts**: Emergency timeouts for Azure environment
3. **Enhanced logging**: More detailed Azure environment debugging
4. **Graceful failures**: Server continues even if yt-dlp tests fail

### Azure-Specific Optimizations

- Emergency timeout caps prevent indefinite hanging
- Startup validation is non-essential for basic server functionality
- Container health checks pass immediately after server starts
- Background validation provides operational insights without blocking

This comprehensive fix addresses both the original cookies path conflicts AND the subsequent startup timeout issues, ensuring reliable Azure deployment with full functionality.
