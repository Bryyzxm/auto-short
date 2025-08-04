#!/usr/bin/env node

/**
 * DEBUG AI SEGMENTER FALLBACK
 */

require('dotenv').config();
const enhancedAISegmenter = require('./services/enhancedAISegmenter.js');

const mockTranscriptSegments = [
 {start: 0, end: 15, text: "Welcome to this technology podcast. Today we're discussing AI."},
 {start: 15, end: 35, text: 'Machine learning algorithms have revolutionized data analysis.'},
 {start: 35, end: 58, text: 'AI in customer service has reduced response times significantly.'},
 {start: 58, end: 82, text: 'However, businesses must consider ethical implications.'},
 {start: 82, end: 105, text: 'Data privacy regulations like GDPR have changed strategies.'},
];

async function debugAISegmenterDirectly() {
 console.log('🔍 DEBUG: Testing AI segmenter directly...');

 try {
  const result = await enhancedAISegmenter.generateIntelligentSegments(mockTranscriptSegments, {
   targetCount: 3,
   minDuration: 20,
   maxDuration: 90,
  });

  console.log('AI Segmenter Result:');
  console.log('Segments:', result.segments.length);
  console.log('Analysis:', result.analysis);
  console.log('Metadata:', result.metadata);

  if (result.segments.length > 0) {
   console.log('\nFirst segment:');
   console.log(JSON.stringify(result.segments[0], null, 2));
  }
 } catch (error) {
  console.error('Error:', error);
 }
}

async function debugFallbackDirectly() {
 console.log('🔍 DEBUG: Testing fallback segmentation directly...');

 try {
  const result = enhancedAISegmenter.generateFallbackSegments(mockTranscriptSegments, {
   targetCount: 3,
   minDuration: 20,
   maxDuration: 90,
  });

  console.log('Fallback Result:');
  console.log('Segments:', result.segments.length);
  console.log('Analysis:', result.analysis);

  if (result.segments.length > 0) {
   console.log('\nFirst segment:');
   console.log(JSON.stringify(result.segments[0], null, 2));
  }
 } catch (error) {
  console.error('Error:', error);
 }
}

async function debugExtractText() {
 console.log('🔍 DEBUG: Testing text extraction...');

 const text1 = enhancedAISegmenter.extractSegmentText(mockTranscriptSegments, 0, 30);
 console.log('Text 0-30s:', text1);

 const text2 = enhancedAISegmenter.extractSegmentText(mockTranscriptSegments, 30, 60);
 console.log('Text 30-60s:', text2);

 const text3 = enhancedAISegmenter.extractSegmentText(mockTranscriptSegments, 60, 105);
 console.log('Text 60-105s:', text3);
}

async function runDebugTests() {
 await debugExtractText();
 await debugFallbackDirectly();
 await debugAISegmenterDirectly();
}

runDebugTests().catch(console.error);
