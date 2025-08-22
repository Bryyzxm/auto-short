# 🚨 CRITICAL ISSUE FOUND: Indonesian Language Priority Breaking English Videos

## Problem Analysis

Our Indonesian-first language prioritization fix is causing **rate limiting and failures** for English videos:

### Root Cause

- **Rick Astley video (dQw4w9WgXcQ)** only has English subtitles
- Our system now requests Indonesian first (`--sub-lang id,en`)
- YouTube API returns **HTTP 429 (Too Many Requests)** when trying to download non-existent Indonesian subtitles
- System burns through rate limits before getting to English subtitles

### Error Pattern

```
ERROR: Unable to download video subtitles for 'id': HTTP Error 429: Too Many Requests
```

## Critical Solution Required

We need **SMART LANGUAGE DETECTION** instead of blanket Indonesian-first priority:

### Option 1: Pre-detection Strategy

1. Quick API call to check available languages
2. Only request Indonesian if available
3. Fall back to English priority if Indonesian not available

### Option 2: Fallback Chain Strategy

1. Try Indonesian first with **single attempt**
2. On failure, immediately switch to English-first priority
3. Avoid rate limiting by reducing retry attempts for language mismatches

### Option 3: Video Metadata Analysis

1. Check video channel location/language
2. Analyze video title for Indonesian keywords
3. Apply appropriate language priority based on content hints

## Immediate Action Required

The current fix **breaks English video processing** - we need to implement smart detection ASAP to maintain compatibility.

**Status: CRITICAL - Requires immediate fix before deployment**
