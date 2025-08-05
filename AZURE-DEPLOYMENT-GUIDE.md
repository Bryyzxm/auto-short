# 🚀 **Azure Deployment Guide - AI YouTube to Shorts**

## **🎯 Overview**

This application is deployed using Azure App Service for the backend and Vercel for the frontend. The deployment is fully automated via GitHub Actions.

## **📋 Prerequisites**

- Azure subscription
- GitHub repository connected to Azure
- Vercel account for frontend deployment
- API keys for Groq and Gemini (optional)

## **1. Azure Backend Configuration**

### **a. Azure App Service Setup**

1. **Create Azure App Service**

   - Runtime: Node.js 20 LTS
   - Operating System: Linux
   - Pricing tier: B1 Basic (minimum recommended)

2. **Configure Environment Variables**

   In Azure Portal → App Service → Configuration → Application settings:

   ```bash
   NODE_ENV=production
   PORT=8080
   CORS_ORIGINS=https://auto-short.vercel.app,https://your-vercel-domain.vercel.app
   GROQ_API_KEY=your_groq_key_here  # Optional untuk AI features
   YTDLP_COOKIES_CONTENT=your_youtube_cookies_here  # Optional for YouTube bot bypass
   ```

3. **Configure Startup Command**

   In Azure Portal → App Service → Configuration → General settings:

   - Startup Command: `backend/startup.sh`

### **b. GitHub Actions Deployment**

The repository includes a GitHub Actions workflow (`.github/workflows/main_auto-short.yml`) that automatically deploys to Azure when you push to the main branch.

**Required GitHub Secrets:**

- `AZUREAPPSERVICE_CLIENTID_*`
- `AZUREAPPSERVICE_TENANTID_*`
- `AZUREAPPSERVICE_SUBSCRIPTIONID_*`

These are automatically generated when you set up deployment from Azure Portal.

## **2. Vercel Frontend Configuration**

### **a. Vercel Project Setup**

1. **Connect Repository to Vercel**

   - Import your GitHub repository
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

2. **Environment Variables in Vercel**

   In Vercel Dashboard → Project Settings → Environment Variables:

   ```bash
   VITE_BACKEND_URL=https://auto-short.azurewebsites.net
   VITE_GROQ_API_KEY=your_groq_api_key_here
   VITE_GEMINI_API_KEY=your_gemini_api_key_here  # Backup AI
   ```

### **b. Deploy to Vercel**

```bash
# Install Vercel CLI (optional)
npm i -g vercel

# Deploy (or use Git integration)
vercel --prod
```

## **3. Verification & Testing**

### **a. Backend Health Check**

```bash
# Test Azure backend
curl https://auto-short.azurewebsites.net/health

# Expected Response:
{
  "status": "healthy",
  "uptime": 123.45,
  "memory": {...},
  "timestamp": "2025-08-05T..."
}
```

### **b. CORS Verification**

```javascript
// Test from browser console on your Vercel domain
fetch('https://auto-short.azurewebsites.net/health')
 .then((r) => r.json())
 .then(console.log)
 .catch(console.error);
```

### **c. API Endpoints Testing**

```bash
# Test transcript endpoint
curl "https://auto-short.azurewebsites.net/api/yt-transcript?videoId=dQw4w9WgXcQ"

# Test metadata endpoint
curl "https://auto-short.azurewebsites.net/api/video-metadata?videoId=dQw4w9WgXcQ"
```

## **4. Monitoring & Troubleshooting**

### **a. Azure Monitoring**

- **Application Logs**: Azure Portal → App Service → Log stream
- **Metrics**: Azure Portal → App Service → Metrics
- **Diagnostic Settings**: Configure for detailed logging

### **b. Common Issues**

**❌ CORS Errors**

```bash
# Ensure CORS_ORIGINS includes your Vercel domain
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

**❌ Backend 500 Errors**

- Check Azure logs in Portal → Log stream
- Verify yt-dlp installation in startup.sh
- Check environment variables configuration

**❌ Cold Start Issues**

- Azure App Service may take 10-15 seconds to warm up
- Consider implementing health check with retry logic in frontend

**❌ File Permissions**

- Ensure startup.sh has execute permissions
- yt-dlp binary needs execute permissions (handled in startup.sh)

## **5. Performance Optimization**

### **a. Azure App Service**

- **Always On**: Enable to prevent cold starts
- **Auto-scaling**: Configure based on CPU/memory metrics
- **CDN**: Consider Azure CDN for static assets

### **b. Application Level**

- File cleanup automation (already implemented)
- Response compression (already enabled)
- Memory usage optimization (built-in)

## **6. Security Best Practices**

### **a. Environment Variables**

- ✅ Never commit API keys to repository
- ✅ Use Azure Key Vault for sensitive data
- ✅ Rotate API keys regularly

### **b. Network Security**

- ✅ CORS properly configured
- ✅ HTTPS enforced (automatic with Azure)
- ✅ Input validation & sanitization (implemented)

## **7. Production URLs**

After successful deployment:

- **Frontend**: `https://your-app.vercel.app`
- **Backend API**: `https://auto-short.azurewebsites.net`
- **Health Check**: `https://auto-short.azurewebsites.net/health`

## **8. Maintenance**

### **a. Regular Updates**

- Keep Node.js dependencies updated
- Monitor Azure platform updates
- Update yt-dlp version periodically

### **b. Backup Strategy**

- Source code: Git repository (primary backup)
- Configuration: Document all environment variables
- Database: Not applicable (stateless application)

## **🚨 Emergency Procedures**

1. **Check Azure deployment status**
2. **Verify environment variables**
3. **Test API endpoints individually**
4. **Check Azure application logs**
5. **Verify GitHub Actions deployment logs**

**Support Resources:**

- Azure Documentation: https://docs.microsoft.com/azure/
- Vercel Documentation: https://vercel.com/docs
- Application Logs: Azure Portal → Log stream

---

_This guide ensures a complete, production-ready deployment with Azure App Service providing robust backend hosting and Vercel delivering optimized frontend performance._
