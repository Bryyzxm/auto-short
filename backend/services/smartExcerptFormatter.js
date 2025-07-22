/**
 * SMART EXCERPT FORMATTER
 * Intelligently formats transcript excerpts without hard limits
 */

class SmartExcerptFormatter {
 constructor() {
  this.minLength = 200; // Minimum excerpt length
  this.preferredLength = 800; // Preferred excerpt length (increased)
  this.maxLength = 2000; // Maximum before considering truncation (increased)
  this.hardLimit = 5000; // Hard limit for extreme cases (increased)
 }

 // Main method: Create smart excerpt from transcript
 formatExcerpt(text, targetLength = this.preferredLength) {
  if (!text) return '';

  // Clean the text first
  const cleanText = this.cleanTranscriptText(text);

  // FOR PRODUCTION: Preserve content integrity - only format for very long texts
  if (cleanText.length <= this.maxLength) {
   console.log(`[EXCERPT] Content preserved: ${cleanText.length} chars (within limit)`);
   return cleanText;
  }

  // For extremely long texts (>5000 chars), use intelligent approach
  if (cleanText.length > this.hardLimit) {
   console.log(`[EXCERPT] Very long text ${cleanText.length} chars - using intelligent approach`);
   return this.intelligentLongTextExcerpt(cleanText, Math.max(targetLength, this.maxLength));
  }

  // For medium-long texts, use smart truncation but allow more content
  const excerpt = this.findSmartTruncationPoint(cleanText, Math.max(targetLength, this.maxLength));
  console.log(`[EXCERPT] Created smart excerpt: ${cleanText.length} → ${excerpt.length} chars`);

  return excerpt;
 }

 cleanTranscriptText(text) {
  return text
   .replace(/\s+/g, ' ') // Multiple spaces to single
   .replace(/\n+/g, ' ') // Newlines to space
   .replace(/[""]/g, '"') // Smart quotes to regular
   .replace(/['']/g, "'") // Smart apostrophes
   .trim();
 }

 // Handle very long texts intelligently
 intelligentLongTextExcerpt(text, targetLength) {
  // For very long texts, extract key passages from different parts
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  if (sentences.length <= 3) {
   // If few sentences, use first part with smart truncation
   return this.findSmartTruncationPoint(text, targetLength * 2); // Allow longer for long texts
  }

  // Extract beginning, middle, and key phrases
  const beginning = sentences.slice(0, 3).join('. ').trim();
  const middle = sentences[Math.floor(sentences.length * 0.4)];
  const keyPhrase = this.findKeyPhrase(sentences);

  let excerpt = beginning;

  // Add middle part if space allows
  if ((excerpt + '. ' + middle).length < targetLength * 1.5) {
   excerpt += '. ' + middle.trim();
  }

  // Add key phrase if space allows and it's different
  if (keyPhrase && !excerpt.includes(keyPhrase.substring(0, 50)) && (excerpt + '. ' + keyPhrase).length < targetLength * 1.8) {
   excerpt += '. ' + keyPhrase.trim();
  }

  // Clean up and add natural ending
  excerpt = excerpt.replace(/\.\s*\./g, '.').trim();

  if (!excerpt.endsWith('.') && !excerpt.endsWith('!') && !excerpt.endsWith('?')) {
   excerpt += '...';
  }

  console.log(`[EXCERPT] Intelligent long text: ${text.length} → ${excerpt.length} chars (extracted key passages)`);
  return excerpt;
 }

 findKeyPhrase(sentences) {
  // Look for sentences with topic indicators
  const topicKeywords = ['investasi', 'podcast', 'neuroscience', 'strategi', 'tips', 'cara', 'kenapa', 'bagaimana', 'penting'];

  for (const sentence of sentences) {
   const lowerSentence = sentence.toLowerCase();
   if (topicKeywords.some((keyword) => lowerSentence.includes(keyword))) {
    return sentence;
   }
  }

  // Fallback to a sentence from middle section
  return sentences[Math.floor(sentences.length * 0.6)] || '';
 }

 findSmartTruncationPoint(text, targetLength) {
  // If target is longer than max, use max
  const actualTarget = Math.min(targetLength, this.maxLength);

  // If text is within acceptable range, return as is
  if (text.length <= actualTarget + 100) {
   return text;
  }

  // Find the best truncation point around target length
  const searchStart = Math.max(this.minLength, actualTarget - 100);
  const searchEnd = Math.min(text.length, actualTarget + 100);
  const searchText = text.substring(searchStart, searchEnd);

  // Look for sentence boundaries (period, exclamation, question mark)
  const sentenceEnds = this.findSentenceBoundaries(searchText);
  if (sentenceEnds.length > 0) {
   const bestEnd = this.selectBestBoundary(sentenceEnds, actualTarget - searchStart);
   if (bestEnd !== -1) {
    const result = text.substring(0, searchStart + bestEnd + 1);
    return this.addSmartEllipsis(result, text);
   }
  }

  // Look for phrase boundaries (comma, semicolon, dash)
  const phraseBoundaries = this.findPhraseBoundaries(searchText);
  if (phraseBoundaries.length > 0) {
   const bestBoundary = this.selectBestBoundary(phraseBoundaries, actualTarget - searchStart);
   if (bestBoundary !== -1) {
    const result = text.substring(0, searchStart + bestBoundary + 1);
    return this.addSmartEllipsis(result, text);
   }
  }

  // Look for word boundaries
  const wordBoundaries = this.findWordBoundaries(searchText);
  if (wordBoundaries.length > 0) {
   const bestWord = this.selectBestBoundary(wordBoundaries, actualTarget - searchStart);
   if (bestWord !== -1) {
    const result = text.substring(0, searchStart + bestWord);
    return this.addSmartEllipsis(result, text);
   }
  }

  // Fallback: hard cut at target with smart ellipsis
  const fallbackResult = text.substring(0, actualTarget);
  return this.addSmartEllipsis(fallbackResult, text);
 }

 findSentenceBoundaries(text) {
  const boundaries = [];
  const sentencePattern = /[.!?]/g;
  let match;

  while ((match = sentencePattern.exec(text)) !== null) {
   // Check if this is likely end of sentence (not abbreviation)
   if (this.isLikelySentenceEnd(text, match.index)) {
    boundaries.push(match.index);
   }
  }

  return boundaries;
 }

 isLikelySentenceEnd(text, index) {
  // Check if followed by space and capital letter or end of text
  const nextChars = text.substring(index + 1, index + 4);

  // End of text
  if (!nextChars.trim()) return true;

  // Space followed by capital letter
  if (nextChars.match(/^\s+[A-Z]/)) return true;

  // Common abbreviations to avoid
  const beforeChar = text.substring(index - 3, index);
  const abbreviations = ['Mr.', 'Ms.', 'Dr.', 'vs.', 'etc.'];
  const hasAbbr = abbreviations.some((abbr) => beforeChar.toLowerCase().endsWith(abbr.toLowerCase().slice(0, -1)));

  return !hasAbbr;
 }

 findPhraseBoundaries(text) {
  const boundaries = [];
  const phrasePattern = /[,;—–-]/g;
  let match;

  while ((match = phrasePattern.exec(text)) !== null) {
   // Must be followed by space to be valid phrase boundary
   const nextChar = text.charAt(match.index + 1);
   if (nextChar === ' ' || nextChar === '') {
    boundaries.push(match.index);
   }
  }

  return boundaries;
 }

 findWordBoundaries(text) {
  const boundaries = [];
  const wordPattern = /\s+/g;
  let match;

  while ((match = wordPattern.exec(text)) !== null) {
   boundaries.push(match.index);
  }

  return boundaries;
 }

 selectBestBoundary(boundaries, targetPosition) {
  if (boundaries.length === 0) return -1;

  // Find boundary closest to target position
  let bestBoundary = -1;
  let bestDistance = Infinity;

  for (const boundary of boundaries) {
   const distance = Math.abs(boundary - targetPosition);
   if (distance < bestDistance) {
    bestDistance = distance;
    bestBoundary = boundary;
   }
  }

  return bestBoundary;
 }

 addSmartEllipsis(text, originalText) {
  // Only add ellipsis if we actually truncated
  if (text.length >= originalText.length - 10) {
   return text;
  }

  // Don't add ellipsis if text already ends with punctuation
  const lastChar = text.trim().slice(-1);
  if (['.', '!', '?', ':', ';'].includes(lastChar)) {
   return text;
  }

  return text.trim() + '...';
 }

 // Utility method for creating short previews (like for cards)
 createPreview(text, maxLength = 150) {
  if (!text || text.length <= maxLength) {
   return text || '';
  }

  const cleanText = this.cleanTranscriptText(text);

  // Find sentence boundary near maxLength
  const sentences = cleanText.split(/[.!?]/);
  let preview = '';

  for (const sentence of sentences) {
   const testPreview = preview + sentence + '.';
   if (testPreview.length <= maxLength) {
    preview = testPreview;
   } else {
    break;
   }
  }

  if (preview && preview.length > 20) {
   return preview;
  }

  // Fallback to word boundary
  const words = cleanText.split(' ');
  preview = '';

  for (const word of words) {
   const testPreview = preview + (preview ? ' ' : '') + word;
   if (testPreview.length <= maxLength - 3) {
    preview = testPreview;
   } else {
    break;
   }
  }

  return preview + (preview.length < cleanText.length ? '...' : '');
 }
}

export default new SmartExcerptFormatter();
