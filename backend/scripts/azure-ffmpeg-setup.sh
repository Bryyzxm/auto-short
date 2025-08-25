#!/bin/bash

# Azure FFmpeg Installation and Verification Script
# This script installs FFmpeg on Azure App Service Linux and provides fallback strategies

set -e  # Exit on any error

echo "🔧 Azure FFmpeg Setup Starting..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install FFmpeg
install_ffmpeg() {
    echo "📦 Installing FFmpeg..."
    
    if command_exists apt-get; then
        # Debian/Ubuntu based systems
        echo "🔍 Using apt-get package manager"
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg
    elif command_exists yum; then
        # RHEL/CentOS based systems
        echo "🔍 Using yum package manager"
        yum install -y epel-release
        yum install -y ffmpeg
    elif command_exists apk; then
        # Alpine Linux
        echo "🔍 Using apk package manager"
        apk update
        apk add ffmpeg
    else
        echo "❌ No supported package manager found"
        return 1
    fi
}

# Function to verify FFmpeg installation
verify_ffmpeg() {
    echo "🔍 Verifying FFmpeg installation..."
    
    if command_exists ffmpeg && command_exists ffprobe; then
        echo "✅ FFmpeg verification successful"
        ffmpeg -version | head -1
        ffprobe -version | head -1
        return 0
    else
        echo "❌ FFmpeg verification failed"
        return 1
    fi
}

# Main installation logic
main() {
    echo "🏁 Starting Azure FFmpeg setup process..."
    
    # Check if FFmpeg is already installed
    if verify_ffmpeg; then
        echo "✅ FFmpeg already available, skipping installation"
        exit 0
    fi
    
    echo "⚠️ FFmpeg not found, attempting installation..."
    
    # Try to install FFmpeg
    if install_ffmpeg; then
        echo "📦 FFmpeg installation completed"
        
        # Verify installation
        if verify_ffmpeg; then
            echo "🎉 FFmpeg setup successful!"
            exit 0
        else
            echo "❌ FFmpeg installation failed verification"
            exit 1
        fi
    else
        echo "❌ FFmpeg installation failed"
        echo "⚠️ Application will run with limited video processing capabilities"
        exit 1
    fi
}

# Run main function
main "$@"
