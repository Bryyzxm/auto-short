#!/bin/bash

# Lightweight FFmpeg Setup Script for Azure App Service
# This script is called from package.json prestart to ensure FFmpeg is available

echo "🔧 Quick FFmpeg Setup Check..."

# Define FFmpeg directory
FFMPEG_DIR="$(pwd)/vendor/ffmpeg"
mkdir -p "$FFMPEG_DIR"

# Check if FFmpeg is already available
if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    echo "✅ FFmpeg already available in PATH"
    export FFMPEG_PATH="$(which ffmpeg)"
    export FFPROBE_PATH="$(which ffprobe)"
    return 0 2>/dev/null || exit 0
fi

# Check if local FFmpeg exists
if [ -x "$FFMPEG_DIR/ffmpeg" ] && [ -x "$FFMPEG_DIR/ffprobe" ]; then
    echo "✅ Local FFmpeg binaries found"
    export PATH="$FFMPEG_DIR:$PATH"
    export FFMPEG_PATH="$FFMPEG_DIR/ffmpeg"
    export FFPROBE_PATH="$FFMPEG_DIR/ffprobe"
    return 0 2>/dev/null || exit 0
fi

# Quick installation attempt (background process)
echo "⚠️ FFmpeg not found, attempting quick installation..."
(
    # Run installation in background to not delay startup
    curl -L "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" -o "$FFMPEG_DIR/ffmpeg-static.tar.xz" --connect-timeout 10 --max-time 60 &>/dev/null &&
    cd "$FFMPEG_DIR" &&
    tar -xf "ffmpeg-static.tar.xz" --strip-components=1 &>/dev/null &&
    chmod +x ffmpeg ffprobe &>/dev/null &&
    rm -f "ffmpeg-static.tar.xz" &>/dev/null &&
    echo "✅ FFmpeg installed successfully" ||
    echo "⚠️ FFmpeg installation failed"
) &

# Don't wait for installation to complete
echo "🚀 Continuing with application startup..."
export FFMPEG_PATH=""
export FFPROBE_PATH=""
return 0 2>/dev/null || exit 0
