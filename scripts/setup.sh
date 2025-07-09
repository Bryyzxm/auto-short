#!/usr/bin/env bash
set -e

echo "🔧 Running postinstall setup (yt-dlp & whisper.cpp) ..."

# Ensure required directories
mkdir -p /app/models || true

########## Install yt-dlp ##########
if [ ! -f /usr/bin/yt-dlp ]; then
  echo "📥 Downloading yt-dlp binary ..."
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/bin/yt-dlp
  chmod +x /usr/bin/yt-dlp
else
  echo "✅ yt-dlp already exists at /usr/bin/yt-dlp"
fi

########## Build whisper.cpp ##########
if [ ! -f /app/whisper.cpp/main ]; then
  echo "🔧 Cloning whisper.cpp and building main binary ..."
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp /tmp/whisper.cpp
  cd /tmp/whisper.cpp && make -j$(nproc) main
  mkdir -p /app/whisper.cpp
  cp /tmp/whisper.cpp/main /app/whisper.cpp/main
  echo "✅ whisper.cpp built and copied to /app/whisper.cpp/main"
else
  echo "✅ whisper.cpp binary already exists"
fi

########## Download Whisper model ##########
if [ ! -f /app/models/ggml-tiny.bin ]; then
  echo "📥 Downloading Whisper tiny model ..."
  curl -L -o /app/models/ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
else
  echo "✅ Whisper model already exists"
fi

echo "🎉 Postinstall setup completed" 