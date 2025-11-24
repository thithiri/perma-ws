import express from 'express';
import fs from 'fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Scoop } from '@harvard-lil/scoop';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || '';

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_PREFIX = process.env.S3_PREFIX || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT;

// Initialize S3 client if bucket is configured
let s3Client = null;
if (S3_BUCKET) {
  const clientConfig = {
    region: S3_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // Use default credential chain if not provided
  };

  // Add custom endpoint if provided (useful for S3-compatible services)
  if (S3_ENDPOINT) {
    clientConfig.endpoint = S3_ENDPOINT;
  }

  s3Client = new S3Client(clientConfig);
}

// Job storage for async scoop requests
const jobs = new Map();

// Middleware to parse JSON bodies
app.use(express.json());

function isValidReferenceId(refId) {
  const pattern = /^[A-Z0-9]{1,8}-[A-Z0-9]{4,5}$/;
  return pattern.test(refId);
}


// Upload file to S3
async function uploadToS3(filePath, filename) {
  if (!s3Client || !S3_BUCKET) {
    return null;
  }

  try {
    const fileContent = await fs.readFile(filePath);
    // const s3Key = S3_PREFIX ? `${S3_PREFIX}/${filename}` : filename;
    const s3Key = `${filename.split('.')[0]}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/wacz',
    });

    await s3Client.send(command);

    const s3Url = `s3://${S3_BUCKET}/${s3Key}`;
    const s3PublicUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;

    console.log(`File uploaded to S3: ${s3Url}`);
    return {
      s3Url,
      s3PublicUrl,
      s3Key,
      bucket: S3_BUCKET,
    };
  } catch (err) {
    console.error(`Error uploading to S3:`, err);
    throw err;
  }
}

// Send callback notification
async function sendCallback(callbackUrl, payload) {
  if (!callbackUrl) {
    return;
  }

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Callback to ${callbackUrl} failed with status ${response.status}`);
    } else {
      console.log(`Callback to ${callbackUrl} sent successfully`);
    }
  } catch (err) {
    console.error(`Error sending callback to ${callbackUrl}:`, err.message);
  }
}

// Process scoop job in background
async function processScoopJob(jobId, url, referenceId, callbackUrl) {
  const job = jobs.get(jobId);
  
  try {
    jobs.set(jobId, { 
      ...job,
      status: 'processing', 
      startedAt: new Date().toISOString() 
    });

    // Scoop the URL
    const capture = await Scoop.capture(url, {
      screenshot: false,
      pdfSnapshot: false,
      captureVideoAsAttachment: false,
      maxVideoCaptureSize: 0,
      maxAudioCaptureSize: 0,
      autoPlayMedia: false,
      autoScroll: true,
    });
    const wacz = await capture.toWACZ();

    // Save the wacz archive with reference ID as name
    const filename = `${referenceId}.wacz`;
    await fs.writeFile(filename, Buffer.from(wacz));

    // Upload to S3 if configured
    let s3Info = null;
    try {
      s3Info = await uploadToS3(filename, filename);
    } catch (err) {
      console.error(`Failed to upload ${filename} to S3:`, err);
      // Continue even if S3 upload fails
    }

    const jobData = {
      status: 'completed',
      referenceId,
      url,
      filename,
      startedAt: jobs.get(jobId)?.startedAt,
      completedAt: new Date().toISOString(),
      ...(s3Info && { s3: s3Info })
    };

    jobs.set(jobId, jobData);

    // Send callback if provided
    if (callbackUrl) {
      await sendCallback(callbackUrl, {
        jobId,
        status: 'completed',
        referenceId,
        url,
        filename,
        completedAt: jobData.completedAt,
        ...(s3Info && { s3: s3Info })
      });
    }
  } catch (err) {
    console.error(`Error processing scoop job ${jobId}:`, err);
    
    const jobData = {
      status: 'failed',
      referenceId,
      url,
      error: err.message,
      startedAt: jobs.get(jobId)?.startedAt,
      failedAt: new Date().toISOString()
    };

    jobs.set(jobId, jobData);

    // Send callback if provided
    if (callbackUrl) {
      await sendCallback(callbackUrl, {
        jobId,
        status: 'failed',
        referenceId,
        url,
        error: err.message,
        failedAt: jobData.failedAt
      });
    }
  }
}

// Async endpoint to scoop a URL
app.post('/scoop-async', async (req, res) => {
  try {
    const { url, referenceId, secret, callbackUrl } = req.body;

    // Validate required fields
    if (!url || !referenceId || !secret) {
      return res.status(400).json({
        error: 'Missing required fields: url, referenceId, and secret are required'
      });
    }

    // Check secret
    if (secret !== SECRET) {
      return res.status(401).json({
        error: 'Invalid secret'
      });
    }

    // Validate reference ID format
    if (!isValidReferenceId(referenceId)) {
      return res.status(400).json({
        error: 'Invalid reference ID format. Expected format: A1B2-C3D4 (1-8 alphanumeric characters, hyphen, 4 alphanumeric characters)'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid URL format'
      });
    }

    // Validate callback URL format if provided
    if (callbackUrl) {
      try {
        new URL(callbackUrl);
      } catch (e) {
        return res.status(400).json({
          error: 'Invalid callback URL format'
        });
      }
    }

    // Use referenceId as jobId
    const jobId = referenceId;

    // Check if job already exists
    if (jobs.has(jobId)) {
      return res.status(409).json({
        error: 'Job with this referenceId already exists',
        jobId,
        referenceId
      });
    }

    // Initialize job status
    jobs.set(jobId, {
      status: 'pending',
      referenceId,
      url,
      callbackUrl: callbackUrl || null,
      createdAt: new Date().toISOString()
    });

    // Start processing in background (don't await)
    processScoopJob(jobId, url, referenceId, callbackUrl).catch(err => {
      console.error(`Background job ${jobId} failed:`, err);
    });

    // Return immediately with job ID
    res.status(202).json({
      success: true,
      message: 'Scoop job created',
      jobId,
      referenceId,
      status: 'pending',
      statusUrl: `/scoop-status/${jobId}`,
      ...(callbackUrl && { callbackUrl })
    });

  } catch (err) {
    console.error('Error creating scoop job:', err);
    
    res.status(500).json({
      error: 'Failed to create scoop job',
      message: err.message
    });
  }
});

// Endpoint to check scoop job status
app.get('/scoop-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      jobId
    });
  }

  res.json({
    jobId,
    ...job
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!SECRET) {
    console.warn('WARNING: SECRET environment variable is not set!');
  }
  if (!S3_BUCKET) {
    console.warn('INFO: S3_BUCKET not configured. Files will only be saved locally.');
  } else {
    console.log(`S3 upload enabled: bucket=${S3_BUCKET}, region=${S3_REGION}`);
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
