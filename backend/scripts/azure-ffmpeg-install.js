// Azure FFmpeg Installation Script for PRE_BUILD_COMMAND
// This script will be executed during Azure App Service deployment

console.log('🔧 Azure FFmpeg Setup - Starting installation process...');

const {execSync} = require('child_process');
const fs = require('fs');

// Function to check if command exists
function commandExists(cmd) {
 try {
  execSync(`which ${cmd}`, {stdio: 'pipe'});
  return true;
 } catch (error) {
  return false;
 }
}

// Function to install FFmpeg
function installFFmpeg() {
 console.log('📦 Attempting FFmpeg installation...');

 try {
  // Update package manager
  console.log('🔄 Updating package manager...');
  execSync('apt-get update -qq', {stdio: 'inherit'});

  // Install FFmpeg
  console.log('⬇️ Installing FFmpeg package...');
  execSync('DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg', {stdio: 'inherit'});

  return true;
 } catch (error) {
  console.error('❌ FFmpeg installation failed:', error.message);
  return false;
 }
}

// Function to verify FFmpeg installation
function verifyFFmpeg() {
 console.log('🔍 Verifying FFmpeg installation...');

 const ffmpegExists = commandExists('ffmpeg');
 const ffprobeExists = commandExists('ffprobe');

 if (ffmpegExists && ffprobeExists) {
  try {
   const ffmpegVersion = execSync('ffmpeg -version 2>&1 | head -1', {encoding: 'utf8'});
   const ffprobeVersion = execSync('ffprobe -version 2>&1 | head -1', {encoding: 'utf8'});

   console.log('✅ FFmpeg verification successful:');
   console.log('  📹 FFmpeg:', ffmpegVersion.trim());
   console.log('  🔍 FFprobe:', ffprobeVersion.trim());

   return true;
  } catch (error) {
   console.warn('⚠️ FFmpeg commands exist but version check failed:', error.message);
   return false;
  }
 } else {
  console.error('❌ FFmpeg verification failed:');
  console.error('  📹 FFmpeg available:', ffmpegExists);
  console.error('  🔍 FFprobe available:', ffprobeExists);
  return false;
 }
}

// Main execution
function main() {
 console.log('🏁 Starting Azure FFmpeg setup process...');

 // Check if already installed
 if (verifyFFmpeg()) {
  console.log('✅ FFmpeg already available, skipping installation');
  console.log('🎉 Azure FFmpeg setup completed successfully!');
  return;
 }

 console.log('⚠️ FFmpeg not found, attempting installation...');

 // Attempt installation
 if (installFFmpeg()) {
  console.log('📦 FFmpeg installation completed, verifying...');

  if (verifyFFmpeg()) {
   console.log('🎉 Azure FFmpeg setup completed successfully!');
  } else {
   console.error('❌ FFmpeg installation verification failed');
   console.error('⚠️ Application will run with limited video processing capabilities');
   process.exit(1);
  }
 } else {
  console.error('❌ FFmpeg installation failed');
  console.error('⚠️ Application will run with limited video processing capabilities');

  // Create a flag file to indicate FFmpeg is not available
  fs.writeFileSync('/tmp/ffmpeg-unavailable', 'FFmpeg installation failed during Azure deployment');

  // Don't exit with error to prevent deployment failure
  console.log('🔄 Continuing deployment without FFmpeg...');
 }
}

// Execute if run directly
if (require.main === module) {
 main();
}

module.exports = {commandExists, installFFmpeg, verifyFFmpeg};
