#!/usr/bin/env node

/**
 * 🚀 Hotfix: UUID Import Issue
 *
 * Quick fix for the "uuidv4 is not defined" error in production
 */

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'backend', 'server.js');

console.log('🔧 Applying UUID hotfix...');

// Read current server.js
let content = fs.readFileSync(serverPath, 'utf8');

// Check if uuid import exists
if (!content.includes("const {v4: uuidv4} = require('uuid')")) {
 console.log('❌ UUID import not found - this is the issue!');

 // Find the other requires section
 const requiresSection = content.match(/const .* = require\(.*/g);
 if (requiresSection && requiresSection.length > 0) {
  const lastRequire = requiresSection[requiresSection.length - 1];
  const insertAfter = content.indexOf(lastRequire) + lastRequire.length;

  // Insert UUID import
  const beforeInsert = content.substring(0, insertAfter);
  const afterInsert = content.substring(insertAfter);

  content = beforeInsert + "\nconst {v4: uuidv4} = require('uuid');" + afterInsert;

  fs.writeFileSync(serverPath, content);
  console.log('✅ UUID import added successfully');
 } else {
  console.log('❌ Could not find require section');
 }
} else {
 console.log('✅ UUID import already exists');
}

console.log('🚀 Hotfix complete');
