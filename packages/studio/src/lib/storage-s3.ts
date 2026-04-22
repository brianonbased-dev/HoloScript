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

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

let _client: S3Client | null = null;

/**
 * SEC-T12: Whitelist of allowed upload extensions. Anything outside this set
 * is rejected by `makeAssetKey` with `InvalidAssetExtensionError`.
 */
export const ALLOWED_ASSET_EXTENSIONS = new Set<string>([
  'gltf',
  'glb',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'hdr',
  'exr',
  'mp3',
  'wav',
  'ogg',
  'bin',
  'ktx2',
  'basis',
]);

/** SEC-T12: Surfaced to upload route so it can translate to a 400 response. */
export class InvalidAssetExtensionError extends Error {
  readonly ext: string;
  constructor(ext: string) {
    super(`Asset extension not allowed: ${ext || '(missing)'}`);
    this.name = 'InvalidAssetExtensionError';
    this.ext = ext;
  }
}

/** SEC-T12: Cap metadata filename length to a S3-reasonable size. */
const MAX_ORIGINAL_FILENAME = 255;

/**
 * SEC-T12: Normalize and whitelist-check the extension taken from an
 * untrusted filename. Returns the lowercase extension (no leading dot) when
 * accepted. Throws InvalidAssetExtensionError otherwise.
 */
export function resolveAssetExtension(filename: string): string {
  const raw = path.extname(filename).toLowerCase().replace(/^\./, '');
  if (!raw || !ALLOWED_ASSET_EXTENSIONS.has(raw)) {
    throw new InvalidAssetExtensionError(raw);
  }
  return raw;
}

/**
 * SEC-T12: Clamp the metadata filename to 255 chars so a huge user-supplied
 * name cannot bloat S3 object metadata or downstream logs.
 */
export function sanitizeOriginalFilename(filename: string): string {
  const cleaned = filename.slice(0, MAX_ORIGINAL_FILENAME);
  return cleaned;
}

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

export interface PresignedPutOptions {
  /**
   * SEC-T12: When set, the signed PUT requires this exact Content-Length (bytes).
   * Client must send the same byte length or S3 rejects the upload.
   */
  contentLength?: number;
}

/**
 * Generate a presigned upload URL for direct browser uploads.
 * Client can PUT directly to this URL without going through the server.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
  options?: PresignedPutOptions
): Promise<string> {
  const client = getS3Client();
  if (!client) throw new Error('S3 storage not configured');

  const contentLength = options?.contentLength;
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
      ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
    }),
    { expiresIn }
  );
}

/**
 * Generate a presigned download URL.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
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
 *
 * SEC-T12: The extension is taken via `path.extname()` (safer than
 * `split('.').pop()` which mishandles dot-only filenames) and whitelist-checked
 * against ALLOWED_ASSET_EXTENSIONS. The uniqueness component is a full
 * `crypto.randomUUID()` — the previous `Math.random().slice(2, 8)` form was
 * neither cryptographically strong nor wide enough to resist collision on a
 * busy tenant. The untrusted filename itself NEVER appears in the key path;
 * it's only preserved in S3 object metadata by the caller.
 *
 * Format: assets/{userId}/{uuid}.{ext}
 *
 * Throws `InvalidAssetExtensionError` when the filename has no extension or
 * the extension is not in the allow-list. The upload route catches this and
 * returns HTTP 400.
 */
export function makeAssetKey(userId: string, filename: string): string {
  const ext = resolveAssetExtension(filename);
  return `assets/${userId}/${randomUUID()}.${ext}`;
}
