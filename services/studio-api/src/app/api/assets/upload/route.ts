import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/api-auth';
import { getDb } from '../../../../db/client';
import { assets } from '../../../../db/schema';
import {
  isStorageConfigured,
  getPresignedUploadUrl,
  makeAssetKey,
  _uploadFile,
} from '../../../../lib/storage-s3';

/**
 * POST /api/assets/upload — Get a presigned S3 upload URL (browser-direct upload).
 *
 * Request body: { filename, contentType, name?, category? }
 * Response:     { uploadUrl, key, assetId }
 *
 * The client PUTs the file directly to S3 using the presigned URL,
 * then calls POST /api/assets to register the metadata.
 *
 * Falls back to server-side proxy upload when S3 is not configured.
 */

const ALLOWED_TYPES = new Set([
  'model/gltf-binary',
  'model/gltf+json',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/vnd.radiance',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'application/octet-stream',
]);

const _MAX_SIZE_MB = 50;

function categoryFromContentType(ct: string): string {
  if (ct.startsWith('model/')) return 'model';
  if (ct.startsWith('image/')) return ct.includes('radiance') ? 'hdri' : 'texture';
  if (ct.startsWith('audio/')) return 'audio';
  return 'other';
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: {
    filename?: string;
    contentType?: string;
    name?: string;
    category?: string;
    fileSizeBytes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { filename, contentType, name, fileSizeBytes } = body;
  if (!filename || !contentType) {
    return NextResponse.json(
      { error: 'filename and contentType are required' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 400 }
    );
  }

  const key = makeAssetKey(userId, filename);
  const category = body.category || categoryFromContentType(contentType);
  const assetName = name || filename;

  if (!isStorageConfigured()) {
    // No S3 configured — return a local upload endpoint instead
    return NextResponse.json({
      uploadUrl: null,
      key,
      method: 'local',
      localUploadEndpoint: '/api/assets/process',
      message: 'S3 not configured. Use multipart upload to /api/assets/process instead.',
    });
  }

  if (fileSizeBytes === undefined || typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes)) {
    return NextResponse.json(
      {
        error: 'fileSizeBytes is required for presigned upload',
        hint: 'Send the byte size of the file you will PUT so the URL can be bound to Content-Length.',
      },
      { status: 400 }
    );
  }
  const maxBytes = _MAX_SIZE_MB * 1024 * 1024;
  if (fileSizeBytes <= 0 || fileSizeBytes > maxBytes) {
    return NextResponse.json(
      { error: `fileSizeBytes must be between 1 and ${maxBytes} (${_MAX_SIZE_MB} MiB cap)` },
      { status: 400 }
    );
  }

  const uploadUrl = await getPresignedUploadUrl(key, contentType, 3600, {
    contentLength: Math.floor(fileSizeBytes),
  });

  // Pre-register asset in database so client can reference it immediately
  const db = getDb();
  let assetId = key;
  if (db) {
    const [row] = await db
      .insert(assets)
      .values({
        ownerId: userId,
        name: assetName,
        type: category,
        url: '', // Will be populated after upload completes
        metadata: { key, contentType, status: 'uploading' },
      })
      .returning();
    assetId = row.id;
  }

  return NextResponse.json({
    uploadUrl,
    key,
    assetId,
    method: 'presigned',
    expiresIn: 3600,
  });
}
