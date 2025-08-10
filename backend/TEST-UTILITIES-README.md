# Cookies Test Utilities 🍪

This directory contains comprehensive test utilities for validating and debugging the YouTube cookies system used by the AI YouTube to Shorts Segmenter.

## 📁 Test Files

### 1. `test-cookies-comparison.js`

**Purpose**: Compare local cookies.txt file with environment variable content

**Features**:

- ✅ Detects encoding issues (base64, URL encoding)
- ✅ Identifies size discrepancies
- ✅ Validates content integrity with MD5 hashing
- ✅ Analyzes YouTube-specific content
- ✅ Provides detailed troubleshooting recommendations

**Usage**:

```bash
node test-cookies-comparison.js
```

### 2. `test-ytdlp-cookies.js`

**Purpose**: Test yt-dlp functionality with the created cookies file

**Features**:

- ✅ Tests yt-dlp basic functionality
- ✅ Compares performance with/without cookies
- ✅ Detects bot protection and authentication issues
- ✅ Analyzes YouTube access patterns
- ✅ Provides performance metrics

**Usage**:

```bash
node test-ytdlp-cookies.js
```

### 3. `test-cookies-runner.js`

**Purpose**: Comprehensive test runner that executes all tests in sequence

**Features**:

- ✅ Pre-flight environment validation
- ✅ Sequential test execution with real-time output
- ✅ Comprehensive summary reporting
- ✅ Failure analysis and recommendations
- ✅ Integration with debug endpoints

**Usage**:

```bash
node test-cookies-runner.js
```

## 🚀 Quick Start

### Prerequisites

1. **Environment Variable**: Set one of:

   - `YTDLP_COOKIES_CONTENT`
   - `YOUTUBE_COOKIES_CONTENT`
   - `COOKIES_CONTENT`

2. **yt-dlp Installation**:

   ```bash
   pip install yt-dlp
   # OR
   npm install -g yt-dlp
   ```

3. **Node.js Dependencies**:
   ```bash
   npm install
   ```

### Running Tests

#### Option 1: Run All Tests (Recommended)

```bash
cd backend
node test-cookies-runner.js
```

#### Option 2: Run Individual Tests

```bash
# Test cookies comparison
node test-cookies-comparison.js

# Test yt-dlp functionality
node test-ytdlp-cookies.js
```

#### Option 3: Use npm Scripts (if configured)

```bash
npm run test:cookies        # Run all cookies tests
npm run test:cookies:compare # Compare cookies only
npm run test:cookies:ytdlp   # Test yt-dlp only
```

## 🔍 Automated Startup Validation

The server now includes **automated startup validation** that runs when the server starts:

### Features

- ✅ Environment variable validation
- ✅ Cookies file creation testing
- ✅ Content integrity verification
- ✅ yt-dlp basic functionality testing
- ✅ YouTube authentication testing

### Configuration

```bash
# Enable/disable startup validation (default: enabled)
STARTUP_VALIDATION=true

# Skip validation in test environment
NODE_ENV=test
```

### Debug Endpoints

When the server is running, access validation results via:

```bash
# Startup validation results
GET /api/debug/startup-validation

# Detailed cookies analysis
GET /api/debug/cookies

# Environment information
GET /api/debug/environment
```

## 📊 Understanding Test Results

### ✅ Success Indicators

- **Size Match**: Environment variable and file have same byte size
- **Hash Match**: Content MD5 hashes are identical
- **Format Valid**: Netscape cookie format detected
- **YouTube Domains**: YouTube cookies found and valid
- **Bot Detection Bypassed**: yt-dlp works without bot warnings
- **Authentication Working**: YouTube access successful

### ❌ Common Issues

#### Size Mismatch

```
Issue: Environment variable: 3421 bytes, File: 2548 bytes
Cause: Base64 encoding/decoding issue
Fix: Check base64 handling in setupCookiesFile()
```

#### Hash Mismatch

```
Issue: Content hash differs between env var and file
Cause: Line ending normalization or encoding changes
Fix: Review content transformations
```

#### Bot Detection

```
Issue: "Sign in to confirm you're not a bot"
Cause: Cookies expired or invalid
Fix: Export fresh cookies from browser
```

#### Authentication Failure

```
Issue: yt-dlp fails with authentication errors
Cause: Missing essential YouTube cookies
Fix: Ensure SID, HSID, SSID, APISID, SAPISID cookies present
```

## 🛠️ Troubleshooting Guide

### 1. Environment Variable Issues

```bash
# Check if variable is set
echo $YTDLP_COOKIES_CONTENT

# Check variable size (should be reasonable)
echo ${#YTDLP_COOKIES_CONTENT}

# Azure: Check for 32KB limit
# If content > 32KB, consider Azure Key Vault
```

### 2. File Permission Issues

```bash
# Check file exists
ls -la backend/cookies.txt

# Check permissions
stat backend/cookies.txt

# Check directory permissions
ls -la backend/
```

### 3. yt-dlp Issues

```bash
# Test yt-dlp installation
yt-dlp --version

# Test without cookies
yt-dlp --list-formats "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Test with cookies
yt-dlp --cookies backend/cookies.txt --list-formats "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### 4. Azure-Specific Issues

```bash
# Check Azure environment detection
node -e "console.log(process.env.WEBSITE_HOSTNAME)"

# Check Azure paths
node -e "console.log(process.env.HOME)"

# Test Azure write permissions
node -e "const fs=require('fs'); fs.writeFileSync('/tmp/test.txt', 'test'); console.log('Write OK')"
```

## 📈 Test Output Examples

### Successful Test Run

```
🧪 Comprehensive Cookies Test Runner
===============================================

✅ Environment variable found: YTDLP_COOKIES_CONTENT (2548 bytes)
✅ Cookies file creation successful
✅ Content integrity verified
✅ yt-dlp authentication working
✅ Bot detection bypassed

🎉 ALL TESTS PASSED - Cookies system is fully functional!
```

### Failed Test Run

```
🧪 Comprehensive Cookies Test Runner
===============================================

❌ Size mismatch: 953 bytes difference
❌ Hash mismatch: content differs
⚠️  Bot detection triggered

💡 Recommendations:
   1. Check environment variable encoding
   2. Refresh YouTube cookies
   3. Verify content integrity
```

## 🔧 Integration with Development Workflow

### 1. Pre-deployment Testing

```bash
# Before deploying to Azure
npm run test:cookies
```

### 2. CI/CD Integration

```yaml
# Add to GitHub Actions or Azure DevOps
- name: Test Cookies System
  run: |
   cd backend
   node test-cookies-runner.js
```

### 3. Development Debugging

```bash
# Quick health check
curl http://localhost:3001/api/debug/startup-validation

# Detailed analysis
curl http://localhost:3001/api/debug/cookies
```

## 🎯 Best Practices

### 1. **Regular Testing**

- Run tests after any cookies-related changes
- Test in both local and production environments
- Validate after environment variable updates

### 2. **Environment Management**

- Use different cookies for development/production
- Rotate cookies regularly (monthly recommended)
- Monitor Azure environment variable size limits

### 3. **Monitoring**

- Check startup validation logs daily
- Monitor bot detection patterns
- Track authentication success rates

### 4. **Security**

- Never commit cookies to version control
- Use Azure Key Vault for large cookie files
- Regularly audit cookies access logs

---

## 📞 Support

If tests fail or you encounter issues:

1. **Check Server Logs**: Look for detailed error messages
2. **Run Individual Tests**: Isolate the failing component
3. **Use Debug Endpoints**: Get real-time system status
4. **Review Documentation**: Check Azure deployment guides
5. **Update Cookies**: Export fresh cookies from browser

**Debug Endpoints** (when server running):

- `/api/debug/startup-validation` - Startup test results
- `/api/debug/cookies` - Detailed cookies analysis
- `/api/debug/environment` - Environment information

---

✅ **All test utilities are ready for use!** Run `node test-cookies-runner.js` to get started.
