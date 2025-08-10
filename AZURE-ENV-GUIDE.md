# 🔧 **Environment Variables Configuration for Azure**

## **Azure App Service (Backend) Environment Variables**

Open Azure Portal → Your App Service → Configuration → Application settings and add:

```bash
# ⚡ Required Variables
NODE_ENV=production
PORT=8080  # Azure will auto-assign if not specified

# 🌐 CORS Configuration (IMPORTANT!)
# Replace with your actual Vercel domain
CORS_ORIGINS=https://auto-short.vercel.app,https://auto-short-git-main-username.vercel.app

# 🍪 YouTube Cookies (IMPORTANT - for bot detection bypass)
# Method 1: Direct cookies content (RECOMMENDED for Azure)
YTDLP_COOKIES_CONTENT="# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	1755331200	VISITOR_INFO1_LIVE	your_visitor_id_here
.youtube.com	TRUE	/	FALSE	1755331200	YSC	your_session_token_here
.youtube.com	TRUE	/	TRUE	1755331200	PREF	your_preferences_here"

# Method 2: Alternative path-based approach (fallback)
YTDLP_COOKIES_PATH=/tmp/cookies.txt

# 🎯 YouTube Configuration (Optional)
YOUTUBE_CLIENT_NAME=WEB
YOUTUBE_CLIENT_VERSION=2.20210101.00.00

# 🤖 Optional: AI Services
GROQ_API_KEY=your_groq_api_key_here
```

**Important Notes for CORS_ORIGINS:**

- Replace `auto-short` with your actual Vercel project name
- Include both main domain and preview deployment domains
- Use comma-separated values for multiple domains

## **Vercel (Frontend) Environment Variables**

Open Vercel Dashboard → Your Project → Settings → Environment Variables and add:

```bash
# 🌐 Backend Connection (REQUIRED!)
VITE_BACKEND_URL=https://auto-short.azurewebsites.net

# 🤖 AI Services
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# 📊 Optional: Environment identifier
VITE_ENVIRONMENT=production
```

**How to get Azure URL:**

1. Open Azure Portal → Your App Service
2. Copy URL from Overview page
3. Format: `https://your-app-name.azurewebsites.net`

## **Local Development (.env.local)**

For local development, create `.env.local` in project root:

```bash
# 🌐 Backend URL for development
VITE_BACKEND_URL=https://auto-short.azurewebsites.net  # Use production backend

# 🤖 AI Services (same as production)
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

## **How to Configure YTDLP_COOKIES_CONTENT**

### **Step 1: Export Cookies from Browser**

1. **Install Browser Extension:**

   - Chrome: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt" addon

2. **Export YouTube Cookies:**
   - Visit https://youtube.com (log in if desired)
   - Click extension icon → Select "youtube.com" → Export as Netscape format
   - Copy the entire content of the cookies.txt file

### **Step 2: Set Environment Variable in Azure**

1. Open Azure Portal → Your App Service → Configuration → Application settings
2. Add new setting:
   - **Name**: `YTDLP_COOKIES_CONTENT`
   - **Value**: Paste the entire cookies file content (including header comments)

**Important Azure Notes:**

- ⚠️ Azure environment variables have size limits (~32KB)
- ✅ Use YTDLP_COOKIES_CONTENT for direct content (recommended)
- ✅ Use YTDLP_COOKIES_PATH for file-based approach (fallback)
- 🔄 Cookies expire - refresh monthly or when YouTube blocks requests

## **Environment Variable Testing**

### **Test Azure Backend**

```bash
# Health check endpoint
curl https://auto-short.azurewebsites.net/health

# Should return healthy status
```

### **Test Frontend Connection**

1. Open your Vercel app in browser
2. Open Developer Console
3. Check for "Using backend URL: ..." message
4. Verify API calls are successful in Network tab

## **Security Best Practices**

- ✅ Never commit `.env` files to Git
- ✅ Use different API keys for development/production
- ✅ Regularly rotate sensitive API keys
- ✅ Use Azure Key Vault for highly sensitive data
- ✅ Monitor environment variable usage in logs

## **Troubleshooting**

### **Backend Not Responding**

1. Check Azure App Service logs
2. Verify environment variables are set correctly
3. Ensure CORS_ORIGINS includes your frontend domain
4. Test health endpoint directly

### **Frontend API Errors**

1. Verify `VITE_BACKEND_URL` is correct
2. Check browser console for CORS errors
3. Test backend endpoints independently
4. Ensure API keys are properly formatted

### **YouTube Bot Detection Issues**

**Symptoms:**

- "Sign in to confirm you're not a bot" errors
- Video downloads failing consistently
- 403 Forbidden errors from YouTube

**Solutions:**

1. **Check Cookies Configuration:**

   ```bash
   # Test cookies debug endpoint
   curl https://your-app.azurewebsites.net/api/debug/cookies-meta

   # Should show:
   # "cookies_exists": true
   # "cookies_size": "30000+" (bytes)
   ```

2. **Refresh Cookies:**

   - Export new cookies from browser
   - Update YTDLP_COOKIES_CONTENT in Azure
   - Restart App Service

3. **Validate Cookies Format:**

   ```bash
   # Run test utilities (in development)
   cd backend
   npm run test-cookies
   ```

4. **Check Azure Environment Variables:**
   ```bash
   # Verify cookies are properly set
   curl https://your-app.azurewebsites.net/api/debug/startup-validation
   ```

### **Common Cookie Issues**

| Problem           | Symptom                | Solution                                        |
| ----------------- | ---------------------- | ----------------------------------------------- |
| Cookies too large | Azure deployment fails | Use file-based approach with YTDLP_COOKIES_PATH |
| Cookies expired   | Bot detection returns  | Re-export from browser                          |
| Invalid format    | Validation errors      | Ensure Netscape format with tabs                |
| Missing cookies   | Downloads fail         | Check YTDLP_COOKIES_CONTENT is set              |

### **Debug Endpoints for Troubleshooting**

```bash
# Health check
curl https://your-app.azurewebsites.net/health

# Environment debug (non-production only)
curl https://your-app.azurewebsites.net/api/debug/environment

# Cookies metadata
curl https://your-app.azurewebsites.net/api/debug/cookies-meta

# Startup validation results
curl https://your-app.azurewebsites.net/api/debug/startup-validation
```

### **Azure-Specific Issues**

1. **App Service Won't Start:**

   - Check Application Insights for startup errors
   - Verify all required environment variables are set
   - Check if cookies content is too large for environment variables

2. **Environment Variable Size Limits:**

   - Azure has ~32KB limit per environment variable
   - Large cookies files may exceed this limit
   - Use file-based approach or trim cookies content

3. **File System Access:**
   - Azure App Service has read-only file system except for /tmp
   - Cookies files are written to /tmp/cookies.txt
   - Files in /tmp are ephemeral and may be cleared

---

_Keep this guide updated whenever environment variables change._
