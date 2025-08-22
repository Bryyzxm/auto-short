/**
 * Enhanced VTT and Subtitle File Cleanup Utility
 *
 * Comprehensive cleanup tool for subtitle files with improved
 * pattern matching and safe deletion practices.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

class EnhancedCleanupUtility {
 constructor(options = {}) {
  this.dryRun = options.dryRun || false;
  this.verbose = options.verbose || false;
  this.directories = options.directories || [process.cwd(), path.join(process.cwd(), 'temp'), path.join(process.cwd(), 'backend'), path.join(process.cwd(), 'backend', 'temp'), '/tmp'];

  this.patterns = ['*.vtt', '*.srt', '*.json3', '*.ass', '*.ttml', '*.sbv', '**/temp/*.vtt', '**/temp/*.srt', '**/temp/*.json3', '**/*transcript*', '**/*subtitle*', '**/*caption*'];

  this.stats = {
   filesFound: 0,
   filesDeleted: 0,
   spaceFreed: 0,
   errors: 0,
  };
 }

 /**
  * Enhanced cleanup with comprehensive pattern matching
  */
 async performCleanup() {
  console.log('🧹 Starting enhanced subtitle file cleanup...');
  console.log(`📁 Searching directories: ${this.directories.length}`);
  console.log(`🔍 Using patterns: ${this.patterns.length}`);

  if (this.dryRun) {
   console.log('🔍 DRY RUN MODE - No files will be deleted');
  }

  for (const directory of this.directories) {
   if (fs.existsSync(directory)) {
    await this.cleanDirectory(directory);
   } else {
    console.log(`⚠️  Directory not found: ${directory}`);
   }
  }

  this.printSummary();
 }

 /**
  * Clean a specific directory
  */
 async cleanDirectory(directory) {
  console.log(`\n📂 Cleaning directory: ${directory}`);

  for (const pattern of this.patterns) {
   try {
    const fullPattern = path.join(directory, pattern);
    const files = glob.sync(fullPattern, {
     ignore: ['**/node_modules/**', '**/vendor/**'],
     dot: false,
    });

    if (files.length > 0) {
     console.log(`  🔍 Pattern "${pattern}" found ${files.length} files`);

     for (const file of files) {
      await this.processFile(file);
     }
    }
   } catch (error) {
    console.log(`  ❌ Error with pattern "${pattern}": ${error.message}`);
    this.stats.errors++;
   }
  }
 }

 /**
  * Process individual file
  */
 async processFile(filePath) {
  try {
   const stats = fs.statSync(filePath);
   const fileName = path.basename(filePath);
   const fileSize = stats.size;
   const fileAge = Date.now() - stats.mtime.getTime();
   const ageHours = Math.round(fileAge / (1000 * 60 * 60));

   this.stats.filesFound++;

   if (this.verbose) {
    console.log(`    📄 ${fileName} (${this.formatBytes(fileSize)}, ${ageHours}h old)`);
   }

   // Safety checks before deletion
   if (this.shouldDeleteFile(filePath, stats)) {
    if (!this.dryRun) {
     fs.unlinkSync(filePath);
     this.stats.filesDeleted++;
     this.stats.spaceFreed += fileSize;
     console.log(`    🗑️  Deleted: ${fileName} (${this.formatBytes(fileSize)})`);
    } else {
     console.log(`    🔍 Would delete: ${fileName} (${this.formatBytes(fileSize)})`);
     this.stats.spaceFreed += fileSize; // For dry run statistics
    }
   } else {
    if (this.verbose) {
     console.log(`    ⏭️  Skipped: ${fileName} (protected)`);
    }
   }
  } catch (error) {
   console.log(`    ❌ Error processing ${filePath}: ${error.message}`);
   this.stats.errors++;
  }
 }

 /**
  * Determine if file should be deleted based on safety rules
  */
 shouldDeleteFile(filePath, stats) {
  const fileName = path.basename(filePath);
  const fileSize = stats.size;
  const fileAge = Date.now() - stats.mtime.getTime();

  // Safety rules
  const rules = {
   // Don't delete files larger than 50MB (might be important)
   maxSize: fileSize < 50 * 1024 * 1024,

   // Don't delete files in protected directories
   notInProtected: !filePath.includes('node_modules') && !filePath.includes('vendor') && !filePath.includes('.git'),

   // Don't delete very recent files (less than 1 hour old)
   notTooRecent: fileAge > 1000 * 60 * 60,

   // Don't delete files with certain protected names
   notProtected: !fileName.includes('backup') && !fileName.includes('important') && !fileName.includes('keep'),

   // Must be a subtitle-related file
   isSubtitleFile: /\.(vtt|srt|json3|ass|ttml|sbv)$/i.test(fileName) || fileName.includes('transcript') || fileName.includes('subtitle') || fileName.includes('caption'),
  };

  const shouldDelete = Object.values(rules).every((rule) => rule === true);

  if (this.verbose && !shouldDelete) {
   const failedRules = Object.entries(rules)
    .filter(([_, passed]) => !passed)
    .map(([rule, _]) => rule);
   console.log(`    ⚠️  Protected by rules: ${failedRules.join(', ')}`);
  }

  return shouldDelete;
 }

 /**
  * Clean specific video ID files
  */
 async cleanVideoFiles(videoId) {
  console.log(`🎯 Cleaning files for specific video: ${videoId}`);

  const videoPatterns = [`${videoId}.*`, `*${videoId}*`, `*${videoId}.vtt`, `*${videoId}.json3`, `*${videoId}.srt`];

  for (const directory of this.directories) {
   if (fs.existsSync(directory)) {
    for (const pattern of videoPatterns) {
     try {
      const fullPattern = path.join(directory, pattern);
      const files = glob.sync(fullPattern);

      for (const file of files) {
       await this.processFile(file);
      }
     } catch (error) {
      console.log(`❌ Error cleaning video files: ${error.message}`);
     }
    }
   }
  }
 }

 /**
  * Format bytes for human readable output
  */
 formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 }

 /**
  * Print cleanup summary
  */
 printSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 CLEANUP SUMMARY');
  console.log('='.repeat(50));
  console.log(`📄 Files found: ${this.stats.filesFound}`);
  console.log(`🗑️  Files deleted: ${this.stats.filesDeleted}`);
  console.log(`💾 Space freed: ${this.formatBytes(this.stats.spaceFreed)}`);
  console.log(`❌ Errors: ${this.stats.errors}`);

  if (this.dryRun) {
   console.log('\n🔍 This was a DRY RUN - no files were actually deleted');
   console.log('💡 Run without --dry-run to perform actual cleanup');
  }
 }
}

// CLI interface
if (require.main === module) {
 const args = process.argv.slice(2);
 const dryRun = args.includes('--dry-run');
 const verbose = args.includes('--verbose') || args.includes('-v');
 const videoId = args.find((arg) => !arg.startsWith('--') && arg.length === 11);

 const cleaner = new EnhancedCleanupUtility({
  dryRun,
  verbose,
 });

 if (videoId) {
  console.log(`🎯 Cleaning files for video: ${videoId}`);
  cleaner.cleanVideoFiles(videoId).catch(console.error);
 } else {
  cleaner.performCleanup().catch(console.error);
 }
}

module.exports = EnhancedCleanupUtility;
