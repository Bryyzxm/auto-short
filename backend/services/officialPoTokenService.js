const fs = require('fs');
const path = require('path');
const {executeYtDlpSecurely} = require('./ytdlpSecureExecutor');

/**
 * Official PO Token Service
 *
 * Based on the official yt-dlp PO Token Guide:
 * https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
 *
 * This service implements the official methods for obtaining and using PO tokens
 * to access YouTube subtitles that require Proof of Origin tokens.
 */
class OfficialPoTokenService {
 constructor() {
  this.tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(this.tempDir)) {
   fs.mkdirSync(this.tempDir, {recursive: true});
  }

  // Cache for PO tokens (they're valid for ~12+ hours)
  this.tokenCache = new Map();
 }

 /**
  * Extract transcript using official PO token methods
  * @param {string} videoId - YouTube video ID
  * @returns {Promise<object>} - Transcript extraction result
  */
 async extractWithPoToken(videoId) {
  console.log(`[PO-TOKEN-SERVICE] 🔐 Starting PO token extraction for ${videoId}`);
  console.log(`[PO-TOKEN-SERVICE] 📖 Based on: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide`);

  try {
   // Method 1: Try with automatic PO token provider plugin
   const pluginResult = await this.tryWithPoTokenPlugin(videoId);
   if (pluginResult) {
    console.log(`[PO-TOKEN-SERVICE] ✅ Success with PO token plugin`);
    return pluginResult;
   }

   // Method 2: Try with mweb client and manual token guidance
   const mwebResult = await this.tryWithMwebClient(videoId);
   if (mwebResult) {
    console.log(`[PO-TOKEN-SERVICE] ✅ Success with mweb client`);
    return mwebResult;
   }

   // Method 3: Try with different client configurations
   const clientResult = await this.tryWithAlternativeClients(videoId);
   if (clientResult) {
    console.log(`[PO-TOKEN-SERVICE] ✅ Success with alternative client`);
    return clientResult;
   }

   throw new Error('All PO token methods failed');
  } catch (error) {
   console.log(`[PO-TOKEN-SERVICE] ❌ PO token extraction failed: ${error.message}`);
   throw error;
  }
 }

 /**
  * Method 1: Try with recommended PO token provider plugin
  */
 async tryWithPoTokenPlugin(videoId) {
  console.log(`[PO-TOKEN-SERVICE] 🔌 Method 1: Checking for PO token provider plugins`);

  try {
   // Check if bgutil-ytdlp-pot-provider plugin is available
   // 🧠 SMART DETECTION: Use adaptive language strategy to avoid rate limiting
   const SmartLanguageDetector = require('../utils/smartLanguageDetector');
   const detector = new SmartLanguageDetector();
   const analysis = await detector.analyzeVideo(videoId);
   const languageParam = detector.getYtDlpLanguageParam(analysis.strategy);

   console.log(`[PO-TOKEN-SERVICE] 🧠 Using ${analysis.strategy} strategy: ${languageParam}`);

   const pluginArgs = ['--write-auto-sub', '--sub-format', 'vtt', '--sub-lang', languageParam, '--skip-download', '--output', path.join(this.tempDir, `${videoId}_plugin.%(ext)s`), `https://www.youtube.com/watch?v=${videoId}`];

   console.log(`[PO-TOKEN-SERVICE] 🔌 Attempting extraction with PO token plugins`);
   const result = await executeYtDlpSecurely(pluginArgs);

   // Check for successful subtitle extraction
   const vttFile = this.findSubtitleFile(videoId, '_plugin');
   if (vttFile) {
    const segments = this.parseVttFile(vttFile);
    const isIndonesian = vttFile.includes('.id.vtt');
    const detectedLanguage = isIndonesian ? 'indonesian' : 'english';

    console.log(`[PO-TOKEN-SERVICE] ✅ Plugin extraction successful: ${segments.length} segments`);
    console.log(`[PO-TOKEN-SERVICE] 🌐 Detected language: ${detectedLanguage}`);

    return {
     segments: segments.map((seg) => ({
      text: seg.text,
      start: seg.start,
      duration: seg.end - seg.start,
     })),
     method: 'po-token-plugin',
     source: 'official-po-token-plugin',
     language: detectedLanguage, // CRITICAL: Pass detected language
     duration: Date.now(),
    };
   }
  } catch (error) {
   console.log(`[PO-TOKEN-SERVICE] ⚠️  Plugin method failed: ${error.message}`);
  }

  return null;
 }

 /**
  * Method 2: Try with mweb client (requires manual PO token setup)
  */
 async tryWithMwebClient(videoId) {
  console.log(`[PO-TOKEN-SERVICE] 📱 Method 2: Using mweb client approach`);
  console.log(`[PO-TOKEN-SERVICE] 📖 Guide: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide#guide-providing-a-po-token-manually-for-use-with-mweb-client`);

  try {
   // Check if user has provided PO token via environment
   const poToken = process.env.YOUTUBE_PO_TOKEN || process.env.PO_TOKEN;

   if (poToken) {
    console.log(`[PO-TOKEN-SERVICE] 🔑 Found PO token in environment, using mweb client`);

    // 🧠 SMART DETECTION: Use adaptive language strategy
    const SmartLanguageDetector = require('../utils/smartLanguageDetector');
    const detector = new SmartLanguageDetector();
    const analysis = await detector.analyzeVideo(videoId);
    const languageParam = detector.getYtDlpLanguageParam(analysis.strategy);

    console.log(`[PO-TOKEN-SERVICE] 🧠 Using ${analysis.strategy} strategy for mweb: ${languageParam}`);

    const mwebArgs = [
     '--write-auto-sub',
     '--sub-format',
     'vtt',
     '--sub-lang',
     languageParam, // Smart language detection instead of hardcoded
     '--skip-download',
     '--output',
     path.join(this.tempDir, `${videoId}_mweb.%(ext)s`),
     '--extractor-args',
     `youtube:player_client=default,mweb;po_token=${poToken}`,
     '--cookies',
     path.join(__dirname, '../cookies.txt'),
     `https://www.youtube.com/watch?v=${videoId}`,
    ];

    const result = await executeYtDlpSecurely(mwebArgs);

    const vttFile = this.findSubtitleFile(videoId, '_mweb');
    if (vttFile) {
     const segments = this.parseVttFile(vttFile);
     const isIndonesian = vttFile.includes('.id.vtt');
     const detectedLanguage = isIndonesian ? 'indonesian' : 'english';

     console.log(`[PO-TOKEN-SERVICE] ✅ mweb extraction successful: ${segments.length} segments`);
     console.log(`[PO-TOKEN-SERVICE] 🌐 Detected language: ${detectedLanguage}`);

     return {
      segments: segments.map((seg) => ({
       text: seg.text,
       start: seg.start,
       duration: seg.end - seg.start,
      })),
      method: 'mweb-po-token',
      source: 'official-mweb-client',
      language: detectedLanguage, // CRITICAL: Pass detected language
      duration: Date.now(),
     };
    }
   } else {
    console.log(`[PO-TOKEN-SERVICE] ℹ️  No PO token found in environment variables`);
    console.log(`[PO-TOKEN-SERVICE] 💡 To use mweb client, set YOUTUBE_PO_TOKEN environment variable`);
    console.log(`[PO-TOKEN-SERVICE] 📖 Instructions: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide#po-token-for-gvs`);
   }
  } catch (error) {
   console.log(`[PO-TOKEN-SERVICE] ⚠️  mweb method failed: ${error.message}`);
  }

  return null;
 }

 /**
  * Method 3: Try with alternative client configurations that may not require PO tokens
  */
 async tryWithAlternativeClients(videoId) {
  console.log(`[PO-TOKEN-SERVICE] 🔄 Method 3: Trying alternative clients`);

  const clientConfigs = [
   {
    name: 'tv_embedded',
    args: ['--extractor-args', 'youtube:player_client=tv_embedded'],
    description: 'TV embedded client (no PO token required)',
   },
   {
    name: 'web_embedded',
    args: ['--extractor-args', 'youtube:player_client=web_embedded'],
    description: 'Web embedded client (no PO token required)',
   },
   {
    name: 'tv_simply',
    args: ['--extractor-args', 'youtube:player_client=tv_simply'],
    description: 'TV simply client (no cookies support, no PO token)',
   },
  ];

  for (const config of clientConfigs) {
   try {
    console.log(`[PO-TOKEN-SERVICE] 🔧 Trying ${config.name}: ${config.description}`);

    // 🧠 SMART DETECTION: Use adaptive language strategy
    const SmartLanguageDetector = require('../utils/smartLanguageDetector');
    const detector = new SmartLanguageDetector();
    const analysis = await detector.analyzeVideo(videoId);
    const languageParam = detector.getYtDlpLanguageParam(analysis.strategy);

    console.log(`[PO-TOKEN-SERVICE] 🧠 Using ${analysis.strategy} strategy for ${config.name}: ${languageParam}`);

    const clientArgs = [
     '--write-auto-sub',
     '--sub-format',
     'vtt',
     '--sub-lang',
     languageParam, // Smart language detection instead of hardcoded
     '--skip-download',
     '--output',
     path.join(this.tempDir, `${videoId}_${config.name}.%(ext)s`),
     ...config.args,
     `https://www.youtube.com/watch?v=${videoId}`,
    ];

    await executeYtDlpSecurely(clientArgs);

    const vttFile = this.findSubtitleFile(videoId, `_${config.name}`);
    if (vttFile) {
     const segments = this.parseVttFile(vttFile);
     const isIndonesian = vttFile.includes('.id.vtt');
     const detectedLanguage = isIndonesian ? 'indonesian' : 'english';

     console.log(`[PO-TOKEN-SERVICE] ✅ ${config.name} successful: ${segments.length} segments`);
     console.log(`[PO-TOKEN-SERVICE] 🌐 Detected language: ${detectedLanguage}`);

     return {
      segments: segments.map((seg) => ({
       text: seg.text,
       start: seg.start,
       duration: seg.end - seg.start,
      })),
      method: config.name,
      source: `official-${config.name}-client`,
      language: detectedLanguage, // CRITICAL: Pass detected language
      duration: Date.now(),
     };
    }
   } catch (error) {
    console.log(`[PO-TOKEN-SERVICE] ⚠️  ${config.name} failed: ${error.message}`);
   }
  }

  return null;
 }

 /**
  * Find subtitle file with given pattern - PRIORITIZE INDONESIAN
  */
 findSubtitleFile(videoId, suffix = '') {
  // CRITICAL FIX: Prioritize Indonesian (.id.vtt) files first
  const possibleFiles = [
   // Indonesian files (highest priority)
   path.join(this.tempDir, `${videoId}${suffix}.id.vtt`),
   path.join(this.tempDir, `${videoId}.id.vtt`),
   // English files (fallback only)
   path.join(this.tempDir, `${videoId}${suffix}.en.vtt`),
   path.join(this.tempDir, `${videoId}.en.vtt`),
   // Generic files (last resort)
   path.join(this.tempDir, `${videoId}${suffix}.vtt`),
   path.join(this.tempDir, `${videoId}.vtt`),
  ];

  for (const file of possibleFiles) {
   if (fs.existsSync(file)) {
    const isIndonesian = file.includes('.id.vtt');
    const language = isIndonesian ? 'Indonesian' : 'English';

    console.log(`[PO-TOKEN-SERVICE] 📄 Found subtitle file: ${path.basename(file)} (${language})`);

    // Log priority selection for debugging
    if (isIndonesian) {
     console.log(`[PO-TOKEN-SERVICE] ✅ PRIORITIZING Indonesian content as requested`);
    } else {
     console.log(`[PO-TOKEN-SERVICE] 📝 Using ${language} content (Indonesian not available)`);
    }

    return file;
   }
  }

  console.log(`[PO-TOKEN-SERVICE] ❌ No subtitle files found for ${videoId}`);
  return null;
 }

 /**
  * Parse VTT file into segments
  */
 parseVttFile(vttFilePath) {
  try {
   const content = fs.readFileSync(vttFilePath, 'utf8');

   // Clean up the file after reading
   try {
    fs.unlinkSync(vttFilePath);
    console.log(`[PO-TOKEN-SERVICE] 🧹 Cleaned up: ${path.basename(vttFilePath)}`);
   } catch (cleanupError) {
    console.log(`[PO-TOKEN-SERVICE] ⚠️  Could not clean up ${path.basename(vttFilePath)}`);
   }

   const segments = [];
   const lines = content.split('\n');

   for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for timestamp lines (format: 00:00:00.000 --> 00:00:00.000)
    if (line.includes('-->')) {
     const [startTime, endTimeRaw] = line.split(' --> ');
     // Clean up end time by removing any VTT styling attributes
     const endTime = endTimeRaw.split(' ')[0];
     const textLines = [];

     // Collect text lines until empty line or next timestamp
     for (let j = i + 1; j < lines.length; j++) {
      const textLine = lines[j].trim();
      if (!textLine || textLine.includes('-->')) {
       break;
      }
      textLines.push(textLine);
     }

     if (textLines.length > 0) {
      const start = this.parseTime(startTime);
      const end = this.parseTime(endTime);
      segments.push({
       start: start,
       end: end,
       text: textLines.join(' ').replace(/<[^>]*>/g, ''), // Remove HTML tags
      });
     }
    }
   }

   return segments;
  } catch (error) {
   console.log(`[PO-TOKEN-SERVICE] ❌ Error parsing VTT file: ${error.message}`);
   return [];
  }
 }

 /**
  * Parse time string to seconds
  */
 parseTime(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
   const hours = parseInt(parts[0]);
   const minutes = parseInt(parts[1]);
   const seconds = parseFloat(parts[2].replace(',', '.'));
   return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
 }

 /**
  * Get setup instructions for PO tokens
  */
 getSetupInstructions() {
  return {
   title: '🔐 PO Token Setup Instructions',
   description: 'To access YouTube videos requiring PO tokens, you have several options:',
   methods: [
    {
     method: '1. Automatic Plugin (Recommended)',
     description: 'Install bgutil-ytdlp-pot-provider plugin',
     instructions: ['pip install bgutil-ytdlp-pot-provider', 'Plugin will automatically handle PO token generation'],
     link: 'https://github.com/Brainicism/bgutil-ytdlp-pot-provider',
    },
    {
     method: '2. Manual PO Token (Advanced)',
     description: 'Extract PO token manually from browser',
     instructions: [
      '1. Open YouTube Music (music.youtube.com) in browser',
      '2. Open Developer Console (F12) → Network tab',
      "3. Filter by 'v1/player'",
      '4. Play a video and find the player request',
      '5. Extract PO token from serviceIntegrityDimensions.poToken',
      '6. Set environment variable: YOUTUBE_PO_TOKEN=your_token_here',
     ],
     link: 'https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide#po-token-for-gvs',
    },
    {
     method: '3. Alternative Clients',
     description: "Use clients that don't require PO tokens",
     instructions: ['tv_embedded - Works for most videos', 'web_embedded - Only embeddable videos', 'tv_simply - No cookies support but no PO token needed'],
     link: 'https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide#current-po-token-enforcement',
    },
   ],
   officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide',
  };
 }
}

module.exports = OfficialPoTokenService;
