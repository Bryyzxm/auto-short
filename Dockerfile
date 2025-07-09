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
WORKDIR /app
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git whisper.cpp
WORKDIR /app/whisper.cpp
RUN make -j $(nproc)

# Download whisper model
RUN mkdir -p /app/models
RUN curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin -o /app/models/ggml-tiny.bin

# Setup app
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --only=production

COPY api/ ./

EXPOSE 8080
CMD ["npm", "start"]