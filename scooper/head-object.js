#!/usr/bin/env node

/**
 * Script to get object HEAD metadata from S3-compatible storage
 * 
 * Usage:
 *   node head-object.js <objectKey>
 * 
 * Environment Variables:
 *   S3_BUCKET              Bucket name (required)
 *   S3_ENDPOINT           Custom S3 endpoint (optional)
 *   S3_REGION             AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID     AWS access key ID
 *   AWS_SECRET_ACCESS_KEY AWS secret access key
 * 
 * Examples:
 *   node head-object.js path/to/file.wacz
 *   node head-object.js file.wacz
 */

import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node head-object.js <objectKey>');
    console.error('');
    console.error('Environment Variables:');
    console.error('  S3_BUCKET              Bucket name (required)');
    console.error('  S3_ENDPOINT           Custom S3 endpoint (optional)');
    console.error('  S3_REGION             AWS region (default: us-east-1)');
    console.error('  AWS_ACCESS_KEY_ID     AWS access key ID');
    console.error('  AWS_SECRET_ACCESS_KEY AWS secret access key');
    console.error('');
    console.error('Examples:');
    console.error('  node head-object.js path/to/file.wacz');
    console.error('  node head-object.js file.wacz');
    process.exit(1);
  }

  const objectKey = args[0];
  const bucketName = process.env.S3_BUCKET;
  
  if (!bucketName) {
    console.error('Error: S3_BUCKET environment variable is required');
    process.exit(1);
  }

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  return {
    bucketName,
    objectKey,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
  };
}

async function headObject(config) {
  const { bucketName, objectKey, endpoint, region, accessKeyId, secretAccessKey } = config;

  // Configure S3 client
  const clientConfig = {
    region,
  };

  // Add credentials if provided
  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
    };
  }

  // Add custom endpoint if provided
  if (endpoint) {
    clientConfig.endpoint = endpoint;
    // For custom endpoints, we might need to disable SSL verification or adjust settings
    // Uncomment if needed:
    // clientConfig.forcePathStyle = true; // Use path-style URLs
  }

  const s3Client = new S3Client(clientConfig);

  try {
    console.log(`Getting HEAD for object: ${objectKey}`);
    console.log(`Bucket: ${bucketName}`);
    if (endpoint) {
      console.log(`Endpoint: ${endpoint}`);
    }
    console.log(`Region: ${region}`);
    console.log('');

    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const response = await s3Client.send(command);

    // Output metadata
    console.log('Object Metadata:');
    console.log('===============');
    console.log(`ContentLength: ${response.ContentLength} bytes`);
    console.log(`ContentType: ${response.ContentType || 'N/A'}`);
    console.log(`ETag: ${response.ETag}`);
    console.log(`LastModified: ${response.LastModified?.toISOString() || 'N/A'}`);
    
    if (response.Metadata && Object.keys(response.Metadata).length > 0) {
      console.log('\nCustom Metadata:');
      for (const [key, value] of Object.entries(response.Metadata)) {
        console.log(`  ${key}: ${value}`);
      }
    }

    if (response.CacheControl) {
      console.log(`CacheControl: ${response.CacheControl}`);
    }
    if (response.ContentEncoding) {
      console.log(`ContentEncoding: ${response.ContentEncoding}`);
    }
    if (response.ContentDisposition) {
      console.log(`ContentDisposition: ${response.ContentDisposition}`);
    }
    if (response.ContentLanguage) {
      console.log(`ContentLanguage: ${response.ContentLanguage}`);
    }
    if (response.Expires) {
      console.log(`Expires: ${response.Expires.toISOString()}`);
    }
    if (response.StorageClass) {
      console.log(`StorageClass: ${response.StorageClass}`);
    }
    if (response.ServerSideEncryption) {
      console.log(`ServerSideEncryption: ${response.ServerSideEncryption}`);
    }

    // Return full response for programmatic use
    return response;

  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.error(`Error: Object not found - ${objectKey}`);
      console.error(`Bucket: ${bucketName}`);
    } else if (err.name === 'NoSuchBucket' || err.$metadata?.httpStatusCode === 404) {
      console.error(`Error: Bucket not found - ${bucketName}`);
    } else {
      console.error('Error:', err.message);
      if (err.$metadata) {
        console.error('HTTP Status:', err.$metadata.httpStatusCode);
        console.error('Request ID:', err.$metadata.requestId);
      }
    }
    process.exit(1);
  }
}

// Run if executed directly
const config = parseArgs();
headObject(config).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

