#!/bin/bash

# Azure FFmpeg Fix Deployment Script
# This script configures Azure App Service for FFmpeg support

set -e

echo "🚀 Azure FFmpeg Fix Deployment Script"
echo "======================================"

# Check if required parameters are provided
if [ $# -ne 2 ]; then
    echo "❌ Usage: $0 <resource-group> <app-name>"
    echo "Example: $0 myResourceGroup myAppName"
    exit 1
fi

RESOURCE_GROUP=$1
APP_NAME=$2

echo "📋 Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  App Name: $APP_NAME"
echo ""

# Verify Azure CLI is installed and logged in
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Please install Azure CLI first."
    exit 1
fi

# Check if logged in
if ! az account show &> /dev/null; then
    echo "❌ Not logged into Azure. Please run 'az login' first."
    exit 1
fi

echo "✅ Azure CLI verified and authenticated"

# Configure FFmpeg installation
echo "🔧 Configuring FFmpeg installation..."

az webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --settings PRE_BUILD_COMMAND="cd backend && node scripts/azure-ffmpeg-install.js" \
    --output table

echo "✅ PRE_BUILD_COMMAND configured"

# Configure FFmpeg verification
echo "🔍 Configuring FFmpeg verification..."

az webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --settings POST_BUILD_COMMAND="cd backend && npm run azure:verify-ffmpeg" \
    --output table

echo "✅ POST_BUILD_COMMAND configured"

# Enable build automation
echo "⚙️ Enabling build automation..."

az webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    --output table

echo "✅ Build automation enabled"

# Show current configuration
echo ""
echo "📊 Current App Settings:"
az webapp config appsettings list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --query "[?name=='PRE_BUILD_COMMAND' || name=='POST_BUILD_COMMAND' || name=='SCM_DO_BUILD_DURING_DEPLOYMENT']" \
    --output table

echo ""
echo "🎉 Azure FFmpeg Fix deployment configuration completed!"
echo ""
echo "📝 Next Steps:"
echo "1. Deploy your application code to Azure"
echo "2. Monitor deployment logs for FFmpeg installation messages"
echo "3. Look for '✅ FFmpeg verification successful' in logs"
echo "4. Test video processing functionality"
echo ""
echo "🔍 To monitor deployment:"
echo "az webapp log tail --resource-group $RESOURCE_GROUP --name $APP_NAME"
