# Scooper

Scooper is a service that scoops URLs and saves them as WACZ archives.

It utilizes Harvard LIL's scoop tool.

And it stores on Warlus using S3-compatible Nami cloud service. So get S3 configs from Nami cloud.

## Setup

1. Install Node.js dependencies:
```bash
npm install
```

2. (Optional) Install yt-dlp for YouTube/video platform support:
   ```bash
   # macOS
   brew install yt-dlp
   
   # Linux (Ubuntu/Debian)
   sudo apt-get install yt-dlp
   
   # Or download from: https://github.com/yt-dlp/yt-dlp/releases
   ```
   **Note:** yt-dlp is only needed if you plan to scoop YouTube videos or similar platforms. For regular web pages, it's not required.

3. Create a `.env` file with your secret:
```
SECRET=your-secret-key-here
PORT=3000

# Optional: S3 configuration for automatic file uploads
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_PREFIX=archives
S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

**Note:** 
- If S3 credentials are not provided, the SDK will use the default credential chain (IAM roles, environment variables, or AWS credentials file).
- `S3_ENDPOINT` is optional and only needed for S3-compatible services (e.g., MinIO, LocalStack). For AWS S3, leave it unset to use the default endpoint.

## Usage

Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## API Endpoint



### POST /scoop-async

Scoops a URL asynchronously and returns immediately with a job ID. The job processes in the background and can optionally send a callback when complete.

**Request Body:**
```json
{
  "url": "https://example.com",
  "referenceId": "A1B2-C3D5",
  "secret": "your-secret-key",
  "callbackUrl": "https://your-server.com/webhook"
}
```

**Response (Accepted):**
```json
{
  "success": true,
  "message": "Scoop job created",
  "jobId": "job_1234567890_abc123",
  "referenceId": "A1B2-C3D5",
  "status": "pending",
  "statusUrl": "/scoop-status/job_1234567890_abc123",
  "callbackUrl": "https://your-server.com/webhook"
}
```

**Status Codes:**
- 202: Accepted (job created)
- 400: Bad Request (missing fields, invalid format)
- 401: Unauthorized (invalid secret)
- 500: Internal Server Error

**Callback Payload (when job completes):**
```json
{
  "jobId": "job_1234567890_abc123",
  "status": "completed",
  "referenceId": "A1B2-C3D5",
  "url": "https://example.com",
  "filename": "A1B2-C3D5.wacz",
  "completedAt": "2024-01-01T12:00:00.000Z",
  "s3": {
    "s3Url": "s3://bucket-name/A1B2-C3D5.wacz",
    "s3PublicUrl": "https://bucket-name.s3.region.amazonaws.com/A1B2-C3D5.wacz",
    "s3Key": "A1B2-C3D5.wacz",
    "bucket": "bucket-name"
  }
}
```

### GET /scoop-status/:jobId

Check the status of an async scoop job.

**Response:**
```json
{
  "jobId": "job_1234567890_abc123",
  "status": "completed",
  "referenceId": "A1B2-C3D5",
  "url": "https://example.com",
  "filename": "A1B2-C3D5.wacz",
  "startedAt": "2024-01-01T12:00:00.000Z",
  "completedAt": "2024-01-01T12:05:00.000Z",
  "s3": {
    "s3Url": "s3://bucket-name/A1B2-C3D5.wacz",
    "s3PublicUrl": "https://bucket-name.s3.region.amazonaws.com/A1B2-C3D5.wacz",
    "s3Key": "A1B2-C3D5.wacz",
    "bucket": "bucket-name"
  }
}
```

**Job Status Values:**
- `pending`: Job created but not started
- `processing`: Job is currently running
- `completed`: Job finished successfully
- `failed`: Job failed with an error

### GET /health

Health check endpoint to verify the service is running.

**Response:**
```json
{
  "status": "ok"
}
```

## Reference ID Format

The reference ID must match the format: `A1B2-C3D5` (4 alphanumeric characters, dash, 4 alphanumeric characters).

