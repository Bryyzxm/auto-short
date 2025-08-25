#!/bin/bash

# Azure App Service Custom Startup Command Fix
# This script configures Azure to use our custom startup.sh

echo "🔧 Configuring Azure App Service to use custom startup script..."

# Set the custom startup file for Azure App Service
# Replace <resource-group-name> and <app-name> with your actual values
az webapp config set \
  --resource-group "auto-short-rg" \
  --name "auto-short" \
  --startup-file "/home/site/wwwroot/backend/startup.sh"

echo "✅ Azure App Service configured to use custom startup script"
echo "🔄 Restart your Azure App Service for changes to take effect"

# Alternative method using startup command:
echo ""
echo "Alternative: Set startup command directly:"
echo "az webapp config set --resource-group auto-short-rg --name auto-short --startup-file \"bash /home/site/wwwroot/backend/startup.sh\""
