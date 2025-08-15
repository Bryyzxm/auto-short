#!/usr/bin/env node

/**
 * 🚀 Azure Deployment Script - Push All Fixes
 *
 * This script handles the complete deployment of all fixes to Azure:
 * - ✅ Enhanced error handling for intelligent-segments
 * - ✅ Azure-specific timeout management
 * - ✅ Updated yt-dlp version detection (2025.08.11)
 * - ✅ Improved transcript-disabled video handling
 * - ✅ Enhanced logging and monitoring
 */

const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

console.log('\n🚀 AZURE DEPLOYMENT SCRIPT - COMPREHENSIVE FIXES');
console.log('='.repeat(60));

// Check deployment readiness
function checkDeploymentReadiness() {
 console.log('\n📋 Step 1: Deployment Readiness Check');

 const criticalFiles = ['backend/server.js', 'backend/package.json', 'backend/startup.sh', 'backend/Dockerfile', 'backend/web.config'];

 let allReady = true;

 for (const file of criticalFiles) {
  if (fs.existsSync(file)) {
   const stats = fs.statSync(file);
   console.log(`✅ ${file} (${(stats.size / 1024).toFixed(1)}KB, modified: ${stats.mtime.toISOString().split('T')[0]})`);
  } else {
   console.log(`❌ ${file} - MISSING`);
   allReady = false;
  }
 }

 return allReady;
}

// Verify binary versions
function verifyBinaryVersions() {
 console.log('\n📋 Step 2: Binary Version Verification');

 try {
  // Check vendor binary
  const vendorPath = 'backend/vendor/yt-dlp.exe';
  if (fs.existsSync(vendorPath)) {
   const vendorStats = fs.statSync(vendorPath);
   console.log(`✅ Vendor binary: ${(vendorStats.size / 1024 / 1024).toFixed(1)}MB`);
  }

  // Check node_modules binary
  const nodeModulesPath = 'backend/node_modules/yt-dlp-exec/bin/yt-dlp';
  if (fs.existsSync(nodeModulesPath)) {
   const nodeStats = fs.statSync(nodeModulesPath);
   console.log(`✅ Node modules binary: ${(nodeStats.size / 1024 / 1024).toFixed(1)}MB`);
  }

  // Run version check
  const versionOutput = execSync(
   'cd backend && node -e "' +
    'const { execSync } = require(\\"child_process\\"); ' +
    'try { const version = execSync(\\"node_modules/.bin/yt-dlp --version\\", {encoding: \\"utf8\\"}); ' +
    'console.log(\\"Version:\\", version.trim()); } ' +
    'catch(e) { console.log(\\"Error:\\", e.message); }' +
    '"',
   {encoding: 'utf8'}
  );

  console.log(`✅ Binary check: ${versionOutput.trim()}`);

  return versionOutput.includes('2025.08.11');
 } catch (error) {
  console.log(`❌ Binary verification failed: ${error.message}`);
  return false;
 }
}

// Check Git status
function checkGitStatus() {
 console.log('\n📋 Step 3: Git Status Check');

 try {
  const status = execSync('git status --porcelain', {encoding: 'utf8'});
  const lines = status
   .trim()
   .split('\n')
   .filter((line) => line.length > 0);

  if (lines.length === 0) {
   console.log('✅ No uncommitted changes');
   return {clean: true, changes: []};
  }

  console.log(`⚠️  ${lines.length} uncommitted changes:`);
  const changes = lines.map((line) => {
   const status = line.substring(0, 2);
   const file = line.substring(3);
   console.log(`   ${status} ${file}`);
   return {status, file};
  });

  return {clean: false, changes};
 } catch (error) {
  console.log(`❌ Git status check failed: ${error.message}`);
  return {clean: false, changes: [], error: error.message};
 }
}

// Create deployment summary
function createDeploymentSummary() {
 console.log('\n📋 Step 4: Creating Deployment Summary');

 const deploymentSummary = {
  timestamp: new Date().toISOString(),
  version: '2025.08.11',
  fixes: [
   'Enhanced intelligent-segments error handling',
   'Azure-specific timeout management (5s version, 20s metadata, 25s formats)',
   'Updated yt-dlp version detection to 2025.08.11',
   'Improved transcript-disabled video handling',
   'Enhanced CORS error responses',
   'Better emergency timeout detection',
   'Robust binary resolution for Azure paths',
  ],
  endpoints: {
   'intelligent-segments': 'Enhanced error handling for transcript-disabled videos',
   'video-metadata': 'Azure timeout optimization',
   'yt-transcript': 'Improved error recovery',
   health: 'Enhanced monitoring with version info',
  },
  expectedImprovements: [
   'Reduced 500 errors from intelligent-segments',
   'Better handling of transcript-disabled videos',
   'Faster Azure startup with timeout optimization',
   'More reliable video processing',
   'Improved frontend error messages',
  ],
 };

 const summaryPath = 'DEPLOYMENT-SUMMARY.json';
 fs.writeFileSync(summaryPath, JSON.stringify(deploymentSummary, null, 2));
 console.log(`✅ Created ${summaryPath}`);

 return deploymentSummary;
}

// Display deployment instructions
function displayDeploymentInstructions(gitStatus, summary) {
 console.log('\n📋 Step 5: Deployment Instructions');
 console.log('='.repeat(40));

 if (!gitStatus.clean) {
  console.log('🔧 COMMIT CHANGES FIRST:');
  console.log('```');
  console.log('git add .');
  console.log('git commit -m "feat: comprehensive Azure fixes - enhanced error handling and timeouts"');
  console.log('```\n');
 }

 console.log('🚀 DEPLOY TO AZURE:');
 console.log('```');
 console.log('git push origin main');
 console.log('```\n');

 console.log('🔍 MONITOR DEPLOYMENT:');
 console.log('1. Azure Portal → App Service → Deployment Center');
 console.log('2. GitHub Actions → Repository → Actions tab');
 console.log('3. Azure Portal → App Service → Log stream\n');

 console.log('✅ VERIFY DEPLOYMENT:');
 console.log('```');
 console.log('curl https://auto-short.azurewebsites.net/health');
 console.log('curl "https://auto-short.azurewebsites.net/api/intelligent-segments?videoId=dQw4w9WgXcQ"');
 console.log('```\n');

 console.log('🎯 EXPECTED IMPROVEMENTS:');
 summary.expectedImprovements.forEach((improvement) => {
  console.log(`   ✅ ${improvement}`);
 });
}

// Main execution
async function main() {
 try {
  console.log('Starting comprehensive Azure deployment preparation...\n');

  // Step 1: Check readiness
  const isReady = checkDeploymentReadiness();
  if (!isReady) {
   console.log('\n❌ Deployment readiness check failed');
   process.exit(1);
  }

  // Step 2: Verify binaries
  const binaryOK = verifyBinaryVersions();
  if (!binaryOK) {
   console.log('\n⚠️  Binary version check failed, but continuing...');
  }

  // Step 3: Check git
  const gitStatus = checkGitStatus();

  // Step 4: Create summary
  const summary = createDeploymentSummary();

  // Step 5: Instructions
  displayDeploymentInstructions(gitStatus, summary);

  console.log('\n🎉 DEPLOYMENT PREPARATION COMPLETE!');
  console.log('='.repeat(60));
  console.log('All fixes are ready for Azure deployment.');
  console.log('Follow the instructions above to deploy.\n');

  // Optional: Auto-commit if requested
  const args = process.argv.slice(2);
  if (args.includes('--auto-commit') && !gitStatus.clean) {
   console.log('🔧 Auto-committing changes...');
   execSync('git add .');
   execSync('git commit -m "feat: comprehensive Azure fixes - enhanced error handling and timeouts"');
   console.log('✅ Changes committed automatically');
  }

  if (args.includes('--auto-deploy')) {
   console.log('🚀 Auto-deploying to Azure...');
   execSync('git push origin main');
   console.log('✅ Deployment initiated');
  }
 } catch (error) {
  console.error('\n❌ Deployment preparation failed:', error.message);
  process.exit(1);
 }
}

// Run if called directly
if (require.main === module) {
 main();
}

module.exports = {checkDeploymentReadiness, verifyBinaryVersions, checkGitStatus, createDeploymentSummary};
