# YouTube Cookies Setup Guide

This guide explains how to set up YouTube cookies to bypass bot detection when using yt-dlp.

## Overview

YouTube has implemented increasingly strict bot detection mechanisms that can block yt-dlp requests. Using browser cookies helps bypass these restrictions by making requests appear as if they come from a legitimate browser session.

## Environment Variable Configuration

### `YTDLP_COOKIES_PATH`

Set this environment variable to specify the path to your cookies file:

```bash
# Linux/macOS
export YTDLP_COOKIES_PATH="/path/to/your/cookies.txt"

# Windows Command Prompt
set YTDLP_COOKIES_PATH=C:\path\to\your\cookies.txt

# Windows PowerShell
$env:YTDLP_COOKIES_PATH="C:\path\to\your\cookies.txt"

# .env file (recommended for development)
YTDLP_COOKIES_PATH=/path/to/your/cookies.txt
```

**Default Path**: If not set, the system will use `backend/cookies/youtube-cookies.txt`

## How to Obtain YouTube Cookies

### Method 1: Using Browser Extension (Recommended)

1. **Install a cookies export extension:**

   - Chrome: "Get cookies.txt LOCALLY" or "cookies.txt"
   - Firefox: "cookies.txt" addon

2. **Visit YouTube:**

   - Go to https://youtube.com
   - Make sure you're logged in (optional but recommended)

3. **Export cookies:**
   - Click the extension icon
   - Select "youtube.com"
   - Choose "Netscape format"
   - Save as `youtube-cookies.txt`

### Method 2: Using yt-dlp's Built-in Cookie Extraction

```bash
# Extract cookies from Chrome
yt-dlp --cookies-from-browser chrome --write-info-json --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Extract cookies from Firefox
yt-dlp --cookies-from-browser firefox --write-info-json --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Extract cookies from Edge
yt-dlp --cookies-from-browser edge --write-info-json --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### Method 3: Manual Browser Export

#### Chrome:

1. Open Chrome DevTools (F12)
2. Go to Application tab → Storage → Cookies → https://www.youtube.com
3. Copy relevant cookies to a text file in Netscape format

#### Firefox:

1. Type `about:preferences#privacy` in address bar
2. Click "Manage Data" under Cookies and Site Data
3. Search for "youtube.com"
4. Export the cookies

## Cookie File Format

The cookies file must be in **Netscape format**:

```
# Netscape HTTP Cookie File
# This file contains the session cookies generated by your browser
.youtube.com	TRUE	/	TRUE	1755331200	VISITOR_INFO1_LIVE	your_visitor_id_here
.youtube.com	TRUE	/	FALSE	1755331200	YSC	your_session_token_here
.youtube.com	TRUE	/	TRUE	1755331200	PREF	your_preferences_here
youtube.com	FALSE	/	FALSE	1640995200	GPS	1
```

**Important Notes:**

- Each line represents one cookie
- Fields are tab-separated: domain, subdomain_flag, path, secure, expiration, name, value
- Lines starting with `#` are comments
- Empty lines are ignored

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit cookies to version control**

   - Add `*cookies*.txt` to your `.gitignore`
   - Keep cookies files private

2. **Cookies contain sensitive information**

   - They may include session tokens
   - Could potentially provide access to your account

3. **Rotate cookies regularly**

   - Cookies expire and need refresh
   - Update them when YouTube access stops working

4. **Use dedicated accounts**
   - Consider using a separate YouTube account for automation
   - Don't use your primary Google account

## Implementation Details

### Where Cookies Are Used

The cookie support has been implemented in the following components:

1. **Main Server (`server.js`)**

   - Video download operations
   - Video metadata extraction
   - Quality checking

2. **Robust Transcript Service V2 (`robustTranscriptServiceV2.js`)**

   - yt-dlp subtitle extraction strategies
   - Multiple client type fallbacks

3. **Anti-Detection Transcript Service (`antiDetectionTranscript.js`)**
   - Advanced bot evasion techniques
   - Session management with cookies

### Automatic Cookie Integration

The system automatically:

- Checks for cookies file existence
- Validates file format and size
- Adds `--cookies` flag to yt-dlp commands when available
- Falls back gracefully when cookies are unavailable
- Logs cookie usage for debugging

## Troubleshooting

### Common Issues

1. **"No valid cookies file found"**

   - Check the file path in `YTDLP_COOKIES_PATH`
   - Ensure the file exists and has content
   - Verify file permissions

2. **"Sign in to confirm you're not a bot" error persists**

   - Cookies may be expired - refresh them
   - Try logging into YouTube in browser first
   - Clear and re-export cookies

3. **yt-dlp still getting blocked**
   - YouTube may have updated detection methods
   - Try different browser for cookie export
   - Consider using VPN or different IP

### Debug Commands

Check if cookies are being detected:

```bash
# Check environment debug endpoint
curl http://localhost:5001/api/debug/environment

# Look for:
# - "cookies_path": "/path/to/cookies"
# - "cookies_exists": true
```

### Log Messages to Monitor

```
[COOKIES] ✅ Valid cookies file found: /path/to/cookies.txt (1234 bytes)
[SECURE-YTDLP] Adding cookies from: /path/to/cookies.txt
[ROBUST-V2] Using cookies from: /path/to/cookies.txt
```

## Production Deployment

### Railway/Vercel Deployment

1. **Upload cookies file to your deployment:**

   ```bash
   # Add to your project files
   mkdir -p backend/cookies
   cp youtube-cookies.txt backend/cookies/
   ```

2. **Set environment variable:**

   ```bash
   # Railway
   railway variables set YTDLP_COOKIES_PATH=/app/backend/cookies/youtube-cookies.txt

   # Vercel
   vercel env add YTDLP_COOKIES_PATH
   # Enter: /var/task/backend/cookies/youtube-cookies.txt
   ```

3. **Update .gitignore:**
   ```gitignore
   # Cookies (security)
   *cookies*.txt
   cookies/
   !backend/cookies/.gitkeep
   ```

### Docker Deployment

```dockerfile
# Copy cookies during build
COPY backend/cookies/youtube-cookies.txt /app/backend/cookies/
ENV YTDLP_COOKIES_PATH=/app/backend/cookies/youtube-cookies.txt
```

## Maintenance

1. **Monitor for failures:**

   - Watch for "bot detection" errors in logs
   - Set up alerts for repeated failures

2. **Refresh cookies monthly:**

   - YouTube sessions expire
   - Proactive refresh prevents downtime

3. **Test periodically:**
   - Use `/api/debug/environment` endpoint
   - Verify cookie file is detected

## Alternative Solutions

If cookies don't work:

1. **Use different IP ranges:**

   - VPN or proxy rotation
   - Different hosting providers

2. **Implement delays:**

   - Longer waits between requests
   - Random request timing

3. **Use alternative extractors:**
   - Different yt-dlp client types
   - Fallback to API-based methods

---

## Quick Setup Checklist

- [ ] Install browser extension for cookie export
- [ ] Visit YouTube and export cookies
- [ ] Save as `backend/cookies/youtube-cookies.txt`
- [ ] Set `YTDLP_COOKIES_PATH` environment variable (optional)
- [ ] Test with `/api/debug/environment` endpoint
- [ ] Monitor logs for cookie usage confirmation
- [ ] Add cookies to deployment pipeline
- [ ] Set up periodic cookie refresh

---

_Last updated: July 24, 2025_
