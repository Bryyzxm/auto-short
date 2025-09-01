#!/bin/bash

###############################################################################
# COMPREHENSIVE AZURE DEPLOYMENT SCRIPT
# 
# Deploys enhanced YouTube cookie management and bot detection bypass
# to Azure App Service with comprehensive production optimizations
###############################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-ai-youtube-segmenter-rg}"
APP_NAME="${AZURE_APP_NAME:-ai-youtube-segmenter}"
DEPLOYMENT_SOURCE="${DEPLOYMENT_SOURCE:-LocalGit}"
NODE_VERSION="18"

echo -e "${BLUE}🚀 Starting comprehensive Azure deployment...${NC}"

# Function to print status
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Azure CLI is installed and logged in
check_azure_cli() {
    print_status "Checking Azure CLI..."
    
    if ! command -v az &> /dev/null; then
        print_error "Azure CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! az account show &> /dev/null; then
        print_error "Not logged in to Azure. Please run 'az login' first."
        exit 1
    fi
    
    print_success "Azure CLI check passed"
}

# Update application settings with enhanced configuration
update_app_settings() {
    print_status "Updating Azure App Service settings..."
    
    # Core Node.js settings
    az webapp config appsettings set \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --settings \
        "WEBSITE_NODE_DEFAULT_VERSION=$NODE_VERSION" \
        "SCM_DO_BUILD_DURING_DEPLOYMENT=true" \
        "ENABLE_ORYX_BUILD=true" \
        "NODE_ENV=production" \
        > /dev/null

    # Enhanced timeout and performance settings
    az webapp config set \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --startup-file "npm start" \
        --always-on true \
        > /dev/null

    # Memory and timeout optimizations
    az webapp config appsettings set \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --settings \
        "WEBSITE_DYNAMIC_CACHE=0" \
        "WEBSITE_LOCAL_CACHE_OPTION=Never" \
        "WEBSITE_HTTPLOGGING_RETENTION_DAYS=7" \
        "WEBSITE_LOAD_USER_PROFILE=1" \
        "WEBSITE_TIME_ZONE=UTC" \
        "WEBSITE_RUN_FROM_PACKAGE=0" \
        > /dev/null

    # Anti-bot detection settings
    az webapp config appsettings set \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --settings \
        "YOUTUBE_ANTI_DETECTION=true" \
        "ENHANCED_RATE_LIMITING=true" \
        "SMART_COOKIE_MANAGEMENT=true" \
        "MAX_EXTRACTION_ATTEMPTS=5" \
        "DEFAULT_USER_AGENT_ROTATION=true" \
        > /dev/null

    print_success "App settings updated"
}

# Deploy enhanced services
deploy_enhanced_services() {
    print_status "Preparing enhanced services for deployment..."
    
    # Ensure all required files exist
    local required_files=(
        "backend/services/azureCookieManager.js"
        "backend/services/enhancedRateLimiter.js"
        "backend/services/enhancedYtDlpService.js"
        "backend/services/advancedBotBypass.js"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            print_error "Required file not found: $file"
            exit 1
        fi
    done
    
    print_success "All enhanced service files found"
}

# Update package.json with optimizations
update_package_json() {
    print_status "Updating package.json for Azure deployment..."
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        print_error "package.json not found in current directory"
        exit 1
    fi
    
    # Backup original package.json
    cp package.json package.json.backup
    
    # Update scripts section for Azure
    cat > temp_package_update.js << 'EOF'
const fs = require('fs');
const package = require('./package.json');

// Ensure proper start script for Azure
package.scripts = package.scripts || {};
package.scripts.start = "node backend/server.js";
package.scripts.build = "npm install --production";
package.scripts["azure:deploy"] = "npm run build";

// Ensure engines specification
package.engines = package.engines || {};
package.engines.node = ">=18.0.0";
package.engines.npm = ">=8.0.0";

// Azure-specific configurations
package.azure = {
  "nodejs_version": "18",
  "startup_file": "backend/server.js",
  "build_flags": "--production"
};

fs.writeFileSync('package.json', JSON.stringify(package, null, 2));
console.log('✅ Package.json updated for Azure deployment');
EOF

    node temp_package_update.js
    rm temp_package_update.js
    
    print_success "Package.json updated"
}

# Create deployment configuration
create_deployment_config() {
    print_status "Creating Azure deployment configuration..."
    
    # Create .deployment file
    cat > .deployment << 'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=true
ENABLE_ORYX_BUILD=true
POST_DEPLOYMENT_ACTION=deploy/post-deployment.sh
EOF

    # Create deployment directory
    mkdir -p deploy
    
    # Create post-deployment script
    cat > deploy/post-deployment.sh << 'EOF'
#!/bin/bash
echo "🔧 Running post-deployment optimizations..."

# Install global dependencies if needed
if [ ! -f "/home/site/wwwroot/node_modules/.bin/pm2" ]; then
    echo "📦 Installing PM2 for process management..."
    npm install -g pm2 || echo "⚠️  PM2 installation failed, continuing..."
fi

# Ensure temp directory exists
mkdir -p /home/site/wwwroot/backend/temp

# Set proper permissions
chmod +x /home/site/wwwroot/backend/server.js || true

# Clean up any old temporary files
find /home/site/wwwroot/backend/temp -type f -mtime +1 -delete 2>/dev/null || true

echo "✅ Post-deployment optimizations completed"
EOF

    chmod +x deploy/post-deployment.sh
    
    print_success "Deployment configuration created"
}

# Enhanced logging configuration
setup_enhanced_logging() {
    print_status "Setting up enhanced logging..."
    
    # Enable application logging
    az webapp log config \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --application-logging filesystem \
        --level information \
        --web-server-logging filesystem \
        > /dev/null

    # Configure log retention
    az webapp config appsettings set \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --settings \
        "WEBSITE_HTTPLOGGING_RETENTION_DAYS=7" \
        "DIAGNOSTICS_AZUREBLOBRETENTIONINDAYS=7" \
        > /dev/null
    
    print_success "Enhanced logging configured"
}

# Deploy to Azure
deploy_to_azure() {
    print_status "Deploying to Azure App Service..."
    
    # Initialize git if not already done
    if [[ ! -d ".git" ]]; then
        git init
        git add .
        git commit -m "Initial commit for Azure deployment"
    else
        # Add all changes
        git add .
        if git diff --cached --quiet; then
            print_warning "No changes to deploy"
        else
            git commit -m "Deploy enhanced YouTube processing with comprehensive bot detection bypass - $(date)"
        fi
    fi
    
    # Get deployment URL
    local deployment_url=$(az webapp deployment source config-local-git \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --query url \
        --output tsv 2>/dev/null || echo "")
    
    if [[ -n "$deployment_url" ]]; then
        # Add Azure remote if not exists
        if ! git remote get-url azure &> /dev/null; then
            git remote add azure "$deployment_url"
        else
            git remote set-url azure "$deployment_url"
        fi
        
        print_status "Pushing to Azure..."
        git push azure main --force
        
        print_success "Deployment pushed to Azure"
    else
        print_error "Could not get deployment URL"
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    local app_url="https://${APP_NAME}.azurewebsites.net"
    
    # Wait for deployment to complete
    print_status "Waiting for app to start..."
    sleep 30
    
    # Check if app is responding
    local max_attempts=12
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        print_status "Health check attempt $attempt/$max_attempts..."
        
        if curl -f -s "$app_url/health" > /dev/null 2>&1; then
            print_success "App is responding successfully!"
            break
        elif [[ $attempt -eq $max_attempts ]]; then
            print_warning "App may still be starting up. Check logs if issues persist."
            break
        else
            sleep 10
            ((attempt++))
        fi
    done
    
    # Display useful information
    echo ""
    echo -e "${BLUE}📊 Deployment Summary:${NC}"
    echo -e "   🌐 App URL: ${GREEN}$app_url${NC}"
    echo -e "   📝 Log Stream: ${YELLOW}az webapp log tail --resource-group $RESOURCE_GROUP --name $APP_NAME${NC}"
    echo -e "   🔧 SSH Access: ${YELLOW}az webapp ssh --resource-group $RESOURCE_GROUP --name $APP_NAME${NC}"
    echo -e "   📊 Metrics: ${YELLOW}az monitor metrics list --resource $APP_NAME --resource-group $RESOURCE_GROUP --resource-type Microsoft.Web/sites${NC}"
}

# Show final instructions
show_final_instructions() {
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Enhanced Features Deployed:${NC}"
    echo -e "   ✅ Azure Cookie Manager with smart refresh"
    echo -e "   ✅ Enhanced Rate Limiter with exponential backoff"
    echo -e "   ✅ Advanced Bot Detection Bypass"
    echo -e "   ✅ Comprehensive Anti-Detection Measures"
    echo -e "   ✅ Production-ready Error Handling"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "   1. Monitor logs: ${BLUE}az webapp log tail --resource-group $RESOURCE_GROUP --name $APP_NAME${NC}"
    echo -e "   2. Test endpoint: ${BLUE}curl https://${APP_NAME}.azurewebsites.net/health${NC}"
    echo -e "   3. Check diagnostics: ${BLUE}curl https://${APP_NAME}.azurewebsites.net/api/diagnostics${NC}"
    echo ""
    echo -e "${GREEN}🔒 Security Notes:${NC}"
    echo -e "   • Update cookies.txt file via Kudu console if needed"
    echo -e "   • Monitor rate limiting statistics in application logs"
    echo -e "   • Check bot detection bypass success rates"
    echo ""
}

# Cleanup function
cleanup() {
    print_status "Cleaning up temporary files..."
    rm -f .deployment 2>/dev/null || true
    rm -rf deploy 2>/dev/null || true
    rm -f package.json.backup 2>/dev/null || true
    print_success "Cleanup completed"
}

# Main execution
main() {
    print_status "Starting comprehensive Azure deployment script"
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    check_azure_cli
    deploy_enhanced_services
    update_package_json
    create_deployment_config
    update_app_settings
    setup_enhanced_logging
    deploy_to_azure
    verify_deployment
    show_final_instructions
    
    print_success "All deployment steps completed successfully!"
}

# Run main function
main "$@"
