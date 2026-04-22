export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../../../db/client';
import { assets } from '../../../../db/schema';
import { getSession } from '../../../../lib/api-auth';
import { isStorageConfigured, uploadFile, makeAssetKey } from '../../../../lib/storage-s3';
import { logger } from '@/lib/logger';
import { virusScanHookPoint } from '@/lib/virusScanHookPoint';

import { corsHeaders } from '../../_lib/cors';
/**
 * POST /api/assets/process
 * Accepts a multipart/form-data file upload.
 *
 * When S3 is configured: uploads to S3, saves metadata to DB.
 * When S3 is not configured: saves to local .uploads/ directory.
 *
 * Full GLTF parsing (Three.js GLTFLoader) requires a browser context;
 * server-side we return metadata only. The client-side AssetDropProcessor
 * handles in-browser GLTF parsing with the installed three package.
 */

const UPLOAD_DIR = path.join(process.cwd(), '.uploads');

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

const ALLOWED = [
  '.glb',
  '.gltf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.hdr',
  '.exr',
  '.mp3',
  '.wav',
  '.ogg',
];

const MIME_MAP: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function getCategory(ext: string): string {
  if (['.glb', '.gltf'].includes(ext)) return 'model';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'texture';
  if (['.hdr', '.exr'].includes(ext)) return 'hdri';
  if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
  return 'other';
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const name = file.name;
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 });
    }

    const MAX_MB = 50;
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large (max ${MAX_MB}MB)` }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    virusScanHookPoint(`assets/process:${ext}`, buffer);
    const category = getCategory(ext);
    const is3D = ['.glb', '.gltf'].includes(ext);

    // Try S3 upload when configured
    if (isStorageConfigured()) {
      const session = await getSession();
      const userId = session?.user?.id ?? 'anonymous';
      const key = makeAssetKey(userId, name);
      const mime = MIME_MAP[ext] ?? 'application/octet-stream';

      const url = await uploadFile(key, buffer, mime);

      // Save metadata to DB if available
      const db = getDb();
      let assetId = `asset_${Date.now()}`;
      if (db) {
        const [row] = await db
          .insert(assets)
          .values({
            ownerId: session?.user?.id ?? undefined!,
            name,
            type: category,
            url,
            metadata: {
              key,
              contentType: mime,
              format: ext.slice(1).toUpperCase(),
              sizeKb: Math.round(file.size / 1024),
              status: 'ready',
            },
          })
          .returning();
        assetId = row.id;
      }

      return NextResponse.json({
        ok: true,
        asset: {
          id: assetId,
          name,
          src: url,
          sizeKb: Math.round(file.size / 1024),
          format: ext.slice(1).toUpperCase(),
          category,
          is3D,
          storage: 's3',
        },
      });
    }

    // Fallback: local disk storage — SEC-T12: non-guessable prefix (UUID), not timestamp-only.
    await ensureUploadDir();
    const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const safeName = `${randomUUID()}_${sanitized || 'upload'}`;
    const savePath = path.join(UPLOAD_DIR, safeName);
    await writeFile(savePath, buffer);

    return NextResponse.json({
      ok: true,
      asset: {
        id: `asset_${Date.now()}`,
        name,
        src: `/api/assets/process?file=${safeName}`,
        savedAs: safeName,
        sizeKb: Math.round(file.size / 1024),
        format: ext.slice(1).toUpperCase(),
        category,
        is3D,
        storage: 'local',
        processingNote: is3D
          ? 'GLB/GLTF: parsed client-side for mesh extraction'
          : `${category} asset saved`,
      },
    });
  } catch (err) {
    logger.error('[assets/process] Error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// Serve locally uploaded files
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('file');
  if (!filename || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const fileBuffer = await readFile(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mime = MIME_MAP[ext] ?? 'application/octet-stream';

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
