#!/bin/bash

# Azure Video Download Fix Test Script
# Tests the critical fix for working directory issues

echo "🚀 Testing Azure Video Download Fix"
echo "=================================="

# Test URL - Using a known working short video
TEST_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
AZURE_ENDPOINT="https://auto-short.azurewebsites.net/api/shorts"

echo "📡 Testing video download endpoint..."
echo "URL: $TEST_URL"
echo "Endpoint: $AZURE_ENDPOINT"
echo ""

# Make the API call
echo "🔄 Sending download request..."
response=$(curl -s -w "%{http_code}" -X POST "$AZURE_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "youtubeUrl": "'$TEST_URL'",
    "start": 10,
    "end": 40,
    "aspectRatio": "9:16"
  }')

# Extract status code
status_code="${response: -3}"
response_body="${response%???}"

echo "📊 Response Status: $status_code"
echo ""

if [ "$status_code" = "200" ]; then
    echo "✅ SUCCESS: Video download completed successfully!"
    echo "Response: $response_body"
    
    # Extract download URL if present
    if echo "$response_body" | grep -q "downloadUrl"; then
        download_url=$(echo "$response_body" | grep -o '"downloadUrl":"[^"]*"' | cut -d'"' -f4)
        echo "📥 Download URL: $download_url"
        echo "🎯 Full URL: https://auto-short.azurewebsites.net$download_url"
    fi
    
elif [ "$status_code" = "500" ]; then
    echo "❌ FAILED: Internal Server Error (500)"
    echo "Response: $response_body"
    echo ""
    echo "🔍 This indicates the fix may not have resolved the issue completely."
    echo "💡 Check Azure logs for detailed error information."
    
elif [ "$status_code" = "400" ]; then
    echo "⚠️  Bad Request (400)"
    echo "Response: $response_body"
    echo ""
    echo "🔍 This might be due to invalid input parameters."
    
else
    echo "⚠️  Unexpected status: $status_code"
    echo "Response: $response_body"
fi

echo ""
echo "🔍 Next Steps:"
echo "1. Check Azure App Service logs for detailed execution info"
echo "2. Look for 'Azure Mode: Using backend working directory' messages"
echo "3. Verify file creation in /home/site/wwwroot/backend/"
echo "4. Monitor for 'File found' vs 'File not found' messages"
echo ""
echo "📋 Log Commands for Azure:"
echo "az webapp log tail --name auto-short --resource-group [YOUR_RESOURCE_GROUP]"
echo ""
echo "🎯 Success Indicators to Look For:"
echo "- ✅ Azure Mode: Using backend working directory"  
echo "- ✅ File found: /home/site/wwwroot/backend/[UUID].mp4"
echo "- ✅ Video downloaded successfully: [SIZE] MB"
