// ================================
// 🔄 ASYNC JOB PROCESSING SYSTEM
// ================================

/**
 * Job processing system to handle long-running video downloads asynchronously
 */
class AsyncJobManager {
 constructor() {
  this.jobs = new Map(); // Store job status and data
  this.activeJobs = new Set(); // Track active job IDs
  this.maxConcurrentJobs = 3; // Limit concurrent processing
  this.jobTimeout = 900000; // 15 minutes max job time
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
     this.failJob(jobId, 'Job timed out after 15 minutes');
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
  * Mark job as failed
  */
 failJob(jobId, errorMessage) {
  if (this.jobs.has(jobId)) {
   const job = this.jobs.get(jobId);
   job.status = 'failed';
   job.message = errorMessage;
   job.error = errorMessage;
   job.completedAt = new Date().toISOString();
   this.activeJobs.delete(jobId);
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
