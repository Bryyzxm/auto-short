/**
 * INTELLIGENT TRANSCRIPT CHUNKER
 * Creates segments with accurate timing and content boundaries
 */

class IntelligentTranscriptChunker {
 constructor() {
  this.minSegmentDuration = 30; // seconds - STRICT minimum
  this.maxSegmentDuration = 120; // seconds - STRICT maximum (NO TOLERANCE)
  this.idealSegmentDuration = 75; // seconds - optimal balance
 }

 // Main method: Create intelligent segments from timed transcript
 createIntelligentSegments(transcriptData, targetSegmentCount = 8) {
  console.log(`[CHUNKER] Processing ${transcriptData.segments.length} timed segments into ${targetSegmentCount} chunks`);

  // CRITICAL: Validate transcript data before proceeding
  if (!transcriptData) {
   throw new Error('Failed to create segments: Transcript data is null or undefined');
  }

  if (!transcriptData.segments || !Array.isArray(transcriptData.segments) || transcriptData.segments.length === 0) {
   throw new Error('Failed to create segments: No valid segments available in transcript data');
  }

  if (!transcriptData.hasRealTiming) {
   throw new Error('Real timing data required for intelligent chunking');
  }

  const timedSegments = transcriptData.segments;

  // Validate each segment has required properties
  for (let i = 0; i < timedSegments.length; i++) {
   const segment = timedSegments[i];
   if (!segment || typeof segment.start === 'undefined' || typeof segment.end === 'undefined' || !segment.text) {
    throw new Error(`Failed to create segments: Invalid segment at index ${i} - missing start, end, or text properties`);
   }
  }

  const totalDuration = timedSegments[timedSegments.length - 1]?.end || 0;

  console.log(`[CHUNKER] Total video duration: ${Math.floor(totalDuration / 60)}m${Math.floor(totalDuration % 60)}s`);

  // Step 1: Find natural break points
  const breakPoints = this.findNaturalBreakPoints(timedSegments);

  // Step 2: Create segments with optimal duration
  const intelligentSegments = this.createOptimalSegments(timedSegments, breakPoints, targetSegmentCount, totalDuration);

  // Step 3: Validate and adjust segments
  const validatedSegments = this.validateAndAdjustSegments(intelligentSegments, timedSegments);

  console.log(`[CHUNKER] Created ${validatedSegments.length} intelligent segments`);
  validatedSegments.forEach((seg, i) => {
   console.log(`[CHUNKER] Segment ${i + 1}: ${this.formatTime(seg.start)} - ${this.formatTime(seg.end)} (${seg.duration}s, ${seg.text.length} chars) - "${seg.text.substring(0, 50)}..."`);
  });

  // Content integrity check
  const totalChars = validatedSegments.reduce((sum, seg) => sum + seg.text.length, 0);
  console.log(`[CHUNKER] Content integrity: ${totalChars} total characters across ${validatedSegments.length} segments`);

  // FINAL STRICT VALIDATION - Remove any segments that exceed limits
  const finalSegments = validatedSegments.filter((seg) => {
   const isValid = seg.duration >= this.minSegmentDuration && seg.duration <= this.maxSegmentDuration;
   if (!isValid) {
    console.log(`[CHUNKER] ❌ FINAL FILTER: Removing invalid segment ${seg.duration}s (outside ${this.minSegmentDuration}s-${this.maxSegmentDuration}s range)`);
   }
   return isValid;
  });

  console.log(`[CHUNKER] ✅ Final result: ${finalSegments.length} valid segments (${validatedSegments.length - finalSegments.length} filtered out)`);

  return finalSegments;
 }

 // Find natural break points in speech (pauses, sentence endings, topic changes)
 findNaturalBreakPoints(timedSegments) {
  const breakPoints = [];

  for (let i = 1; i < timedSegments.length; i++) {
   const current = timedSegments[i];
   const previous = timedSegments[i - 1];

   // Calculate pause between segments
   const pause = current.start - previous.end;

   // Identify break points based on:
   const isLongPause = pause > 1.5; // >1.5 second pause
   const isSentenceEnd = previous.text.match(/[.!?][\s]*$/);
   const isTopicChange = this.detectTopicChange(previous.text, current.text);
   const isNaturalBreak = previous.text.match(/jadi|nah|oke|baik|selanjutnya|kemudian/i);

   if (isLongPause || (isSentenceEnd && pause > 0.8) || isTopicChange || isNaturalBreak) {
    breakPoints.push({
     index: i,
     timestamp: current.start,
     reason: isLongPause ? 'long_pause' : isSentenceEnd ? 'sentence_end' : isTopicChange ? 'topic_change' : 'natural_break',
     confidence: this.calculateBreakPointConfidence(pause, previous.text, current.text),
    });
   }
  }

  // Sort by confidence and select best break points
  breakPoints.sort((a, b) => b.confidence - a.confidence);

  console.log(`[CHUNKER] Found ${breakPoints.length} potential break points`);
  return breakPoints;
 }

 // Create optimal segments using break points and duration constraints
 createOptimalSegments(timedSegments, breakPoints, targetCount, totalDuration) {
  const segments = [];

  // Calculate ideal segment duration
  const idealDuration = Math.min(this.maxSegmentDuration, Math.max(this.minSegmentDuration, totalDuration / targetCount));

  console.log(`[CHUNKER] Target duration per segment: ${idealDuration}s (STRICT MAX: ${this.maxSegmentDuration}s)`);

  let segmentStart = 0;
  let currentSegmentIndex = 0;

  while (currentSegmentIndex < timedSegments.length && segments.length < targetCount - 1) {
   const segmentStartTime = timedSegments[segmentStart].start;

   // Find best end point for this segment
   const endPoint = this.findOptimalEndPoint(timedSegments, segmentStart, segmentStartTime, idealDuration, breakPoints);

   if (endPoint > segmentStart) {
    const segmentTexts = timedSegments
     .slice(segmentStart, endPoint + 1)
     .map((s) => s.text)
     .join(' ')
     .trim();

    const segmentDuration = timedSegments[endPoint].end - segmentStartTime;

    // STRICT CHECK: If segment exceeds max duration, find closer end point
    if (segmentDuration > this.maxSegmentDuration) {
     console.log(`[CHUNKER] ⚠️ Segment would be ${Math.round(segmentDuration)}s, finding shorter endpoint`);

     // Find closer endpoint that stays within max duration
     let adjustedEndPoint = endPoint;
     while (adjustedEndPoint > segmentStart && timedSegments[adjustedEndPoint].end - segmentStartTime > this.maxSegmentDuration) {
      adjustedEndPoint--;
     }

     if (adjustedEndPoint > segmentStart) {
      endPoint = adjustedEndPoint;
      console.log(`[CHUNKER] ✅ Adjusted endpoint to respect ${this.maxSegmentDuration}s limit`);
     }
    }

    const finalSegmentDuration = timedSegments[endPoint].end - segmentStartTime;

    segments.push({
     start: segmentStartTime,
     end: timedSegments[endPoint].end,
     duration: Math.round(finalSegmentDuration),
     text: segmentTexts,
     segmentCount: endPoint - segmentStart + 1,
    });

    segmentStart = endPoint + 1;
    currentSegmentIndex = segmentStart;
   } else {
    currentSegmentIndex++;
   }
  }

  // Add remaining content as final segment if substantial
  if (segmentStart < timedSegments.length - 1) {
   const remainingTexts = timedSegments
    .slice(segmentStart)
    .map((s) => s.text)
    .join(' ')
    .trim();

   const remainingDuration = timedSegments[timedSegments.length - 1].end - timedSegments[segmentStart].start;

   if (remainingDuration >= this.minSegmentDuration) {
    segments.push({
     start: timedSegments[segmentStart].start,
     end: timedSegments[timedSegments.length - 1].end,
     duration: Math.round(remainingDuration),
     text: remainingTexts,
     segmentCount: timedSegments.length - segmentStart,
    });
   } else if (segments.length > 0) {
    // Merge with last segment if too short
    const lastSegment = segments[segments.length - 1];
    lastSegment.end = timedSegments[timedSegments.length - 1].end;
    lastSegment.duration = Math.round(lastSegment.end - lastSegment.start);
    lastSegment.text += ' ' + remainingTexts;
   }
  }

  return segments;
 }

 // Find optimal end point for a segment
 findOptimalEndPoint(timedSegments, startIndex, startTime, idealDuration, breakPoints) {
  let bestEndIndex = startIndex;
  let bestScore = -1;

  const maxEndTime = startTime + this.maxSegmentDuration;
  const idealEndTime = startTime + idealDuration;
  const minEndTime = startTime + this.minSegmentDuration;

  for (let i = startIndex + 1; i < timedSegments.length; i++) {
   const currentTime = timedSegments[i].end;

   // Don't go beyond max duration
   if (currentTime > maxEndTime) break;

   // Must meet minimum duration
   if (currentTime < minEndTime) continue;

   // Calculate score based on multiple factors
   const durationScore = this.calculateDurationScore(currentTime - startTime, idealDuration);
   const breakPointScore = this.calculateBreakPointScore(i, breakPoints);
   const contentScore = this.calculateContentScore(timedSegments[i].text);

   const totalScore = durationScore * 0.4 + breakPointScore * 0.4 + contentScore * 0.2;

   if (totalScore > bestScore) {
    bestScore = totalScore;
    bestEndIndex = i;
   }
  }

  return bestEndIndex;
 }

 // Calculate duration score (prefer ideal duration)
 calculateDurationScore(duration, idealDuration) {
  const diff = Math.abs(duration - idealDuration);
  return Math.max(0, 1 - diff / idealDuration);
 }

 // Calculate break point score (prefer natural breaks)
 calculateBreakPointScore(index, breakPoints) {
  const breakPoint = breakPoints.find((bp) => Math.abs(bp.index - index) <= 2);
  return breakPoint ? breakPoint.confidence : 0;
 }

 // Calculate content score (prefer complete thoughts)
 calculateContentScore(text) {
  if (text.match(/[.!?][\s]*$/)) return 1.0; // Sentence end
  if (text.match(/[,;:][\s]*$/)) return 0.6; // Clause end
  return 0.3; // Mid-sentence
 }

 // Detect topic changes using simple keyword analysis
 detectTopicChange(prevText, currText) {
  const topicWords = ['jadi', 'nah', 'kemudian', 'selanjutnya', 'lalu', 'sekarang', 'pertama', 'kedua', 'ketiga'];
  return topicWords.some((word) => currText.toLowerCase().includes(word)) && !topicWords.some((word) => prevText.toLowerCase().includes(word));
 }

 // Calculate break point confidence
 calculateBreakPointConfidence(pause, prevText, currText) {
  let confidence = 0;

  if (pause > 2.0) confidence += 0.4;
  else if (pause > 1.5) confidence += 0.3;
  else if (pause > 1.0) confidence += 0.2;

  if (prevText.match(/[.!?][\s]*$/)) confidence += 0.3;
  if (this.detectTopicChange(prevText, currText)) confidence += 0.2;
  if (currText.match(/^(jadi|nah|oke|baik)/i)) confidence += 0.1;

  return Math.min(1.0, confidence);
 }

 // Validate and adjust segments
 validateAndAdjustSegments(segments, timedSegments) {
  const validated = [];

  for (let i = 0; i < segments.length; i++) {
   const segment = segments[i];

   // Skip segments that are too short, but try to merge first
   if (segment.duration < this.minSegmentDuration) {
    console.log(`[CHUNKER] Found too short segment: ${segment.duration}s`);

    // Try to merge with previous segment
    if (validated.length > 0) {
     const lastSegment = validated[validated.length - 1];
     const combinedDuration = lastSegment.duration + segment.duration;

     // Only merge if combined duration is within STRICT limits
     if (combinedDuration <= this.maxSegmentDuration) {
      lastSegment.end = segment.end;
      lastSegment.duration = Math.round(combinedDuration);
      lastSegment.text += ' ' + segment.text;
      lastSegment.segmentCount += segment.segmentCount || 1;

      console.log(`[CHUNKER] ✅ Merged short segment with previous: ${segment.duration}s + ${lastSegment.duration - segment.duration}s = ${lastSegment.duration}s`);
      continue;
     }
    }

    // Try to merge with next segment
    if (i < segments.length - 1) {
     const nextSegment = segments[i + 1];
     const combinedDuration = segment.duration + nextSegment.duration;

     if (combinedDuration <= this.maxSegmentDuration) {
      nextSegment.start = segment.start;
      nextSegment.duration = Math.round(combinedDuration);
      nextSegment.text = segment.text + ' ' + nextSegment.text;
      nextSegment.segmentCount = (nextSegment.segmentCount || 1) + (segment.segmentCount || 1);

      console.log(`[CHUNKER] ✅ Merged short segment with next: ${segment.duration}s + ${nextSegment.duration - segment.duration}s = ${nextSegment.duration}s`);
      continue;
     }
    }

    // If can't merge and too short, skip
    console.log(`[CHUNKER] Skipping too short segment: ${segment.duration}s (couldn't merge)`);
    continue;
   }

   // Handle segments that are too long - SPLIT instead of TRIM
   if (segment.duration > this.maxSegmentDuration) {
    console.log(`[CHUNKER] Splitting too long segment: ${segment.duration}s (preserving content)`);

    const splitSegments = this.splitLongSegment(segment, timedSegments);
    validated.push(...splitSegments);
   } else {
    // STRICT validation - segment must be within acceptable range
    if (segment.duration > this.maxSegmentDuration) {
     console.log(`[CHUNKER] ❌ Segment still too long after validation: ${segment.duration}s, forcing split`);
     const splitSegments = this.splitLongSegment(segment, timedSegments);
     validated.push(...splitSegments);
    } else if (segment.duration < this.minSegmentDuration) {
     console.log(`[CHUNKER] ❌ Segment too short and couldn't merge: ${segment.duration}s, skipping`);
     // Skip segments that are too short and can't be merged
    } else {
     // Segment is within acceptable range
     validated.push({
      ...segment,
      start: parseFloat(segment.start.toFixed(3)),
      end: parseFloat(segment.end.toFixed(3)),
      duration: Math.round(segment.duration),
     });
    }
   }
  }

  return validated;
 }

 // Split a long segment into multiple shorter segments while preserving content
 splitLongSegment(segment, timedSegments) {
  const splits = [];
  const targetDuration = this.maxSegmentDuration; // Use STRICT max duration

  // Find all timed segments within this long segment
  const relevantSegments = timedSegments.filter((ts) => ts.start >= segment.start && ts.end <= segment.end);

  if (relevantSegments.length === 0) {
   console.log(`[CHUNKER] ⚠️ No timed segments found for splitting, using fallback split`);

   // Fallback: Split into equal parts that respect max duration
   const numSplits = Math.ceil(segment.duration / targetDuration);
   const splitDuration = segment.duration / numSplits;

   for (let i = 0; i < numSplits; i++) {
    const splitStart = segment.start + i * splitDuration;
    const splitEnd = Math.min(segment.start + (i + 1) * splitDuration, segment.end);
    const textStart = Math.floor((i * segment.text.length) / numSplits);
    const textEnd = Math.floor(((i + 1) * segment.text.length) / numSplits);

    splits.push({
     start: splitStart,
     end: splitEnd,
     duration: Math.round(splitEnd - splitStart),
     text: segment.text.substring(textStart, textEnd).trim(),
     segmentCount: 1,
    });
   }

   return splits;
  }

  let currentStart = segment.start;
  let currentSegments = [];
  let currentDuration = 0;

  for (const timedSeg of relevantSegments) {
   const segDuration = timedSeg.end - timedSeg.start;

   // STRICT CHECK: If adding this segment exceeds max duration, create a split
   if (currentDuration + segDuration > this.maxSegmentDuration && currentSegments.length > 0) {
    const splitText = currentSegments
     .map((s) => s.text)
     .join(' ')
     .trim();
    const splitEnd = currentSegments[currentSegments.length - 1].end;
    const splitDuration = Math.round(splitEnd - currentStart);

    // Only add split if it meets minimum duration requirement
    if (splitDuration >= this.minSegmentDuration) {
     splits.push({
      start: currentStart,
      end: splitEnd,
      duration: splitDuration,
      text: splitText,
      segmentCount: currentSegments.length,
     });
    }

    // Start new segment
    currentStart = timedSeg.start;
    currentSegments = [timedSeg];
    currentDuration = segDuration;
   } else {
    // Add to current segment
    currentSegments.push(timedSeg);
    currentDuration += segDuration;
   }
  }

  // Add remaining segments as final split
  if (currentSegments.length > 0) {
   const splitText = currentSegments
    .map((s) => s.text)
    .join(' ')
    .trim();
   const splitEnd = currentSegments[currentSegments.length - 1].end;

   splits.push({
    start: currentStart,
    end: splitEnd,
    duration: Math.round(splitEnd - currentStart),
    text: splitText,
    segmentCount: currentSegments.length,
   });
  }

  console.log(`[CHUNKER] ✅ Split ${segment.duration}s segment into ${splits.length} parts: ${splits.map((s) => s.duration + 's').join(', ')}`);

  return splits.map((split) => ({
   ...split,
   start: parseFloat(split.start.toFixed(3)),
   end: parseFloat(split.end.toFixed(3)),
  }));
 }

 // Format time for display
 formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
 }
}

export default new IntelligentTranscriptChunker();
