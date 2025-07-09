#!/bin/bash
set -e

echo "🚀 Starting deployment setup..."

# Ensure directories exist
mkdir -p /app/bin /app/models /app/outputs

# Check if yt-dlp is installed, if not install it
if ! command -v yt-dlp &> /dev/null; then
    echo "📥 Installing yt-dlp..."
    pip3 install yt-dlp
fi

# Check if whisper.cpp exists, if not build it
if [ ! -f "/app/bin/main" ] && [ ! -f "/app/bin/whisper" ]; then
    echo "🔨 Building whisper.cpp..."
    
    # Clone and build whisper.cpp
    if [ ! -d "/tmp/whisper.cpp" ]; then
        git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /tmp/whisper.cpp
    fi
    
    cd /tmp/whisper.cpp
    make -j $(nproc)
    
    # Copy binaries
    cp bin/main /app/bin/main
    ln -sf /app/bin/main /app/bin/whisper
    chmod +x /app/bin/main /app/bin/whisper
    
    echo "✅ whisper.cpp built successfully"
fi

# Download whisper model if not exists
if [ ! -f "/app/models/ggml-tiny.bin" ]; then
    echo "📥 Downloading whisper model..."
    curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin -o /app/models/ggml-tiny.bin
    cp /app/models/ggml-tiny.bin /app/bin/ggml-tiny.bin
    echo "✅ Model downloaded successfully"
fi

# Update PATH
export PATH="/app/bin:$PATH"

# Verify installations
echo "🔍 Verifying installations..."
yt-dlp --version && echo "✅ yt-dlp: OK" || echo "❌ yt-dlp: FAILED"
/app/bin/main --help > /dev/null 2>&1 && echo "✅ whisper.cpp: OK" || echo "❌ whisper.cpp: FAILED"
ls -la /app/models/ggml-tiny.bin && echo "✅ whisper model: OK" || echo "❌ whisper model: FAILED"

echo "🎉 Setup complete! Starting application..."

# Start the application
exec npm start