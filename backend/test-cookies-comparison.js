#!/usr/bin/env node

/**
 * Cookies Comparison Test Utility
 * 
 * This script compares local cookies.txt file with environment variable content
 * to identify size discrepancies, encoding issues, and content differences.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ANSI color codes for better console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(` 🔍 ${title}`, 'bold');
    console.log('='.repeat(60));
}

function isBase64Encoded(str) {
    try {
        // Basic base64 pattern check
        const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Pattern.test(str)) return false;
        
        // Try to decode and re-encode
        const decoded = Buffer.from(str, 'base64').toString('utf8');
        const reencoded = Buffer.from(decoded, 'utf8').toString('base64');
        return reencoded === str && decoded.includes('youtube.com');
    } catch (e) {
        return false;
    }
}

function analyzeContent(content, label) {
    const analysis = {
        label,
        raw: {
            length: content.length,
            bytes: Buffer.byteLength(content, 'utf8'),
            lines: content.split('\n').length,
            hash: crypto.createHash('md5').update(content).digest('hex')
        },
        encoding: {
            isBase64: isBase64Encoded(content),
            hasUrlEncoding: content.includes('%'),
            lineEndings: content.includes('\r\n') ? 'CRLF' : content.includes('\r') ? 'CR' : 'LF'
        },
        content: {
            hasNetscapeHeader: content.includes('# Netscape') || content.includes('# HTTP Cookie File'),
            youtubeDomains: (content.match(/youtube\.com/g) || []).length,
            nonCommentLines: content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length
        }
    };

    // If it's base64, analyze decoded content too
    if (analysis.encoding.isBase64) {
        try {
            const decoded = Buffer.from(content, 'base64').toString('utf8');
            analysis.decoded = {
                length: decoded.length,
                bytes: Buffer.byteLength(decoded, 'utf8'),
                lines: decoded.split('\n').length,
                hash: crypto.createHash('md5').update(decoded).digest('hex'),
                hasNetscapeHeader: decoded.includes('# Netscape') || decoded.includes('# HTTP Cookie File'),
                youtubeDomains: (decoded.match(/youtube\.com/g) || []).length,
                nonCommentLines: decoded.split('\n').filter(line => line.trim() && !line.startsWith('#')).length
            };
        } catch (e) {
            analysis.decoded = { error: e.message };
        }
    }

    return analysis;
}

function compareAnalyses(envAnalysis, fileAnalysis) {
    logSection('COMPARISON RESULTS');

    const comparison = {
        sizeDifference: null,
        hashMatch: false,
        encoding: {
            envIsBase64: envAnalysis.encoding.isBase64,
            fileIsBase64: fileAnalysis.encoding.isBase64,
            bothDecoded: false
        },
        content: {
            netscapeHeaderMatch: false,
            youtubeDomainCountMatch: false,
            lineCountMatch: false
        },
        issues: [],
        recommendations: []
    };

    // Compare appropriate versions (raw vs decoded)
    let envToCompare = envAnalysis.raw;
    let fileToCompare = fileAnalysis.raw;

    if (envAnalysis.encoding.isBase64 && envAnalysis.decoded) {
        envToCompare = envAnalysis.decoded;
        comparison.encoding.bothDecoded = true;
        log('📋 Comparing decoded environment variable with file content', 'yellow');
    } else if (fileAnalysis.encoding.isBase64 && fileAnalysis.decoded) {
        fileToCompare = fileAnalysis.decoded;
        log('📋 Comparing environment variable with decoded file content', 'yellow');
    } else {
        log('📋 Comparing raw content', 'blue');
    }

    // Size comparison
    comparison.sizeDifference = envToCompare.bytes - fileToCompare.bytes;
    comparison.hashMatch = envToCompare.hash === fileToCompare.hash;

    log(`\n📏 Size Comparison:`, 'cyan');
    log(`   Environment: ${envToCompare.bytes} bytes (${envToCompare.lines} lines)`);
    log(`   File:        ${fileToCompare.bytes} bytes (${fileToCompare.lines} lines)`);
    log(`   Difference:  ${comparison.sizeDifference} bytes`, comparison.sizeDifference === 0 ? 'green' : 'red');

    log(`\n🔐 Hash Comparison:`, 'cyan');
    log(`   Environment: ${envToCompare.hash}`);
    log(`   File:        ${fileToCompare.hash}`);
    log(`   Match:       ${comparison.hashMatch ? 'YES' : 'NO'}`, comparison.hashMatch ? 'green' : 'red');

    // Content comparison
    comparison.content.netscapeHeaderMatch = 
        (envAnalysis.content.hasNetscapeHeader || (envAnalysis.decoded && envAnalysis.decoded.hasNetscapeHeader)) ===
        (fileAnalysis.content.hasNetscapeHeader || (fileAnalysis.decoded && fileAnalysis.decoded.hasNetscapeHeader));

    comparison.content.youtubeDomainCountMatch = 
        (envAnalysis.content.youtubeDomains || (envAnalysis.decoded && envAnalysis.decoded.youtubeDomains)) ===
        (fileAnalysis.content.youtubeDomains || (fileAnalysis.decoded && fileAnalysis.decoded.youtubeDomains));

    comparison.content.lineCountMatch = envToCompare.lines === fileToCompare.lines;

    log(`\n📄 Content Comparison:`, 'cyan');
    log(`   Netscape header: ${comparison.content.netscapeHeaderMatch ? 'MATCH' : 'MISMATCH'}`, 
        comparison.content.netscapeHeaderMatch ? 'green' : 'yellow');
    log(`   YouTube domains: ${comparison.content.youtubeDomainCountMatch ? 'MATCH' : 'MISMATCH'}`, 
        comparison.content.youtubeDomainCountMatch ? 'green' : 'yellow');
    log(`   Line count:      ${comparison.content.lineCountMatch ? 'MATCH' : 'MISMATCH'}`, 
        comparison.content.lineCountMatch ? 'green' : 'yellow');

    // Identify issues and recommendations
    if (comparison.sizeDifference !== 0) {
        comparison.issues.push(`Size mismatch: ${Math.abs(comparison.sizeDifference)} bytes difference`);
        
        if (comparison.sizeDifference > 0) {
            comparison.recommendations.push('Environment variable has more content than file - check for truncation during file write');
        } else {
            comparison.recommendations.push('File has more content than environment variable - check for extra data in file');
        }
    }

    if (!comparison.hashMatch) {
        comparison.issues.push('Content hash mismatch - files have different content');
        comparison.recommendations.push('Compare content byte-by-byte to identify differences');
    }

    if (envAnalysis.encoding.isBase64 && !fileAnalysis.encoding.isBase64) {
        comparison.issues.push('Environment variable is base64 encoded but file is not');
        comparison.recommendations.push('Ensure proper base64 decoding during file creation');
    } else if (!envAnalysis.encoding.isBase64 && fileAnalysis.encoding.isBase64) {
        comparison.issues.push('File is base64 encoded but environment variable is not');
        comparison.recommendations.push('Check if file encoding is correct');
    }

    if (!comparison.content.netscapeHeaderMatch) {
        comparison.issues.push('Netscape header presence mismatch');
        comparison.recommendations.push('Verify cookies format consistency');
    }

    if (!comparison.content.youtubeDomainCountMatch) {
        comparison.issues.push('YouTube domain count mismatch');
        comparison.recommendations.push('Check for missing or corrupted YouTube cookies');
    }

    // Display issues and recommendations
    if (comparison.issues.length > 0) {
        log(`\n❌ Issues Found (${comparison.issues.length}):`, 'red');
        comparison.issues.forEach((issue, index) => {
            log(`   ${index + 1}. ${issue}`, 'red');
        });
    } else {
        log(`\n✅ No issues found - content matches perfectly!`, 'green');
    }

    if (comparison.recommendations.length > 0) {
        log(`\n💡 Recommendations (${comparison.recommendations.length}):`, 'yellow');
        comparison.recommendations.forEach((rec, index) => {
            log(`   ${index + 1}. ${rec}`, 'yellow');
        });
    }

    return comparison;
}

async function main() {
    log('🍪 Cookies Comparison Test Utility', 'bold');
    log('Comparing local cookies.txt with environment variable content\n', 'cyan');

    // 1. Check environment variables
    logSection('ENVIRONMENT VARIABLE ANALYSIS');
    
    const envVarNames = ['YTDLP_COOKIES_CONTENT', 'YOUTUBE_COOKIES_CONTENT', 'COOKIES_CONTENT'];
    let envContent = null;
    let usedEnvVar = null;

    for (const varName of envVarNames) {
        const content = process.env[varName];
        if (content && content.trim()) {
            envContent = content;
            usedEnvVar = varName;
            log(`✅ Found cookies in: ${varName}`, 'green');
            break;
        } else {
            log(`❌ Not found: ${varName}`, 'red');
        }
    }

    if (!envContent) {
        log('\n❌ No cookies environment variable found!', 'red');
        log('💡 Set one of: YTDLP_COOKIES_CONTENT, YOUTUBE_COOKIES_CONTENT, or COOKIES_CONTENT', 'yellow');
        process.exit(1);
    }

    const envAnalysis = analyzeContent(envContent, `Environment Variable (${usedEnvVar})`);

    log(`\n📊 Environment Variable Analysis:`, 'blue');
    log(`   Raw size: ${envAnalysis.raw.bytes} bytes (${envAnalysis.raw.lines} lines)`);
    log(`   Is Base64: ${envAnalysis.encoding.isBase64 ? 'YES' : 'NO'}`, 
        envAnalysis.encoding.isBase64 ? 'yellow' : 'blue');
    log(`   Line endings: ${envAnalysis.encoding.lineEndings}`);
    log(`   Netscape header: ${envAnalysis.content.hasNetscapeHeader ? 'YES' : 'NO'}`);
    log(`   YouTube domains: ${envAnalysis.content.youtubeDomains}`);

    if (envAnalysis.decoded) {
        log(`   Decoded size: ${envAnalysis.decoded.bytes} bytes (${envAnalysis.decoded.lines} lines)`, 'yellow');
        log(`   Decoded YouTube domains: ${envAnalysis.decoded.youtubeDomains}`, 'yellow');
    }

    // 2. Check local cookies.txt file
    logSection('LOCAL FILE ANALYSIS');

    const cookiesPath = path.join(__dirname, 'cookies.txt');
    
    if (!fs.existsSync(cookiesPath)) {
        log(`❌ Local cookies.txt not found at: ${cookiesPath}`, 'red');
        log('💡 Run the server to create cookies.txt from environment variable', 'yellow');
        process.exit(1);
    }

    log(`✅ Found local file: ${cookiesPath}`, 'green');

    const fileContent = fs.readFileSync(cookiesPath, 'utf8');
    const fileStats = fs.statSync(cookiesPath);
    const fileAnalysis = analyzeContent(fileContent, 'Local File (cookies.txt)');

    log(`\n📊 Local File Analysis:`, 'blue');
    log(`   File size: ${fileAnalysis.raw.bytes} bytes (${fileAnalysis.raw.lines} lines)`);
    log(`   Created: ${fileStats.birthtime.toISOString()}`);
    log(`   Modified: ${fileStats.mtime.toISOString()}`);
    log(`   Is Base64: ${fileAnalysis.encoding.isBase64 ? 'YES' : 'NO'}`, 
        fileAnalysis.encoding.isBase64 ? 'yellow' : 'blue');
    log(`   Line endings: ${fileAnalysis.encoding.lineEndings}`);
    log(`   Netscape header: ${fileAnalysis.content.hasNetscapeHeader ? 'YES' : 'NO'}`);
    log(`   YouTube domains: ${fileAnalysis.content.youtubeDomains}`);

    // 3. Compare the two
    const comparison = compareAnalyses(envAnalysis, fileAnalysis);

    // 4. Summary and exit code
    logSection('SUMMARY');

    if (comparison.issues.length === 0) {
        log('🎉 SUCCESS: Environment variable and local file match perfectly!', 'green');
        log('✅ No content discrepancies detected', 'green');
        process.exit(0);
    } else {
        log(`⚠️  ISSUES DETECTED: ${comparison.issues.length} problem(s) found`, 'red');
        log(`📋 See recommendations above for troubleshooting steps`, 'yellow');
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    log(`\n💥 Uncaught Exception: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`\n💥 Unhandled Rejection: ${reason}`, 'red');
    console.error(reason);
    process.exit(1);
});

// Run the main function
if (require.main === module) {
    main().catch(error => {
        log(`\n💥 Error: ${error.message}`, 'red');
        console.error(error.stack);
        process.exit(1);
    });
}

module.exports = { analyzeContent, compareAnalyses, isBase64Encoded };
