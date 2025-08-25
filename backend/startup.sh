#!/bin/bash

# Azure App Service Enhanced Startup Script with FFmpeg Support
# Exit immediately if a command exits with a non-zero status.
set -e

echo "🚀 Azure App Service Enhanced Startup Script"
echo "📅 $(date)"
echo "🌐 Environment: ${NODE_ENV:-production}"
echo "🏠 Working Directory: $(pwd)"

# Define the path to the backend directory within the Azure App Service environment.
# /home/site/wwwroot is the root of your deployed application.
BACKEND_DIR="/home/site/wwwroot/backend"

# Check if the backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
  echo "❌ Error: Backend directory not found at $BACKEND_DIR!"
  echo "📁 Available directories:"
  ls -la /home/site/wwwroot/ || true
  exit 1
fi

# Navigate to the backend directory.
cd "$BACKEND_DIR"

echo "✅ Successfully changed directory to $(pwd)"
echo "📂 Current directory contents:"
ls -la | head -10 || true

# Define paths to the vendored yt-dlp binaries
YT_DLP_LINUX_BINARY="$BACKEND_DIR/vendor/yt-dlp-exec/bin/yt-dlp"

# Grant execute permissions to the Linux binary. This is crucial for it to run.
if [ -f "$YT_DLP_LINUX_BINARY" ]; then
  echo "Found Linux binary, setting execute permissions..."
  chmod +x "$YT_DLP_LINUX_BINARY"
  echo "Permissions set for yt-dlp Linux binary."
else
    echo "Warning: yt-dlp Linux binary not found at $YT_DLP_LINUX_BINARY"
fi

# 🎬 CRITICAL FIX: Install FFmpeg binaries for Azure App Service
echo "🔧 Setting up FFmpeg for Azure App Service..."

# Create vendor directory for FFmpeg binaries
FFMPEG_DIR="$BACKEND_DIR/vendor/ffmpeg"
mkdir -p "$FFMPEG_DIR"

# Function to check if FFmpeg is already available
check_ffmpeg() {
    echo "🔍 Checking FFmpeg availability..."
    
    # Check in multiple locations
    local ffmpeg_paths=(
        "/usr/bin/ffmpeg"
        "/usr/local/bin/ffmpeg"
        "$FFMPEG_DIR/ffmpeg"
        "$(which ffmpeg 2>/dev/null || echo '')"
    )
    
    local ffprobe_paths=(
        "/usr/bin/ffprobe"
        "/usr/local/bin/ffprobe"
        "$FFMPEG_DIR/ffprobe"
        "$(which ffprobe 2>/dev/null || echo '')"
    )
    
    for ffmpeg_path in "${ffmpeg_paths[@]}"; do
        if [ -n "$ffmpeg_path" ] && [ -x "$ffmpeg_path" ]; then
            for ffprobe_path in "${ffprobe_paths[@]}"; do
                if [ -n "$ffprobe_path" ] && [ -x "$ffprobe_path" ]; then
                    echo "✅ Found FFmpeg: $ffmpeg_path"
                    echo "✅ Found FFprobe: $ffprobe_path"
                    export FFMPEG_PATH="$ffmpeg_path"
                    export FFPROBE_PATH="$ffprobe_path"
                    
                    # Test functionality
                    if "$ffmpeg_path" -version >/dev/null 2>&1; then
                        echo "✅ FFmpeg functional test passed"
                        "$ffmpeg_path" -version | head -1
                        return 0
                    fi
                fi
            done
        fi
    done
    
    echo "❌ FFmpeg not found or not functional"
    return 1
}

# Function to install FFmpeg static binaries
install_ffmpeg_static() {
    echo "📦 Installing FFmpeg static binaries from johnvansickle.com..."
    
    # Download FFmpeg static build (most reliable for Azure App Service)
    local FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    local FFMPEG_ARCHIVE="$FFMPEG_DIR/ffmpeg-static.tar.xz"
    
    # Check if binaries already exist and are functional
    if [ -f "$FFMPEG_DIR/ffmpeg" ] && [ -f "$FFMPEG_DIR/ffprobe" ]; then
        if "$FFMPEG_DIR/ffmpeg" -version >/dev/null 2>&1; then
            echo "✅ FFmpeg binaries already installed and functional"
            export PATH="$FFMPEG_DIR:$PATH"
            return 0
        else
            echo "⚠️ Existing binaries found but non-functional, reinstalling..."
            rm -f "$FFMPEG_DIR/ffmpeg" "$FFMPEG_DIR/ffprobe"
        fi
    fi
    
    echo "⬇️ Downloading FFmpeg static build..."
    echo "📍 URL: $FFMPEG_URL"
    
    # Download with multiple retry attempts
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "🔄 Download attempt $attempt/$max_attempts"
        
        if curl -L "$FFMPEG_URL" -o "$FFMPEG_ARCHIVE" \
           --connect-timeout 30 \
           --max-time 300 \
           --retry 2 \
           --retry-delay 5 \
           --fail \
           --silent \
           --show-error; then
            echo "✅ Download successful"
            break
        else
            echo "❌ Download attempt $attempt failed"
            rm -f "$FFMPEG_ARCHIVE"
            
            if [ $attempt -eq $max_attempts ]; then
                echo "❌ All download attempts failed"
                return 1
            fi
            
            attempt=$((attempt + 1))
            echo "⏳ Waiting before retry..."
            sleep 5
        fi
    done
    
    if [ ! -f "$FFMPEG_ARCHIVE" ]; then
        echo "❌ Download verification failed"
        return 1
    fi
    
    echo "� Archive size: $(du -h "$FFMPEG_ARCHIVE" | cut -f1)"
    
    echo "�📂 Extracting FFmpeg binaries..."
    cd "$FFMPEG_DIR"
    
    # Extract with error handling
    if tar -xf "$FFMPEG_ARCHIVE" --strip-components=1 2>/dev/null; then
        echo "✅ Extraction successful"
    else
        echo "❌ Extraction failed"
        rm -f "$FFMPEG_ARCHIVE"
        return 1
    fi
    
    # Verify extracted files
    if [ -f "ffmpeg" ] && [ -f "ffprobe" ]; then
        echo "✅ Binaries extracted successfully"
        
        # Make binaries executable
        chmod +x ffmpeg ffprobe
        echo "✅ Execute permissions set"
        
        # Clean up archive
        rm -f "$FFMPEG_ARCHIVE"
        
        # Add to PATH
        export PATH="$FFMPEG_DIR:$PATH"
        echo "🛣️ Added FFmpeg to PATH: $FFMPEG_DIR"
        
        # Final verification
        if ./ffmpeg -version >/dev/null 2>&1; then
            echo "✅ FFmpeg installation verification successful"
            ./ffmpeg -version | head -1
            return 0
        else
            echo "❌ FFmpeg verification failed"
            return 1
        fi
    else
        echo "❌ Expected binaries not found after extraction"
        return 1
    fi
}

# Function to install FFmpeg via package manager (fallback)
install_ffmpeg_apt() {
    echo "📦 Attempting FFmpeg installation via apt..."
    
    # Check if we have sudo/root privileges
    if command -v apt-get >/dev/null 2>&1; then
        if [ "$EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
            echo "🔧 Installing FFmpeg via package manager..."
            apt-get update -qq && apt-get install -y ffmpeg
            return 0
        else
            echo "⚠️ No root privileges for apt-get"
            return 1
        fi
    else
        echo "⚠️ apt-get not available"
        return 1
    fi
}

# Main FFmpeg installation logic
echo "🎬 Starting Enhanced FFmpeg Installation Process..."

if check_ffmpeg; then
    echo "✅ FFmpeg already available, skipping installation"
else
    echo "⚠️ FFmpeg not found, attempting installation..."
    
    # Try static binaries first (most reliable for Azure)
    if install_ffmpeg_static; then
        if check_ffmpeg; then
            echo "🎉 FFmpeg static installation successful!"
        else
            echo "⚠️ FFmpeg static installation completed but verification failed"
        fi
    else
        echo "⚠️ Static installation failed, trying package manager..."
        
        # Fallback to package manager
        if install_ffmpeg_apt; then
            if check_ffmpeg; then
                echo "🎉 FFmpeg package installation successful!"
            else
                echo "⚠️ FFmpeg package installation completed but verification failed"
            fi
        else
            echo "❌ All FFmpeg installation methods failed"
            echo "⚠️ Application will run with limited video processing capabilities"
            
            # Create flag file to indicate FFmpeg unavailability
            touch "$BACKEND_DIR/ffmpeg-unavailable"
        fi
    fi
fi

# Final verification and environment setup
if check_ffmpeg; then
    echo "✅ Final FFmpeg verification successful"
    
    # Ensure FFmpeg paths are available to Node.js application
    echo "🔗 Setting up FFmpeg environment for Node.js..."
    
    # Create environment file for Node.js
    cat > "$BACKEND_DIR/.ffmpeg-env" << EOF
export FFMPEG_PATH="$FFMPEG_PATH"
export FFPROBE_PATH="$FFPROBE_PATH"
export PATH="$FFMPEG_DIR:\$PATH"
EOF
    
    # Source the environment
    source "$BACKEND_DIR/.ffmpeg-env" 2>/dev/null || true
    
    echo "🌟 FFmpeg environment variables set:"
    echo "   FFMPEG_PATH: $FFMPEG_PATH"
    echo "   FFPROBE_PATH: $FFPROBE_PATH"
    
    # Test basic functionality
    echo "🧪 Testing FFmpeg functionality..."
    if [ -n "$FFMPEG_PATH" ] && "$FFMPEG_PATH" -version >/dev/null 2>&1; then
        echo "✅ FFmpeg functionality test passed"
        echo "📊 FFmpeg version: $("$FFMPEG_PATH" -version | head -1)"
    else
        echo "⚠️ FFmpeg functionality test failed"
    fi
else
    echo "❌ FFmpeg installation verification failed"
    echo "⚠️ Video processing will be disabled"
    
    # Set empty paths for Node.js
    export FFMPEG_PATH=""
    export FFPROBE_PATH=""
fi

echo ""
echo "🔧 FFmpeg Setup Complete"
echo "============================================================"

# Install project dependencies
echo ""
echo "📦 Installing Node.js dependencies..."
echo "============================================================"

# Ensure npm install runs successfully
if npm install --production; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Dependency installation failed"
    exit 1
fi

echo ""
echo "🚀 Starting Node.js Application..."
echo "============================================================"
echo "🌐 Environment: ${NODE_ENV:-production}"
echo "📊 Node.js Version: $(node --version)"
echo "📊 NPM Version: $(npm --version)"
echo "🕒 Startup Time: $(date)"

# Source FFmpeg environment before starting Node.js
if [ -f "$BACKEND_DIR/.ffmpeg-env" ]; then
    source "$BACKEND_DIR/.ffmpeg-env"
fi

# Start the Node.js application
exec npm start