#!/bin/bash

# Enhanced FFmpeg Setup Script for Azure App Service
# This script is called from package.json prestart to ensure FFmpeg is available

echo "🔧 Enhanced FFmpeg Setup Check..."
echo "📍 Working Directory: $(pwd)"
echo "🕒 Setup Time: $(date)"

# Define FFmpeg directory
FFMPEG_DIR="$(pwd)/vendor/ffmpeg"
mkdir -p "$FFMPEG_DIR"
echo "📁 FFmpeg Directory: $FFMPEG_DIR"

# Check if FFmpeg is already available in system PATH
if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    echo "✅ System FFmpeg already available"
    ffmpeg -version | head -1 2>/dev/null || echo "⚠️ Version check failed"
    export FFMPEG_PATH="$(which ffmpeg)"
    export FFPROBE_PATH="$(which ffprobe)"
    echo "🎯 Using system FFmpeg: $FFMPEG_PATH"
    return 0 2>/dev/null || exit 0
fi

# Check if local FFmpeg exists and is functional
if [ -x "$FFMPEG_DIR/ffmpeg" ] && [ -x "$FFMPEG_DIR/ffprobe" ]; then
    echo "✅ Local FFmpeg binaries found"
    if "$FFMPEG_DIR/ffmpeg" -version >/dev/null 2>&1; then
        echo "✅ Local FFmpeg functional"
        export PATH="$FFMPEG_DIR:$PATH"
        export FFMPEG_PATH="$FFMPEG_DIR/ffmpeg"
        export FFPROBE_PATH="$FFMPEG_DIR/ffprobe"
        echo "🎯 Using local FFmpeg: $FFMPEG_PATH"
        return 0 2>/dev/null || exit 0
    else
        echo "⚠️ Local binaries exist but non-functional, reinstalling..."
        rm -f "$FFMPEG_DIR/ffmpeg" "$FFMPEG_DIR/ffprobe"
    fi
fi

# Enhanced installation with better error handling
echo "⚠️ FFmpeg not found, starting enhanced installation..."
echo "📦 Download URL: https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"

# Enhanced background installation with comprehensive logging
(
    set -e  # Exit on any error within subshell
    
    echo "🚀 [$(date)] Starting FFmpeg installation..." > "$FFMPEG_DIR/install.log"
    
    # Create temporary directory for download
    TEMP_DIR="$FFMPEG_DIR/temp"
    mkdir -p "$TEMP_DIR"
    
    cd "$TEMP_DIR"
    echo "📂 [$(date)] Working in: $(pwd)" >> "$FFMPEG_DIR/install.log"
    
    # Download with multiple attempts
    MAX_ATTEMPTS=3
    for attempt in $(seq 1 $MAX_ATTEMPTS); do
        echo "🔄 [$(date)] Download attempt $attempt/$MAX_ATTEMPTS" >> "$FFMPEG_DIR/install.log"
        
        if curl -L "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
           -o "ffmpeg-static.tar.xz" \
           --connect-timeout 15 \
           --max-time 120 \
           --retry 2 \
           --retry-delay 3 \
           --fail \
           --silent \
           --show-error 2>>"$FFMPEG_DIR/install.log"; then
            echo "✅ [$(date)] Download successful on attempt $attempt" >> "$FFMPEG_DIR/install.log"
            break
        else
            echo "❌ [$(date)] Download attempt $attempt failed" >> "$FFMPEG_DIR/install.log"
            rm -f "ffmpeg-static.tar.xz"
            
            if [ $attempt -eq $MAX_ATTEMPTS ]; then
                echo "❌ [$(date)] All download attempts failed" >> "$FFMPEG_DIR/install.log"
                echo "❌ FFmpeg installation failed - download error"
                exit 1
            fi
            
            echo "⏳ [$(date)] Waiting 5s before retry..." >> "$FFMPEG_DIR/install.log"
            sleep 5
        fi
    done
    
    # Verify download
    if [ ! -f "ffmpeg-static.tar.xz" ]; then
        echo "❌ [$(date)] Download verification failed" >> "$FFMPEG_DIR/install.log"
        echo "❌ FFmpeg installation failed - file not found"
        exit 1
    fi
    
    ARCHIVE_SIZE=$(du -h "ffmpeg-static.tar.xz" | cut -f1)
    echo "📦 [$(date)] Archive size: $ARCHIVE_SIZE" >> "$FFMPEG_DIR/install.log"
    
    # Extract
    echo "📂 [$(date)] Extracting archive..." >> "$FFMPEG_DIR/install.log"
    if tar -xf "ffmpeg-static.tar.xz" --strip-components=1 2>>"$FFMPEG_DIR/install.log"; then
        echo "✅ [$(date)] Extraction successful" >> "$FFMPEG_DIR/install.log"
    else
        echo "❌ [$(date)] Extraction failed" >> "$FFMPEG_DIR/install.log"
        echo "❌ FFmpeg installation failed - extraction error"
        exit 1
    fi
    
    # Verify extracted binaries
    if [ -f "ffmpeg" ] && [ -f "ffprobe" ]; then
        echo "✅ [$(date)] Binaries extracted" >> "$FFMPEG_DIR/install.log"
        
        # Set permissions
        chmod +x ffmpeg ffprobe
        echo "✅ [$(date)] Permissions set" >> "$FFMPEG_DIR/install.log"
        
        # Move to final location
        mv ffmpeg ffprobe "$FFMPEG_DIR/"
        echo "✅ [$(date)] Binaries moved to final location" >> "$FFMPEG_DIR/install.log"
        
        # Test functionality
        if "$FFMPEG_DIR/ffmpeg" -version >/dev/null 2>&1; then
            VERSION=$("$FFMPEG_DIR/ffmpeg" -version 2>&1 | head -1)
            echo "✅ [$(date)] Installation verification successful: $VERSION" >> "$FFMPEG_DIR/install.log"
            echo "✅ FFmpeg installed successfully"
        else
            echo "❌ [$(date)] Installation verification failed" >> "$FFMPEG_DIR/install.log"
            echo "❌ FFmpeg installation failed - verification error"
            exit 1
        fi
    else
        echo "❌ [$(date)] Expected binaries not found after extraction" >> "$FFMPEG_DIR/install.log"
        echo "❌ FFmpeg installation failed - missing binaries"
        exit 1
    fi
    
    # Cleanup
    cd ..
    rm -rf "$TEMP_DIR"
    echo "🧹 [$(date)] Cleanup completed" >> "$FFMPEG_DIR/install.log"
    
) &

# Get the background process ID
INSTALL_PID=$!
echo "🔄 Installation started in background (PID: $INSTALL_PID)"
echo "📋 Progress will be logged to: $FFMPEG_DIR/install.log"
echo "⏱️ Installation typically takes 30-60 seconds"
echo "🚀 Continuing with application startup..."

# Set empty paths for now - server.js will detect when installation completes
export FFMPEG_PATH=""
export FFPROBE_PATH=""

return 0 2>/dev/null || exit 0
