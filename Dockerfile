FROM node:18-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    git \
    build-essential \
    cmake \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp

# Build whisper.cpp
RUN git clone https://github.com/ggerganov/whisper.cpp.git /tmp/whisper.cpp \
    && cd /tmp/whisper.cpp \
    && make \
    && mkdir -p /app/bin \
    && cp main /app/bin/main \
    && ln -sf /app/bin/main /app/bin/whisper \
    && chmod +x /app/bin/main /app/bin/whisper

# Download whisper model
RUN mkdir -p /app/models \
    && curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin -o /app/models/ggml-tiny.bin \
    && cp /app/models/ggml-tiny.bin /app/bin/ggml-tiny.bin

# Setup app
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --only=production

COPY api/ ./

EXPOSE 8080
CMD ["npm", "start"]