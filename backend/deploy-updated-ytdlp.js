#!/usr/bin/env node

/**
 * Deploy Updated yt-dlp Binary to Azure
 *
 * This script ensures the Azure deployment uses the latest yt-dlp binary
 * by copying the updated binary to the appropriate locations and validating
 * the deployment.
 */

const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

console.log('🚀 Deploy Updated yt-dlp Binary to Azure');
console.log('=========================================');

const EXPECTED_VERSION = '2025.08.11';
const BACKUP_VERSION = '2025.07.21';

// Paths
const vendorBinaryPath = path.join(__dirname, 'vendor', 'yt-dlp-exec', 'bin', 'yt-dlp');
const nodeModulesBinaryPath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');
const vendorExePath = path.join(__dirname, 'vendor', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');
const nodeModulesExePath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');

function checkFileExists(filePath) {
 try {
  return fs.existsSync(filePath);
 } catch (error) {
  return false;
 }
}

function getFileStats(filePath) {
 try {
  const stats = fs.statSync(filePath);
  return {
   size: stats.size,
   modified: stats.mtime.toISOString(),
   readable: true,
  };
 } catch (error) {
  return {
   size: 0,
   modified: 'unknown',
   readable: false,
  };
 }
}

function checkBinaryVersion(binaryPath) {
 try {
  const result = execSync(`python "${binaryPath}" --version`, {
   encoding: 'utf8',
   timeout: 10000,
   stdio: 'pipe',
  });
  return result.trim();
 } catch (error) {
  console.warn(`⚠️  Could not check version for ${binaryPath}: ${error.message}`);
  return 'unknown';
 }
}

async function main() {
 console.log('\n📋 Step 1: Pre-deployment Validation');
 console.log('=====================================');

 // Check vendor binary
 console.log('\n🔍 Checking vendor binary...');
 if (checkFileExists(vendorBinaryPath)) {
  const vendorStats = getFileStats(vendorBinaryPath);
  const vendorVersion = checkBinaryVersion(vendorBinaryPath);
  console.log(`✅ Vendor binary exists: ${vendorBinaryPath}`);
  console.log(`   📊 Size: ${vendorStats.size} bytes`);
  console.log(`   🕒 Modified: ${vendorStats.modified}`);
  console.log(`   🔢 Version: ${vendorVersion}`);

  if (vendorVersion === EXPECTED_VERSION) {
   console.log(`   🎉 Vendor binary is up to date!`);
  } else {
   console.log(`   ⚠️  Vendor binary version mismatch. Expected: ${EXPECTED_VERSION}, Got: ${vendorVersion}`);
  }
 } else {
  console.error(`❌ Vendor binary not found: ${vendorBinaryPath}`);
 }

 // Check node_modules binary
 console.log('\n🔍 Checking node_modules binary...');
 if (checkFileExists(nodeModulesBinaryPath)) {
  const nodeModulesStats = getFileStats(nodeModulesBinaryPath);
  const nodeModulesVersion = checkBinaryVersion(nodeModulesBinaryPath);
  console.log(`✅ Node modules binary exists: ${nodeModulesBinaryPath}`);
  console.log(`   📊 Size: ${nodeModulesStats.size} bytes`);
  console.log(`   🕒 Modified: ${nodeModulesStats.modified}`);
  console.log(`   🔢 Version: ${nodeModulesVersion}`);

  if (nodeModulesVersion === EXPECTED_VERSION) {
   console.log(`   🎉 Node modules binary is up to date!`);
  } else {
   console.log(`   ⚠️  Node modules binary version mismatch. Expected: ${EXPECTED_VERSION}, Got: ${nodeModulesVersion}`);
  }
 } else {
  console.error(`❌ Node modules binary not found: ${nodeModulesBinaryPath}`);
 }

 console.log('\n📦 Step 2: Deployment Verification');
 console.log('===================================');

 // Check if we need to copy from vendor to node_modules
 const vendorVersion = checkBinaryVersion(vendorBinaryPath);
 const nodeModulesVersion = checkBinaryVersion(nodeModulesBinaryPath);

 if (vendorVersion === EXPECTED_VERSION && nodeModulesVersion !== EXPECTED_VERSION) {
  console.log('🔄 Copying updated binary from vendor to node_modules...');
  try {
   fs.copyFileSync(vendorBinaryPath, nodeModulesBinaryPath);
   fs.chmodSync(nodeModulesBinaryPath, '755');
   console.log('✅ Binary copied successfully');

   // Verify copy
   const newVersion = checkBinaryVersion(nodeModulesBinaryPath);
   if (newVersion === EXPECTED_VERSION) {
    console.log(`✅ Copy verified: version ${newVersion}`);
   } else {
    console.error(`❌ Copy failed: expected ${EXPECTED_VERSION}, got ${newVersion}`);
   }
  } catch (error) {
   console.error(`❌ Failed to copy binary: ${error.message}`);
  }
 }

 // Check Windows binaries
 console.log('\n🖥️  Step 3: Windows Binary Check');
 console.log('=================================');

 [vendorExePath, nodeModulesExePath].forEach((exePath, index) => {
  const name = index === 0 ? 'vendor' : 'node_modules';
  if (checkFileExists(exePath)) {
   const stats = getFileStats(exePath);
   console.log(`✅ ${name} .exe exists: ${stats.size} bytes, modified ${stats.modified}`);
  } else {
   console.log(`⚠️  ${name} .exe not found: ${exePath}`);
  }
 });

 console.log('\n🎯 Step 4: Deployment Readiness');
 console.log('================================');

 const finalVendorVersion = checkBinaryVersion(vendorBinaryPath);
 const finalNodeModulesVersion = checkBinaryVersion(nodeModulesBinaryPath);

 console.log(`📋 Final Status:`);
 console.log(`   🔧 Vendor version: ${finalVendorVersion}`);
 console.log(`   📦 Node modules version: ${finalNodeModulesVersion}`);
 console.log(`   🎯 Expected version: ${EXPECTED_VERSION}`);

 const allUpToDate = finalVendorVersion === EXPECTED_VERSION && finalNodeModulesVersion === EXPECTED_VERSION;

 if (allUpToDate) {
  console.log('\n🎉 SUCCESS: All binaries are up to date and ready for Azure deployment!');
  console.log('\n📌 Next Steps:');
  console.log('   1. Commit the updated binaries to Git');
  console.log('   2. Push to trigger Azure deployment');
  console.log('   3. Monitor Azure logs for successful startup');
  console.log('   4. Test with a video to confirm functionality');
 } else {
  console.log('\n⚠️  WARNING: Version mismatches detected. Manual intervention may be required.');
  console.log('\n🔧 Troubleshooting:');
  console.log('   1. Check if the latest yt-dlp binary was downloaded correctly');
  console.log('   2. Verify file permissions and executable status');
  console.log('   3. Consider re-downloading the latest release');
 }

 console.log('\n✅ Deployment preparation complete!');
}

// Run the script
main().catch((error) => {
 console.error('\n❌ Deployment script failed:', error);
 process.exit(1);
});
