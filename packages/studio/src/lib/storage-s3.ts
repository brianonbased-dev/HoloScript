/**
 * S3-compatible storage client for HoloScript Studio.
 *
 * Supports AWS S3, Cloudflare R2, MinIO, and any S3-compatible provider.
 * Configured via environment variables:
 *   - S3_BUCKET
 *   - S3_REGION
 *   - S3_ACCESS_KEY_ID
 *   - S3_SECRET_ACCESS_KEY
 *   - S3_ENDPOINT (optional, for R2/MinIO)
 *
 * Falls back gracefully when credentials are not configured.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (_client) return _client;

  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  _client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!process.env.S3_ENDPOINT, // Required for R2/MinIO
  });

  return _client;
}

function getBucket(): string {
  return process.env.S3_BUCKET || 'holoscript-studio-assets';
}

/**
 * Check if S3 storage is configured.
 */
export function isStorageConfigured(): boolean {
  return getS3Client() !== null;
}

/**
 * Upload a file to S3.
 * Returns the public URL of the uploaded file.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  if (!client) throw new Error('S3 storage not configured');

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // Return the public URL
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    // R2/MinIO: construct URL from endpoint
    return `${endpoint}/${getBucket()}/${key}`;
  }
  return `https://${getBucket()}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

/**
 * Generate a presigned upload URL for direct browser uploads.
 * Client can PUT directly to this URL without going through the server.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const client = getS3Client();
  if (!client) throw new Error('S3 storage not configured');

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/**
 * Generate a presigned download URL.
 */
export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getS3Client();
  if (!client) throw new Error('S3 storage not configured');

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
    { expiresIn }
  );
}

/**
 * Delete a file from S3.
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client();
  if (!client) throw new Error('S3 storage not configured');

  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}

/**
 * Generate a unique asset key for uploads.
 * Format: assets/{userId}/{timestamp}-{random}.{ext}
 */
export function makeAssetKey(userId: string, filename: string): string {
  const ext = filename.split('.').pop() || 'bin';
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `assets/${userId}/${timestamp}-${random}.${ext}`;
}
