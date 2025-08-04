/**
 * ENHANCED AI-BASED SEGMENTATION ENGINE
 *
 * Production-ready system for intelligent video segment generation from uploaded transcripts.
 * Implements advanced AI analysis, topic boundary detection, and dynamic segment optimization.
 *
 * Features:
 * - AI-powered topic boundary detection
 * - Semantic shift analysis
 * - Dynamic segment length optimization (20-90 seconds)
 * - Compelling title generation
 * - Content-aware descriptions
 * - Impact quote extraction
 * - Multiple content type support (podcasts, lectures, vlogs)
 *
 * Architecture:
 * - Multi-pass AI analysis for optimal results
 * - Groq Llama 3.3 70B for complex reasoning
 * - Fallback to Llama 3.1 8B for efficiency
 * - Comprehensive error handling and validation
 */

const Groq = require('groq-sdk');

class EnhancedAISegmenter {
 constructor() {
  // Check for API key in multiple environment variable formats
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  this.groq = apiKey ? new Groq({apiKey: apiKey}) : null;

  this.rateLimitDelay = 2000; // 2 seconds between requests
  this.lastRequestTime = 0;

  // Segmentation parameters
  this.minSegmentDuration = 20; // Minimum 20 seconds
  this.maxSegmentDuration = 90; // Maximum 90 seconds
  this.idealSegmentDuration = 60; // Target 60 seconds

  console.log(`✅ [Enhanced AI Segmenter] Initialized with ${this.groq ? 'valid' : 'missing'} API key`);
  if (this.groq) {
   console.log(`[Enhanced AI Segmenter] 🔑 API key source: ${process.env.GROQ_API_KEY ? 'GROQ_API_KEY' : 'VITE_GROQ_API_KEY'}`);
  }
 }

 /**
  * MAIN SEGMENTATION METHOD
  * Takes structured transcript and generates intelligent segments with metadata
  */
 async generateIntelligentSegments(transcriptSegments, options = {}) {
  if (!this.groq) {
   console.warn('[AI-SEGMENTER] No API key available, using fallback segmentation');
   return await this.generateFallbackSegments(transcriptSegments, options);
  }

  try {
   console.log(`[AI-SEGMENTER] 🚀 Starting AI segmentation for ${transcriptSegments.length} transcript segments`);

   // STEP 1: Analyze transcript structure and content
   const contentAnalysis = await this.analyzeTranscriptContent(transcriptSegments);
   console.log(`[AI-SEGMENTER] 📊 Content analysis: ${contentAnalysis.contentType}, ${contentAnalysis.language}, ${contentAnalysis.topics.length} topics`);

   // STEP 2: Detect topic boundaries using AI
   const topicBoundaries = await this.detectTopicBoundaries(transcriptSegments, contentAnalysis);
   console.log(`[AI-SEGMENTER] 🎯 Detected ${topicBoundaries.length} topic boundaries`);

   // STEP 3: Generate optimal segments based on boundaries and duration constraints
   const rawSegments = await this.generateOptimalSegments(transcriptSegments, topicBoundaries, contentAnalysis);
   console.log(`[AI-SEGMENTER] ⚡ Generated ${rawSegments.length} raw segments`);

   // STEP 4: Generate compelling titles and descriptions using AI
   const segmentsWithMetadata = await this.generateSegmentMetadata(rawSegments, contentAnalysis);
   console.log(`[AI-SEGMENTER] 📝 Added metadata to ${segmentsWithMetadata.length} segments`);

   // STEP 5: Extract impact quotes for each segment
   const finalSegments = await this.extractImpactQuotes(segmentsWithMetadata);
   console.log(`[AI-SEGMENTER] ✨ Final result: ${finalSegments.length} complete segments`);

   return {
    segments: finalSegments,
    analysis: contentAnalysis,
    metadata: {
     totalDuration: this.calculateTotalDuration(transcriptSegments),
     averageSegmentDuration: finalSegments.length > 0 ? Math.round(finalSegments.reduce((sum, s) => sum + s.duration, 0) / finalSegments.length) : 0,
     contentType: contentAnalysis.contentType,
     qualityScore: this.calculateQualityScore(finalSegments),
     processingTime: Date.now(),
    },
   };
  } catch (error) {
   console.error('[AI-SEGMENTER] ❌ Error in AI segmentation:', error);

   // Fallback to rule-based segmentation
   console.log('[AI-SEGMENTER] 🔄 Falling back to rule-based segmentation');
   return await this.generateFallbackSegments(transcriptSegments, options);
  }
 }

 /**
  * STEP 1: CONTENT ANALYSIS
  * Analyzes transcript to understand content type, language, and main topics
  */
 async analyzeTranscriptContent(transcriptSegments) {
  await this.respectRateLimit();

  // Combine transcript for analysis (sample first 3000 chars for efficiency)
  const fullText = transcriptSegments
   .map((s) => s.text)
   .join(' ')
   .substring(0, 3000);

  const prompt = `Analyze this transcript excerpt and provide a JSON response with content insights.

TRANSCRIPT EXCERPT:
"""
${fullText}
"""

Analyze and provide:
1. Content type (podcast, lecture, interview, vlog, tutorial, discussion, etc.)
2. Primary language (indonesian, english, mixed)
3. Main topics/themes discussed (up to 5)
4. Content style (formal, casual, educational, entertainment)
5. Speaker count (estimate)
6. Key entities mentioned (people, companies, concepts)

OUTPUT FORMAT (JSON only):
{
  "contentType": "podcast|lecture|interview|vlog|tutorial|discussion",
  "language": "indonesian|english|mixed", 
  "topics": ["topic1", "topic2", "topic3"],
  "style": "formal|casual|educational|entertainment",
  "speakerCount": 1-5,
  "keyEntities": ["entity1", "entity2", "entity3"],
  "confidence": 0.0-1.0
}`;

  try {
   const completion = await this.groq.chat.completions.create({
    messages: [
     {
      role: 'system',
      content: 'You are an expert content analyst. Analyze transcripts and provide structured insights in JSON format only.',
     },
     {
      role: 'user',
      content: prompt,
     },
    ],
    model: 'llama-3.1-8b-instant', // Fast model for analysis
    temperature: 0.1,
    max_tokens: 500,
    response_format: {type: 'json_object'},
   });

   const response = completion.choices[0]?.message?.content;
   const analysis = JSON.parse(response);

   console.log(`[AI-SEGMENTER] 📊 Content analysis complete: ${analysis.contentType} in ${analysis.language}`);
   return analysis;
  } catch (error) {
   console.warn('[AI-SEGMENTER] ⚠️ Content analysis failed, using defaults:', error.message);

   // Fallback analysis
   return {
    contentType: 'discussion',
    language: 'mixed',
    topics: ['general discussion'],
    style: 'casual',
    speakerCount: 2,
    keyEntities: [],
    confidence: 0.5,
   };
  }
 }

 /**
  * STEP 2: TOPIC BOUNDARY DETECTION
  * Uses AI to identify natural topic boundaries in the conversation
  */
 async detectTopicBoundaries(transcriptSegments, contentAnalysis) {
  await this.respectRateLimit();

  // Group transcript into larger chunks for boundary detection
  const chunks = this.createAnalysisChunks(transcriptSegments, 500); // 500 words per chunk
  const allBoundaries = [];

  for (let i = 0; i < chunks.length; i++) {
   const chunk = chunks[i];

   const prompt = `Identify topic boundaries in this ${contentAnalysis.contentType} transcript chunk.

CONTENT TYPE: ${contentAnalysis.contentType}
LANGUAGE: ${contentAnalysis.language}
CHUNK ${i + 1}/${chunks.length}

TRANSCRIPT:
"""
${chunk.text}
"""

Look for:
- Topic shifts and subject changes
- Natural conversation breaks  
- Introduction of new concepts
- Speaker transitions (if applicable)
- Semantic shifts in discussion

For each boundary, provide the approximate timestamp and reason.

OUTPUT FORMAT (JSON only):
{
  "boundaries": [
    {
      "timestamp": "MM:SS",
      "reason": "topic_change|speaker_transition|concept_introduction|natural_break",
      "confidence": 0.0-1.0,
      "description": "Brief description of the boundary"
    }
  ]
}`;

   try {
    const completion = await this.groq.chat.completions.create({
     messages: [
      {
       role: 'system',
       content: `You are an expert at identifying topic boundaries in ${contentAnalysis.contentType} content. Provide precise timestamp-based analysis.`,
      },
      {
       role: 'user',
       content: prompt,
      },
     ],
     model: 'llama3-70b-8192', // Use powerful model for complex reasoning
     temperature: 0.2,
     max_tokens: 800,
     response_format: {type: 'json_object'},
    });

    const response = completion.choices[0]?.message?.content;
    const result = JSON.parse(response);

    if (result.boundaries && Array.isArray(result.boundaries)) {
     allBoundaries.push(...result.boundaries);
     console.log(`[AI-SEGMENTER] 🎯 Found ${result.boundaries.length} boundaries in chunk ${i + 1}`);
    }

    // Rate limiting between chunks
    if (i < chunks.length - 1) {
     await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay));
    }
   } catch (error) {
    console.warn(`[AI-SEGMENTER] ⚠️ Boundary detection failed for chunk ${i + 1}:`, error.message);
   }
  }

  // Sort boundaries by timestamp and remove duplicates
  const sortedBoundaries = allBoundaries.filter((b) => b.timestamp && b.confidence > 0.5).sort((a, b) => this.parseTimestamp(a.timestamp) - this.parseTimestamp(b.timestamp));

  // Remove duplicates within 10 seconds
  const uniqueBoundaries = [];
  for (const boundary of sortedBoundaries) {
   const timestamp = this.parseTimestamp(boundary.timestamp);
   const isDuplicate = uniqueBoundaries.some((existing) => Math.abs(this.parseTimestamp(existing.timestamp) - timestamp) < 10);

   if (!isDuplicate) {
    uniqueBoundaries.push(boundary);
   }
  }

  console.log(`[AI-SEGMENTER] 🎯 Final boundaries: ${uniqueBoundaries.length} unique boundaries`);
  return uniqueBoundaries;
 }

 /**
  * STEP 3: OPTIMAL SEGMENT GENERATION
  * Creates segments based on topic boundaries and duration constraints
  */
 async generateOptimalSegments(transcriptSegments, topicBoundaries, contentAnalysis) {
  const segments = [];
  const totalDuration = this.calculateTotalDuration(transcriptSegments);

  // Convert boundaries to timestamp array
  const boundaryTimestamps = topicBoundaries.map((b) => this.parseTimestamp(b.timestamp));
  boundaryTimestamps.sort((a, b) => a - b);

  // Add start and end boundaries
  const allBoundaries = [0, ...boundaryTimestamps, totalDuration];

  console.log(`[AI-SEGMENTER] ⚡ Creating segments from ${allBoundaries.length} boundaries`);

  for (let i = 0; i < allBoundaries.length - 1; i++) {
   const segmentStart = allBoundaries[i];
   const segmentEnd = allBoundaries[i + 1];
   const duration = segmentEnd - segmentStart;

   // Skip very short segments
   if (duration < this.minSegmentDuration) {
    console.log(`[AI-SEGMENTER] ⏭️ Skipping short segment: ${duration}s`);
    continue;
   }

   // Handle long segments by splitting
   if (duration > this.maxSegmentDuration) {
    const subSegments = this.splitLongSegment(transcriptSegments, segmentStart, segmentEnd, contentAnalysis);
    segments.push(...subSegments);
   } else {
    // Create segment within duration limits
    const segmentText = this.extractSegmentText(transcriptSegments, segmentStart, segmentEnd);

    if (segmentText.length > 50) {
     // Ensure meaningful content
     segments.push({
      start: segmentStart,
      end: segmentEnd,
      duration: Math.round(duration),
      text: segmentText,
      transcriptExcerpt: this.createExcerpt(segmentText, 200),
      segmentIndex: segments.length + 1,
     });
    }
   }
  }

  console.log(`[AI-SEGMENTER] ⚡ Generated ${segments.length} optimal segments`);
  return segments;
 }

 /**
  * STEP 4: METADATA GENERATION
  * Generates compelling titles and descriptions using AI
  */
 async generateSegmentMetadata(segments, contentAnalysis) {
  const segmentsWithMetadata = [];

  // Process segments in batches to avoid rate limits
  const batchSize = 3;
  for (let i = 0; i < segments.length; i += batchSize) {
   const batch = segments.slice(i, i + batchSize);

   await this.respectRateLimit();

   const batchTexts = batch.map((seg, idx) => `=== SEGMENT ${i + idx + 1} (${seg.duration}s) ===\n${seg.text.substring(0, 800)}\n`).join('\n');

   const prompt = `Generate compelling titles and descriptions for these ${contentAnalysis.contentType} segments.

CONTENT TYPE: ${contentAnalysis.contentType}
LANGUAGE: ${contentAnalysis.language} 
STYLE: ${contentAnalysis.style}

${batchTexts}

For each segment, create:
1. A compelling title (max 12 words) that captures the key insight/topic
2. A clear description (1-2 sentences) explaining what viewers will learn
3. Make titles relevant and unique to each segment's content

${contentAnalysis.language === 'indonesian' ? 'PENTING: Generate titles and descriptions in BAHASA INDONESIA.' : 'Generate titles and descriptions in the same language as the transcript.'}

OUTPUT FORMAT (JSON only):
{
  "segments": [
    {
      "title": "Engaging title that captures the segment essence",
      "description": "Clear 1-2 sentence description of the segment content and value."
    }
  ]
}`;

   try {
    const completion = await this.groq.chat.completions.create({
     messages: [
      {
       role: 'system',
       content: `You are an expert content marketer specializing in ${contentAnalysis.contentType} content. Create compelling, accurate titles that match the content precisely.`,
      },
      {
       role: 'user',
       content: prompt,
      },
     ],
     model: 'llama3-70b-8192', // Use powerful model for creative tasks
     temperature: 0.3,
     max_tokens: 1200,
     response_format: {type: 'json_object'},
    });

    const response = completion.choices[0]?.message?.content;
    const result = JSON.parse(response);

    if (result.segments && Array.isArray(result.segments)) {
     // Merge AI-generated metadata with segments
     batch.forEach((segment, idx) => {
      const aiMetadata = result.segments[idx];
      segmentsWithMetadata.push({
       ...segment,
       title: aiMetadata?.title || `Segment ${i + idx + 1}`,
       description: aiMetadata?.description || `${contentAnalysis.contentType} segment lasting ${segment.duration} seconds`,
       id: `ai-segment-${Date.now()}-${i + idx + 1}`,
      });
     });

     console.log(`[AI-SEGMENTER] 📝 Generated metadata for batch ${Math.floor(i / batchSize) + 1}`);
    } else {
     // Fallback metadata
     batch.forEach((segment, idx) => {
      segmentsWithMetadata.push({
       ...segment,
       title: this.generateSmartFallbackTitle(segment.text),
       description: this.generateSmartFallbackDescription(segment.text, segment.duration),
       id: `fallback-segment-${Date.now()}-${i + idx + 1}`,
      });
     });
    }
   } catch (error) {
    console.warn(`[AI-SEGMENTER] ⚠️ Metadata generation failed for batch ${Math.floor(i / batchSize) + 1}:`, error.message);

    // Fallback metadata for this batch
    batch.forEach((segment, idx) => {
     segmentsWithMetadata.push({
      ...segment,
      title: this.generateSmartFallbackTitle(segment.text),
      description: this.generateSmartFallbackDescription(segment.text, segment.duration),
      id: `fallback-segment-${Date.now()}-${i + idx + 1}`,
     });
    });
   }
  }

  console.log(`[AI-SEGMENTER] 📝 Metadata generation complete: ${segmentsWithMetadata.length} segments`);
  return segmentsWithMetadata;
 }

 /**
  * STEP 5: IMPACT QUOTE EXTRACTION
  * Extracts memorable quotes from each segment
  */
 async extractImpactQuotes(segments) {
  const finalSegments = [];

  // Process segments in smaller batches for quote extraction
  const batchSize = 2;
  for (let i = 0; i < segments.length; i += batchSize) {
   const batch = segments.slice(i, i + batchSize);

   await this.respectRateLimit();

   const batchTexts = batch.map((seg, idx) => `=== SEGMENT ${i + idx + 1}: "${seg.title}" ===\n${seg.text}\n`).join('\n');

   const prompt = `Extract the most impactful quote from each segment for use as overlay text.

${batchTexts}

For each segment, find:
- The most memorable, quotable line (7-12 words)
- Something that captures the key insight or emotion
- Avoid generic statements, focus on specific valuable content
- Should work well as social media overlay text

OUTPUT FORMAT (JSON only):
{
  "quotes": [
    {
      "quote": "Impactful quote that captures the segment essence",
      "speaker": "speaker name or 'Unknown'",
      "context": "brief context if needed"
    }
  ]
}`;

   try {
    const completion = await this.groq.chat.completions.create({
     messages: [
      {
       role: 'system',
       content: 'You are an expert at extracting memorable quotes from video content. Focus on finding the most impactful, shareable lines.',
      },
      {
       role: 'user',
       content: prompt,
      },
     ],
     model: 'llama-3.1-8b-instant', // Faster model for quote extraction
     temperature: 0.2,
     max_tokens: 600,
     response_format: {type: 'json_object'},
    });

    const response = completion.choices[0]?.message?.content;
    const result = JSON.parse(response);

    if (result.quotes && Array.isArray(result.quotes)) {
     batch.forEach((segment, idx) => {
      const quoteData = result.quotes[idx];
      finalSegments.push({
       ...segment,
       keyQuote: quoteData?.quote || this.extractFallbackQuote(segment.text),
       speaker: quoteData?.speaker || 'Unknown',
       quoteContext: quoteData?.context || '',
      });
     });
    } else {
     // Fallback quotes
     batch.forEach((segment) => {
      finalSegments.push({
       ...segment,
       keyQuote: this.extractFallbackQuote(segment.text),
       speaker: 'Unknown',
       quoteContext: '',
      });
     });
    }
   } catch (error) {
    console.warn(`[AI-SEGMENTER] ⚠️ Quote extraction failed for batch:`, error.message);

    // Fallback quotes
    batch.forEach((segment) => {
     finalSegments.push({
      ...segment,
      keyQuote: this.extractFallbackQuote(segment.text),
      speaker: 'Unknown',
      quoteContext: '',
     });
    });
   }
  }

  console.log(`[AI-SEGMENTER] ✨ Quote extraction complete: ${finalSegments.length} segments with quotes`);
  return finalSegments;
 }

 // ===== HELPER METHODS =====

 async respectRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;

  if (timeSinceLastRequest < this.rateLimitDelay) {
   const waitTime = this.rateLimitDelay - timeSinceLastRequest;
   await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  this.lastRequestTime = Date.now();
 }

 createAnalysisChunks(transcriptSegments, wordsPerChunk = 500) {
  const chunks = [];
  let currentChunk = '';
  let currentWordCount = 0;
  let startTime = 0;

  for (const segment of transcriptSegments) {
   const words = segment.text.split(' ').length;

   if (currentWordCount + words > wordsPerChunk && currentChunk.length > 0) {
    chunks.push({
     text: currentChunk.trim(),
     startTime: startTime,
     wordCount: currentWordCount,
    });

    currentChunk = segment.text;
    currentWordCount = words;
    startTime = segment.start;
   } else {
    if (currentChunk.length === 0) {
     startTime = segment.start;
    }
    currentChunk += ' ' + segment.text;
    currentWordCount += words;
   }
  }

  if (currentChunk.length > 0) {
   chunks.push({
    text: currentChunk.trim(),
    startTime: startTime,
    wordCount: currentWordCount,
   });
  }

  return chunks;
 }

 parseTimestamp(timestamp) {
  if (typeof timestamp === 'number') return timestamp;

  const parts = timestamp.split(':');
  if (parts.length === 2) {
   return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
 }

 calculateTotalDuration(transcriptSegments) {
  if (transcriptSegments.length === 0) return 0;
  return transcriptSegments[transcriptSegments.length - 1].end || 600;
 }

 extractSegmentText(transcriptSegments, startTime, endTime) {
  return transcriptSegments
   .filter((seg) => seg.start < endTime && seg.end > startTime)
   .map((seg) => seg.text)
   .join(' ')
   .trim();
 }

 createExcerpt(text, maxLength = 200) {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
 }

 splitLongSegment(transcriptSegments, startTime, endTime, contentAnalysis) {
  const segments = [];
  const totalDuration = endTime - startTime;
  const targetSegments = Math.ceil(totalDuration / this.idealSegmentDuration);
  const segmentDuration = totalDuration / targetSegments;

  for (let i = 0; i < targetSegments; i++) {
   const segStart = startTime + i * segmentDuration;
   const segEnd = Math.min(startTime + (i + 1) * segmentDuration, endTime);
   const duration = segEnd - segStart;

   if (duration >= this.minSegmentDuration) {
    const text = this.extractSegmentText(transcriptSegments, segStart, segEnd);

    if (text.length > 50) {
     segments.push({
      start: segStart,
      end: segEnd,
      duration: Math.round(duration),
      text: text,
      transcriptExcerpt: this.createExcerpt(text, 200),
      segmentIndex: i + 1,
      splitFrom: 'long_segment',
     });
    }
   }
  }

  return segments;
 }

 /**
  * ENHANCED RULE-BASED METADATA GENERATION
  * Fallback when API is unavailable - uses smart algorithms instead of generic templates
  */
 generateEnhancedRuleBasedMetadata(segments, contentAnalysis) {
  console.log(`[AI-SEGMENTER] 🔧 Generating enhanced rule-based metadata for ${segments.length} segments`);

  return segments.map((segment, index) => ({
   title: this.generateSmartFallbackTitle(segment.text),
   description: this.generateSmartFallbackDescription(segment.text, segment.duration || 60),
   keyQuote: this.extractFallbackQuote(segment.text),
   confidence: 0.7, // Good confidence for rule-based
   source: 'enhanced-rules',
   index: index + 1,
  }));
 }

 /**
  * ENHANCED AI-POWERED SEGMENT METADATA GENERATION
  * Uses actual AI to generate titles and descriptions based on segment content
  */
 async generateEnhancedSegmentMetadata(segments, contentAnalysis) {
  if (!this.groq) {
   console.log('[AI-SEGMENTER] No API key - using enhanced rule-based metadata');
   return this.generateEnhancedRuleBasedMetadata(segments, contentAnalysis);
  }

  await this.respectRateLimit();

  console.log(`[AI-SEGMENTER] 🎯 Generating AI-powered metadata for ${segments.length} segments`);

  const enhancedSegments = [];
  const batchSize = 3; // Process segments in batches

  for (let i = 0; i < segments.length; i += batchSize) {
   const batch = segments.slice(i, i + batchSize);

   // Create detailed prompt for each segment in batch
   const segmentPrompts = batch.map((segment, idx) => ({
    index: i + idx + 1,
    text: segment.text,
    duration: segment.duration,
   }));

   const metadataPrompt = `Analyze these video segments and generate compelling titles and descriptions:

${segmentPrompts
 .map(
  (s) => `
SEGMENT ${s.index} (${s.duration}s):
"${s.text.substring(0, 500)}..."

`
 )
 .join('')}

Requirements:
1. Title: 3-8 words, specific to content, no generic prefixes
2. Description: 1-2 sentences explaining what viewers learn/discover
3. Use natural language that matches the content tone
4. Avoid templates like "Q&A:", "Discussion:", etc.
5. Make each title unique and compelling

${contentAnalysis.language === 'indonesian' ? 'Generate in BAHASA INDONESIA.' : 'Generate in the same language as content.'}

Return JSON format:
{
  "segments": [
    {
      "title": "Specific content-based title",
      "description": "Clear description of what this segment covers and its value."
    }
  ]
}`;

   try {
    const completion = await this.groq.chat.completions.create({
     messages: [
      {
       role: 'system',
       content: 'You are an expert content analyst who creates compelling, accurate video segment titles and descriptions. Focus on the actual content meaning, not generic categorization.',
      },
      {
       role: 'user',
       content: metadataPrompt,
      },
     ],
     model: 'llama3-70b-8192',
     temperature: 0.4, // Balance creativity with accuracy
     max_tokens: 1000,
     response_format: {type: 'json_object'},
    });

    const response = completion.choices[0]?.message?.content;
    const aiResult = JSON.parse(response);

    if (aiResult.segments && Array.isArray(aiResult.segments)) {
     batch.forEach((segment, idx) => {
      const aiMetadata = aiResult.segments[idx];
      enhancedSegments.push({
       ...segment,
       title: aiMetadata?.title || this.generateSmartFallbackTitle(segment.text),
       description: aiMetadata?.description || this.generateSmartFallbackDescription(segment.text, segment.duration),
       id: `ai-enhanced-${Date.now()}-${i + idx + 1}`,
       aiGenerated: true,
      });
     });
    } else {
     // Fallback for this batch
     batch.forEach((segment, idx) => {
      enhancedSegments.push({
       ...segment,
       title: this.generateSmartFallbackTitle(segment.text),
       description: this.generateSmartFallbackDescription(segment.text, segment.duration),
       id: `fallback-${Date.now()}-${i + idx + 1}`,
       aiGenerated: false,
      });
     });
    }

    console.log(`[AI-SEGMENTER] ✅ Generated AI metadata for batch ${Math.floor(i / batchSize) + 1}`);
   } catch (error) {
    console.warn(`[AI-SEGMENTER] AI metadata failed for batch: ${error.message}`);

    // Fallback for this batch
    batch.forEach((segment, idx) => {
     enhancedSegments.push({
      ...segment,
      title: this.generateSmartFallbackTitle(segment.text),
      description: this.generateSmartFallbackDescription(segment.text, segment.duration),
      id: `fallback-${Date.now()}-${i + idx + 1}`,
      aiGenerated: false,
     });
    });
   }

   // Rate limiting between batches
   if (i + batchSize < segments.length) {
    await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay));
   }
  }

  return enhancedSegments;
 }

 /**
  * SMART FALLBACK TITLE GENERATION
  * Improved rule-based title generation without generic prefixes
  */
 generateSmartFallbackTitle(text) {
  if (!text || text.length < 20) {
   return 'Content Segment';
  }

  // Extract the most important sentence or phrase
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 15);

  if (sentences.length > 0) {
   // Find the sentence with the most meaningful content
   let bestSentence = sentences[0];
   let bestScore = 0;

   for (const sentence of sentences.slice(0, 3)) {
    // Check first 3 sentences
    const words = sentence.toLowerCase().split(/\s+/);
    const meaningfulWords = words.filter((word) => word.length > 3 && !this.isStopWord(word) && !this.isFillerWord(word));

    if (meaningfulWords.length > bestScore) {
     bestScore = meaningfulWords.length;
     bestSentence = sentence;
    }
   }

   // Clean and shorten the best sentence for title
   const cleanTitle = bestSentence
    .trim()
    .replace(/^(well|so|now|today|okay|right|um|uh|like|basically)/i, '')
    .trim();

   if (cleanTitle.length > 10 && cleanTitle.length <= 60) {
    return this.capitalizeTitle(cleanTitle);
   }

   // If too long, extract key phrase
   const words = cleanTitle.split(/\s+/);
   if (words.length > 8) {
    return this.capitalizeTitle(words.slice(0, 6).join(' ') + '...');
   }
  }

  // Final fallback: extract key topics
  const keyTopics = this.extractKeyTopics(text);
  if (keyTopics.length > 0) {
   return this.capitalizeTitle(keyTopics.slice(0, 3).join(' '));
  }

  return 'Content Discussion';
 }

 /**
  * SMART FALLBACK DESCRIPTION GENERATION
  * Context-aware description without templates
  */
 generateSmartFallbackDescription(text, duration) {
  if (!text || text.length < 50) {
   return `${Math.round(duration)}-second segment covering key content.`;
  }

  // Extract main themes and concepts
  const keyTopics = this.extractKeyTopics(text);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  let description = '';

  if (keyTopics.length > 0) {
   const mainTopics = keyTopics.slice(0, 2);
   description = `Covers ${mainTopics.join(' and ')}`;

   // Add context from content analysis
   if (sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    if (firstSentence.length > 20 && firstSentence.length < 100) {
     description += ` including discussion about ${firstSentence.toLowerCase()}`;
    }
   }
  } else if (sentences.length > 0) {
   // Use first meaningful sentence as description base
   const mainSentence = sentences[0].trim();
   if (mainSentence.length <= 120) {
    description = mainSentence;
   } else {
    description = mainSentence.substring(0, 100) + '...';
   }
  } else {
   description = 'Important content segment';
  }

  return `${description}. Duration: ${Math.round(duration)} seconds.`;
 }

 /**
  * CHECK IF WORD IS STOP WORD
  */
 isStopWord(word) {
  const stopWords = new Set([
   // English
   'the',
   'a',
   'an',
   'and',
   'or',
   'but',
   'in',
   'on',
   'at',
   'to',
   'for',
   'of',
   'with',
   'by',
   'is',
   'are',
   'was',
   'were',
   'be',
   'been',
   'being',
   'have',
   'has',
   'had',
   'do',
   'does',
   'did',
   'will',
   'would',
   'could',
   'should',
   'may',
   'might',
   'can',
   'this',
   'that',
   'these',
   'those',
   // Indonesian
   'yang',
   'dan',
   'di',
   'ke',
   'dari',
   'untuk',
   'dengan',
   'pada',
   'dalam',
   'adalah',
   'itu',
   'ini',
   'juga',
   'akan',
   'atau',
   'bisa',
   'dapat',
   'tidak',
   'ya',
   'saya',
   'kita',
   'kami',
   'mereka',
  ]);

  return stopWords.has(word.toLowerCase());
 }

 /**
  * CHECK IF WORD IS FILLER WORD
  */
 isFillerWord(word) {
  const fillerWords = new Set(['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'obviously', 'eh', 'emm', 'hmm', 'ya', 'oke', 'baik', 'nah', 'jadi', 'terus', 'lalu']);

  return fillerWords.has(word.toLowerCase());
 }

 generateFallbackDescription(text, duration) {
  if (!text || text.length < 50) {
   return `Content segment lasting ${Math.round(duration)} seconds`;
  }

  // Enhanced description with content analysis
  const contentInfo = this.analyzeContentForDescription(text);
  const excerpt = this.createExcerpt(text, 150);

  let description = '';

  // Create descriptions based on content type and topics
  if (contentInfo.topics.length > 0) {
   const topicList = contentInfo.topics.slice(0, 2).join(' and ');

   switch (contentInfo.type) {
    case 'question':
     description = `Q&A session covering ${topicList} with detailed explanations`;
     break;
    case 'instruction':
     description = `Step-by-step tutorial about ${topicList} with practical guidance`;
     break;
    case 'story':
     description = `Personal story and experiences related to ${topicList}`;
     break;
    default:
     description = `In-depth discussion about ${topicList} with valuable insights`;
   }
  } else {
   // Use excerpt if no clear topics identified
   description = `Content covering: ${excerpt}`;
  }

  return `${description}. Duration: ${Math.round(duration)} seconds.`;
 }

 extractFallbackQuote(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  // Find shortest meaningful sentence for quote
  const shortSentences = sentences.filter((s) => s.split(' ').length >= 7 && s.split(' ').length <= 12).sort((a, b) => a.length - b.length);

  return shortSentences[0]?.trim() || text.split(' ').slice(0, 10).join(' ') + '...';
 }

 extractKeyPhrases(text) {
  // Simple key phrase extraction
  const words = text.toLowerCase().split(' ');
  const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'yang', 'dan', 'di', 'ke', 'dari', 'untuk'];

  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) {
   const phrase = words.slice(i, i + 2).join(' ');
   if (!stopWords.includes(words[i]) && !stopWords.includes(words[i + 1])) {
    phrases.push(phrase);
   }
  }

  return phrases.slice(0, 3);
 }

 calculateQualityScore(segments) {
  if (segments.length === 0) return 0;

  let score = 0;

  // Duration distribution score
  const avgDuration = segments.reduce((sum, s) => sum + s.duration, 0) / segments.length;
  const durationScore = avgDuration >= 45 && avgDuration <= 75 ? 1 : 0.7;
  score += durationScore * 0.3;

  // Content length score
  const avgContentLength = segments.reduce((sum, s) => sum + s.text.length, 0) / segments.length;
  const contentScore = avgContentLength >= 200 ? 1 : avgContentLength / 200;
  score += contentScore * 0.3;

  // Title quality score (basic check for non-generic titles)
  const titleQuality = segments.filter((s) => !s.title.includes('Segment')).length / segments.length;
  score += titleQuality * 0.4;

  return Math.round(score * 100) / 100;
 }

 /**
  * ENHANCED SEMANTIC SEGMENTATION WITH DYNAMIC DURATIONS
  * Creates segments based on content meaning and natural breaks, not fixed time
  */
 generateSemanticSegments(transcriptSegments, targetCount) {
  const allText = transcriptSegments.map((t) => t.text).join(' ');
  const sentences = this.splitIntoSentences(allText);
  const totalDuration = this.calculateTotalDuration(transcriptSegments);

  console.log(`[AI-SEGMENTER] 📝 Enhanced semantic analysis: ${sentences.length} sentences, ${totalDuration}s total`);

  if (sentences.length < 2) {
   console.log('[AI-SEGMENTER] ⚠️ Too few sentences, creating single segment');
   return [
    {
     start: 0,
     end: totalDuration,
     duration: Math.min(totalDuration, this.maxSegmentDuration),
     text: allText,
     sentenceCount: 1,
    },
   ];
  }

  // STRATEGY 1: Topic-based segmentation if we have clear topic boundaries
  const topicSegments = this.detectTopicBasedSegments(sentences, totalDuration);
  if (topicSegments.length >= 2) {
   console.log(`[AI-SEGMENTER] 🎯 Using topic-based segmentation: ${topicSegments.length} segments`);
   return topicSegments;
  }

  // STRATEGY 2: Content density-based segmentation
  const densitySegments = this.generateContentDensitySegments(sentences, totalDuration, targetCount);
  if (densitySegments.length >= 2) {
   console.log(`[AI-SEGMENTER] 📊 Using content density segmentation: ${densitySegments.length} segments`);
   return densitySegments;
  }

  // STRATEGY 3: Fallback to improved sentence grouping
  return this.generateImprovedSentenceSegments(sentences, totalDuration, targetCount);
 }

 /**
  * DETECT TOPIC-BASED SEGMENTS
  * Identifies natural topic transitions for segment boundaries
  */
 detectTopicBasedSegments(sentences, totalDuration) {
  const segments = [];
  const topicBoundaries = [];

  // Analyze sentence transitions for topic changes
  for (let i = 1; i < sentences.length; i++) {
   const prevSentence = sentences[i - 1].toLowerCase();
   const currSentence = sentences[i].toLowerCase();

   // Check for topic transition indicators
   const hasTopicTransition = this.detectTopicTransition(prevSentence, currSentence);

   if (hasTopicTransition) {
    topicBoundaries.push(i);
   }
  }

  if (topicBoundaries.length === 0) {
   return []; // No clear topics found
  }

  // Create segments based on topic boundaries
  let lastBoundary = 0;
  const timePerSentence = totalDuration / sentences.length;

  for (const boundary of topicBoundaries) {
   if (boundary - lastBoundary >= 3) {
    // Minimum 3 sentences per segment
    const segmentSentences = sentences.slice(lastBoundary, boundary);
    const segmentText = segmentSentences.join(' ').trim();

    const startTime = Math.round(lastBoundary * timePerSentence);
    const endTime = Math.round(boundary * timePerSentence);
    const duration = Math.max(this.minSegmentDuration, Math.min(this.maxSegmentDuration, endTime - startTime));

    segments.push({
     start: startTime,
     end: startTime + duration,
     duration: duration,
     text: segmentText,
     sentenceCount: segmentSentences.length,
     topicBased: true,
    });

    lastBoundary = boundary;
   }
  }

  // Add final segment
  if (lastBoundary < sentences.length - 1) {
   const finalSentences = sentences.slice(lastBoundary);
   const finalText = finalSentences.join(' ').trim();
   const startTime = Math.round(lastBoundary * timePerSentence);
   const duration = Math.max(this.minSegmentDuration, totalDuration - startTime);

   segments.push({
    start: startTime,
    end: totalDuration,
    duration: duration,
    text: finalText,
    sentenceCount: finalSentences.length,
    topicBased: true,
   });
  }

  return segments.filter((s) => s.text.length > 50 && s.duration >= this.minSegmentDuration);
 }

 /**
  * DETECT TOPIC TRANSITIONS BETWEEN SENTENCES
  */
 detectTopicTransition(prevSentence, currSentence) {
  // Transition indicators
  const transitionPhrases = [
   // English
   'now let',
   'moving on',
   'next',
   'another',
   'also',
   'however',
   'but',
   'meanwhile',
   'furthermore',
   'in addition',
   'on the other hand',
   'speaking of',
   'that brings us',
   // Indonesian
   'sekarang',
   'selanjutnya',
   'kemudian',
   'lalu',
   'berikutnya',
   'nah',
   'terus',
   'jadi',
   'selain itu',
   'di sisi lain',
   'namun',
   'akan tetapi',
  ];

  for (const phrase of transitionPhrases) {
   if (currSentence.includes(phrase)) {
    return true;
   }
  }

  // Check for topic word overlap (low overlap = topic change)
  const prevWords = new Set(prevSentence.split(/\s+/).filter((w) => w.length > 3 && !this.isStopWord(w)));
  const currWords = new Set(currSentence.split(/\s+/).filter((w) => w.length > 3 && !this.isStopWord(w)));

  const intersection = new Set([...prevWords].filter((x) => currWords.has(x)));
  const overlap = intersection.size / Math.max(prevWords.size, currWords.size);

  return overlap < 0.2; // Low overlap suggests topic change
 }

 /**
  * GENERATE CONTENT DENSITY-BASED SEGMENTS
  * Creates segments based on information density and natural pauses
  */
 generateContentDensitySegments(sentences, totalDuration, targetCount) {
  const densityScores = sentences.map((sentence) => this.calculateContentDensity(sentence));
  const segments = [];

  // Find natural breakpoints with low content density
  const breakpoints = [];
  for (let i = 1; i < densityScores.length - 1; i++) {
   if (densityScores[i] < densityScores[i - 1] * 0.7 && densityScores[i] < densityScores[i + 1] * 0.7) {
    breakpoints.push(i);
   }
  }

  if (breakpoints.length === 0) {
   return []; // No clear density patterns
  }

  // Create segments based on density breakpoints
  let lastBreak = 0;
  const timePerSentence = totalDuration / sentences.length;

  for (const breakpoint of breakpoints) {
   if (breakpoint - lastBreak >= 2) {
    // Minimum 2 sentences
    const segmentSentences = sentences.slice(lastBreak, breakpoint);
    const segmentText = segmentSentences.join(' ').trim();

    const startTime = Math.round(lastBreak * timePerSentence);
    const naturalDuration = Math.round((breakpoint - lastBreak) * timePerSentence);

    // Allow more variation in duration based on content
    let adjustedDuration = naturalDuration;
    if (naturalDuration < this.minSegmentDuration) {
     adjustedDuration = this.minSegmentDuration;
    } else if (naturalDuration > this.maxSegmentDuration) {
     adjustedDuration = this.maxSegmentDuration;
    }
    // Allow segments between 30-120 seconds based on content density
    else if (naturalDuration >= 30 && naturalDuration <= 120) {
     adjustedDuration = naturalDuration; // Keep natural duration
    }

    segments.push({
     start: startTime,
     end: startTime + adjustedDuration,
     duration: adjustedDuration,
     text: segmentText,
     sentenceCount: segmentSentences.length,
     densityBased: true,
     naturalDuration: naturalDuration,
    });

    lastBreak = breakpoint;
   }
  }

  return segments.filter((s) => s.text.length > 50);
 }

 /**
  * CALCULATE CONTENT DENSITY OF A SENTENCE
  * Higher density = more important/informative content
  */
 calculateContentDensity(sentence) {
  const words = sentence.toLowerCase().split(/\s+/);
  const meaningfulWords = words.filter((word) => word.length > 3 && !this.isStopWord(word) && !this.isFillerWord(word));

  // Factors that increase density
  let density = meaningfulWords.length / words.length; // Base ratio

  // Boost for numbers, technical terms, proper nouns
  if (/\d+/.test(sentence)) density += 0.1;
  if (/[A-Z][a-z]+/.test(sentence)) density += 0.1;
  if (sentence.includes('?')) density += 0.2; // Questions are often important

  return Math.min(density, 1.0);
 }

 /**
  * IMPROVED SENTENCE GROUPING (FALLBACK)
  * Better than original fixed-duration approach
  */
 generateImprovedSentenceSegments(sentences, totalDuration, targetCount) {
  const segments = [];
  const avgSentencesPerSegment = Math.ceil(sentences.length / targetCount);
  const timePerSentence = totalDuration / sentences.length;

  for (let i = 0; i < sentences.length; i += avgSentencesPerSegment) {
   const endIdx = Math.min(i + avgSentencesPerSegment, sentences.length);
   const segmentSentences = sentences.slice(i, endIdx);
   const segmentText = segmentSentences.join(' ').trim();

   if (segmentText.length > 50) {
    const startTime = Math.round(i * timePerSentence);
    const naturalDuration = Math.round((endIdx - i) * timePerSentence);

    // More flexible duration calculation
    let adjustedDuration;
    if (naturalDuration < 30) {
     adjustedDuration = Math.max(30, this.minSegmentDuration);
    } else if (naturalDuration > 120) {
     adjustedDuration = Math.min(120, this.maxSegmentDuration);
    } else {
     adjustedDuration = naturalDuration; // Keep natural timing for 30-120s range
    }

    segments.push({
     start: startTime,
     end: Math.min(startTime + adjustedDuration, totalDuration),
     duration: adjustedDuration,
     text: segmentText,
     sentenceCount: segmentSentences.length,
     improved: true,
    });
   }
  }

  return segments;
 }

 /**
  * SPLIT TEXT INTO SENTENCES
  * Enhanced sentence detection for better semantic boundaries
  */
 splitIntoSentences(text) {
  if (!text) return [];

  // Enhanced sentence splitting with multiple delimiters and paragraph breaks
  const sentences = [];

  // First split by paragraphs (double newlines)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 15);

  if (paragraphs.length > 1) {
   // If we have clear paragraph breaks, use them
   paragraphs.forEach((paragraph) => {
    sentences.push(paragraph.trim());
   });
  } else {
   // Otherwise, split by sentence endings
   const sentenceParts = text
    .split(/[.!?]+\s+/)
    .filter((s) => s.trim().length > 15)
    .map((s) => s.trim());
   sentences.push(...sentenceParts);
  }

  console.log(`[AI-SEGMENTER] 📝 Split text into ${sentences.length} meaningful chunks`);
  return sentences;
 }

 /**
  * ANALYZE CONTENT TYPE FOR BETTER DESCRIPTIONS
  */
 analyzeContentForDescription(text) {
  if (!text) return {type: 'general', topics: []};

  const lowerText = text.toLowerCase();
  const keyTopics = this.extractKeyTopics(text);

  let type = 'general';
  if (/\b(what|how|why|when|where|who|question|ask)\b/.test(lowerText) || text.includes('?')) {
   type = 'question';
  } else if (/\b(step|first|second|then|next|follow|guide|tutorial|how to)\b/.test(lowerText)) {
   type = 'instruction';
  } else if (/\b(story|experience|happened|remember|once|time when|example)\b/.test(lowerText)) {
   type = 'story';
  }

  return {type, topics: keyTopics};
 }

 /**
  * EXTRACT KEY TOPICS FROM TEXT
  */
 extractKeyTopics(text) {
  if (!text) return [];

  const words = text
   .toLowerCase()
   .replace(/[^\w\s]/g, '')
   .split(/\s+/);

  // Simple frequency analysis for key topics
  const stopWords = new Set([
   'the',
   'a',
   'an',
   'and',
   'or',
   'but',
   'in',
   'on',
   'at',
   'to',
   'for',
   'of',
   'with',
   'by',
   'is',
   'are',
   'was',
   'were',
   'be',
   'been',
   'being',
   'have',
   'has',
   'had',
   'do',
   'does',
   'did',
   'will',
   'would',
   'could',
   'should',
   'may',
   'might',
   'can',
   'this',
   'that',
   'these',
   'those',
  ]);

  const meaningfulWords = words.filter((word) => word.length > 3 && !stopWords.has(word));

  // Count frequency and return top words
  const wordCount = {};
  meaningfulWords.forEach((word) => {
   wordCount[word] = (wordCount[word] || 0) + 1;
  });

  return Object.entries(wordCount)
   .sort((a, b) => b[1] - a[1])
   .slice(0, 3)
   .map(([word]) => word);
 }

 /**
  * CAPITALIZE TITLE PROPERLY
  */
 capitalizeTitle(text) {
  if (!text) return '';

  return text
   .split(' ')
   .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
   .join(' ');
 }

 async generateFallbackSegments(transcriptSegments, options = {}) {
  console.log('[AI-SEGMENTER] 🔄 Generating enhanced fallback segments with AI-powered metadata');

  const segments = [];
  const totalDuration = this.calculateTotalDuration(transcriptSegments);
  const targetCount = options.targetCount || 6; // Reduced for better quality

  // Use semantic segmentation approach instead of fixed duration
  const semanticSegments = this.generateSemanticSegments(transcriptSegments, targetCount);

  console.log(`[AI-SEGMENTER] 🔍 Enhanced fallback: totalDuration=${totalDuration}, semanticSegments=${semanticSegments.length}`);

  // Process each semantic segment with enhanced AI metadata
  for (let i = 0; i < semanticSegments.length; i++) {
   const segment = semanticSegments[i];

   if (segment.text.length > 50) {
    let title, description, keyQuote;

    try {
     // Try to use AI for metadata generation
     if (this.groq) {
      const aiMetadata = await this.generateEnhancedSegmentMetadata([segment], {
       contentType: 'unknown',
       language: 'mixed',
      });

      if (aiMetadata && aiMetadata.length > 0) {
       title = aiMetadata[0].title;
       description = aiMetadata[0].description;
       keyQuote = aiMetadata[0].keyQuote;
      }
     }
    } catch (error) {
     console.log(`[AI-SEGMENTER] ⚠️ AI metadata failed for segment ${i + 1}, using smart fallback`);
    }

    // Use smart fallback if AI failed or no API
    if (!title) {
     title = this.generateSmartFallbackTitle(segment.text);
     description = this.generateSmartFallbackDescription(segment.text, segment.duration);
     keyQuote = this.extractFallbackQuote(segment.text);
    }

    segments.push({
     id: `enhanced-fallback-${Date.now()}-${i + 1}`,
     title: title,
     description: description,
     start: segment.start,
     end: segment.end,
     duration: Math.round(segment.duration),
     text: segment.text,
     transcriptExcerpt: segment.text, // Use full text, not truncated
     keyQuote: keyQuote,
     speaker: 'Unknown',
     segmentIndex: i + 1,
     fallback: true,
     enhanced: true,
     aiGenerated: !!this.groq,
    });
   }
  }
  return {
   segments: segments,
   analysis: {
    contentType: 'unknown',
    language: 'mixed',
    topics: [],
    style: 'unknown',
    speakerCount: 1,
    keyEntities: [],
    confidence: 0.3,
   },
   metadata: {
    totalDuration: totalDuration,
    averageSegmentDuration: segments.length > 0 ? Math.round(segments.reduce((sum, s) => sum + s.duration, 0) / segments.length) : 0,
    contentType: 'unknown',
    qualityScore: 0.5,
    processingTime: Date.now(),
    fallback: true,
   },
  };
 }
}

module.exports = new EnhancedAISegmenter();
