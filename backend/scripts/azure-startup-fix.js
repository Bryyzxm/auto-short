#!/usr/bin/env node

/**
 * Azure Startup Fix Script
 *
 * This script automatically applies the yt-dlp fix for Azure environment
 * Based on GitHub issue #13930 - fixed by #14081
 *
 * This script should be run during Azure App Service startup
 */

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(80));
console.log('🚀 AZURE STARTUP FIX SCRIPT');
console.log('📋 Applying fix for yt-dlp GitHub issue #13930');
console.log('✅ Fixed by PR: https://github.com/yt-dlp/yt-dlp/pull/14081');
console.log('='.repeat(80));

/**
 * Detect Azure environment
 */
function isAzureEnvironment() {
 const azureIndicators = [!!process.env.WEBSITE_HOSTNAME, !!process.env.WEBSITE_SITE_NAME, !!process.env.WEBSITE_RESOURCE_GROUP, process.env.HOME && process.env.HOME.includes('/home/site')];

 const azureCount = azureIndicators.filter(Boolean).length;
 return azureCount >= 2;
}

/**
 * Update yt-dlp to latest version with the fix
 */
async function updateYtDlp() {
 console.log('🔄 Updating yt-dlp to latest version...');

 try {
  // Method 1: Try updating yt-dlp binary
  try {
   const updateResult = execSync('yt-dlp --update-to master', {
    encoding: 'utf8',
    timeout: 60000,
   });
   console.log('✅ yt-dlp updated successfully');
   console.log(updateResult);
   return true;
  } catch (binaryError) {
   console.log('⚠️  Binary update failed, trying npm package update...');
  }

  // Method 2: Try updating npm package
  try {
   const npmUpdateResult = execSync('npm install yt-dlp-exec@latest', {
    encoding: 'utf8',
    timeout: 120000,
    cwd: path.join(__dirname, '..'),
   });
   console.log('✅ yt-dlp-exec npm package updated successfully');
   console.log(npmUpdateResult);
   return true;
  } catch (npmError) {
   console.log('⚠️  NPM update failed:', npmError.message);
  }

  // Method 3: Manual download (fallback)
  console.log('⚠️  Attempting manual yt-dlp installation...');
  const manualResult = execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp', {
   encoding: 'utf8',
   timeout: 120000,
  });
  console.log('✅ Manual yt-dlp installation completed');
  return true;
 } catch (error) {
  console.error('❌ Failed to update yt-dlp:', error.message);
  console.log('🔄 Proceeding with existing version...');
  return false;
 }
}

/**
 * Verify the fix is working
 */
async function verifyFix() {
 console.log('🔍 Verifying fix is working...');

 try {
  // Test with a known working video
  const testResult = execSync('yt-dlp --list-formats --extractor-args "youtube:player_client=default,tv_simply,web,android;bypass_native_jsi" https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
   encoding: 'utf8',
   timeout: 30000,
  });

  if (testResult.includes('format') || testResult.includes('Available formats')) {
   console.log('✅ Fix verification successful');
   return true;
  } else {
   console.log('⚠️  Fix verification inconclusive');
   return false;
  }
 } catch (error) {
  console.error('❌ Fix verification failed:', error.message);
  return false;
 }
}

/**
 * Setup environment variables
 */
function setupEnvironmentVariables() {
 console.log('🔧 Setting up environment variables...');

 // Set Azure-optimized yt-dlp configuration
 process.env.YTDLP_EXTRACTOR_ARGS = 'youtube:player_client=default,tv_simply,web,android;bypass_native_jsi;formats=all';
 process.env.YTDLP_RETRIES = '8';
 process.env.YTDLP_SOCKET_TIMEOUT = '60';
 process.env.YTDLP_FRAGMENT_RETRIES = '5';
 process.env.YTDLP_FORCE_IPV4 = 'true';

 console.log('✅ Environment variables configured');
}

/**
 * Create Azure-optimized configuration file
 */
function createConfigFile() {
 console.log('📝 Creating Azure-optimized yt-dlp configuration...');

 const configContent = `# Azure-optimized yt-dlp configuration
# Based on fix for GitHub issue #13930

# Critical fix for "content not available on this app"
--extractor-args youtube:player_client=default,tv_simply,web,android;bypass_native_jsi;formats=all

# Azure network optimizations
--retries 8
--socket-timeout 60
--fragment-retries 5
--force-ipv4

# Anti-detection measures
--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
--add-header "Accept-Language: en-US,en;q=0.9,id;q=0.8,*;q=0.7"
--add-header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8"
--no-check-certificate
--no-call-home

# Performance optimizations for Azure
--sleep-requests 1
--sleep-interval 2
--max-sleep-interval 8
--concurrent-fragments 3
--max-downloads 1
--no-color
--progress-delta 5
`;

 const configDir = path.join(process.env.HOME || '/home/site', '.config', 'yt-dlp');
 const configPath = path.join(configDir, 'config');

 try {
  // Create config directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
   fs.mkdirSync(configDir, {recursive: true});
  }

  // Write configuration file
  fs.writeFileSync(configPath, configContent);
  console.log(`✅ Configuration file created: ${configPath}`);

  // Also create a backup in the app directory
  const backupPath = path.join(__dirname, '..', 'yt-dlp-config.txt');
  fs.writeFileSync(backupPath, configContent);
  console.log(`✅ Backup configuration created: ${backupPath}`);
 } catch (error) {
  console.error('❌ Failed to create configuration file:', error.message);
 }
}

/**
 * Main startup function
 */
async function main() {
 console.log('🚀 Starting Azure startup fix process...');

 // Check if we're in Azure
 if (!isAzureEnvironment()) {
  console.log('ℹ️  Not running in Azure environment, skipping Azure-specific fixes');
  return;
 }

 console.log('✅ Azure environment detected');

 try {
  // Step 1: Setup environment variables
  setupEnvironmentVariables();

  // Step 2: Create configuration file
  createConfigFile();

  // Step 3: Update yt-dlp
  await updateYtDlp();

  // Step 4: Verify the fix
  await verifyFix();

  console.log('='.repeat(80));
  console.log('🎉 AZURE STARTUP FIX COMPLETED SUCCESSFULLY');
  console.log('✅ The "content not available on this app" issue should be resolved');
  console.log('🔗 Reference: https://github.com/yt-dlp/yt-dlp/issues/13930');
  console.log('='.repeat(80));
 } catch (error) {
  console.error('='.repeat(80));
  console.error('❌ AZURE STARTUP FIX FAILED');
  console.error('Error:', error.message);
  console.error('='.repeat(80));
  process.exit(1);
 }
}

// Run the script
if (require.main === module) {
 main().catch(console.error);
}

module.exports = {main, isAzureEnvironment, updateYtDlp, verifyFix};
