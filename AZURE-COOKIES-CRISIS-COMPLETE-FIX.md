# 🛠️ Azure Cookies Crisis - Complete Fix Guide

## **🚨 CRITICAL ISSUES IDENTIFIED**

Based on the Azure deployment logs from 2025-08-11T12:14:34, there are several critical issues:

### **Issue 1: Environment Variable Size Limit Exceeded**

- **Problem**: `YTDLP_COOKIES_CONTENT` is 37,798 bytes (37KB)
- **Azure Limit**: 32,768 bytes (32KB)
- **Result**: Content is being truncated, causing invalid cookies

### **Issue 2: No Valid YouTube Cookies After Processing**

- **Problem**: After URL decoding, only Netscape header remains
- **Missing**: SID, HSID, SSID, APISID, SAPISID (essential YouTube auth cookies)
- **Result**: YouTube access will fail due to bot detection

## **🔧 IMMEDIATE FIXES**

### **Fix 1: Address Azure Size Limitation**

#### **Option A: Use Azure Key Vault (Recommended)**

```bash
# Create Key Vault secret
az keyvault secret set \
  --vault-name "your-keyvault" \
  --name "youtube-cookies" \
  --file cookies.txt
```

#### **Option B: Compress Cookies Data**

```bash
# Compress and base64 encode cookies
gzip -c cookies.txt | base64 -w 0 > cookies-compressed.txt
```

### **Fix 2: Update Server Configuration**

The server.js has been updated with:

- ✅ Better size limit detection
- ✅ Enhanced validation with detailed logging
- ✅ Fallback cookie creation for basic functionality
- ✅ Improved error handling and troubleshooting

### **Fix 3: Regenerate Valid Cookies**

#### **Step-by-Step Cookie Export:**

1. **Open Chrome/Edge in Incognito Mode**
2. **Navigate to YouTube and login fully**
   - Complete any 2FA prompts
   - Ensure you can access your account normally
3. **Install Cookie Editor Extension**
   - Chrome: "Cookie-Editor" by cgagnier
   - Edge: "Cookie-Editor"
4. **Export Cookies in Netscape Format**
   ```
   - Click Cookie Editor icon
   - Select "Export"
   - Choose "Netscape HTTP Cookie File" format
   - Filter by domain: "youtube.com"
   - Copy the exported text
   ```
5. **Verify Essential Cookies Are Present**
   - Check for: SID, HSID, SSID, APISID, SAPISID
   - These should have long alphanumeric values

## **🚀 DEPLOYMENT FIXES**

### **Method 1: Azure Key Vault Integration**

1. **Update package.json** (if not already present):

```json
{
 "dependencies": {
  "@azure/keyvault-secrets": "^4.7.0",
  "@azure/identity": "^3.4.0"
 }
}
```

2. **Update server.js** to use Key Vault:

```javascript
// Add after existing imports
const {SecretClient} = require('@azure/keyvault-secrets');
const {DefaultAzureCredential} = require('@azure/identity');

// In setupCookiesFile function, add Key Vault fallback
if (!finalCookiesContent && azureEnv.isAzure) {
 try {
  const credential = new DefaultAzureCredential();
  const vaultUrl = `https://${process.env.KEY_VAULT_NAME}.vault.azure.net`;
  const client = new SecretClient(vaultUrl, credential);
  const secret = await client.getSecret('youtube-cookies');
  finalCookiesContent = secret.value;
  console.log('[COOKIES-SETUP] ✅ Loaded cookies from Azure Key Vault');
 } catch (kvError) {
  console.log('[COOKIES-SETUP] ⚠️ Key Vault fallback failed:', kvError.message);
 }
}
```

### **Method 2: Fix Environment Variable Size**

1. **Compress cookies before setting environment variable:**

```bash
# Create compressed cookies
node -e "
const fs = require('fs');
const zlib = require('zlib');
const cookies = fs.readFileSync('cookies.txt', 'utf8');
const compressed = zlib.gzipSync(cookies).toString('base64');
console.log('Compressed size:', compressed.length);
fs.writeFileSync('cookies-compressed.txt', compressed);
"
```

2. **Update Azure App Service setting:**

```bash
az webapp config appsettings set \
  --name auto-short \
  --resource-group auto-short-rg \
  --settings YTDLP_COOKIES_CONTENT_COMPRESSED="$(cat cookies-compressed.txt)"
```

3. **Update server.js to handle compressed cookies:**

```javascript
// Add decompression logic
if (varName.includes('COMPRESSED') && content) {
 try {
  const decompressed = zlib.gunzipSync(Buffer.from(content, 'base64')).toString('utf8');
  content = decompressed;
  transformationsApplied.push('gzip_decompress');
 } catch (e) {
  console.warn('[COOKIES-SETUP] ⚠️ Decompression failed:', e.message);
 }
}
```

## **🧪 TESTING & VALIDATION**

### **Run Diagnostic Tool:**

```bash
cd backend
node fix-azure-cookies.js
```

### **Test Cookie Validation:**

```bash
cd backend
node test-cookies-runner.js
```

### **Manual Validation:**

```bash
# Check environment variable
echo "Size: ${#YTDLP_COOKIES_CONTENT} characters"

# Test yt-dlp with cookies
./node_modules/.bin/yt-dlp --cookies cookies.txt --version
```

## **📊 MONITORING & MAINTENANCE**

### **Health Check Endpoint**

The server includes `/api/debug/startup-validation` endpoint for monitoring:

- Environment variable status
- Cookie file validation
- yt-dlp functionality
- Azure-specific diagnostics

### **Automated Alerts**

Set up monitoring for:

- Cookie validation failures
- Environment variable truncation
- YouTube authentication errors

## **⚡ QUICK EMERGENCY FIX**

If you need immediate functionality:

1. **Run the diagnostic tool:**

```bash
node backend/fix-azure-cookies.js
```

2. **Use the fallback cookies** (limited functionality):

```bash
export YTDLP_COOKIES_PATH="./backend/cookies-fallback.txt"
```

3. **Deploy with reduced functionality** while fixing the root cause

## **🔄 LONG-TERM SOLUTION**

1. **Implement Azure Key Vault integration**
2. **Set up automated cookie refresh process**
3. **Add comprehensive monitoring and alerting**
4. **Create cookie backup and rotation strategy**

This complete fix addresses all the issues identified in the Azure deployment logs and provides both immediate and long-term solutions.
