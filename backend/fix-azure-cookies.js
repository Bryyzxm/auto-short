#!/usr/bin/env node

/**
 * Azure Cookies Diagnostic and Fix Utility
 *
 * This script helps diagnose and fix cookie issues in Azure deployment
 */

const fs = require('fs');
const path = require('path');

function log(message, level = 'info') {
 const timestamp = new Date().toISOString();
 const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
 console.log(`${prefix} [${timestamp}] ${message}`);
}

function analyzeEnvironmentVariable(varName) {
 log(`Analyzing environment variable: ${varName}`);

 const content = process.env[varName];
 if (!content) {
  log(`Environment variable ${varName} is not set`, 'error');
  return null;
 }

 const size = Buffer.byteLength(content, 'utf8');
 const azureLimit = 32768; // 32KB

 log(`Variable ${varName}:`);
 log(`  Size: ${size} bytes (${Math.round(size / 1024)}KB)`);
 log(`  Azure limit: ${azureLimit} bytes (32KB)`);
 log(`  Usage: ${Math.round((size / azureLimit) * 100)}%`);

 if (size >= azureLimit) {
  log(`  STATUS: TRUNCATED - Content exceeds Azure limit!`, 'error');
 } else if (size >= azureLimit * 0.95) {
  log(`  STATUS: CRITICAL - Near Azure limit, may be truncated`, 'warn');
 } else {
  log(`  STATUS: OK - Within safe limits`);
 }

 return {content, size, truncated: size >= azureLimit};
}

function analyzeCookieContent(content) {
 log('Analyzing cookie content...');

 if (!content) {
  log('No content to analyze', 'error');
  return null;
 }

 // Check if URL encoded
 const isUrlEncoded = content.includes('%');
 if (isUrlEncoded) {
  log('Content appears to be URL encoded');
  try {
   content = decodeURIComponent(content);
   log(`URL decoded successfully: ${Buffer.byteLength(content, 'utf8')} bytes`);
  } catch (e) {
   log(`URL decode failed: ${e.message}`, 'error');
  }
 }

 const lines = content.split('\n');
 const totalLines = lines.length;
 const commentLines = lines.filter((line) => line.trim().startsWith('#')).length;
 const emptyLines = lines.filter((line) => !line.trim()).length;
 const cookieLines = lines.filter((line) => {
  const trimmed = line.trim();
  return trimmed && !trimmed.startsWith('#') && trimmed.includes('\t');
 });

 const youtubeCookies = cookieLines.filter((line) => line.includes('youtube.com'));

 // Check for essential cookies
 const essentialCookies = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
 const foundEssential = essentialCookies.filter((cookie) => cookieLines.some((line) => line.includes(`\t${cookie}\t`)));

 log('Cookie analysis results:');
 log(`  Total lines: ${totalLines}`);
 log(`  Comment lines: ${commentLines}`);
 log(`  Empty lines: ${emptyLines}`);
 log(`  Cookie lines: ${cookieLines.length}`);
 log(`  YouTube cookies: ${youtubeCookies.length}`);
 log(`  Essential cookies found: ${foundEssential.length}/${essentialCookies.length}`);

 if (foundEssential.length > 0) {
  log(`  Found essential: ${foundEssential.join(', ')}`);
 }

 const missing = essentialCookies.filter((c) => !foundEssential.includes(c));
 if (missing.length > 0) {
  log(`  Missing essential: ${missing.join(', ')}`, 'warn');
 }

 return {
  totalLines,
  cookieLines: cookieLines.length,
  youtubeCookies: youtubeCookies.length,
  essentialCookies: foundEssential.length,
  isValid: youtubeCookies.length > 0,
  content: content,
 };
}

function generateFixRecommendations(envAnalysis, cookieAnalysis) {
 log('Generating fix recommendations...');

 const recommendations = [];

 if (envAnalysis?.truncated) {
  recommendations.push({
   priority: 'CRITICAL',
   issue: 'Environment variable truncated',
   solution: 'Move cookies to Azure Key Vault or use compressed/chunked storage',
  });
 }

 if (cookieAnalysis?.youtubeCookies === 0) {
  recommendations.push({
   priority: 'CRITICAL',
   issue: 'No YouTube cookies found',
   solution: 'Export fresh cookies from authenticated YouTube session',
  });
 }

 if (cookieAnalysis?.essentialCookies < 3) {
  recommendations.push({
   priority: 'HIGH',
   issue: 'Missing essential authentication cookies',
   solution: 'Ensure cookies are exported from fully authenticated YouTube session',
  });
 }

 if (recommendations.length === 0) {
  log('✅ No critical issues found - cookies appear to be in good condition');
 } else {
  log('🔧 Fix recommendations:');
  recommendations.forEach((rec, index) => {
   log(`  ${index + 1}. [${rec.priority}] ${rec.issue}`);
   log(`     Solution: ${rec.solution}`);
  });
 }

 return recommendations;
}

function createFallbackCookies() {
 log('Creating fallback cookies file...');

 const fallbackContent = `# Netscape HTTP Cookie File
# This is a fallback file created by fix-azure-cookies.js
# Replace with valid YouTube cookies for full functionality
# 
# To get valid cookies:
# 1. Log into YouTube in your browser
# 2. Use a browser extension to export cookies in Netscape format
# 3. Update the environment variable or use Azure Key Vault

.youtube.com\tTRUE\t/\tFALSE\t0\tYSC\tfallback_session_${Date.now()}
.youtube.com\tTRUE\t/\tFALSE\t1999999999\tVISITOR_INFO1_LIVE\tfallback_visitor
`;

 const fallbackPath = path.join(__dirname, 'cookies-fallback.txt');

 try {
  fs.writeFileSync(fallbackPath, fallbackContent);
  log(`Fallback cookies created: ${fallbackPath}`);
  log('Update YTDLP_COOKIES_PATH to use this file temporarily');
  return fallbackPath;
 } catch (error) {
  log(`Failed to create fallback cookies: ${error.message}`, 'error');
  return null;
 }
}

function main() {
 log('🔍 Azure Cookies Diagnostic Tool Started');
 log('======================================');

 // Check environment variables
 const envVars = ['YTDLP_COOKIES_CONTENT', 'YOUTUBE_COOKIES_CONTENT', 'COOKIES_CONTENT'];
 let envAnalysis = null;
 let cookieAnalysis = null;

 for (const varName of envVars) {
  const analysis = analyzeEnvironmentVariable(varName);
  if (analysis) {
   envAnalysis = analysis;
   cookieAnalysis = analyzeCookieContent(analysis.content);
   break;
  }
 }

 if (!envAnalysis) {
  log('No cookie environment variables found!', 'error');
  log('Set one of: ' + envVars.join(', '), 'error');
  process.exit(1);
 }

 // Generate recommendations
 const recommendations = generateFixRecommendations(envAnalysis, cookieAnalysis);

 // If critical issues found, offer to create fallback
 const hasCritical = recommendations.some((r) => r.priority === 'CRITICAL');
 if (hasCritical) {
  log('Creating fallback cookies for basic functionality...');
  createFallbackCookies();
 }

 log('======================================');
 log('🔍 Diagnostic Complete');

 // Exit with appropriate code
 process.exit(hasCritical ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
 main();
}

module.exports = {analyzeEnvironmentVariable, analyzeCookieContent, generateFixRecommendations};
