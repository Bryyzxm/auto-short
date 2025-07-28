#!/bin/bash

# Startup script for Node.js application with yt-dlp dependency
# This script prepares the environment and starts the application on Azure App Service

set -e  # Exit immediately if a command exits with a non-zero status

echo "Starting application setup..."

# Step 1: Update the system package list
echo "Updating system package list..."
apt-get update

# Step 2: Install Python3 and pip (required for yt-dlp)
echo "Installing Python3 and pip..."
apt-get install -y python3-pip

# Step 3: Install/upgrade yt-dlp to the latest version
echo "Installing/upgrading yt-dlp..."
pip3 install --upgrade yt-dlp

# Step 4: Install Node.js project dependencies
echo "Installing Node.js dependencies..."
npm install

# Step 5: Start the Node.js application
echo "Starting the application..."
npm start