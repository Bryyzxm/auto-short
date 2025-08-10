# Debug Endpoints - Troubleshooting Guide

## 🔍 Available Debug Endpoints

### 1. `/api/debug/cookies` ⭐ **NEW**

**Purpose**: Comprehensive cookies troubleshooting
**Access**: Non-production environments only
**Method**: GET

**Features:**

- Environment variable analysis (presence, size, format)
- Cookies file analysis (location, size, content)
- Content comparison between env var and file
- Azure-specific monitoring (size limits, path types)
- Issue identification and recommendations
- Sanitized content samples for debugging

**Example Usage:**

```bash
curl http://localhost:3001/api/debug/cookies
```

**Sample Response:**

```json
{
 "status": "ok",
 "environmentVariable": {
  "present": true,
  "sizeBytes": 2548,
  "md5Hash": "abc123...",
  "truncationRisk": false
 },
 "cookiesFile": {
  "exists": true,
  "size": 499,
  "path": "/home/data/cookies.txt",
  "md5Hash": "def456..."
 },
 "comparison": {
  "sizeDifference": 2049,
  "hashMatch": false,
  "possibleIssues": ["Significant length difference detected"]
 }
}
```

### 2. `/api/debug/environment`

**Purpose**: General environment diagnostics
**Features**: Platform info, yt-dlp status, Azure environment details

### 3. `/api/debug/cookies-meta`

**Purpose**: Basic cookies metadata
**Features**: File existence, size, hash, required keys presence

### 4. `/api/debug/cookies-validation` ⭐ **ENHANCED**

**Purpose**: Detailed cookies validation with enhanced analysis
**Features**: Netscape header check, essential YouTube cookies validation, format analysis

## 🔒 Security Features

### Production Protection

All debug endpoints include automatic production detection:

- `NODE_ENV=production` blocks access
- Azure production hostnames block access
- Staging environments allow access

### Content Sanitization

- Long authentication tokens are masked: `abc123***SANITIZED***`
- Alphanumeric strings >32 chars are masked
- Only structure and format are shown, not sensitive values

## 🚨 Troubleshooting Common Issues

### Cookies Size Mismatch (2548 vs 499 bytes)

1. Check `/api/debug/cookies` for detailed analysis
2. Look for `sizeDifference` in comparison section
3. Check `truncationRisk` in environment variable section
4. Verify `nearAzureLimit` if running in Azure

### Missing Cookies

1. Verify environment variable is set with `/api/debug/cookies`
2. Check file permissions and path with `/api/debug/environment`
3. Validate cookie format with `/api/debug/cookies-validation`

### Azure Deployment Issues

1. Check Azure size limits with `/api/debug/cookies`
2. Verify path types and permissions
3. Monitor environment variable truncation

## 🛠️ Quick Diagnostic Commands

```bash
# Complete cookies analysis
curl http://localhost:3001/api/debug/cookies

# Basic environment check
curl http://localhost:3001/api/debug/environment

# Detailed cookies validation
curl http://localhost:3001/api/debug/cookies-validation

# Health check with Azure info
curl http://localhost:3001/health
```

## 📋 Environment Variables Checked

- `YTDLP_COOKIES_CONTENT` (primary)
- `YOUTUBE_COOKIES_CONTENT` (fallback)
- `COOKIES_CONTENT` (fallback)
- `NODE_ENV` (environment detection)
- `WEBSITE_HOSTNAME` (Azure detection)

## 🎯 Azure-Specific Features

- Environment variable size limit monitoring (32KB)
- Path type identification (persistent-data, temp, wwwroot, etc.)
- Azure App Service configuration details
- Instance and resource group information
- Container environment detection
