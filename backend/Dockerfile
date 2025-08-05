# Use Node.js 18 LTS with optimized slim image
FROM node:18-slim

# Set environment variables for production
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies dengan optimisasi untuk Azure
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    python3-pip \
    python3-setuptools \
    && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp==2025.07.21 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* \
    && rm -rf /var/tmp/* \
    && echo "🔍 Verifying installations..." \
    && ffmpeg -version > /dev/null && echo "✅ FFmpeg verified" \
    && yt-dlp --version && echo "✅ yt-dlp verified" \
    && which yt-dlp && echo "✅ yt-dlp path confirmed"

# Set working directory
WORKDIR /app

# Create app user for security (non-root)
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies dengan optimisasi
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories dengan proper permissions
RUN mkdir -p temp cookies outputs logs \
    && chown -R appuser:appuser /app \
    && chmod 755 temp cookies outputs logs

# Switch to non-root user
USER appuser

# Expose port (Azure menggunakan PORT environment variable)
EXPOSE ${PORT:-5001}

# Health check untuk memastikan aplikasi berjalan
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5001}/health || exit 1

# Start aplikasi
CMD ["npm", "start"]
