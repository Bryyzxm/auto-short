// Script untuk membersihkan file VTT lama
import fs from 'fs';
import path from 'path';

function cleanupVttFiles() {
 try {
  const files = fs.readdirSync(process.cwd());
  const vttFiles = files.filter(file => file.endsWith('.vtt'));
  
  console.log(`Found ${vttFiles.length} VTT files to cleanup:`);
  vttFiles.forEach(file => {
   console.log(`- ${file}`);
  });
  
  vttFiles.forEach(file => {
   try {
    fs.unlinkSync(path.join(process.cwd(), file));
    console.log(`✓ Cleaned up: ${file}`);
   } catch (e) {
    console.warn(`✗ Failed to cleanup ${file}:`, e.message);
   }
  });
  
  console.log(`\nCleanup completed. Removed ${vttFiles.length} VTT files.`);
 } catch (e) {
  console.error('Failed to cleanup VTT files:', e.message);
 }
}

cleanupVttFiles();