import axios from 'axios';

/**
 * Schedules a transcript scraping job on Zyte Scrapy Cloud
 * @param {string} videoUrl - The YouTube video URL to scrape transcript from
 * @returns {Promise<string>} - The job ID from Zyte API
 * @throws {Error} - If environment variables are missing or API call fails
 */
export async function scheduleZyteJob(videoUrl) {
 try {
  // Check for required environment variables
  const zyteApiKey = process.env.ZYTE_API_KEY;
  const zyteProjectId = process.env.ZYTE_PROJECT_ID;

  if (!zyteApiKey) {
   throw new Error('ZYTE_API_KEY environment variable is required');
  }

  if (!zyteProjectId) {
   throw new Error('ZYTE_PROJECT_ID environment variable is required');
  }

  // Convert project ID to integer
  const projectId = parseInt(zyteProjectId, 10);
  if (isNaN(projectId)) {
   throw new Error('ZYTE_PROJECT_ID must be a valid integer');
  }

  console.log(`[ZYTE] Scheduling job for video: ${videoUrl}`);

  // Prepare the request configuration
  const config = {
   method: 'POST',
   url: 'https://app.zyte.com/api/run.json',
   auth: {
    username: zyteApiKey,
    password: '', // Empty password as per Zyte API requirements
   },
   headers: {
    'Content-Type': 'application/json',
   },
   data: {
    project: projectId,
    spider: 'transcript',
    video_url: videoUrl,
   },
  };

  // Make the API request
  console.log('[ZYTE] Making API request to Zyte Scrapy Cloud...');
  const response = await axios(config);

  // Check if response is successful
  if (response.status !== 200) {
   throw new Error(`Zyte API returned status ${response.status}`);
  }

  const {status, jobid} = response.data;

  console.log(`[ZYTE] ✅ Job scheduled successfully - Status: ${status}, Job ID: ${jobid}`);

  return jobid;
 } catch (error) {
  console.error('[ZYTE] ❌ Failed to schedule Zyte job:', error.message);

  // Provide more specific error messages
  if (error.response) {
   // The request was made and the server responded with a status code
   // that falls out of the range of 2xx
   const statusCode = error.response.status;
   const errorData = error.response.data;

   console.error(`[ZYTE] API Error - Status: ${statusCode}, Data:`, errorData);
   throw new Error(`Failed to schedule Zyte job: API returned ${statusCode} - ${JSON.stringify(errorData)}`);
  } else if (error.request) {
   // The request was made but no response was received
   console.error('[ZYTE] Network error - No response received');
   throw new Error('Failed to schedule Zyte job: Network error - unable to reach Zyte API');
  } else {
   // Something happened in setting up the request that triggered an Error
   throw new Error(`Failed to schedule Zyte job: ${error.message}`);
  }
 }
}

/**
 * Checks the status of a Zyte job
 * @param {string} jobId - The job ID to check
 * @returns {Promise<Object>} - The job status response
 */
export async function checkZyteJobStatus(jobId) {
 try {
  const zyteApiKey = process.env.ZYTE_API_KEY;
  const zyteProjectId = process.env.ZYTE_PROJECT_ID;

  if (!zyteApiKey || !zyteProjectId) {
   throw new Error('Zyte API credentials are required');
  }

  const response = await axios({
   method: 'GET',
   url: `https://app.zyte.com/api/jobs/list.json?project=${zyteProjectId}&job=${jobId}`,
   auth: {
    username: zyteApiKey,
    password: '',
   },
  });

  return response.data;
 } catch (error) {
  console.error('[ZYTE] Failed to check job status:', error.message);
  throw new Error(`Failed to check Zyte job status: ${error.message}`);
 }
}

/**
 * Retrieves the results/items from a completed Zyte job
 * @param {string} jobId - The job ID to get results from
 * @returns {Promise<Array>} - Array of scraped items
 */
export async function getZyteJobResults(jobId) {
 try {
  const zyteApiKey = process.env.ZYTE_API_KEY;
  const zyteProjectId = process.env.ZYTE_PROJECT_ID;

  if (!zyteApiKey || !zyteProjectId) {
   throw new Error('Zyte API credentials are required');
  }

  const response = await axios({
   method: 'GET',
   url: `https://app.zyte.com/api/items.json?project=${zyteProjectId}&job=${jobId}`,
   auth: {
    username: zyteApiKey,
    password: '',
   },
  });

  return response.data;
 } catch (error) {
  console.error('[ZYTE] Failed to get job results:', error.message);
  throw new Error(`Failed to get Zyte job results: ${error.message}`);
 }
}

/**
 * Polls for job completion and retrieves the transcript result
 * @param {string} jobId - The job ID to poll and get results from
 * @returns {Promise<string>} - The transcript text from the scraped data
 * @throws {Error} - If job fails, times out, or no transcript found
 */
export async function getZyteJobResult(jobId) {
 // Polling configuration
 const MAX_POLLS = 20;
 const POLL_INTERVAL_MS = 10000; // 10 seconds

 try {
  const zyteApiKey = process.env.ZYTE_API_KEY;
  const zyteProjectId = process.env.ZYTE_PROJECT_ID;

  if (!zyteApiKey) {
   throw new Error('ZYTE_API_KEY environment variable is required');
  }

  if (!zyteProjectId) {
   throw new Error('ZYTE_PROJECT_ID environment variable is required');
  }

  console.log(`[ZYTE] Starting polling for job: ${jobId}`);

  // Polling loop
  for (let poll = 0; poll < MAX_POLLS; poll++) {
   console.log(`[ZYTE] Poll ${poll + 1}/${MAX_POLLS} - Checking job status...`);

   try {
    // Check job status
    const statusResponse = await axios({
     method: 'GET',
     url: `https://app.zyte.com/api/jobs/list.json?project=${zyteProjectId}&job=${jobId}`,
     auth: {
      username: zyteApiKey,
      password: '',
     },
    });

    const jobs = statusResponse.data.jobs || [];

    if (jobs.length === 0) {
     throw new Error(`Job ${jobId} not found`);
    }

    const job = jobs[0];
    const jobState = job.state;

    console.log(`[ZYTE] Job ${jobId} state: ${jobState}`);

    if (jobState === 'finished') {
     console.log(`[ZYTE] ✅ Job ${jobId} completed successfully`);
     break;
    } else if (jobState === 'running' || jobState === 'pending') {
     console.log(`[ZYTE] Job ${jobId} still ${jobState}, waiting ${POLL_INTERVAL_MS / 1000}s...`);

     // Wait before next poll (unless it's the last iteration)
     if (poll < MAX_POLLS - 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
     }
    } else {
     // Job failed, cancelled, deleted, etc.
     const closeReason = job.close_reason || 'Unknown reason';
     throw new Error(`Job ${jobId} failed with state: ${jobState}. Reason: ${closeReason}`);
    }
   } catch (error) {
    if (error.message.includes('Job') && error.message.includes('failed')) {
     // Re-throw job failure errors
     throw error;
    }

    console.error(`[ZYTE] Error during poll ${poll + 1}:`, error.message);

    // For network errors, continue polling unless it's the last attempt
    if (poll === MAX_POLLS - 1) {
     throw new Error(`Failed to check job status after ${MAX_POLLS} attempts: ${error.message}`);
    }

    console.log(`[ZYTE] Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
   }
  }

  // Check if we exited the loop due to timeout
  const finalStatusResponse = await axios({
   method: 'GET',
   url: `https://app.zyte.com/api/jobs/list.json?project=${zyteProjectId}&job=${jobId}`,
   auth: {
    username: zyteApiKey,
    password: '',
   },
  });

  const finalJobs = finalStatusResponse.data.jobs || [];
  if (finalJobs.length === 0 || finalJobs[0].state !== 'finished') {
   throw new Error(`Job polling timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000} seconds. Job did not complete.`);
  }

  console.log(`[ZYTE] Fetching scraped data for job: ${jobId}`);

  // Fetch the scraped items
  const itemsResponse = await axios({
   method: 'GET',
   url: `https://storage.sync.cloud.zyte.com/items/${jobId}`,
   auth: {
    username: zyteApiKey,
    password: '',
   },
   headers: {
    Accept: 'application/x-jsonlines',
   },
  });

  const itemsData = itemsResponse.data;

  if (!itemsData || itemsData.trim() === '') {
   throw new Error('No scraped data found for this job');
  }

  console.log(`[ZYTE] Raw items response (first 200 chars): ${itemsData.substring(0, 200)}...`);

  // Parse newline-delimited JSON
  const lines = itemsData.trim().split('\n');

  if (lines.length === 0) {
   throw new Error('No items found in scraped data');
  }

  // Parse the first item (should contain our transcript)
  const firstItem = JSON.parse(lines[0]);

  if (!firstItem.transcript_text) {
   throw new Error('No transcript_text found in scraped item');
  }

  const transcriptText = firstItem.transcript_text;
  console.log(`[ZYTE] ✅ Successfully retrieved transcript (${transcriptText.length} characters)`);

  return transcriptText;
 } catch (error) {
  console.error('[ZYTE] Error in getZyteJobResult:', error.message);
  throw new Error(`Failed to get Zyte job result: ${error.message}`);
 }
}

export default {
 scheduleZyteJob,
 checkZyteJobStatus,
 getZyteJobResults,
 getZyteJobResult,
};
