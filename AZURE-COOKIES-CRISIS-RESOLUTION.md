# 🚨 AZURE COOKIES CRISIS - IMMEDIATE RESOLUTION GUIDE

## Critical Issues Identified (August 10, 2025)

### 1. Environment Variable Size Limit Crisis
- **Problem**: `YTDLP_COOKIES_CONTENT` = 37,798 bytes > Azure limit (32,768 bytes)
- **Impact**: Cookies are truncated and corrupted
- **Status**: 🔴 CRITICAL - YouTube downloads failing

### 2. yt-dlp Binary Missing
- **Problem**: `spawn yt-dlp ENOENT` - binary not found in PATH
- **Impact**: All video processing operations fail
- **Status**: 🔴 CRITICAL - Application non-functional

### 3. Invalid Cookie Content
- **Problem**: Missing essential YouTube auth cookies (SID, HSID, SSID, APISID, SAPISID)
- **Impact**: "Sign in to confirm you're not a bot" errors
- **Status**: 🔴 CRITICAL - YouTube bot detection

## IMMEDIATE ACTION PLAN

### Phase 1: Emergency Cookie Fix (5 minutes)

#### Option A: Fresh Cookie Export (RECOMMENDED)
```bash
# 1. Export fresh cookies from browser
# Visit https://youtube.com in browser (logged in)
# Use browser extension to export cookies in Netscape format

# 2. Verify essential cookies present:
grep -E "(SID|HSID|SSID|APISID|SAPISID)" cookies.txt

# 3. Compress cookies to fit Azure limit
gzip -c cookies.txt | base64 -w 0 > cookies_compressed.txt
```

#### Option B: Split Cookie Approach
```bash
# 1. Split large cookies into multiple environment variables
split -b 30000 cookies.txt cookie_part_

# 2. Set multiple Azure environment variables:
# YTDLP_COOKIES_PART_1=...
# YTDLP_COOKIES_PART_2=...
# YTDLP_COOKIES_COUNT=2
```

### Phase 2: yt-dlp Binary Fix (2 minutes)

#### Update package.json startup script:
```json
{
  "scripts": {
    "start": "export PATH=/home/site/wwwroot/backend/node_modules/.bin:$PATH && node server.js"
  }
}
```

#### Alternative: Use absolute path in code
```javascript
const ytdlpPath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');
```

### Phase 3: Cookie Path Fix (1 minute)

#### Force consistent cookie path:
```javascript
// In server.js - override cookie path detection
const COOKIES_PATH = '/home/site/wwwroot/backend/cookies.txt';
process.env.YTDLP_COOKIES_PATH = COOKIES_PATH;
```

## CRITICAL DEPLOYMENT STEPS

### 1. Update Azure Environment Variables

#### Method 1: Azure CLI (FASTEST)
```bash
# Remove oversized variable
az webapp config appsettings delete \
  --resource-group auto-short-rg \
  --name auto-short \
  --setting-names YTDLP_COOKIES_CONTENT

# Add compressed variable
az webapp config appsettings set \
  --resource-group auto-short-rg \
  --name auto-short \
  --settings YTDLP_COOKIES_COMPRESSED="$(gzip -c cookies.txt | base64 -w 0)"
```

#### Method 2: Azure Portal
1. Go to auto-short App Service
2. Settings → Configuration → Application settings
3. Delete `YTDLP_COOKIES_CONTENT`
4. Add new compressed cookie variable

### 2. Update Application Code

#### Server.js Cookie Handler Update:
```javascript
// Add to cookie setup section
function setupCompressedCookies() {
  const compressed = process.env.YTDLP_COOKIES_COMPRESSED;
  if (compressed) {
    const decompressed = zlib.gunzipSync(Buffer.from(compressed, 'base64')).toString();
    fs.writeFileSync(COOKIES_PATH, decompressed);
    console.log('✅ Decompressed cookies successfully');
  }
}
```

### 3. Package.json Updates

```json
{
  "scripts": {
    "prestart": "chmod +x node_modules/yt-dlp-exec/bin/yt-dlp",
    "start": "export PATH=$PATH:/home/site/wwwroot/backend/node_modules/.bin && node server.js"
  },
  "dependencies": {
    "yt-dlp-exec": "^1.0.4"
  }
}
```

## VALIDATION CHECKLIST

### Before Deployment:
- [ ] Fresh cookies exported from logged-in YouTube session
- [ ] Essential cookies (SID, HSID, SSID, APISID, SAPISID) present
- [ ] Cookie size under 32KB (compressed if needed)
- [ ] yt-dlp binary path configured correctly

### After Deployment:
- [ ] `/api/debug/startup-validation` shows all PASS
- [ ] Test video download works
- [ ] No "sign in to confirm you're not a bot" errors
- [ ] Application starts without ENOENT errors

## EMERGENCY ROLLBACK PLAN

If issues persist:

1. **Revert to file-based cookies:**
   ```bash
   # Upload cookies.txt directly to /home/site/wwwroot/backend/
   # Set YTDLP_COOKIES_PATH=/home/site/wwwroot/backend/cookies.txt
   ```

2. **Use alternative yt-dlp:**
   ```bash
   npm install --save @distube/ytdl-core
   # Fallback to ytdl-core for critical operations
   ```

## MONITORING

### Key Endpoints to Monitor:
- `/api/debug/startup-validation` - System health
- `/api/debug/cookies` - Cookie validation
- `/api/metadata` - Test video processing

### Log Patterns to Watch:
- ✅ `Cookies file validation passed`
- ✅ `YT-DLP executable test passed`
- ❌ `spawn yt-dlp ENOENT`
- ❌ `Sign in to confirm you're not a bot`

## LONG-TERM SOLUTIONS

1. **Azure Key Vault Integration** - Store large cookies securely
2. **Cookie Refresh Service** - Automated cookie renewal
3. **Multi-Cookie Strategy** - Rotate multiple cookie sets
4. **Fallback Extractors** - Alternative download methods

---

**Status**: 🔴 CRISIS MODE - Immediate action required
**Priority**: P0 - System down
**ETA**: 10 minutes for full resolution

Last Updated: August 10, 2025 - 06:27 UTC
