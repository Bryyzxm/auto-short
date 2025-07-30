#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the path to the backend directory within the Azure App Service environment.
# /home/site/wwwroot is the root of your deployed application.
BACKEND_DIR="/home/site/wwwroot/backend"

# Check if the backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
  echo "Error: Backend directory not found at $BACKEND_DIR!"
  exit 1
fi

# Navigate to the backend directory.
cd "$BACKEND_DIR"

echo "Successfully changed directory to $(pwd)"

# Define paths to the vendored yt-dlp binaries
YT_DLP_LINUX_BINARY="$BACKEND_DIR/vendor/yt-dlp-exec/bin/yt-dlp"

# Grant execute permissions to the Linux binary. This is crucial for it to run.
if [ -f "$YT_DLP_LINUX_BINARY" ]; then
  echo "Found Linux binary, setting execute permissions..."
  chmod +x "$YT_DLP_LINUX_BINARY"
  echo "Permissions set for yt-dlp Linux binary."
else
    echo "Warning: yt-dlp Linux binary not found at $YT_DLP_LINUX_BINARY"
fi

# Install project dependencies
echo "Installing Node.js dependencies..."
npm install

# Start the Node.js application
echo "Starting the Node.js server..."
npm start