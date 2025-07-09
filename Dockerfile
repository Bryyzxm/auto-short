FROM ubuntu:22.04

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    cmake \
    python3 \
    python3-pip \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY api/package*.json ./api/

# Install dependencies
RUN npm ci
RUN cd api && npm ci --only=production

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Setup whisper.cpp
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp \
    && cd whisper.cpp \
    && make -j$(nproc) main \
    && cd ..

# Download Whisper model
RUN mkdir -p /app/models \
    && curl -L -o /app/models/ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin

# Download yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/bin/yt-dlp \
    && chmod +x /usr/bin/yt-dlp

# Verify installations
RUN echo "🔍 Verifying installations..." \
    && if [ -f "/usr/bin/yt-dlp" ]; then echo "✅ yt-dlp found"; else echo "❌ yt-dlp NOT found"; fi \
    && if [ -f "/app/whisper.cpp/main" ]; then echo "✅ whisper.cpp found"; else echo "❌ whisper.cpp NOT found"; fi \
    && if [ -f "/app/models/ggml-tiny.bin" ]; then echo "✅ Whisper model found"; else echo "❌ Whisper model NOT found"; fi

# Expose port
EXPOSE 8080

# Start the application
CMD ["sh", "-c", "cd api && npm start"] 