// ================================
// 🔄 ASYNC JOB PROCESSING SYSTEM
// ================================

const {v4: uuidv4} = require('uuid');

/**
 * Job processing system to handle long-running video downloads asynchronously
 */
class AsyncJobManager {
 constructor() {
  this.jobs = new Map(); // Store job status and data
  this.activeJobs = new Set(); // Track active job IDs
  this.maxConcurrentJobs = 3; // Limit concurrent processing
  this.jobTimeout = 1800000; // 30 minutes max job time (increased for video processing)
  this.cleanupInterval = 300000; // Clean completed jobs every 5 minutes

  // Start cleanup timer
  setInterval(() => this.cleanupCompletedJobs(), this.cleanupInterval);
 }

 /**
  * Create a new job and start processing
  */
 async createJob(jobType, params, processingFunction) {
  const jobId = uuidv4();

  // Check if we're at max capacity
  if (this.activeJobs.size >= this.maxConcurrentJobs) {
   throw new Error('Server at maximum capacity. Please try again in a few minutes.');
  }

  // Initialize job
  const job = {
   id: jobId,
   type: jobType,
   status: 'queued',
   progress: 0,
   message: 'Job queued for processing',
   createdAt: new Date().toISOString(),
   startedAt: null,
   completedAt: null,
   result: null,
   error: null,
   params: params,
  };

  this.jobs.set(jobId, job);
  this.activeJobs.add(jobId);

  // Start processing immediately
  this.processJobAsync(jobId, processingFunction);

  return jobId;
 }

 /**
  * Process job asynchronously without blocking
  */
 async processJobAsync(jobId, processingFunction) {
  const job = this.jobs.get(jobId);
  if (!job) return;

  try {
   // Mark as started
   job.status = 'processing';
   job.startedAt = new Date().toISOString();
   job.message = 'Processing started';

   console.log(`🚀 [AsyncJob] Starting job ${jobId} of type ${job.type}`);

   // Set timeout for job
   const timeoutId = setTimeout(() => {
    if (this.jobs.has(jobId) && this.jobs.get(jobId).status === 'processing') {
     this.failJob(jobId, 'Job timed out after 30 minutes - video processing took too long');
    }
   }, this.jobTimeout);

   // Execute the processing function with progress callback
   const progressCallback = (progress, message) => {
    if (this.jobs.has(jobId)) {
     const currentJob = this.jobs.get(jobId);
     currentJob.progress = progress;
     currentJob.message = message;
    }
   };

   const result = await processingFunction(job.params, progressCallback);

   // Clear timeout
   clearTimeout(timeoutId);

   // Mark as completed
   if (this.jobs.has(jobId)) {
    job.status = 'completed';
    job.progress = 100;
    job.message = 'Processing completed successfully';
    job.completedAt = new Date().toISOString();
    job.result = result;
    this.activeJobs.delete(jobId);

    console.log(`✅ [AsyncJob] Completed job ${jobId} successfully`);
   }
  } catch (error) {
   console.error(`❌ [AsyncJob] Failed job ${jobId}:`, error);
   this.failJob(jobId, error.message || 'Unknown error occurred');
  }
 }

 /**
  * Mark job as failed with detailed error categorization
  */
 failJob(jobId, errorMessage) {
  if (this.jobs.has(jobId)) {
   const job = this.jobs.get(jobId);

   // Categorize the error for better user feedback
   let userFriendlyMessage = errorMessage;
   if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    userFriendlyMessage = 'Video processing took too long. This may happen with very large videos. Try using a shorter video clip.';
   } else if (errorMessage.includes('FFmpeg') || errorMessage.includes('ffmpeg')) {
    userFriendlyMessage = 'Video encoding failed. The video format may not be supported or the file may be corrupted.';
   } else if (errorMessage.includes('download') || errorMessage.includes('yt-dlp')) {
    userFriendlyMessage = 'Failed to download video from YouTube. The video may be private, deleted, or restricted.';
   } else if (errorMessage.includes('format') || errorMessage.includes('quality')) {
    userFriendlyMessage = 'Video format check failed. Try with a different video or check if the video is available.';
   }

   job.status = 'failed';
   job.message = userFriendlyMessage;
   job.error = errorMessage; // Keep technical error for debugging
   job.completedAt = new Date().toISOString();
   this.activeJobs.delete(jobId);

   console.error(`❌ [AsyncJob] Job ${jobId} failed: ${errorMessage}`);
  }
 }

 /**
  * Get job status
  */
 getJobStatus(jobId) {
  return this.jobs.get(jobId) || null;
 }

 /**
  * Get all jobs for debugging
  */
 getAllJobs() {
  return Array.from(this.jobs.values());
 }

 /**
  * Clean up completed jobs older than 1 hour
  */
 cleanupCompletedJobs() {
  const oneHourAgo = new Date(Date.now() - 3600000);

  for (const [jobId, job] of this.jobs.entries()) {
   if (job.status === 'completed' || job.status === 'failed') {
    const completedAt = new Date(job.completedAt);
    if (completedAt < oneHourAgo) {
     this.jobs.delete(jobId);
     console.log(`🧹 [AsyncJob] Cleaned up old job ${jobId}`);
    }
   }
  }
 }
}

// Global job manager instance
const jobManager = new AsyncJobManager();

module.exports = {AsyncJobManager, jobManager};
