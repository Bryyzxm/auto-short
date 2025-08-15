# YT-DLP BINARY EXECUTION FAILURE ANALYSIS

## Current Issue Status

**Date:** January 15, 2025  
**Problem:** yt-dlp binary failing in Azure with exit code `null` and 0.0 KB stdout/stderr  
**User Action:** Added environment variables to Azure but issue persists  
**Impact:** Complete YouTube transcript extraction failure in production

## Root Cause Analysis

### Exit Code `null` Meaning

In Node.js, exit code `null` typically indicates:

1. **Process terminated by signal** (SIGTERM, SIGKILL, SIGINT)
2. **Process killed by system** (out of memory, resource limits)
3. **Process never started properly** (immediate termination)
4. **Container/runtime killed the process** (Azure App Service limits)

### Why This Happens in Azure

1. **Resource Constraints**: Azure App Service may kill processes that:

   - Use too much memory
   - Take too long to start
   - Violate security policies

2. **Missing System Dependencies**: yt-dlp requires:

   - Python runtime (usually bundled)
   - SSL/TLS libraries
   - System libraries for video processing

3. **Binary Compatibility**: The vendored yt-dlp binary may be:
   - Compiled for different architecture
   - Missing required dynamic libraries
   - Incompatible with Azure's Linux container

## Current Code Status

### Enhanced Binary Resolution ✅

**File:** `backend/server.js` lines 371-448

- Implemented `resolveYtDlpBinary()` with Azure-specific paths
- Priority system: env override → Azure paths → package constants → system PATH
- Comprehensive file existence and permission checking

### Enhanced Spawn Debugging ✅

**File:** `backend/server.js` lines 1455-1508

- Pre-spawn validation with detailed binary information
- Comprehensive error categorization (ENOENT, EACCES)
- Full spawn error logging with all error properties
- Binary existence, size, and permission verification

### Startup Script Permissions ✅

**File:** `backend/startup.sh`

- Automatic `chmod +x` for yt-dlp binary
- Path verification and error reporting
- Proper Azure App Service integration

## Diagnostic Tools Created

### 1. Comprehensive Binary Diagnostic

**File:** `backend/test-azure-binary.js`
**Purpose:** Complete Azure environment analysis
**Tests:**

- Node.js yt-dlp-exec package loading
- Binary path discovery across all potential locations
- System dependencies (Python, libraries, OS info)
- Binary execution tests (version, help commands)
- Environment variable analysis

### 2. Minimal Spawn Replication

**File:** `backend/test-minimal-spawn.js`  
**Purpose:** Replicate exact spawn failure conditions
**Tests:**

- Exact binary resolution logic from server.js
- Spawn with same parameters as production
- Multiple command tests (version, help, no args)
- Detailed spawn error analysis

## Environment Variables Analysis

### User Added Variables

Based on user report, these variables were added to Azure:

- `YT_DLP_PATH` or `YT_DLP_FORCE_PATH`
- `YT_DLP_DEBUG`
- `NODE_PATH`
- Potentially others

### Recommended Environment Variables

```bash
# Binary path override
YT_DLP_FORCE_PATH=/home/site/wwwroot/backend/vendor/yt-dlp-exec/bin/yt-dlp

# Debug mode
YT_DLP_DEBUG=1

# Node.js module resolution
NODE_PATH=/home/site/wwwroot/node_modules:/home/site/wwwroot/backend/node_modules

# Python path (if needed)
PYTHONPATH=/usr/bin/python3

# Library path (if needed)
LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu

# Disable Azure's process recycling for yt-dlp
WEBSITE_RUN_FROM_PACKAGE=0
```

## Next Steps for Diagnosis

### 1. Deploy Diagnostic Tools

Run both diagnostic scripts in Azure to get detailed environment information:

```bash
# In Azure SSH Console or via logs
cd /home/site/wwwroot/backend
node test-azure-binary.js
node test-minimal-spawn.js
```

### 2. Check Azure Resource Limits

Monitor Azure metrics during yt-dlp execution:

- Memory usage spikes
- CPU utilization
- Process duration before termination
- Azure App Service logs for process kills

### 3. Test Alternative Binary Sources

Try different yt-dlp binary sources:

- System-installed yt-dlp via apt
- Different yt-dlp-exec package version
- Statically compiled yt-dlp binary

### 4. Azure App Service Configuration

Verify Azure settings:

- Platform version (32-bit vs 64-bit)
- Linux container type
- Resource allocation
- Security policies

## Potential Solutions

### Immediate Fixes

1. **Static Binary Replacement**

   ```bash
   # Download latest static yt-dlp binary
   curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
   chmod +x yt-dlp
   ```

2. **System Package Installation**
   Add to startup.sh:

   ```bash
   apt-get update && apt-get install -y yt-dlp
   ```

3. **Container Resource Limits**
   ```bash
   # Reduce memory usage
   export NODE_OPTIONS="--max-old-space-size=512"
   ```

### Alternative Approaches

1. **Different YouTube Library**

   - Switch to `youtube-transcript` only (already in dependencies)
   - Use `youtubei.js` for metadata extraction
   - Implement browser-based extraction

2. **External Service**

   - Use YouTube Data API v3
   - Implement serverless function for yt-dlp
   - Use containerized yt-dlp service

3. **Fallback Strategy**
   - Primary: yt-dlp binary
   - Secondary: youtube-transcript package
   - Tertiary: Manual transcript upload

## Log Analysis Commands

To analyze Azure logs for yt-dlp failures:

```bash
# Check for process termination signals
grep -i "signal\|sigterm\|sigkill" /var/log/azure/*

# Monitor memory usage
grep -i "out of memory\|oom" /var/log/azure/*

# Check for permission errors
grep -i "permission\|denied\|eacces" /var/log/azure/*

# Look for library dependency errors
grep -i "library\|missing\|not found" /var/log/azure/*
```

## Success Criteria

The issue is resolved when:

1. yt-dlp binary executes successfully in Azure
2. Exit codes are non-null (0 for success, >0 for errors)
3. stdout/stderr contain actual output (not 0.0 KB)
4. YouTube transcript extraction works end-to-end

## Risk Assessment

**High Risk**: Production YouTube functionality completely broken
**Medium Risk**: User experience degraded without transcript features
**Low Risk**: Manual workarounds available

**Recommended Priority**: CRITICAL - Deploy diagnostic tools immediately to identify root cause
