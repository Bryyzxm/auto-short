/**
 * Comprehensive Transcript Debugging Tool
 * Systematic analysis of transcript extraction issues
 */

const fs = require('fs');
const path = require('path');
const {execSync, spawn} = require('child_process');

class TranscriptDebugger {
 constructor() {
  this.results = {
   environment: {},
   cookies: {},
   ytdlp: {},
   services: {},
   botDetection: {},
   alternatives: {},
  };
  this.testVideos = [
   {id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', type: 'popular'},
   {id: 'rHpMT4leNeg', title: 'Ganti Password Kalian Sekarang!', type: 'problematic'},
   {id: 'jNQXAC9IVRw', title: 'Me at the zoo', type: 'first_youtube'},
   {id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito', type: 'most_viewed'},
  ];
 }

 log(category, message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] [${category.toUpperCase()}] ${message}`);
  if (data) {
   console.log(JSON.stringify(data, null, 2));
  }
 }

 async runDiagnostics() {
  console.log('\n🚀 STARTING COMPREHENSIVE TRANSCRIPT DIAGNOSTICS\n');

  try {
   await this.testEnvironment();
   await this.analyzeCookies();
   await this.testYtDlpDirect();
   await this.testServiceLayers();
   await this.analyzeBotDetection();
   await this.testAlternativeMethods();

   this.generateReport();
  } catch (error) {
   this.log('error', `Diagnostics failed: ${error.message}`);
   console.error(error);
  }
 }

 async testEnvironment() {
  this.log('env', 'Testing environment setup...');

  try {
   // Check Node.js version
   this.results.environment.nodeVersion = process.version;

   // Check yt-dlp binary
   const ytdlpPath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');
   this.results.environment.ytdlpExists = fs.existsSync(ytdlpPath);

   if (this.results.environment.ytdlpExists) {
    const stats = fs.statSync(ytdlpPath);
    this.results.environment.ytdlpSize = stats.size;
    this.results.environment.ytdlpModified = stats.mtime;
   }

   // Check cookies file
   const cookiesPath = path.join(__dirname, 'cookies.txt');
   this.results.environment.cookiesExists = fs.existsSync(cookiesPath);

   if (this.results.environment.cookiesExists) {
    const cookiesStats = fs.statSync(cookiesPath);
    this.results.environment.cookiesSize = cookiesStats.size;
    this.results.environment.cookiesModified = cookiesStats.mtime;
   }

   // Check temp directory
   const tempPath = path.join(__dirname, 'temp');
   this.results.environment.tempExists = fs.existsSync(tempPath);

   this.log('env', 'Environment check completed', this.results.environment);
  } catch (error) {
   this.log('env', `Environment test failed: ${error.message}`);
  }
 }

 async analyzeCookies() {
  this.log('cookies', 'Analyzing cookie file...');

  try {
   const cookiesPath = path.join(__dirname, 'cookies.txt');
   if (!fs.existsSync(cookiesPath)) {
    this.results.cookies.status = 'missing';
    return;
   }

   const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
   const lines = cookiesContent.split('\n');

   this.results.cookies.totalLines = lines.length;
   this.results.cookies.hasNetscapeHeader = lines[0].includes('Netscape');

   // Analyze YouTube cookies
   const youtubeCookies = lines.filter((line) => line.includes('.youtube.com') && !line.startsWith('#'));

   this.results.cookies.youtubeCount = youtubeCookies.length;

   // Check for essential cookies
   const essentialCookies = ['HSID', 'SSID', 'APISID', 'SAPISID', 'SID'];
   this.results.cookies.essential = {};

   essentialCookies.forEach((cookie) => {
    this.results.cookies.essential[cookie] = youtubeCookies.some((line) => line.includes(cookie));
   });

   // Check cookie age
   const fileStats = fs.statSync(cookiesPath);
   const ageHours = (Date.now() - fileStats.mtime.getTime()) / (1000 * 60 * 60);
   this.results.cookies.ageHours = ageHours;
   this.results.cookies.isStale = ageHours > 24; // Consider stale after 24 hours

   this.log('cookies', 'Cookie analysis completed', this.results.cookies);
  } catch (error) {
   this.log('cookies', `Cookie analysis failed: ${error.message}`);
  }
 }

 async testYtDlpDirect() {
  this.log('ytdlp', 'Testing yt-dlp direct execution...');

  try {
   const ytdlpPath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');

   // Test 1: Version check
   try {
    const version = execSync(`"${ytdlpPath}" --version`, {
     encoding: 'utf8',
     timeout: 10000,
    }).trim();
    this.results.ytdlp.version = version;
    this.results.ytdlp.versionCheck = 'success';
   } catch (error) {
    this.results.ytdlp.versionCheck = 'failed';
    this.results.ytdlp.versionError = error.message;
   }

   // Test 2: Simple extraction without cookies
   const testVideo = 'dQw4w9WgXcQ';
   try {
    this.log('ytdlp', `Testing extraction without cookies: ${testVideo}`);
    const result = execSync(`"${ytdlpPath}" --print title "${testVideo}"`, {
     encoding: 'utf8',
     timeout: 30000,
    }).trim();
    this.results.ytdlp.noCookiesTest = 'success';
    this.results.ytdlp.extractedTitle = result;
   } catch (error) {
    this.results.ytdlp.noCookiesTest = 'failed';
    this.results.ytdlp.noCookiesError = error.message;
   }

   // Test 3: Extraction with cookies
   const cookiesPath = path.join(__dirname, 'cookies.txt');
   if (fs.existsSync(cookiesPath)) {
    try {
     this.log('ytdlp', `Testing extraction with cookies: ${testVideo}`);
     const result = execSync(`"${ytdlpPath}" --cookies "${cookiesPath}" --print title "${testVideo}"`, {
      encoding: 'utf8',
      timeout: 30000,
     }).trim();
     this.results.ytdlp.cookiesTest = 'success';
     this.results.ytdlp.cookiesExtractedTitle = result;
    } catch (error) {
     this.results.ytdlp.cookiesTest = 'failed';
     this.results.ytdlp.cookiesError = error.message;
    }
   }

   this.log('ytdlp', 'yt-dlp direct tests completed', this.results.ytdlp);
  } catch (error) {
   this.log('ytdlp', `yt-dlp testing failed: ${error.message}`);
  }
 }

 async testServiceLayers() {
  this.log('services', 'Testing service layer functionality...');

  try {
   // Test robustTranscriptServiceV2
   try {
    const robustService = require('./services/robustTranscriptServiceV2');
    this.results.services.robustServiceLoaded = true;

    // Quick test with a simple video
    this.log('services', 'Testing robust service with simple extraction...');
    const result = await Promise.race([robustService.extract('dQw4w9WgXcQ'), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))]);

    this.results.services.robustServiceTest = 'success';
    this.results.services.robustResult = {
     hasTranscript: !!result.transcript,
     transcriptLength: result.transcript ? result.transcript.length : 0,
     success: result.success,
    };
   } catch (error) {
    this.results.services.robustServiceTest = 'failed';
    this.results.services.robustError = error.message;
   }

   // Test advancedTranscriptExtractor
   try {
    const AdvancedTranscriptExtractor = require('./services/advancedTranscriptExtractor');
    const extractor = new AdvancedTranscriptExtractor();
    this.results.services.advancedExtractorLoaded = true;

    this.log('services', 'Testing advanced extractor...');
    const result = await Promise.race([extractor.extract('dQw4w9WgXcQ'), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))]);

    this.results.services.advancedExtractorTest = 'success';
    this.results.services.advancedResult = {
     hasTranscript: !!result.transcript,
     transcriptLength: result.transcript ? result.transcript.length : 0,
     strategy: result.strategy,
    };
   } catch (error) {
    this.results.services.advancedExtractorTest = 'failed';
    this.results.services.advancedError = error.message;
   }

   this.log('services', 'Service layer tests completed', this.results.services);
  } catch (error) {
   this.log('services', `Service testing failed: ${error.message}`);
  }
 }

 async analyzeBotDetection() {
  this.log('bot', 'Analyzing bot detection patterns...');

  try {
   const botPatterns = [
    'The following content is not available on this app',
    'Watch on the latest version of YouTube',
    "Sign in to confirm you're not a bot",
    'This video is not available',
    'Private video',
    'Video unavailable',
    'HTTP Error 403',
    'HTTP Error 429',
   ];

   this.results.botDetection.patterns = botPatterns;
   this.results.botDetection.detectedIn = [];

   // Check previous error logs for bot detection patterns
   if (this.results.ytdlp.noCookiesError) {
    botPatterns.forEach((pattern) => {
     if (this.results.ytdlp.noCookiesError.includes(pattern)) {
      this.results.botDetection.detectedIn.push(`ytdlp-no-cookies: ${pattern}`);
     }
    });
   }

   if (this.results.ytdlp.cookiesError) {
    botPatterns.forEach((pattern) => {
     if (this.results.ytdlp.cookiesError.includes(pattern)) {
      this.results.botDetection.detectedIn.push(`ytdlp-cookies: ${pattern}`);
     }
    });
   }

   if (this.results.services.robustError) {
    botPatterns.forEach((pattern) => {
     if (this.results.services.robustError.includes(pattern)) {
      this.results.botDetection.detectedIn.push(`robust-service: ${pattern}`);
     }
    });
   }

   this.results.botDetection.isBotDetected = this.results.botDetection.detectedIn.length > 0;

   this.log('bot', 'Bot detection analysis completed', this.results.botDetection);
  } catch (error) {
   this.log('bot', `Bot detection analysis failed: ${error.message}`);
  }
 }

 async testAlternativeMethods() {
  this.log('alt', 'Testing alternative extraction methods...');

  try {
   // Test 1: Different user agents
   const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'com.google.android.youtube/19.50.37 (Linux; U; Android 14; SM-G998B Build/UP1A.231005.007) gzip',
   ];

   this.results.alternatives.userAgentTests = [];

   for (const ua of userAgents) {
    try {
     const ytdlpPath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');
     const result = execSync(`"${ytdlpPath}" --user-agent "${ua}" --print title "dQw4w9WgXcQ"`, {
      encoding: 'utf8',
      timeout: 20000,
     }).trim();

     this.results.alternatives.userAgentTests.push({
      userAgent: ua.substring(0, 50) + '...',
      status: 'success',
      title: result,
     });
    } catch (error) {
     this.results.alternatives.userAgentTests.push({
      userAgent: ua.substring(0, 50) + '...',
      status: 'failed',
      error: error.message.substring(0, 100),
     });
    }
   }

   // Test 2: Different client configurations
   const clientConfigs = ['android', 'web', 'ios', 'tv'];

   this.results.alternatives.clientTests = [];

   for (const client of clientConfigs) {
    try {
     const ytdlpPath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');
     const result = execSync(`"${ytdlpPath}" --extractor-args "youtube:player_client=${client}" --print title "dQw4w9WgXcQ"`, {
      encoding: 'utf8',
      timeout: 20000,
     }).trim();

     this.results.alternatives.clientTests.push({
      client: client,
      status: 'success',
      title: result,
     });
    } catch (error) {
     this.results.alternatives.clientTests.push({
      client: client,
      status: 'failed',
      error: error.message.substring(0, 100),
     });
    }
   }

   this.log('alt', 'Alternative methods tests completed', this.results.alternatives);
  } catch (error) {
   this.log('alt', `Alternative methods testing failed: ${error.message}`);
  }
 }

 generateReport() {
  console.log('\n📊 COMPREHENSIVE TRANSCRIPT DEBUGGING REPORT');
  console.log('==============================================\n');

  // Environment Summary
  console.log('🔧 ENVIRONMENT STATUS:');
  console.log(`   Node.js: ${this.results.environment.nodeVersion}`);
  console.log(`   yt-dlp Binary: ${this.results.environment.ytdlpExists ? '✅ Found' : '❌ Missing'}`);
  console.log(`   Cookies File: ${this.results.environment.cookiesExists ? '✅ Found' : '❌ Missing'}`);
  console.log(`   Temp Directory: ${this.results.environment.tempExists ? '✅ Found' : '❌ Missing'}\n`);

  // Cookie Status
  console.log('🍪 COOKIES STATUS:');
  if (this.results.cookies.status === 'missing') {
   console.log('   ❌ No cookies file found');
  } else {
   console.log(`   📁 File Size: ${this.results.environment.cookiesSize} bytes`);
   console.log(`   📅 Age: ${this.results.cookies.ageHours?.toFixed(1)} hours`);
   console.log(`   ⚠️  Stale: ${this.results.cookies.isStale ? 'YES (>24h)' : 'NO'}`);
   console.log(`   🎯 YouTube Cookies: ${this.results.cookies.youtubeCount}`);
   console.log('   Essential Cookies:');
   Object.entries(this.results.cookies.essential || {}).forEach(([cookie, present]) => {
    console.log(`     ${present ? '✅' : '❌'} ${cookie}`);
   });
  }
  console.log();

  // yt-dlp Status
  console.log('📦 YT-DLP STATUS:');
  console.log(`   Version: ${this.results.ytdlp.version || 'Unknown'}`);
  console.log(`   Version Check: ${this.results.ytdlp.versionCheck === 'success' ? '✅' : '❌'}`);
  console.log(`   No Cookies Test: ${this.results.ytdlp.noCookiesTest === 'success' ? '✅' : '❌'}`);
  console.log(`   With Cookies Test: ${this.results.ytdlp.cookiesTest === 'success' ? '✅' : '❌'}`);

  if (this.results.ytdlp.noCookiesError) {
   console.log(`   No Cookies Error: ${this.results.ytdlp.noCookiesError}`);
  }
  if (this.results.ytdlp.cookiesError) {
   console.log(`   Cookies Error: ${this.results.ytdlp.cookiesError}`);
  }
  console.log();

  // Service Layer Status
  console.log('⚙️  SERVICE LAYER STATUS:');
  console.log(`   Robust Service: ${this.results.services.robustServiceTest === 'success' ? '✅' : '❌'}`);
  console.log(`   Advanced Extractor: ${this.results.services.advancedExtractorTest === 'success' ? '✅' : '❌'}`);

  if (this.results.services.robustError) {
   console.log(`   Robust Error: ${this.results.services.robustError}`);
  }
  if (this.results.services.advancedError) {
   console.log(`   Advanced Error: ${this.results.services.advancedError}`);
  }
  console.log();

  // Bot Detection Analysis
  console.log('🤖 BOT DETECTION ANALYSIS:');
  console.log(`   Bot Detection: ${this.results.botDetection.isBotDetected ? '🚨 DETECTED' : '✅ Not detected'}`);
  if (this.results.botDetection.detectedIn?.length > 0) {
   console.log('   Detected in:');
   this.results.botDetection.detectedIn.forEach((detection) => {
    console.log(`     • ${detection}`);
   });
  }
  console.log();

  // Alternative Methods
  console.log('🔄 ALTERNATIVE METHODS:');
  console.log('   User Agent Tests:');
  this.results.alternatives.userAgentTests?.forEach((test) => {
   console.log(`     ${test.status === 'success' ? '✅' : '❌'} ${test.userAgent}`);
  });

  console.log('   Client Tests:');
  this.results.alternatives.clientTests?.forEach((test) => {
   console.log(`     ${test.status === 'success' ? '✅' : '❌'} ${test.client}`);
  });
  console.log();

  // Recommendations
  this.generateRecommendations();
 }

 generateRecommendations() {
  console.log('💡 RECOMMENDATIONS:');

  const recommendations = [];

  if (!this.results.environment.ytdlpExists) {
   recommendations.push('Install or repair yt-dlp binary');
  }

  if (!this.results.environment.cookiesExists) {
   recommendations.push('Create cookies.txt file from browser session');
  } else if (this.results.cookies.isStale) {
   recommendations.push('Update cookies.txt - current cookies are stale (>24h)');
  }

  if (this.results.botDetection.isBotDetected) {
   recommendations.push('Implement bot detection bypass strategies');
   recommendations.push('Try different user agents and client configurations');
   recommendations.push('Consider using proxy or VPN');
  }

  if (this.results.ytdlp.versionCheck !== 'success') {
   recommendations.push('Update yt-dlp to latest version');
  }

  if (this.results.services.robustServiceTest !== 'success' && this.results.services.advancedExtractorTest !== 'success') {
   recommendations.push('Service layer needs debugging - both services failed');
  }

  // Check if any alternative methods worked
  const workingUserAgents = this.results.alternatives.userAgentTests?.filter((t) => t.status === 'success') || [];
  const workingClients = this.results.alternatives.clientTests?.filter((t) => t.status === 'success') || [];

  if (workingUserAgents.length > 0) {
   recommendations.push(`Use working user agents: Found ${workingUserAgents.length} successful`);
  }

  if (workingClients.length > 0) {
   recommendations.push(`Use working client configs: ${workingClients.map((c) => c.client).join(', ')}`);
  }

  if (recommendations.length === 0) {
   recommendations.push('All tests passed - investigate specific video issues');
  }

  recommendations.forEach((rec, index) => {
   console.log(`   ${index + 1}. ${rec}`);
  });

  console.log('\n==============================================');
  console.log('📋 Debug session completed at', new Date().toISOString());
 }
}

// Export for testing
module.exports = TranscriptDebugger;

// Run diagnostics if called directly
if (require.main === module) {
 const transcriptDebugger = new TranscriptDebugger();
 transcriptDebugger.runDiagnostics().catch(console.error);
}
