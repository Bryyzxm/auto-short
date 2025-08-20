/**
 * Centralized Error Handling Service
 * Provides consistent error handling across all Azure operations
 */

class AzureErrorHandler {
 constructor() {
  this.errorStats = {
   totalErrors: 0,
   authErrors: 0,
   timeoutErrors: 0,
   destructuringErrors: 0,
   ytdlpErrors: 0,
   lastErrorTime: null,
  };
 }

 /**
  * Safe destructuring with fallback values
  */
 safeDestructure(obj, defaults = {}) {
  if (!obj || typeof obj !== 'object') {
   console.warn('[ERROR-HANDLER] ⚠️ Safe destructuring: received non-object', typeof obj);
   return {...defaults, _error: 'invalid_object'};
  }

  return {...defaults, ...obj};
 }

 /**
  * Handle yt-dlp execution errors
  */
 handleYtDlpError(error, context = {}) {
  this.errorStats.totalErrors++;
  this.errorStats.ytdlpErrors++;
  this.errorStats.lastErrorTime = new Date().toISOString();

  const errorInfo = {
   type: 'yt-dlp-error',
   message: error.message || 'Unknown yt-dlp error',
   context,
   timestamp: new Date().toISOString(),
   isRecoverable: this.isRecoverableError(error),
  };

  // Check for specific error types
  if (this.isAuthError(error)) {
   this.errorStats.authErrors++;
   errorInfo.subtype = 'authentication';
   errorInfo.recommendation = 'Check cookies and authentication credentials';
  } else if (this.isTimeoutError(error)) {
   this.errorStats.timeoutErrors++;
   errorInfo.subtype = 'timeout';
   errorInfo.recommendation = 'Increase timeout or optimize command arguments';
  } else if (this.isDestructuringError(error)) {
   this.errorStats.destructuringErrors++;
   errorInfo.subtype = 'destructuring';
   errorInfo.recommendation = 'Add defensive checks before destructuring';
  }

  console.error('[ERROR-HANDLER] 🚨 YT-DLP Error:', errorInfo);
  return errorInfo;
 }

 /**
  * Handle safe execution with automatic retries
  */
 async executeWithRetry(fn, options = {}) {
  const {maxRetries = 3, retryDelay = 1000, context = 'unknown', fallbackValue = null} = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
   try {
    console.log(`[ERROR-HANDLER] 🔄 Attempt ${attempt}/${maxRetries} for ${context}`);
    const result = await fn();

    if (result === undefined || result === null) {
     throw new Error(`Function returned ${result} on attempt ${attempt}`);
    }

    console.log(`[ERROR-HANDLER] ✅ Success on attempt ${attempt} for ${context}`);
    return result;
   } catch (error) {
    lastError = error;
    console.warn(`[ERROR-HANDLER] ❌ Attempt ${attempt} failed for ${context}:`, error.message);

    if (attempt < maxRetries && this.isRecoverableError(error)) {
     await this.delay(retryDelay * attempt); // Exponential backoff
    }
   }
  }

  // All attempts failed
  const errorInfo = this.handleYtDlpError(lastError, {context, attempts: maxRetries});

  if (fallbackValue !== null) {
   console.log(`[ERROR-HANDLER] 🛡️ Using fallback value for ${context}`);
   return fallbackValue;
  }

  throw new Error(`All ${maxRetries} attempts failed for ${context}: ${lastError.message}`);
 }

 /**
  * Validate and normalize yt-dlp output
  */
 normalizeYtDlpOutput(result) {
  if (typeof result === 'string') {
   return {output: result, type: 'string', valid: true};
  }

  if (result && typeof result === 'object') {
   const output = result.stdout || result.output || JSON.stringify(result);
   return {
    output,
    type: 'object',
    valid: true,
    stderr: result.stderr || '',
    exitCode: result.exitCode,
   };
  }

  console.warn('[ERROR-HANDLER] ⚠️ Invalid yt-dlp result:', typeof result);
  return {output: '', type: 'invalid', valid: false, error: 'Invalid result type'};
 }

 /**
  * Check if error is recoverable (retry-worthy)
  */
 isRecoverableError(error) {
  const message = error.message?.toLowerCase() || '';

  // Non-recoverable errors (don't retry)
  const nonRecoverable = ['video unavailable', 'private video', 'video not found', 'invalid url', 'unsupported format'];

  if (nonRecoverable.some((pattern) => message.includes(pattern))) {
   return false;
  }

  // Recoverable errors (retry)
  const recoverable = ['timeout', 'connection', 'network', 'temporary', 'rate limit', 'authentication credential'];

  return recoverable.some((pattern) => message.includes(pattern));
 }

 /**
  * Check specific error types
  */
 isAuthError(error) {
  const message = error.message?.toLowerCase() || '';
  return message.includes('authentication') || message.includes('oauth') || message.includes('credential') || message.includes('login cookie');
 }

 isTimeoutError(error) {
  const message = error.message?.toLowerCase() || '';
  return message.includes('timeout') || message.includes('exceeded') || error.code === 'ETIMEDOUT';
 }

 isDestructuringError(error) {
  const message = error.message?.toLowerCase() || '';
  return message.includes('cannot destructure') || message.includes('undefined') || message.includes('cannot read property');
 }

 /**
  * Delay utility for retries
  */
 delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
 }

 /**
  * Get error statistics
  */
 getStats() {
  return {
   ...this.errorStats,
   errorRate: this.errorStats.totalErrors > 0 ? ((this.errorStats.ytdlpErrors / this.errorStats.totalErrors) * 100).toFixed(2) + '%' : '0%',
  };
 }
}

module.exports = new AzureErrorHandler();
