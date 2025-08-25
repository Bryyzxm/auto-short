# Azure FFmpeg Comprehensive Fix - Implementation Guide

## Root Cause Analysis Complete ✅

### Issues Identified:
1. **Missing FFmpeg/FFprobe**: Azure App Service Linux lacks FFmpeg binaries
2. **NaN Calculations**: `Math.round((720 * 0) / 0) = NaN` when ffprobe fails
3. **Shell Syntax Errors**: Invalid parameters like `scale=NaN:720` cause command failures

### Log Evidence:
- Line 1058: `/bin/sh: 1: ffprobe: not found`
- Line 1061: `scale=NaN:720:flags=lanczos`
- Line 1062: `Syntax error: '(' unexpected`

## Solution Implementation Strategy

### Phase 1: Azure FFmpeg Installation
- **PRE_BUILD_COMMAND**: Install FFmpeg during deployment
- **Startup Script**: Verify FFmpeg availability at runtime
- **Custom Container**: Fallback option with pre-installed FFmpeg

### Phase 2: Defensive Code Enhancement
- **FFprobe Fallback**: Handle missing ffprobe gracefully
- **NaN Prevention**: Validate video dimensions before calculations
- **Parameter Sanitization**: Ensure valid FFmpeg arguments

### Phase 3: Error Recovery
- **Quality Fallbacks**: Multiple resolution strategies
- **Direct Download**: Skip processing when FFmpeg unavailable
- **Retry Logic**: Automated recovery attempts

## Expected Outcomes
✅ All video segments downloadable with minimum 720p quality
✅ Robust handling of Azure environment constraints
✅ Zero NaN parameter generation
✅ Graceful degradation when tools unavailable
