# Use Node.js 18 slim image
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp

# Create app directory
WORKDIR /app

# Copy package files from api directory
COPY api/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source from api directory
COPY api/ .

# Create outputs directory
RUN mkdir -p outputs

# Expose port
EXPOSE $PORT

# Start the application
CMD ["npm", "start"]