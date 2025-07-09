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
  echo "🔧 Cloning whisper.cpp and building with CMake ..."
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp /tmp/whisper.cpp
  cd /tmp/whisper.cpp
  cmake -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build -j$(nproc) --config Release
  # Copy the whisper-cli binary (the main executable)
  cp build/bin/whisper-cli ../../../bin/whisper
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