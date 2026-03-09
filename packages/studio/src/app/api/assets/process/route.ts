import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * POST /api/assets/process
 * Accepts a multipart/form-data file upload.
 * Reads the file as a Buffer and returns a basic asset manifest:
 *   { name, sizeKb, format, processingNote }
 *
 * Full GLTF parsing (Three.js GLTFLoader) requires a browser context;
 * server-side we return metadata only. The client-side AssetDropProcessor
 * handles in-browser GLTF parsing with the installed three package.
 *
 * Saves the raw file to .uploads/<filename> for future reference.
 */

const UPLOAD_DIR = path.join(process.cwd(), '.uploads');

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    await ensureUploadDir();

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate extension
    const name = file.name;
    const ext = path.extname(name).toLowerCase();
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
    if (!ALLOWED.includes(ext)) {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 });
    }

    const MAX_MB = 50;
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large (max ${MAX_MB}MB)` }, { status: 413 });
    }

    // Save to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = `${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const savePath = path.join(UPLOAD_DIR, safeName);
    await writeFile(savePath, buffer);

    // Determine asset category
    const glbOrGltf = ['.glb', '.gltf'].includes(ext);
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const isHDRI = ['.hdr', '.exr'].includes(ext);
    const isAudio = ['.mp3', '.wav', '.ogg'].includes(ext);

    let category = 'model';
    if (isImage) category = 'texture';
    else if (isHDRI) category = 'hdri';
    else if (isAudio) category = 'audio';

    return NextResponse.json({
      ok: true,
      asset: {
        id: `asset_${Date.now()}`,
        name,
        src: `/api/uploads/${safeName}`,
        savedAs: safeName,
        sizeKb: Math.round(file.size / 1024),
        format: ext.slice(1).toUpperCase(),
        category,
        is3D: glbOrGltf,
        processingNote: glbOrGltf
          ? 'GLB/GLTF: parsed client-side for mesh extraction'
          : `${category} asset saved`,
      },
    });
  } catch (err) {
    console.error('[assets/process] Error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// Serve uploaded files
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

  const buffer = await readFile(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.hdr': 'image/vnd.radiance',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  };
  const mime = mimeMap[ext] ?? 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
