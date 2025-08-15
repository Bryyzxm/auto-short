#!/usr/bin/env node

/**
 * Minimal yt-dlp Spawn Test
 * Replicates the exact spawn conditions causing exit code null
 */

const {spawn} = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔬 MINIMAL YT-DLP SPAWN TEST');
console.log('='.repeat(50));
console.log('⏰ Started:', new Date().toISOString());

// Replicate the resolveYtDlpBinary function logic
function resolveYtDlpBinary() {
 console.log('[YT-DLP-RESOLVE] 🔍 Starting binary resolution...');

 // Priority 1: Environment variable override
 const overridePath = process.env.YT_DLP_PATH || process.env.YT_DLP_FORCE_PATH;
 if (overridePath && overridePath.trim()) {
  const cleanPath = overridePath.trim();
  console.log(`[YT-DLP-RESOLVE] 🔧 Testing environment override: ${cleanPath}`);
  if (fs.existsSync(cleanPath)) {
   console.log('[YT-DLP-RESOLVE] ✅ Environment override path exists');
   return {path: cleanPath, source: 'env_override'};
  } else {
   console.log('[YT-DLP-RESOLVE] ❌ Environment override path not found');
  }
 }

 // Priority 2: Azure-specific paths
 const azurePaths = [
  '/home/site/wwwroot/backend/node_modules/yt-dlp-exec/bin/yt-dlp',
  '/home/site/wwwroot/node_modules/yt-dlp-exec/bin/yt-dlp',
  '/opt/node_modules/yt-dlp-exec/bin/yt-dlp',
  path.join(__dirname, 'vendor', 'yt-dlp-exec', 'bin', 'yt-dlp'),
  path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp'),
  path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp'),
  path.join(process.cwd(), 'backend', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp'),
 ];

 console.log('[YT-DLP-RESOLVE] 🔍 Testing Azure-specific paths...');
 for (const testPath of azurePaths) {
  console.log(`[YT-DLP-RESOLVE] 📍 Testing: ${testPath}`);
  if (fs.existsSync(testPath)) {
   try {
    const stats = fs.statSync(testPath);
    console.log(`[YT-DLP-RESOLVE] ✅ Found binary: ${testPath}`);
    console.log(`[YT-DLP-RESOLVE] 📊 Size: ${stats.size} bytes`);
    console.log(`[YT-DLP-RESOLVE] 🔐 Mode: ${stats.mode.toString(8)}`);
    console.log(`[YT-DLP-RESOLVE] 🕒 Modified: ${stats.mtime.toISOString()}`);
    return {path: testPath, source: 'azure_paths'};
   } catch (statError) {
    console.log(`[YT-DLP-RESOLVE] ⚠️  Path exists but stat failed: ${statError.message}`);
   }
  }
 }

 // Fallback
 console.log('[YT-DLP-RESOLVE] ⚠️  Using fallback path');
 return {path: 'yt-dlp', source: 'fallback'};
}

async function testSpawn(binaryPath, args = ['--version']) {
 console.log('');
 console.log(`🚀 SPAWN TEST: ${binaryPath}`);
 console.log('📋 Arguments:', args.join(' '));
 console.log('-'.repeat(50));

 return new Promise((resolve) => {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let spawned = null;

  try {
   // Enhanced pre-spawn validation (matching server.js)
   console.log(`[YT-DLP-EXEC] 🔍 Pre-spawn validation:`);
   console.log(`[YT-DLP-EXEC]   📍 Binary path: ${binaryPath}`);
   console.log(`[YT-DLP-EXEC]   📁 Current working directory: ${process.cwd()}`);
   console.log(`[YT-DLP-EXEC]   👤 Process UID: ${process.getuid ? process.getuid() : 'N/A'}`);
   console.log(`[YT-DLP-EXEC]   👥 Process GID: ${process.getgid ? process.getgid() : 'N/A'}`);

   // Check if binary exists and is executable
   if (fs.existsSync(binaryPath)) {
    const binaryStats = fs.statSync(binaryPath);
    console.log(`[YT-DLP-EXEC]   ✅ Binary exists: ${binaryPath}`);
    console.log(`[YT-DLP-EXEC]   📊 Binary size: ${binaryStats.size} bytes`);
    console.log(`[YT-DLP-EXEC]   🔐 Binary permissions: ${binaryStats.mode.toString(8)}`);
    console.log(`[YT-DLP-EXEC]   🕒 Binary modified: ${binaryStats.mtime.toISOString()}`);

    // Check if file is executable (Unix-like systems)
    if (process.platform !== 'win32') {
     try {
      fs.accessSync(binaryPath, fs.constants.F_OK | fs.constants.X_OK);
      console.log(`[YT-DLP-EXEC]   ✅ Binary is executable`);
     } catch (accessError) {
      console.log(`[YT-DLP-EXEC]   ❌ Binary is not executable: ${accessError.message}`);
     }
    }
   } else {
    console.log(`[YT-DLP-EXEC]   ❌ Binary does not exist: ${binaryPath}`);
   }

   spawned = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    maxBuffer: 1024 * 1024,
   });

   console.log(`[YT-DLP-EXEC] ✅ Spawn successful, PID: ${spawned.pid}`);
  } catch (spawnErr) {
   console.error(`[YT-DLP-EXEC] ❌ Spawn failed with detailed error:`);
   console.error(`[YT-DLP-EXEC]   🔥 Error name: ${spawnErr.name}`);
   console.error(`[YT-DLP-EXEC]   💬 Error message: ${spawnErr.message}`);
   console.error(`[YT-DLP-EXEC]   📍 Error code: ${spawnErr.code || 'undefined'}`);
   console.error(`[YT-DLP-EXEC]   🔧 Error errno: ${spawnErr.errno || 'undefined'}`);
   console.error(`[YT-DLP-EXEC]   📂 Error path: ${spawnErr.path || 'undefined'}`);
   console.error(`[YT-DLP-EXEC]   ⚙️  Error syscall: ${spawnErr.syscall || 'undefined'}`);

   if (spawnErr.code === 'ENOENT') {
    console.error(`[YT-DLP-EXEC] 🚨 ENOENT: Binary not found - ${binaryPath}`);
   } else if (spawnErr.code === 'EACCES') {
    console.error(`[YT-DLP-EXEC] 🚨 EACCES: Permission denied - ${binaryPath}`);
   }

   resolve({
    success: false,
    error: spawnErr.message,
    code: spawnErr.code,
    duration: Date.now() - startTime,
   });
   return;
  }

  if (!spawned) {
   console.error('[YT-DLP-EXEC] ❌ Spawn returned null');
   resolve({
    success: false,
    error: 'Spawn returned null',
    duration: Date.now() - startTime,
   });
   return;
  }

  // Set up event handlers
  spawned.stdout?.on('data', (data) => {
   const output = data.toString();
   stdout += output;
   console.log(`[YT-DLP-EXEC] 📥 stdout: ${output.trim()}`);
  });

  spawned.stderr?.on('data', (data) => {
   const output = data.toString();
   stderr += output;
   console.log(`[YT-DLP-EXEC] 📥 stderr: ${output.trim()}`);
  });

  spawned.on('close', (code, signal) => {
   const duration = Date.now() - startTime;
   const stdoutSize = Buffer.byteLength(stdout, 'utf8');
   const stderrSize = Buffer.byteLength(stderr, 'utf8');

   console.log('[YT-DLP-EXEC] 🏁 Process completed:');
   console.log(`[YT-DLP-EXEC]   ⏱️  Duration: ${duration}ms`);
   console.log(`[YT-DLP-EXEC]   🔢 Exit code: ${code}`);
   console.log(`[YT-DLP-EXEC]   📡 Signal: ${signal || 'none'}`);
   console.log(`[YT-DLP-EXEC]   📊 stdout: ${(stdoutSize / 1024).toFixed(1)} KB`);
   console.log(`[YT-DLP-EXEC]   📊 stderr: ${(stderrSize / 1024).toFixed(1)} KB`);

   resolve({
    success: code === 0,
    exitCode: code,
    signal: signal,
    stdout: stdout,
    stderr: stderr,
    stdoutSize: stdoutSize,
    stderrSize: stderrSize,
    duration: duration,
   });
  });

  spawned.on('error', (error) => {
   console.error(`[YT-DLP-EXEC] ❌ Process error: ${error.message}`);
   console.error(`[YT-DLP-EXEC] 🔧 Error code: ${error.code}`);
   console.error(`[YT-DLP-EXEC] ⚙️  Error syscall: ${error.syscall}`);

   resolve({
    success: false,
    error: error.message,
    code: error.code,
    duration: Date.now() - startTime,
   });
  });

  // Add timeout handling
  setTimeout(() => {
   if (spawned && !spawned.killed) {
    console.log('[YT-DLP-EXEC] ⏰ Timeout reached, killing process');
    spawned.kill('SIGTERM');
    setTimeout(() => {
     if (spawned && !spawned.killed) {
      console.log('[YT-DLP-EXEC] 💀 Force killing process');
      spawned.kill('SIGKILL');
     }
    }, 2000);
   }
  }, 15000);
 });
}

async function main() {
 // Resolve binary
 const resolution = resolveYtDlpBinary();
 console.log(`🎯 Resolved binary: ${resolution.path} (source: ${resolution.source})`);

 // Test 1: Version check
 console.log('');
 console.log('🧪 TEST 1: Version check');
 const versionResult = await testSpawn(resolution.path, ['--version']);
 console.log('📊 Version test result:', JSON.stringify(versionResult, null, 2));

 // Test 2: Help command
 console.log('');
 console.log('🧪 TEST 2: Help command');
 const helpResult = await testSpawn(resolution.path, ['--help']);
 console.log('📊 Help test result:', JSON.stringify(helpResult, null, 2));

 // Test 3: No arguments (should show usage)
 console.log('');
 console.log('🧪 TEST 3: No arguments');
 const noArgsResult = await testSpawn(resolution.path, []);
 console.log('📊 No args test result:', JSON.stringify(noArgsResult, null, 2));

 console.log('');
 console.log('🏁 MINIMAL SPAWN TEST COMPLETE');
 console.log('⏰ Finished:', new Date().toISOString());
}

main().catch((error) => {
 console.error('💥 Test error:', error);
 process.exit(1);
});
