#!/usr/bin/env node

/**
 * Azure Binary Diagnostic Tool
 * Tests yt-dlp binary execution in Azure environment with comprehensive diagnostics
 */

const fs = require('fs');
const path = require('path');
const {spawn, exec} = require('child_process');

console.log('🧪 AZURE BINARY DIAGNOSTIC TOOL');
console.log('='.repeat(60));
console.log('⏰ Started:', new Date().toISOString());
console.log('🌍 Platform:', process.platform);
console.log('📍 Architecture:', process.arch);
console.log('📁 Working directory:', process.cwd());
console.log('👤 User ID:', process.getuid ? process.getuid() : 'N/A');
console.log('👥 Group ID:', process.getgid ? process.getgid() : 'N/A');
console.log('');

// Test 1: Check Node.js yt-dlp-exec package
console.log('🔍 TEST 1: Node.js yt-dlp-exec Package');
console.log('-'.repeat(40));

try {
 const ytdlpExec = require('yt-dlp-exec');
 console.log('✅ yt-dlp-exec package loaded successfully');

 if (ytdlpExec.binaryPath) {
  console.log('📍 Package binary path:', ytdlpExec.binaryPath);
  if (fs.existsSync(ytdlpExec.binaryPath)) {
   const stats = fs.statSync(ytdlpExec.binaryPath);
   console.log('✅ Package binary exists');
   console.log('📊 Size:', stats.size, 'bytes');
   console.log('🔐 Permissions:', stats.mode.toString(8));
  } else {
   console.log('❌ Package binary does not exist');
  }
 }

 try {
  const {YOUTUBE_DL_PATH} = require('yt-dlp-exec/src/constants');
  console.log('📍 Constants path:', YOUTUBE_DL_PATH);
  if (fs.existsSync(YOUTUBE_DL_PATH)) {
   const stats = fs.statSync(YOUTUBE_DL_PATH);
   console.log('✅ Constants path exists');
   console.log('📊 Size:', stats.size, 'bytes');
   console.log('🔐 Permissions:', stats.mode.toString(8));
  } else {
   console.log('❌ Constants path does not exist');
  }
 } catch (constantsError) {
  console.log('❌ Failed to load constants:', constantsError.message);
 }
} catch (packageError) {
 console.log('❌ yt-dlp-exec package error:', packageError.message);
}

console.log('');

// Test 2: Check potential binary paths
console.log('🔍 TEST 2: Binary Path Discovery');
console.log('-'.repeat(40));

const potentialPaths = [
 '/home/site/wwwroot/backend/vendor/yt-dlp-exec/bin/yt-dlp',
 '/home/site/wwwroot/backend/node_modules/yt-dlp-exec/bin/yt-dlp',
 '/home/site/wwwroot/node_modules/yt-dlp-exec/bin/yt-dlp',
 '/opt/node_modules/yt-dlp-exec/bin/yt-dlp',
 path.join(__dirname, 'vendor', 'yt-dlp-exec', 'bin', 'yt-dlp'),
 path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp'),
 path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp'),
];

let foundBinaries = [];

for (const testPath of potentialPaths) {
 console.log(`📍 Testing: ${testPath}`);
 if (fs.existsSync(testPath)) {
  try {
   const stats = fs.statSync(testPath);
   console.log(`✅ EXISTS - Size: ${stats.size} bytes, Mode: ${stats.mode.toString(8)}`);

   // Test if executable (Unix only)
   if (process.platform !== 'win32') {
    try {
     fs.accessSync(testPath, fs.constants.F_OK | fs.constants.X_OK);
     console.log('✅ EXECUTABLE');
     foundBinaries.push(testPath);
    } catch {
     console.log('❌ NOT EXECUTABLE');
    }
   } else {
    foundBinaries.push(testPath);
   }
  } catch (statError) {
   console.log(`❌ STAT ERROR: ${statError.message}`);
  }
 } else {
  console.log('❌ NOT FOUND');
 }
}

console.log('');

// Test 3: System dependencies
console.log('🔍 TEST 3: System Dependencies');
console.log('-'.repeat(40));

const systemCommands = [
 'python3 --version',
 'python --version',
 'which python3',
 'which python',
 'ldd --version',
 'file /lib/x86_64-linux-gnu/libc.so.6',
 'uname -a',
 'cat /etc/os-release',
 'ls -la /usr/lib/x86_64-linux-gnu/lib*ssl*',
 'ls -la /usr/lib/x86_64-linux-gnu/lib*crypto*',
];

async function testSystemCommand(command) {
 return new Promise((resolve) => {
  exec(command, {timeout: 5000}, (error, stdout, stderr) => {
   if (error) {
    console.log(`❌ ${command}: ${error.message}`);
   } else {
    console.log(`✅ ${command}: ${stdout.trim() || stderr.trim()}`);
   }
   resolve();
  });
 });
}

async function runSystemTests() {
 for (const command of systemCommands) {
  await testSystemCommand(command);
 }
}

// Test 4: Binary execution tests
async function testBinaryExecution(binaryPath) {
 console.log('');
 console.log(`🔍 TEST 4: Binary Execution Test - ${binaryPath}`);
 console.log('-'.repeat(40));

 if (!fs.existsSync(binaryPath)) {
  console.log('❌ Binary not found, skipping execution test');
  return;
 }

 // Test 1: Simple version check
 console.log('📋 Test 4.1: Version check');
 return new Promise((resolve) => {
  const versionProcess = spawn(binaryPath, ['--version'], {
   stdio: ['ignore', 'pipe', 'pipe'],
   timeout: 10000,
  });

  let stdout = '';
  let stderr = '';

  versionProcess.stdout?.on('data', (data) => {
   stdout += data.toString();
  });

  versionProcess.stderr?.on('data', (data) => {
   stderr += data.toString();
  });

  versionProcess.on('close', (code, signal) => {
   console.log(`🔢 Exit code: ${code}`);
   console.log(`📡 Signal: ${signal || 'none'}`);
   console.log(`📊 stdout (${stdout.length} chars): ${stdout.substring(0, 200)}`);
   console.log(`📊 stderr (${stderr.length} chars): ${stderr.substring(0, 200)}`);

   if (code === 0) {
    console.log('✅ Version check successful');
   } else {
    console.log('❌ Version check failed');
   }

   // Test 2: Help command
   console.log('');
   console.log('📋 Test 4.2: Help command');
   const helpProcess = spawn(binaryPath, ['--help'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
   });

   let helpStdout = '';
   let helpStderr = '';

   helpProcess.stdout?.on('data', (data) => {
    helpStdout += data.toString();
   });

   helpProcess.stderr?.on('data', (data) => {
    helpStderr += data.toString();
   });

   helpProcess.on('close', (helpCode, helpSignal) => {
    console.log(`🔢 Help exit code: ${helpCode}`);
    console.log(`📡 Help signal: ${helpSignal || 'none'}`);
    console.log(`📊 Help stdout (${helpStdout.length} chars): ${helpStdout.substring(0, 200)}`);
    console.log(`📊 Help stderr (${helpStderr.length} chars): ${helpStderr.substring(0, 200)}`);

    if (helpCode === 0) {
     console.log('✅ Help command successful');
    } else {
     console.log('❌ Help command failed');
    }

    resolve();
   });

   helpProcess.on('error', (helpError) => {
    console.log(`❌ Help command spawn error: ${helpError.message}`);
    resolve();
   });
  });

  versionProcess.on('error', (error) => {
   console.log(`❌ Version check spawn error: ${error.message}`);
   console.log(`🔧 Error code: ${error.code}`);
   console.log(`⚙️  Error syscall: ${error.syscall}`);
   resolve();
  });
 });
}

// Test 5: Environment variables
function testEnvironmentVariables() {
 console.log('');
 console.log('🔍 TEST 5: Environment Variables');
 console.log('-'.repeat(40));

 const relevantEnvVars = [
  'PATH',
  'LD_LIBRARY_PATH',
  'PYTHONPATH',
  'YT_DLP_PATH',
  'YT_DLP_FORCE_PATH',
  'YT_DLP_DEBUG',
  'NODE_PATH',
  'HOME',
  'PWD',
  'WEBSITE_SITE_NAME', // Azure App Service
  'WEBSITE_RESOURCE_GROUP', // Azure App Service
 ];

 for (const varName of relevantEnvVars) {
  const value = process.env[varName];
  if (value) {
   console.log(`✅ ${varName}: ${value.length > 100 ? value.substring(0, 100) + '...' : value}`);
  } else {
   console.log(`❌ ${varName}: not set`);
  }
 }
}

// Main execution
async function main() {
 await runSystemTests();
 testEnvironmentVariables();

 // Test the first found binary
 if (foundBinaries.length > 0) {
  await testBinaryExecution(foundBinaries[0]);
 } else {
  console.log('');
  console.log('❌ No executable binaries found for testing');
 }

 console.log('');
 console.log('🏁 DIAGNOSTIC COMPLETE');
 console.log('⏰ Finished:', new Date().toISOString());
}

main().catch((error) => {
 console.error('💥 Diagnostic tool error:', error);
 process.exit(1);
});
