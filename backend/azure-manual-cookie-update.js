#!/usr/bin/env node

/**
 * Manual Azure Cookie Update Tool
 * Creates properly formatted content for Azure Portal manual update
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 AZURE MANUAL COOKIE UPDATE TOOL');
console.log('='.repeat(60));

const cookiesPath = path.join(__dirname, 'cookies.txt');

try {
 // Read the local cookies file
 const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');

 console.log('✅ Local cookies file read successfully');
 console.log(`📏 Original size: ${cookiesContent.length} bytes`);
 console.log(`📄 Lines: ${cookiesContent.split('\n').length}`);

 // Count essential cookies
 const essentialCookies = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
 const foundEssential = essentialCookies.filter((cookie) => cookiesContent.includes(`\t${cookie}\t`));

 console.log(`🔑 Essential cookies found: ${foundEssential.length}/5`);
 console.log(`✅ Found: ${foundEssential.join(', ')}`);

 if (foundEssential.length < 5) {
  console.log('❌ Missing essential cookies - please check your cookies.txt file');
  process.exit(1);
 }

 // URL encode the content for Azure Portal
 const urlEncoded = encodeURIComponent(cookiesContent);

 console.log('');
 console.log('🎯 AZURE PORTAL UPDATE INSTRUCTIONS');
 console.log('='.repeat(60));
 console.log('');
 console.log('1. Go to Azure Portal → App Services → auto-short');
 console.log('2. Navigate to Settings → Configuration');
 console.log('3. Find YTDLP_COOKIES_CONTENT and click Edit');
 console.log('4. Delete existing content and paste the content below:');
 console.log('');
 console.log('📋 COPY THIS CONTENT TO AZURE PORTAL:');
 console.log('-'.repeat(60));
 console.log(urlEncoded);
 console.log('-'.repeat(60));
 console.log('');
 console.log('5. Click OK → Save → Restart the app service');
 console.log('');
 console.log('✅ Expected result after restart:');
 console.log('   [COOKIES-VALIDATION] 🔑 Essential cookies found: 5/5');
 console.log('   ✅ OVERALL STATUS: SUCCESS');

 // Also save to a file for easy copy/paste
 const outputFile = path.join(__dirname, 'azure-cookies-encoded.txt');
 fs.writeFileSync(outputFile, urlEncoded, 'utf8');

 console.log('');
 console.log(`💾 Content also saved to: ${outputFile}`);
 console.log('💡 You can open this file and copy the content if needed');
} catch (error) {
 console.error('❌ Error processing cookies:', error.message);
 process.exit(1);
}
