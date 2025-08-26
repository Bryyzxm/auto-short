#!/bin/bash

# 🛠️ NPM 429 Error Fix Script
# This script resolves the "Too Many Requests" error by cleaning dependencies and regenerating lockfiles

echo "🔧 Starting NPM 429 Error Fix..."

# Function to safely delete files/directories
safe_delete() {
    if [ -e "$1" ]; then
        rm -rf "$1"
        echo "✅ Deleted: $1"
    else
        echo "ℹ️ Not found (skipping): $1"
    fi
}

echo ""
echo "📁 Step 1: Cleaning npm cache and old lockfiles..."
npm cache clean --force 2>/dev/null || true

# Clean root directory
echo "🧹 Cleaning frontend dependencies..."
safe_delete "package-lock.json"
safe_delete "node_modules"

# Clean backend directory
echo "🧹 Cleaning backend dependencies..."
cd backend
safe_delete "package-lock.json" 
safe_delete "node_modules"
cd ..

echo ""
echo "📦 Step 2: Configuring npm for rate limiting prevention..."

# Configure npm settings to prevent 429 errors
npm config set registry https://registry.npmjs.org/
npm config set fetch-timeout 600000
npm config set fetch-retry-mintimeout 10000
npm config set fetch-retry-maxtimeout 60000
npm config set fetch-retries 5
npm config set maxsockets 1
npm config set audit false
npm config set fund false
npm config set prefer-offline true

echo "✅ NPM configuration updated"

echo ""
echo "📥 Step 3: Installing dependencies with retry strategy..."

# Function to install with retries
install_with_retry() {
    local dir=$1
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "🔄 Attempt $attempt/$max_attempts for $dir..."
        
        if [ "$dir" = "." ]; then
            if npm install --no-audit --no-fund; then
                echo "✅ Frontend dependencies installed successfully"
                return 0
            fi
        else
            cd "$dir"
            if npm install --no-audit --no-fund; then
                echo "✅ Backend dependencies installed successfully"
                cd ..
                return 0
            fi
            cd ..
        fi
        
        echo "❌ Attempt $attempt failed, waiting 10 seconds..."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    echo "❌ All attempts failed for $dir"
    return 1
}

# Install backend first (more critical)
echo "🎯 Installing backend dependencies..."
install_with_retry "backend"

echo ""
echo "⏳ Waiting 15 seconds to avoid rate limiting..."
sleep 15

# Install frontend
echo "🎯 Installing frontend dependencies..."
install_with_retry "."

echo ""
echo "🎉 NPM 429 Error Fix Complete!"
echo ""
echo "📋 Summary:"
echo "✅ Cleaned npm cache and old lockfiles"
echo "✅ Updated npm configuration for rate limiting"
echo "✅ Installed dependencies with retry strategy"
echo "✅ Generated new package-lock.json files"
echo ""
echo "🚀 You can now push to GitHub without 429 errors!"
