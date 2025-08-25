#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the path to the backend directory within the Azure App Service environment.
# /home/site/wwwroot is the root of your deployed application.
BACKEND_DIR="/home/site/wwwroot/backend"

# Check if the backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
  echo "Error: Backend directory not found at $BACKEND_DIR!"
  exit 1
fi

# Navigate to the backend directory.
cd "$BACKEND_DIR"

echo "Successfully changed directory to $(pwd)"

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
    if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
        echo "✅ FFmpeg and FFprobe already available"
        ffmpeg -version | head -1
        return 0
    else
        echo "❌ FFmpeg not found in PATH"
        return 1
    fi
}

# Function to install FFmpeg static binaries
install_ffmpeg_static() {
    echo "📦 Installing FFmpeg static binaries..."
    
    # Download FFmpeg static build
    FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    FFMPEG_ARCHIVE="$FFMPEG_DIR/ffmpeg-static.tar.xz"
    
    # Check if binaries already exist
    if [ -f "$FFMPEG_DIR/ffmpeg" ] && [ -f "$FFMPEG_DIR/ffprobe" ]; then
        echo "✅ FFmpeg binaries already installed"
    else
        echo "⬇️ Downloading FFmpeg static build..."
        curl -L "$FFMPEG_URL" -o "$FFMPEG_ARCHIVE" --connect-timeout 30 --max-time 300
        
        if [ -f "$FFMPEG_ARCHIVE" ]; then
            echo "📂 Extracting FFmpeg binaries..."
            cd "$FFMPEG_DIR"
            tar -xf "$FFMPEG_ARCHIVE" --strip-components=1
            
            # Make binaries executable
            chmod +x ffmpeg ffprobe 2>/dev/null || true
            
            # Clean up archive
            rm -f "$FFMPEG_ARCHIVE"
            
            echo "✅ FFmpeg static binaries installed"
        else
            echo "❌ Failed to download FFmpeg static build"
            return 1
        fi
    fi
    
    # Add to PATH
    export PATH="$FFMPEG_DIR:$PATH"
    echo "🛣️ Added FFmpeg to PATH: $FFMPEG_DIR"
    
    return 0
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
echo "🎬 Starting FFmpeg installation process..."

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

# Final verification and PATH setup
if check_ffmpeg; then
    echo "✅ Final FFmpeg verification successful"
    
    # Ensure FFmpeg is in PATH for the application
    echo "export PATH=\"$FFMPEG_DIR:\$PATH\"" > "$BACKEND_DIR/.ffmpeg-path"
    source "$BACKEND_DIR/.ffmpeg-path" 2>/dev/null || true
    
    # Test basic functionality
    echo "🧪 Testing FFmpeg functionality..."
    if ffmpeg -version >/dev/null 2>&1 && ffprobe -version >/dev/null 2>&1; then
        echo "✅ FFmpeg functionality test passed"
    else
        echo "⚠️ FFmpeg functionality test failed"
    fi
else
    echo "❌ FFmpeg installation verification failed"
    echo "⚠️ Video processing will be disabled"
fi

# Install project dependencies
echo "Installing Node.js dependencies..."
npm install

# Start the Node.js application
echo "Starting the Node.js server..."
npm start