#!/usr/bin/env node

/**
 * Azure Cookies Update Utility
 *
 * This script helps update Azure App Service with properly formatted cookies
 */

const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

function log(message, level = 'info') {
 const timestamp = new Date().toISOString();
 const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
 console.log(`${prefix} [${timestamp}] ${message}`);
}

function readCookiesFile(filePath) {
 if (!fs.existsSync(filePath)) {
  log(`Cookies file not found: ${filePath}`, 'error');
  return null;
 }

 const content = fs.readFileSync(filePath, 'utf8');
 const size = Buffer.byteLength(content, 'utf8');

 log(`Reading cookies from: ${filePath}`);
 log(`File size: ${size} bytes (${Math.round(size / 1024)}KB)`);

 return content;
}

function validateCookiesContent(content) {
 if (!content || content.length < 100) {
  log('Cookies content too short', 'error');
  return false;
 }

 const lines = content.split('\n');
 const youtubeCookies = lines.filter((line) => line.includes('youtube.com') && line.includes('\t') && !line.startsWith('#'));

 const essentialCookies = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
 const foundEssential = essentialCookies.filter((cookie) => lines.some((line) => line.includes(`\t${cookie}\t`)));

 log(`Validation results:`);
 log(`  Total lines: ${lines.length}`);
 log(`  YouTube cookie lines: ${youtubeCookies.length}`);
 log(`  Essential cookies: ${foundEssential.length}/${essentialCookies.length}`);

 if (foundEssential.length > 0) {
  log(`  Found: ${foundEssential.join(', ')}`);
 }

 return youtubeCookies.length > 0;
}

function compressCookies(content) {
 const zlib = require('zlib');

 try {
  const compressed = zlib.gzipSync(Buffer.from(content, 'utf8')).toString('base64');
  const originalSize = Buffer.byteLength(content, 'utf8');
  const compressedSize = compressed.length;

  log(`Compression results:`);
  log(`  Original: ${originalSize} bytes`);
  log(`  Compressed: ${compressedSize} bytes`);
  log(`  Reduction: ${Math.round((1 - compressedSize / originalSize) * 100)}%`);

  return compressed;
 } catch (error) {
  log(`Compression failed: ${error.message}`, 'error');
  return null;
 }
}

function urlEncodeCookies(content) {
 try {
  const encoded = encodeURIComponent(content);
  const originalSize = Buffer.byteLength(content, 'utf8');
  const encodedSize = encoded.length;

  log(`URL encoding results:`);
  log(`  Original: ${originalSize} bytes`);
  log(`  Encoded: ${encodedSize} bytes`);
  log(`  Expansion: ${Math.round((encodedSize / originalSize) * 100)}%`);

  return encoded;
 } catch (error) {
  log(`URL encoding failed: ${error.message}`, 'error');
  return null;
 }
}

function updateAzureAppService(appName, resourceGroup, value, compressed = false) {
 const settingName = compressed ? 'YTDLP_COOKIES_CONTENT_COMPRESSED' : 'YTDLP_COOKIES_CONTENT';

 try {
  log(`Updating Azure App Service setting: ${settingName}`);
  log(`App: ${appName}, Resource Group: ${resourceGroup}`);

  // Create temporary file for large values
  const tempFile = path.join(__dirname, 'temp-cookies.txt');
  fs.writeFileSync(tempFile, value);

  try {
   const command = `az webapp config appsettings set --name "${appName}" --resource-group "${resourceGroup}" --settings ${settingName}="$(cat ${tempFile})"`;

   log('Executing Azure CLI command...');
   execSync(command, {stdio: 'inherit'});
   log('Azure App Service updated successfully');
  } finally {
   // Clean up temp file
   if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
   }
  }

  return true;
 } catch (error) {
  log(`Failed to update Azure App Service: ${error.message}`, 'error');
  return false;
 }
}

function main() {
 const args = process.argv.slice(2);

 if (args.length < 3) {
  console.log('Usage: node update-azure-cookies.js <cookies-file> <app-name> <resource-group> [--compress]');
  console.log('');
  console.log('Examples:');
  console.log('  node update-azure-cookies.js cookies.txt auto-short auto-short-rg');
  console.log('  node update-azure-cookies.js cookies.txt auto-short auto-short-rg --compress');
  process.exit(1);
 }

 const [cookiesFile, appName, resourceGroup] = args;
 const useCompression = args.includes('--compress');

 log('🚀 Azure Cookies Update Utility');
 log('==============================');

 // Step 1: Read and validate cookies
 const content = readCookiesFile(cookiesFile);
 if (!content) {
  process.exit(1);
 }

 if (!validateCookiesContent(content)) {
  log('Cookies validation failed - please check your cookies file', 'error');
  process.exit(1);
 }

 // Step 2: Process cookies based on size and options
 const originalSize = Buffer.byteLength(content, 'utf8');
 const azureLimit = 32768; // 32KB

 let finalValue = content;
 let needsProcessing = originalSize >= azureLimit || useCompression;

 if (needsProcessing) {
  log(`Content size (${originalSize} bytes) requires processing`);

  if (useCompression || originalSize >= azureLimit) {
   log('Using compression...');
   const compressed = compressCookies(content);
   if (compressed && compressed.length < azureLimit) {
    finalValue = compressed;
    log('Will use compressed cookies');
   } else {
    log('Compression did not sufficiently reduce size', 'warn');
   }
  }

  // If still too large, try URL encoding
  if (Buffer.byteLength(finalValue, 'utf8') >= azureLimit) {
   log('Trying URL encoding as fallback...');
   const encoded = urlEncodeCookies(content);
   if (encoded && encoded.length < azureLimit) {
    finalValue = encoded;
    log('Will use URL encoded cookies');
   } else {
    log('Content too large even with encoding - consider using Azure Key Vault', 'error');
    process.exit(1);
   }
  }
 }

 // Step 3: Update Azure App Service
 const success = updateAzureAppService(appName, resourceGroup, finalValue, useCompression);

 if (success) {
  log('✅ Cookies updated successfully!');
  log('');
  log('Next steps:');
  log('1. Restart your Azure App Service');
  log('2. Check the deployment logs for validation results');
  log('3. Test the /api/debug/startup-validation endpoint');
 } else {
  log('❌ Failed to update cookies');
  process.exit(1);
 }
}

// Run if called directly
if (require.main === module) {
 main();
}

module.exports = {readCookiesFile, validateCookiesContent, compressCookies};
