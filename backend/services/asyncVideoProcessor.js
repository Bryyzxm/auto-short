// ================================
// 🎬 ASYNC VIDEO PROCESSING FUNCTION
// ================================

const fs = require('fs');
const path = require('path');
const {v4: uuidv4} = require('uuid');

/**
 * Async video processing function for job manager
 * This function performs the complete video processing workflow without blocking HTTP requests
 */
async function processVideoAsync(params, progressCallback) {
 const {youtubeUrl, start, end, aspectRatio} = params;
 const id = uuidv4();

 progressCallback(5, 'Initializing video processing...');

 // 🚨 CRITICAL FIX: Azure working directory path resolution
 let tempFile;
 let workingDir;

 // Import azureEnv from main server context
 const azureEnv = global.azureEnv || {isAzure: false};

 if (azureEnv.isAzure) {
  // In Azure: Use backend directory explicitly to match yt-dlp execution context
  workingDir = path.join('/home/site/wwwroot', 'backend');
  tempFile = path.join(workingDir, `${id}.mp4`);
  console.log(`[${id}] 🌐 Azure Mode: Using backend working directory`);
  console.log(`[${id}] 📁 Working directory: ${workingDir}`);
  console.log(`[${id}] 📍 Expected file path: ${tempFile}`);

  // Ensure working directory exists and is accessible
  try {
   if (!fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, {recursive: true});
    console.log(`[${id}] 📁 Created working directory: ${workingDir}`);
   }

   // Test write permissions
   const testFile = path.join(workingDir, `.write-test-${Date.now()}`);
   fs.writeFileSync(testFile, 'test');
   fs.unlinkSync(testFile);
   console.log(`[${id}] ✅ Working directory is writable`);
  } catch (dirError) {
   console.error(`[${id}] ❌ Working directory issue: ${dirError.message}`);
   // Fallback to process.cwd() if backend directory fails
   workingDir = process.cwd();
   tempFile = path.join(workingDir, `${id}.mp4`);
   console.log(`[${id}] 🔄 Fallback to process.cwd(): ${workingDir}`);
  }
 } else {
  // Local development: Use standard process.cwd()
  workingDir = process.cwd();
  tempFile = path.join(workingDir, `${id}.mp4`);
  console.log(`[${id}] 💻 Local Mode: Using process.cwd()`);
 }

 console.log(`[${id}] Starting video processing: ${youtubeUrl} (${start}s - ${end}s, ratio: ${aspectRatio})`);
 console.log(`[${id}] 🔧 Environment: ${azureEnv.isAzure ? 'Azure App Service' : 'Local Development'}`);
 console.log(`[${id}] 📁 Working directory: ${workingDir}`);
 console.log(`[${id}] 📍 Target file: ${tempFile}`);

 try {
  progressCallback(10, 'Checking video formats...');

  // Import required functions from global scope
  const checkVideoFormats = global.checkVideoFormats;
  const buildYtDlpArgs = global.buildYtDlpArgs;
  const executeWithFallbackStrategies = global.executeWithFallbackStrategies;
  const YT_DLP_PATH = global.YT_DLP_PATH;

  // Check video formats with aggressive fallback handling
  const formatCheck = await checkVideoFormats(id, youtubeUrl);
  if (!formatCheck.success) {
   console.log(`[${id}] ❌ Format check failed: ${formatCheck.error}`);
   console.log(`[${id}] 🎯 Attempting direct download bypass...`);
   progressCallback(15, 'Format check failed, using direct download...');
  } else {
   console.log(`[${id}] ✅ Format check passed with strategy: ${formatCheck.strategy}`);
   progressCallback(20, 'Format check successful, starting download...');
  }

  // Download video
  console.time(`[${id}] yt-dlp download`);
  progressCallback(25, 'Downloading video from YouTube...');

  // Choose download strategy based on format check results
  const useSimpleFormat = !formatCheck.success || formatCheck.strategy === 'optimistic' || formatCheck.skipFormatCheck;
  const ytDlpArgs = buildYtDlpArgs(tempFile, youtubeUrl, useSimpleFormat, workingDir);

  console.log(`[${id}] yt-dlp command (${useSimpleFormat ? 'SIMPLE' : 'ADVANCED'}): ${YT_DLP_PATH} ${ytDlpArgs.join(' ')}`);

  let downloadSuccess = false;

  try {
   const fallbackResult = await executeWithFallbackStrategies(ytDlpArgs, {
    purpose: 'download',
    timeout: 300000,
    maxBuffer: 1024 * 1024 * 50,
    workingDir: workingDir,
   });

   const {output = '', strategy = 'unknown'} = fallbackResult || {};
   console.log(`[${id}] download strategy used: ${strategy}`);
   console.log(`[${id}] yt-dlp output: ${output.substring(0, 500)}...`);

   progressCallback(60, 'Download completed, verifying file...');
   downloadSuccess = true;
  } catch (downloadErr) {
   console.log(`[${id}] 🔄 Primary download failed, trying backup strategy`);
   progressCallback(40, 'Primary download failed, trying backup strategy...');

   // Backup strategy with ultra-simplified format
   const backupOutputPath = workingDir ? path.relative(workingDir, tempFile) : path.basename(tempFile);
   const backupArgs = [
    '-f',
    'best',
    '--no-playlist',
    '--no-warnings',
    '--merge-output-format',
    'mp4',
    '--user-agent',
    'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    '--extractor-args',
    'youtube:player_client=android',
    '--socket-timeout',
    '20',
    '--retries',
    '2',
    '-o',
    backupOutputPath,
    youtubeUrl,
   ];

   console.log(`[${id}] 🔄 Backup command: ${YT_DLP_PATH} ${backupArgs.join(' ')}`);

   const backupResult = await executeWithFallbackStrategies(backupArgs, {
    purpose: 'backup-download',
    timeout: 300000,
    maxBuffer: 1024 * 1024 * 50,
    workingDir: workingDir,
   });

   console.log(`[${id}] ✅ Backup download successful with strategy: ${backupResult?.strategy || 'unknown'}`);
   progressCallback(60, 'Backup download completed, verifying file...');
   downloadSuccess = true;
  }

  // Verify file exists
  if (!fs.existsSync(tempFile)) {
   console.log(`[${id}] ❌ File not found after download: ${tempFile}`);

   // Enhanced debugging: Check multiple possible locations
   const debugLocations = [process.cwd(), workingDir, path.dirname(tempFile), '/home/site/wwwroot', '/home/site/wwwroot/backend'].filter(Boolean).filter((loc, index, arr) => arr.indexOf(loc) === index);

   console.log(`[${id}] 🔍 Searching for files in ${debugLocations.length} locations...`);

   let foundFile = null;
   for (const location of debugLocations) {
    try {
     if (fs.existsSync(location)) {
      const files = fs
       .readdirSync(location)
       .filter((f) => f.includes(id) || (f.endsWith('.mp4') && f.includes('youtube')))
       .slice(0, 10);

      console.log(`[${id}] 📁 ${location}: ${files.length > 0 ? files.join(', ') : 'No matching files'}`);

      if (files.length > 0) {
       foundFile = path.join(location, files[0]);
       console.log(`[${id}] 🎯 Found potential file: ${foundFile}`);
       break;
      }
     }
    } catch (dirError) {
     console.log(`[${id}] ❌ Cannot read ${location}: ${dirError.message}`);
    }
   }

   if (foundFile && fs.existsSync(foundFile)) {
    console.log(`[${id}] 🔄 Using found file: ${foundFile}`);
    tempFile = foundFile;
   } else {
    throw new Error('Video download failed - file not found after download completion');
   }
  }

  console.timeEnd(`[${id}] yt-dlp download`);
  const stats = fs.statSync(tempFile);
  console.log(`[${id}] ✅ Download completed! File size: ${stats.size} bytes`);

  progressCallback(70, 'Processing video with FFmpeg...');

  // Process video with FFmpeg
  const outputFile = await processVideoWithFFmpeg(id, tempFile, start, end, aspectRatio, progressCallback);

  progressCallback(90, 'Finalizing and preparing download...');

  // Read the final file
  const videoBuffer = fs.readFileSync(outputFile);
  const base64Video = videoBuffer.toString('base64');

  // Cleanup temporary files
  try {
   if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
   if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
  } catch (cleanupError) {
   console.warn(`[${id}] Cleanup warning: ${cleanupError.message}`);
  }

  progressCallback(100, 'Video processing completed successfully!');

  return {
   success: true,
   message: 'Video processed successfully',
   video: base64Video,
   filename: `short_${id}.mp4`,
   duration: end - start,
   aspectRatio: aspectRatio,
   quality: '720p',
   timestamp: new Date().toISOString(),
  };
 } catch (error) {
  console.error(`[${id}] ❌ Video processing failed:`, error);

  // Cleanup on error
  try {
   if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  } catch (cleanupError) {
   console.warn(`[${id}] Cleanup error: ${cleanupError.message}`);
  }

  throw new Error(`Video processing failed: ${error.message}`);
 }
}

/**
 * Process video with FFmpeg (placeholder - will use existing implementation)
 */
async function processVideoWithFFmpeg(id, inputFile, start, end, aspectRatio, progressCallback) {
 // This would call the existing FFmpeg processing logic
 // For now, return a placeholder - will be integrated with existing FFmpeg code
 const outputFile = inputFile.replace('.mp4', '_processed.mp4');

 progressCallback(80, 'Cutting and encoding video...');

 // Import and use existing FFmpeg functions
 const processSegmentWithQualityAssurance = global.processSegmentWithQualityAssurance;

 return await processSegmentWithQualityAssurance(id, inputFile, outputFile, start, end, aspectRatio);
}

module.exports = {processVideoAsync};
