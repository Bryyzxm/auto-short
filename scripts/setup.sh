#!/usr/bin/env bash
set -e

echo "🔧 Running postinstall setup (yt-dlp & whisper.cpp) ..."

# Create local directories in project root
mkdir -p ./bin
mkdir -p ./models

########## Install yt-dlp ##########
if [ ! -f ./bin/yt-dlp ]; then
  echo "📥 Downloading yt-dlp binary ..."
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp
  chmod +x ./bin/yt-dlp
else
  echo "✅ yt-dlp already exists at ./bin/yt-dlp"
fi

########## Build whisper.cpp ##########
if [ ! -f ./bin/whisper ]; then
  echo "🔧 Building whisper.cpp with optimized settings..."
  set -x  # Debug mode
  # Store current directory
  ORIGINAL_DIR=$(pwd)
  
  cd /tmp
  if [ ! -d "whisper.cpp" ]; then
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
  fi
  
  cd whisper.cpp
  
  # Build with optimized flags for CI
  cmake -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=OFF
  
  cmake --build build --config Release --parallel 2
  
  # Copy binary to project
  cp build/bin/whisper-cli "$ORIGINAL_DIR/bin/whisper"
  
  cd "$ORIGINAL_DIR"
  echo "✅ whisper.cpp built and copied to ./bin/whisper"
else
  echo "✅ whisper.cpp binary already exists"
fi

########## Download Whisper model ##########
if [ ! -f ./models/ggml-tiny.bin ]; then
  echo "📥 Downloading Whisper tiny model ..."
  curl -L -o ./models/ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
else
  echo "✅ Whisper model already exists"
fi

echo "🎉 Postinstall setup completed"