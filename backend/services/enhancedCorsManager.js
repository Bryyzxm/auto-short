// ================================
// 🌐 ENHANCED CORS MIDDLEWARE
// ================================

const cors = require('cors');

/**
 * Enhanced CORS configuration for handling all response types including errors
 */
class EnhancedCorsManager {
 constructor() {
  this.productionOrigins = ['https://auto-short.azurewebsites.net', 'https://autoshort.azurewebsites.net', 'https://www.auto-short.com', 'https://auto-short.com', 'https://auto-short.vercel.app'];

  this.developmentOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:5173'];

  this.allowedOrigins = process.env.NODE_ENV === 'production' ? this.productionOrigins : [...this.productionOrigins, ...this.developmentOrigins];
 }

 /**
  * Get standard CORS configuration
  */
 getCorsOptions() {
  return {
   origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);

    if (this.allowedOrigins.includes(origin)) {
     return callback(null, true);
    }

    console.log(`❌ [CORS] Blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'), false);
   },
   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
   exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-Total-Count', 'X-Job-ID'],
   maxAge: 86400, // 24 hours preflight cache
  };
 }

 /**
  * Enhanced CORS middleware that handles error responses
  */
 getEnhancedCorsMiddleware() {
  const standardCors = cors(this.getCorsOptions());

  return (req, res, next) => {
   // Apply standard CORS
   standardCors(req, res, (err) => {
    if (err) {
     // CORS error - send proper CORS headers with error
     this.addCorsHeadersToResponse(res, req.headers.origin);
     return res.status(403).json({
      success: false,
      error: 'CORS_ERROR',
      message: 'Origin not allowed by CORS policy',
      timestamp: new Date().toISOString(),
     });
    }

    // Add our custom error handler for downstream errors
    const originalSend = res.send;
    const originalJson = res.json;
    const originalStatus = res.status;

    // Store reference to corsManager instance for proper context
    const corsManager = this;

    // Override response methods to ensure CORS headers
    res.send = function (body) {
     corsManager.addCorsHeadersToResponse(res, req.headers.origin);
     return originalSend.call(res, body);
    };

    res.json = function (obj) {
     corsManager.addCorsHeadersToResponse(res, req.headers.origin);
     return originalJson.call(res, obj);
    };

    res.status = function (code) {
     corsManager.addCorsHeadersToResponse(res, req.headers.origin);
     return originalStatus.call(res, code);
    };

    next();
   });
  };
 }

 /**
  * Manually add CORS headers to response (for error scenarios)
  */
 addCorsHeadersToResponse(res, origin) {
  if (!origin || this.allowedOrigins.includes(origin)) {
   res.header('Access-Control-Allow-Origin', origin || '*');
   res.header('Access-Control-Allow-Credentials', 'true');
   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
   res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range, X-Total-Count, X-Job-ID');
  }
 }

 /**
  * Error handler middleware that ensures CORS headers on all errors
  */
 getErrorCorsMiddleware() {
  return (err, req, res, next) => {
   // Ensure CORS headers are present on error responses
   this.addCorsHeadersToResponse(res, req.headers.origin);

   // Handle different error types
   if (err.code === 'TIMEOUT') {
    return res.status(408).json({
     success: false,
     error: 'REQUEST_TIMEOUT',
     message: 'Request took too long to process. Please try again.',
     timestamp: new Date().toISOString(),
    });
   }

   if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
    return res.status(504).json({
     success: false,
     error: 'GATEWAY_TIMEOUT',
     message: 'Service temporarily unavailable. Please try again in a moment.',
     timestamp: new Date().toISOString(),
    });
   }

   // Generic error handling
   const statusCode = err.statusCode || err.status || 500;
   const errorResponse = {
    success: false,
    error: err.code || 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
   };

   // Add stack trace in development
   if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
   }

   console.error(`❌ [Error] ${req.method} ${req.path}:`, err);

   res.status(statusCode).json(errorResponse);
  };
 }

 /**
  * Timeout middleware with CORS support
  */
 getTimeoutMiddleware(timeoutMs = 240000) {
  // 4 minutes (Azure limit)
  return (req, res, next) => {
   const timeout = setTimeout(() => {
    if (!res.headersSent) {
     this.addCorsHeadersToResponse(res, req.headers.origin);
     res.status(408).json({
      success: false,
      error: 'REQUEST_TIMEOUT',
      message: `Request timed out after ${timeoutMs / 1000} seconds`,
      timestamp: new Date().toISOString(),
     });
    }
   }, timeoutMs);

   // Clear timeout when response is sent
   res.on('finish', () => clearTimeout(timeout));
   res.on('close', () => clearTimeout(timeout));

   next();
  };
 }
}

// Export singleton instance
const corsManager = new EnhancedCorsManager();

module.exports = {
 EnhancedCorsManager,
 corsManager,
 corsMiddleware: corsManager.getEnhancedCorsMiddleware(),
 errorCorsMiddleware: corsManager.getErrorCorsMiddleware(),
 timeoutMiddleware: (timeoutMs) => corsManager.getTimeoutMiddleware(timeoutMs),
};
