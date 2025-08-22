/**
 * Smart Language Detection Utility
 *
 * Intelligently determines the best language priority for YouTube videos
 * to avoid rate limiting while still prioritizing Indonesian content.
 */

class SmartLanguageDetector {
 constructor() {
  this.indonesianKeywords = [
   // Common Indonesian words
   'bahasa',
   'indonesia',
   'indonesia',
   'viral',
   'tiktok',
   'shorts',
   'tutorial',
   'cara',
   'belajar',
   'review',
   'gaming',
   'musik',
   // Indonesian channel indicators
   'channel',
   'subscribe',
   'like',
   'comment',
   'share',
   // Common Indonesian phrases
   'gimana',
   'banget',
   'yang',
   'dengan',
   'untuk',
   'dari',
  ];

  this.englishChannelPatterns = [
   // Well-known English channels/artists
   'vevo',
   'official',
   'records',
   'entertainment',
   'music',
   'rick astley',
   'never gonna give you up',
   'rickroll',
  ];
 }

 /**
  * Analyze video metadata to determine optimal language strategy
  */
 async analyzeVideo(videoId, metadata = {}) {
  const analysis = {
   isLikelyIndonesian: false,
   isLikelyEnglish: false,
   confidence: 0,
   strategy: 'smart-fallback',
  };

  // Check title for Indonesian keywords
  const title = (metadata.title || '').toLowerCase();
  const indonesianScore = this.calculateIndonesianScore(title);
  const englishScore = this.calculateEnglishScore(title);

  analysis.isLikelyIndonesian = indonesianScore > 0.3;
  analysis.isLikelyEnglish = englishScore > 0.5;
  analysis.confidence = Math.max(indonesianScore, englishScore);

  // Determine strategy
  if (analysis.isLikelyIndonesian && !analysis.isLikelyEnglish) {
   analysis.strategy = 'indonesian-first';
  } else if (analysis.isLikelyEnglish && !analysis.isLikelyIndonesian) {
   analysis.strategy = 'english-first';
  } else {
   analysis.strategy = 'smart-fallback'; // Quick Indonesian attempt, then English
  }

  console.log(`[SMART-DETECTOR] Video ${videoId}: ${analysis.strategy} (confidence: ${analysis.confidence.toFixed(2)})`);
  return analysis;
 }

 /**
  * Get optimized language arrays based on detection
  */
 getLanguageStrategy(strategy = 'smart-fallback') {
  switch (strategy) {
   case 'indonesian-first':
    return {
     primary: ['id'],
     fallback: ['en', 'en-US', 'en-GB'],
     quickTimeout: false, // Allow normal timeouts for expected Indonesian content
    };

   case 'english-first':
    return {
     primary: ['en', 'en-US', 'en-GB'],
     fallback: ['id'],
     quickTimeout: true, // Quick timeout for Indonesian since unlikely
    };

   case 'smart-fallback':
   default:
    return {
     primary: ['id'], // Quick Indonesian attempt
     fallback: ['en', 'en-US', 'en-GB'],
     quickTimeout: true, // Quick timeout to avoid rate limiting
    };
  }
 }

 /**
  * Calculate Indonesian language score from text
  */
 calculateIndonesianScore(text) {
  if (!text) return 0;

  const words = text.toLowerCase().split(/\s+/);
  const matchCount = words.filter((word) => this.indonesianKeywords.some((keyword) => word.includes(keyword) || keyword.includes(word))).length;

  return Math.min(matchCount / words.length, 1.0);
 }

 /**
  * Calculate English language score from text
  */
 calculateEnglishScore(text) {
  if (!text) return 0;

  const textLower = text.toLowerCase();
  const matchCount = this.englishChannelPatterns.filter((pattern) => textLower.includes(pattern)).length;

  return matchCount > 0 ? 0.8 : 0.1; // High confidence if matches known English patterns
 }

 /**
  * Get YT-DLP language parameter for different strategies
  */
 getYtDlpLanguageParam(strategy = 'smart-fallback') {
  const config = this.getLanguageStrategy(strategy);

  switch (strategy) {
   case 'indonesian-first':
    return 'id,en'; // Indonesian first, then English
   case 'english-first':
    return 'en,id'; // English first, then Indonesian
   case 'smart-fallback':
   default:
    return 'id,en'; // Quick Indonesian attempt, then English
  }
 }
}

module.exports = SmartLanguageDetector;
