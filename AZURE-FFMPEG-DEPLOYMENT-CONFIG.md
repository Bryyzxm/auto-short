# Azure App Service Configuration for FFmpeg Support

# This file contains the deployment settings needed for FFmpeg installation

# Azure App Service Application Settings (to be configured via Azure CLI or Portal)

# FFmpeg Installation via PRE_BUILD_COMMAND

PRE_BUILD_COMMAND="cd backend && node scripts/azure-ffmpeg-install.js"

# Alternative: Use PRE_BUILD_SCRIPT_PATH

# PRE_BUILD_SCRIPT_PATH="backend/scripts/azure-ffmpeg-setup.sh"

# Backup strategy: Use POST_BUILD_COMMAND for verification

POST_BUILD_COMMAND="cd backend && npm run azure:verify-ffmpeg"

# Enable verbose logging for debugging

SCM_DO_BUILD_DURING_DEPLOYMENT=true

# Azure CLI Commands for Deployment Configuration

# Set PRE_BUILD_COMMAND for FFmpeg installation

az webapp config appsettings set \
 --resource-group <your-resource-group> \
 --name <your-app-name> \
 --settings PRE_BUILD_COMMAND="cd backend && node scripts/azure-ffmpeg-install.js"

# Set POST_BUILD_COMMAND for verification

az webapp config appsettings set \
 --resource-group <your-resource-group> \
 --name <your-app-name> \
 --settings POST_BUILD_COMMAND="cd backend && npm run azure:verify-ffmpeg"

# Enable build automation

az webapp config appsettings set \
 --resource-group <your-resource-group> \
 --name <your-app-name> \
 --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true

# Alternative: Create custom startup script

# az webapp config set \

# --resource-group <your-resource-group> \

# --name <your-app-name> \

# --startup-file "backend/scripts/azure-startup-with-ffmpeg.sh"

# Deployment Instructions:

# 1. Replace <your-resource-group> and <your-app-name> with actual values

# 2. Run the Azure CLI commands to configure the app settings

# 3. Deploy your application using Git, GitHub Actions, or Azure DevOps

# 4. Monitor deployment logs to verify FFmpeg installation

# Verification:

# After deployment, check the logs to confirm:

# - "✅ FFmpeg verification successful"

# - "🎉 Azure FFmpeg setup completed successfully!"
