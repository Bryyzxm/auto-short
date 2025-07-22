// Enhanced API endpoint for intelligent segmentation
app.post('/api/intelligent-segments', async (req, res) => {
 const {videoId, targetSegmentCount = 8} = req.body;

 if (!videoId) {
  return res.status(400).json({error: 'Video ID is required'});
 }

 try {
  console.log(`[INTELLIGENT-SEGMENTS] Starting intelligent segmentation for ${videoId}`);

  // Step 1: Get transcript with real timing
  const transcriptData = await robustTranscriptService.extractWithRealTiming(videoId, {
   lang: ['id', 'en'],
  });

  if (!transcriptData.hasRealTiming) {
   throw new Error('Real timing data required for intelligent segmentation');
  }

  console.log(`[INTELLIGENT-SEGMENTS] Got transcript: ${transcriptData.segments.length} timed segments, ${Math.floor(transcriptData.totalDuration / 60)}m${Math.floor(transcriptData.totalDuration % 60)}s`);

  // Step 2: Create intelligent segments
  const intelligentSegments = intelligentChunker.createIntelligentSegments(transcriptData, targetSegmentCount);

  // Step 3: Format for frontend
  const formattedSegments = intelligentSegments.map((segment, index) => ({
   id: `intelligent-${videoId}-${index + 1}`,
   title: `Segment ${index + 1}`, // You could use AI to generate better titles
   description: `Smart segment ${index + 1} (${segment.duration}s)`,
   startTimeSeconds: segment.start,
   endTimeSeconds: segment.end,
   duration: segment.duration,
   transcriptExcerpt: segment.text.length > 300 ? segment.text.substring(0, 297) + '...' : segment.text,
   youtubeVideoId: videoId,
   thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
   hasRealTiming: true,
   segmentCount: segment.segmentCount,
  }));

  const result = {
   segments: formattedSegments,
   videoId: videoId,
   totalSegments: formattedSegments.length,
   averageDuration: Math.round(formattedSegments.reduce((sum, s) => sum + s.duration, 0) / formattedSegments.length),
   method: 'Intelligent Chunking with Real Timing',
   hasRealTiming: true,
   transcriptQuality: 'HIGH',
   extractedAt: new Date().toISOString(),
  };

  console.log(`[INTELLIGENT-SEGMENTS] ✅ Created ${formattedSegments.length} intelligent segments (avg: ${result.averageDuration}s)`);

  res.json(result);
 } catch (error) {
  console.error(`[INTELLIGENT-SEGMENTS] ❌ Error for ${videoId}:`, error);
  res.status(500).json({
   error: 'Intelligent segmentation failed',
   message: error.message,
   videoId: videoId,
  });
 }
});
