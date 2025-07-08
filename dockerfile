# Gunakan base image Node.js yang sesuai
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

# Install system dependencies (ffmpeg and yt-dlp)
# apt-get update untuk memperbarui daftar paket
# apt-get install -y ffmpeg python3-pip untuk menginstal ffmpeg dan pip
# pip install yt-dlp untuk menginstal yt-dlp
RUN apt-get update && apt-get install -y ffmpeg python3-pip && pip install yt-dlp \
    && ln -s $(which yt-dlp) /usr/local/bin/yt-dlp \
    && ln -s $(which ffmpeg) /usr/local/bin/ffmpeg

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (sesuaikan dengan PORT di server.js, yaitu 8080)
EXPOSE 8080

# Command to run the application
CMD ["bash", "-c", "export PATH=$PATH:/usr/local/bin && npm start"]