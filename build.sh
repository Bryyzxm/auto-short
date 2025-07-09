#!/bin/bash
set -e

echo "🚀 Starting custom build script..."

# Install deps & build front-end
echo "📦 Installing dependencies..."
unset NODE_ENV && npm ci
echo "🏗️ Building front-end..."
npm run build
echo "📦 Installing backend dependencies..."
cd api && npm ci --only=production
cd ..

# Clone & compile whisper.cpp
echo "🔧 Setting up whisper.cpp..."
git clone --depth 1 https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make -j$(nproc) main
cd ..
echo "✅ whisper.cpp compiled successfully"

# Download model tiny
echo "📥 Downloading Whisper model..."
mkdir -p /app/models
curl -L -o /app/models/ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
echo "✅ Whisper model downloaded"

# Download yt-dlp binary statik ke /usr/bin
echo "📥 Downloading yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/bin/yt-dlp
chmod +x /usr/bin/yt-dlp
echo "✅ yt-dlp binary downloaded and made executable"

# Verify installations
echo "🔍 Verifying installations..."
if [ -f "/usr/bin/yt-dlp" ]; then
    echo "✅ yt-dlp found at /usr/bin/yt-dlp"
else
    echo "❌ yt-dlp NOT found at /usr/bin/yt-dlp"
fi

if [ -f "/app/whisper.cpp/main" ]; then
    echo "✅ whisper.cpp found at /app/whisper.cpp/main"
else
    echo "❌ whisper.cpp NOT found at /app/whisper.cpp/main"
fi

if [ -f "/app/models/ggml-tiny.bin" ]; then
    echo "✅ Whisper model found at /app/models/ggml-tiny.bin"
else
    echo "❌ Whisper model NOT found at /app/models/ggml-tiny.bin"
fi

echo "🎉 Build script completed successfully!" 