# 🚨 URGENT: Cookie Refresh & Bot Detection Fix

## **Current Issue Analysis**
- **Error**: "Sign in to confirm you're not a bot"  
- **Cause**: Expired/stale YouTube cookies
- **Impact**: All transcript extraction failing
- **Priority**: CRITICAL - Production down

## **Immediate Actions Required**

### 1. **Fresh Cookie Export (URGENT)**
```bash
# Steps to export fresh cookies:
1. Open Chrome/Firefox
2. Login to YouTube with a real account  
3. Watch 2-3 videos normally (build session history)
4. Install "Get cookies.txt LOCALLY" extension
5. Export YouTube cookies in Netscape format
6. Replace the current cookies.txt file
```

### 2. **Cookie Quality Check**
Your current cookies show these warning signs:
- `__Secure-1PSIDTS` expires: Jan 27, 2025 (SOON!)
- `__Secure-3PSIDTS` expires: Jan 27, 2025 (SOON!)
- Session tokens from Dec 2024 (STALE)

### 3. **Enhanced Cookie Validation**
```javascript
// Add to server.js - Enhanced cookie validation
function validateCookieFreshness(cookiesContent) {
    const now = Date.now() / 1000; // Unix timestamp
    const lines = cookiesContent.split('\n');
    
    let criticalExpired = 0;
    let totalChecked = 0;
    
    for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue;
        
        const parts = line.split('\t');
        if (parts.length >= 7) {
            const expirationTime = parseInt(parts[4]);
            const cookieName = parts[5];
            
            // Check critical YouTube cookies
            if (['__Secure-1PSIDTS', '__Secure-3PSIDTS', 'SIDCC', '__Secure-1PSIDCC'].includes(cookieName)) {
                totalChecked++;
                if (expirationTime < now + 86400) { // Expires within 24 hours
                    criticalExpired++;
                    console.log(`🚨 CRITICAL: ${cookieName} expires in ${Math.round((expirationTime - now) / 3600)} hours`);
                }
            }
        }
    }
    
    return {
        criticalExpired,
        totalChecked,
        needsRefresh: criticalExpired > 0
    };
}
```

## **Production Deployment Steps**

### Azure Environment Variable Update:
```bash
# 1. Export fresh cookies to a file
# 2. Base64 encode for Azure (if large)
cat new-cookies.txt | base64 -w 0 > cookies-b64.txt

# 3. Update Azure App Service Configuration
# Go to: Azure Portal > App Service > Configuration > Application settings
# Update: YTDLP_COOKIES_CONTENT with new content

# 4. Restart App Service
az webapp restart --name your-app-name --resource-group your-resource-group
```

## **Testing & Validation**

### Test Cookie Freshness:
```bash
# Run the enhanced test utility
cd backend
npm run test-cookies-comparison

# Check debug endpoint
curl https://your-app.azurewebsites.net/api/debug/cookies-meta
```

### Expected Good Results:
```json
{
  "cookies_exists": true,
  "cookies_size": "30000+",
  "cookies_validation": {
    "valid": true,
    "criticalExpired": 0,
    "needsRefresh": false
  }
}
```

## **Enhanced Monitoring**

Add to your app startup logging:
```javascript
// Check cookie freshness on startup
const cookieValidation = validateCookieFreshness(cookiesContent);
if (cookieValidation.needsRefresh) {
    console.error('🚨 ALERT: Cookies need refresh within 24 hours!');
    console.error(`Critical expiring: ${cookieValidation.criticalExpired}/${cookieValidation.totalChecked}`);
}
```

## **Preventive Measures**

1. **Set up alerts** for cookie expiration (24-48 hours before)
2. **Rotate cookies weekly** - don't wait for expiration
3. **Use multiple cookie sets** for redundancy
4. **Monitor error patterns** for early detection

## **Timeline for Fix**
- **0-30 minutes**: Export fresh cookies manually
- **30-60 minutes**: Update Azure environment variables  
- **60-90 minutes**: Deploy and test
- **90+ minutes**: Monitor production success

---
**Status**: READY FOR IMMEDIATE IMPLEMENTATION
