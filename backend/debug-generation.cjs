#!/usr/bin/env node

/**
 * DEBUG TEST FOR GENERATION MODE
 */

require('dotenv').config();
const enhancedTranscriptProcessor = require('./services/enhancedTranscriptProcessor.js');

const mockTranscriptSegments = [
 {start: 0, end: 15, text: "Welcome to this technology podcast. Today we're discussing AI."},
 {start: 15, end: 35, text: 'Machine learning algorithms have revolutionized data analysis.'},
 {start: 35, end: 58, text: 'AI in customer service has reduced response times significantly.'},
 {start: 58, end: 82, text: 'However, businesses must consider ethical implications.'},
 {start: 82, end: 105, text: 'Data privacy regulations like GDPR have changed strategies.'},
];

async function debugGenerationMode() {
 console.log('🔍 DEBUG: Testing generation mode...');

 try {
  const result = await enhancedTranscriptProcessor.generateSegmentsFromTranscript(mockTranscriptSegments, 'debug_video_123');

  console.log('Result:', JSON.stringify(result, null, 2));
 } catch (error) {
  console.error('Error:', error);
 }
}

async function debugRuleBasedSegments() {
 console.log('🔍 DEBUG: Testing rule-based segmentation directly...');

 try {
  const result = enhancedTranscriptProcessor.generateRuleBasedSegments(mockTranscriptSegments, 'debug_video_123');

  console.log('Result:', JSON.stringify(result, null, 2));
 } catch (error) {
  console.error('Error:', error);
 }
}

async function debugTotalDuration() {
 console.log('🔍 DEBUG: Testing duration calculation...');

 const duration = enhancedTranscriptProcessor.calculateTotalDuration(mockTranscriptSegments);
 console.log('Total duration:', duration);

 for (const segment of mockTranscriptSegments) {
  console.log(`Segment: ${segment.start}s - ${segment.end}s (${segment.end - segment.start}s): "${segment.text.substring(0, 50)}..."`);
 }
}

async function runDebugTests() {
 await debugTotalDuration();
 await debugRuleBasedSegments();
 await debugGenerationMode();
}

runDebugTests().catch(console.error);
