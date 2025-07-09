#!/usr/bin/env node

/**
 * Test Script for Enhanced Transcript Features
 * 
 * This script tests all the new transcript enhancement features:
 * - Multi-method fallback system
 * - Statistics and monitoring
 * - Error handling
 * - Performance analytics
 * 
 * Usage: node test-transcript-features.js [BASE_URL]
 * Example: node test-transcript-features.js http://localhost:3001
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.argv[2] || 'http://localhost:3001';

// Test video IDs with different characteristics
const TEST_VIDEOS = [
  { id: 'dQw4w9WgXcQ', name: 'Rick Roll (Popular, should have transcript)' },
  { id: 'M7lc1UVf-VE', name: 'TED Talk (Educational, should have transcript)' },
  { id: 'invalid_id_123', name: 'Invalid Video ID (should fail gracefully)' },
  { id: 'jNQXAC9IVRw', name: 'Me at the zoo (First YouTube video)' }
];

class TranscriptTester {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.results = [];
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      return { success: true, status: response.status, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testHealthCheck() {
    console.log('\n🏥 Testing Health Check...');
    const result = await this.makeRequest('/');
    
    if (result.success) {
      console.log('✅ Server is running');
      return true;
    } else {
      console.log('❌ Server is not accessible:', result.error);
      return false;
    }
  }

  async testTranscriptEndpoint(videoId, videoName) {
    console.log(`\n🎬 Testing: ${videoName} (${videoId})`);
    
    const startTime = Date.now();
    const result = await this.makeRequest(`/api/yt-transcript?videoId=${videoId}`);
    const duration = Date.now() - startTime;
    
    if (result.success) {
      const { segments, metadata } = result.data;
      console.log(`✅ Success (${duration}ms)`);
      console.log(`   Segments: ${segments?.length || 0}`);
      console.log(`   Source: ${metadata?.source || 'unknown'}`);
      console.log(`   Processing Time: ${metadata?.processingTime || 'unknown'}ms`);
      
      if (segments && segments.length > 0) {
        console.log(`   Sample: "${segments[0].text?.substring(0, 50)}..."`);
      }
      
      return { success: true, segmentCount: segments?.length || 0, duration, metadata };
    } else {
      console.log(`❌ Failed (${duration}ms):`, result.error);
      return { success: false, duration, error: result.error };
    }
  }

  async testRefreshFeature(videoId) {
    console.log(`\n🔄 Testing Refresh Feature for ${videoId}...`);
    
    // First request (should cache)
    const result1 = await this.makeRequest(`/api/yt-transcript?videoId=${videoId}`);
    
    // Second request (should use cache)
    const result2 = await this.makeRequest(`/api/yt-transcript?videoId=${videoId}`);
    
    // Third request with refresh (should bypass cache)
    const result3 = await this.makeRequest(`/api/yt-transcript?videoId=${videoId}&refresh=true`);
    
    if (result1.success && result2.success && result3.success) {
      const source1 = result1.data.metadata?.source;
      const source2 = result2.data.metadata?.source;
      const source3 = result3.data.metadata?.source;
      
      console.log(`   First request source: ${source1}`);
      console.log(`   Second request source: ${source2}`);
      console.log(`   Refresh request source: ${source3}`);
      
      if (source2 === 'cache' && source3 !== 'cache') {
        console.log('✅ Refresh feature working correctly');
        return true;
      } else {
        console.log('⚠️ Refresh feature behavior unexpected');
        return false;
      }
    } else {
      console.log('❌ Refresh feature test failed');
      return false;
    }
  }

  async testStatisticsEndpoint() {
    console.log('\n📊 Testing Statistics Endpoint...');
    
    const result = await this.makeRequest('/api/transcript-stats');
    
    if (result.success) {
      const stats = result.data;
      console.log('✅ Statistics endpoint working');
      console.log(`   Total Requests: ${stats.totalRequests}`);
      console.log(`   Successful Requests: ${stats.successfulRequests}`);
      console.log(`   Success Rate: ${stats.overallSuccessRate}`);
      console.log(`   Error Count: ${stats.errorCount}`);
      console.log(`   Uptime: ${stats.uptime}s`);
      
      // Show method statistics
      console.log('\n   Method Performance:');
      Object.entries(stats.methodStats || {}).forEach(([method, data]) => {
        console.log(`     ${method}: ${data.success}/${data.total} (${data.successRate})`);
      });
      
      return true;
    } else {
      console.log('❌ Statistics endpoint failed:', result.error);
      return false;
    }
  }

  async testPerformanceEndpoint() {
    console.log('\n📈 Testing Performance Endpoint...');
    
    const result = await this.makeRequest('/api/transcript-performance');
    
    if (result.success) {
      const perf = result.data;
      console.log('✅ Performance endpoint working');
      
      // Show method ranking
      console.log('\n   Method Ranking:');
      perf.methodRanking?.forEach((method, index) => {
        console.log(`     ${index + 1}. ${method.method}: ${method.successRate}% (${method.success}/${method.total})`);
      });
      
      // Show recommendations
      if (perf.recommendations?.length > 0) {
        console.log('\n   Recommendations:');
        perf.recommendations.forEach(rec => {
          console.log(`     • ${rec}`);
        });
      }
      
      // Show error analysis
      if (perf.errorAnalysis) {
        console.log('\n   Error Analysis:');
        console.log(`     Total Errors: ${perf.errorAnalysis.totalErrors}`);
        
        if (Object.keys(perf.errorAnalysis.errorsBySource || {}).length > 0) {
          console.log('     Errors by Source:');
          Object.entries(perf.errorAnalysis.errorsBySource).forEach(([source, count]) => {
            console.log(`       ${source}: ${count}`);
          });
        }
      }
      
      return true;
    } else {
      console.log('❌ Performance endpoint failed:', result.error);
      return false;
    }
  }

  async testCacheEndpoints() {
    console.log('\n💾 Testing Cache Endpoints...');
    
    // Test cache list
    const cacheResult = await this.makeRequest('/api/yt-transcript/cache');
    
    if (cacheResult.success) {
      console.log('✅ Cache list endpoint working');
      console.log(`   Cached entries: ${cacheResult.data.totalCached}`);
      
      if (cacheResult.data.cacheEntries?.length > 0) {
        console.log('   Cache entries:');
        cacheResult.data.cacheEntries.forEach(entry => {
          console.log(`     ${entry.videoId}: ${entry.segmentCount} segments`);
        });
        
        // Test cache deletion for first entry
        const firstEntry = cacheResult.data.cacheEntries[0];
        if (firstEntry) {
          const deleteResult = await this.makeRequest(
            `/api/yt-transcript/cache/${firstEntry.videoId}`,
            { method: 'DELETE' }
          );
          
          if (deleteResult.success) {
            console.log(`✅ Cache deletion working for ${firstEntry.videoId}`);
          } else {
            console.log(`❌ Cache deletion failed for ${firstEntry.videoId}`);
          }
        }
      }
      
      return true;
    } else {
      console.log('❌ Cache endpoints failed:', cacheResult.error);
      return false;
    }
  }

  async testStatsReset() {
    console.log('\n🔄 Testing Statistics Reset...');
    
    const resetResult = await this.makeRequest('/api/transcript-stats/reset', {
      method: 'POST'
    });
    
    if (resetResult.success) {
      console.log('✅ Statistics reset working');
      
      // Verify reset by checking stats
      const statsResult = await this.makeRequest('/api/transcript-stats');
      if (statsResult.success) {
        const stats = statsResult.data;
        if (stats.totalRequests === 0 && stats.successfulRequests === 0) {
          console.log('✅ Statistics successfully reset to zero');
          return true;
        } else {
          console.log('⚠️ Statistics not properly reset');
          return false;
        }
      }
    } else {
      console.log('❌ Statistics reset failed:', resetResult.error);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Enhanced Transcript Features Test Suite');
    console.log(`📍 Testing server at: ${this.baseUrl}`);
    
    const results = {
      healthCheck: false,
      transcriptTests: [],
      refreshTest: false,
      statisticsTest: false,
      performanceTest: false,
      cacheTest: false,
      resetTest: false
    };
    
    // Health check
    results.healthCheck = await this.testHealthCheck();
    if (!results.healthCheck) {
      console.log('\n❌ Server not accessible. Aborting tests.');
      return results;
    }
    
    // Test transcript endpoint with different videos
    console.log('\n🎬 Testing Transcript Endpoints...');
    for (const video of TEST_VIDEOS) {
      const result = await this.testTranscriptEndpoint(video.id, video.name);
      results.transcriptTests.push({ ...video, ...result });
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test refresh feature with first successful video
    const successfulVideo = results.transcriptTests.find(t => t.success);
    if (successfulVideo) {
      results.refreshTest = await this.testRefreshFeature(successfulVideo.id);
    }
    
    // Test monitoring endpoints
    results.statisticsTest = await this.testStatisticsEndpoint();
    results.performanceTest = await this.testPerformanceEndpoint();
    results.cacheTest = await this.testCacheEndpoints();
    
    // Test reset (do this last as it clears stats)
    results.resetTest = await this.testStatsReset();
    
    // Summary
    this.printSummary(results);
    
    return results;
  }

  printSummary(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST SUMMARY');
    console.log('='.repeat(60));
    
    const tests = [
      { name: 'Health Check', result: results.healthCheck },
      { name: 'Statistics Endpoint', result: results.statisticsTest },
      { name: 'Performance Endpoint', result: results.performanceTest },
      { name: 'Cache Management', result: results.cacheTest },
      { name: 'Refresh Feature', result: results.refreshTest },
      { name: 'Statistics Reset', result: results.resetTest }
    ];
    
    tests.forEach(test => {
      const icon = test.result ? '✅' : '❌';
      console.log(`${icon} ${test.name}`);
    });
    
    console.log('\n📊 Transcript Test Results:');
    results.transcriptTests.forEach(test => {
      const icon = test.success ? '✅' : '❌';
      const segments = test.segmentCount || 0;
      console.log(`${icon} ${test.name}: ${segments} segments`);
    });
    
    const passedTests = tests.filter(t => t.result).length;
    const totalTests = tests.length;
    const successfulTranscripts = results.transcriptTests.filter(t => t.success).length;
    const totalTranscripts = results.transcriptTests.length;
    
    console.log('\n📈 Overall Results:');
    console.log(`   Core Features: ${passedTests}/${totalTests} passed`);
    console.log(`   Transcript Tests: ${successfulTranscripts}/${totalTranscripts} successful`);
    
    if (passedTests === totalTests && successfulTranscripts > 0) {
      console.log('\n🎉 All tests passed! Enhanced transcript features are working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the logs above for details.');
    }
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new TranscriptTester(BASE_URL);
  tester.runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

export default TranscriptTester;