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

# 🍪 YouTube Cookies (optional - for bot detection bypass)
YTDLP_COOKIES_CONTENT=your_youtube_cookies_content_here

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

---

_Keep this guide updated whenever environment variables change._
