/**
 * Azure Health Monitoring Service
 * Provides comprehensive monitoring for Azure-specific issues
 */

const fs = require('fs');
const path = require('path');
const {executeYtDlpSecurely} = require('./ytdlpSecureExecutor');

class AzureHealthMonitor {
 constructor() {
  this.healthStats = {
   lastHealthCheck: null,
   consecutiveFailures: 0,
   totalChecks: 0,
   successfulChecks: 0,
   issues: [],
   performance: {
    avgResponseTime: 0,
    slowestOperation: null,
    fastestOperation: null,
   },
  };

  this.thresholds = {
   maxConsecutiveFailures: 5,
   maxResponseTime: 30000,
   cookieRefreshInterval: 3600000, // 1 hour
   healthCheckInterval: 300000, // 5 minutes
  };
 }

 /**
  * Comprehensive health check
  */
 async performHealthCheck() {
  const startTime = Date.now();
  const checkId = `health-${Date.now()}`;

  console.log(`[AZURE-HEALTH] 🏥 Starting health check ${checkId}`);

  this.healthStats.totalChecks++;
  this.healthStats.lastHealthCheck = new Date().toISOString();

  const results = {
   timestamp: new Date().toISOString(),
   checkId,
   tests: {},
   overall: 'unknown',
   duration: 0,
   recommendations: [],
  };

  try {
   // Test 1: Basic yt-dlp functionality
   results.tests.ytdlpBasic = await this.testYtDlpBasic();

   // Test 2: Cookie authentication
   results.tests.cookieAuth = await this.testCookieAuthentication();

   // Test 3: Network connectivity
   results.tests.networkConnectivity = await this.testNetworkConnectivity();

   // Test 4: Container resource usage
   results.tests.resourceUsage = await this.testResourceUsage();

   // Test 5: File system permissions
   results.tests.fileSystem = await this.testFileSystemPermissions();

   // Determine overall health
   const failedTests = Object.values(results.tests).filter((test) => !test.success);

   if (failedTests.length === 0) {
    results.overall = 'healthy';
    this.healthStats.successfulChecks++;
    this.healthStats.consecutiveFailures = 0;
   } else if (failedTests.length <= 2) {
    results.overall = 'degraded';
    this.healthStats.consecutiveFailures++;
    results.recommendations.push('Some services are experiencing issues');
   } else {
    results.overall = 'unhealthy';
    this.healthStats.consecutiveFailures++;
    results.recommendations.push('Multiple critical systems failing');
   }

   results.duration = Date.now() - startTime;
   this.updatePerformanceStats(results.duration);

   // Generate recommendations
   this.generateRecommendations(results);

   console.log(`[AZURE-HEALTH] 🏥 Health check completed: ${results.overall} (${results.duration}ms)`);

   return results;
  } catch (error) {
   this.healthStats.consecutiveFailures++;
   console.error(`[AZURE-HEALTH] ❌ Health check failed:`, error.message);

   return {
    ...results,
    overall: 'critical',
    error: error.message,
    duration: Date.now() - startTime,
    recommendations: ['System experiencing critical failures', 'Immediate intervention required'],
   };
  }
 }

 /**
  * Test basic yt-dlp functionality
  */
 async testYtDlpBasic() {
  try {
   const startTime = Date.now();
   const result = await executeYtDlpSecurely(['--version'], {
    timeout: 10000,
    useCookies: false,
   });

   const duration = Date.now() - startTime;
   const success = result && result.length > 0;

   return {
    name: 'YT-DLP Basic',
    success,
    duration,
    details: success ? 'yt-dlp executable working' : 'yt-dlp not responding',
    version: success ? result.trim() : null,
   };
  } catch (error) {
   return {
    name: 'YT-DLP Basic',
    success: false,
    duration: 0,
    error: error.message,
    details: 'yt-dlp execution failed',
   };
  }
 }

 /**
  * Test cookie authentication
  */
 async testCookieAuthentication() {
  try {
   const cookiePath = '/home/data/cookies.txt';

   if (!fs.existsSync(cookiePath)) {
    return {
     name: 'Cookie Authentication',
     success: false,
     details: 'Cookies file not found',
     path: cookiePath,
    };
   }

   const stats = fs.statSync(cookiePath);
   const age = Date.now() - stats.mtime.getTime();
   const isStale = age > this.thresholds.cookieRefreshInterval;

   // Test with a simple YouTube metadata fetch
   const startTime = Date.now();
   const result = await executeYtDlpSecurely(['--dump-json', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'], {
    timeout: 15000,
    useCookies: true,
   });

   const duration = Date.now() - startTime;
   const success = result && result.length > 100; // Basic sanity check

   return {
    name: 'Cookie Authentication',
    success,
    duration,
    details: success ? 'Cookie authentication working' : 'Authentication failed',
    cookieAge: Math.round(age / 1000 / 60), // minutes
    isStale,
    size: stats.size,
   };
  } catch (error) {
   return {
    name: 'Cookie Authentication',
    success: false,
    duration: 0,
    error: error.message,
    details: 'Cookie authentication test failed',
   };
  }
 }

 /**
  * Test network connectivity
  */
 async testNetworkConnectivity() {
  try {
   const {execSync} = require('child_process');

   // Test DNS resolution
   const dnsTest = execSync('nslookup youtube.com', {timeout: 5000}).toString();
   const dnsWorking = dnsTest.includes('Address:');

   // Test HTTP connectivity
   const httpTest = execSync('curl -I --max-time 5 https://www.youtube.com', {timeout: 6000}).toString();
   const httpWorking = httpTest.includes('200 OK');

   return {
    name: 'Network Connectivity',
    success: dnsWorking && httpWorking,
    details: {
     dns: dnsWorking ? 'working' : 'failed',
     http: httpWorking ? 'working' : 'failed',
    },
   };
  } catch (error) {
   return {
    name: 'Network Connectivity',
    success: false,
    error: error.message,
    details: 'Network connectivity test failed',
   };
  }
 }

 /**
  * Test container resource usage
  */
 async testResourceUsage() {
  try {
   const {execSync} = require('child_process');

   // Get memory usage
   const memInfo = execSync('cat /proc/meminfo').toString();
   const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)[1]);
   const memAvailable = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)[1]);
   const memUsage = (((memTotal - memAvailable) / memTotal) * 100).toFixed(1);

   // Get disk usage
   const diskInfo = execSync('df /home').toString().split('\n')[1];
   const diskUsage = parseInt(diskInfo.split(/\s+/)[4].replace('%', ''));

   const memoryHealthy = parseFloat(memUsage) < 85;
   const diskHealthy = diskUsage < 85;

   return {
    name: 'Resource Usage',
    success: memoryHealthy && diskHealthy,
    details: {
     memory: `${memUsage}%`,
     disk: `${diskUsage}%`,
     memoryHealthy,
     diskHealthy,
    },
   };
  } catch (error) {
   return {
    name: 'Resource Usage',
    success: false,
    error: error.message,
    details: 'Resource monitoring failed',
   };
  }
 }

 /**
  * Test file system permissions
  */
 async testFileSystemPermissions() {
  try {
   const testPaths = ['/home/site/wwwroot/backend', '/home/data', '/tmp'];

   const results = {};
   let allSuccess = true;

   for (const testPath of testPaths) {
    try {
     const stats = fs.statSync(testPath);
     const writable = fs.constants.W_OK;

     try {
      fs.accessSync(testPath, writable);
      results[testPath] = 'writable';
     } catch {
      results[testPath] = 'read-only';
      allSuccess = false;
     }
    } catch {
     results[testPath] = 'not-found';
     allSuccess = false;
    }
   }

   return {
    name: 'File System Permissions',
    success: allSuccess,
    details: results,
   };
  } catch (error) {
   return {
    name: 'File System Permissions',
    success: false,
    error: error.message,
    details: 'Permission check failed',
   };
  }
 }

 /**
  * Generate recommendations based on test results
  */
 generateRecommendations(results) {
  if (!results.tests.ytdlpBasic?.success) {
   results.recommendations.push('yt-dlp binary issues detected - check installation');
  }

  if (!results.tests.cookieAuth?.success) {
   results.recommendations.push('Cookie authentication failing - refresh cookies');
  }

  if (results.tests.cookieAuth?.isStale) {
   results.recommendations.push('Cookies are stale - consider refreshing');
  }

  if (!results.tests.networkConnectivity?.success) {
   results.recommendations.push('Network connectivity issues - check firewall/DNS');
  }

  if (!results.tests.resourceUsage?.success) {
   results.recommendations.push('Resource constraints detected - optimize usage');
  }

  if (!results.tests.fileSystem?.success) {
   results.recommendations.push('File system permission issues - check container setup');
  }

  if (this.healthStats.consecutiveFailures >= this.thresholds.maxConsecutiveFailures) {
   results.recommendations.push('Critical: Multiple consecutive failures - requires immediate attention');
  }
 }

 /**
  * Update performance statistics
  */
 updatePerformanceStats(duration) {
  const stats = this.healthStats.performance;

  if (stats.avgResponseTime === 0) {
   stats.avgResponseTime = duration;
  } else {
   stats.avgResponseTime = (stats.avgResponseTime + duration) / 2;
  }

  if (!stats.slowestOperation || duration > stats.slowestOperation.duration) {
   stats.slowestOperation = {duration, timestamp: new Date().toISOString()};
  }

  if (!stats.fastestOperation || duration < stats.fastestOperation.duration) {
   stats.fastestOperation = {duration, timestamp: new Date().toISOString()};
  }
 }

 /**
  * Get health summary
  */
 getHealthSummary() {
  const successRate = this.healthStats.totalChecks > 0 ? ((this.healthStats.successfulChecks / this.healthStats.totalChecks) * 100).toFixed(1) : 0;

  return {
   ...this.healthStats,
   successRate: `${successRate}%`,
   status: this.healthStats.consecutiveFailures === 0 ? 'healthy' : this.healthStats.consecutiveFailures < 3 ? 'degraded' : 'critical',
  };
 }

 /**
  * Start automatic health monitoring
  */
 startMonitoring() {
  console.log('[AZURE-HEALTH] 🚀 Starting automatic health monitoring');

  // Initial health check
  this.performHealthCheck().catch(console.error);

  // Schedule regular health checks
  this.monitoringInterval = setInterval(() => {
   this.performHealthCheck().catch(console.error);
  }, this.thresholds.healthCheckInterval);
 }

 /**
  * Stop automatic health monitoring
  */
 stopMonitoring() {
  if (this.monitoringInterval) {
   clearInterval(this.monitoringInterval);
   this.monitoringInterval = null;
   console.log('[AZURE-HEALTH] 🛑 Stopped automatic health monitoring');
  }
 }
}

module.exports = new AzureHealthMonitor();
