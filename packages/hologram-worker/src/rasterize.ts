import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';

import type { HologramSourceKind } from '@holoscript/engine/hologram';

export interface PreparedRaster {
  pngPath: string;
  width: number;
  height: number;
  sourceKind: HologramSourceKind;
  compositionMediaType: 'image';
}

export function maxRasterSide(): number {
  const n = Number(process.env.HOLOGRAM_DEPTH_MAX_SIDE || 640);
  return Number.isFinite(n) && n >= 64 ? Math.min(1024, n) : 640;
}

function tempPath(suffix: string): string {
  return join(tmpdir(), `holo-worker-${randomBytes(8).toString('hex')}${suffix}`);
}

async function resizeToCapPipeline(
  sharpInput: sharp.Sharp,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharpInput.metadata();
  let w = meta.width ?? 1;
  let h = meta.height ?? 1;
  const cap = maxRasterSide();
  if (Math.max(w, h) > cap) {
    if (w >= h) {
      h = Math.max(1, Math.round((h * cap) / w));
      w = cap;
    } else {
      w = Math.max(1, Math.round((w * cap) / h));
      h = cap;
    }
  }
  const buf = await sharpInput.resize(w, h, { fit: 'fill' }).png().toBuffer();
  return { buffer: buf, width: w, height: h };
}

/**
 * Rasterize incoming media to a capped PNG on disk (single frame for gif/video).
 */
export async function prepareRasterPng(
  media: Uint8Array,
  sourceKind: HologramSourceKind,
): Promise<PreparedRaster & { dispose: () => Promise<void> }> {
  const pngPath = tempPath('.png');
  const dispose = async () => {
    await fs.unlink(pngPath).catch(() => {});
  };

  if (sourceKind === 'image') {
    const { buffer, width, height } = await resizeToCapPipeline(sharp(Buffer.from(media)));
    await fs.writeFile(pngPath, buffer);
    return { pngPath, width, height, sourceKind, compositionMediaType: 'image', dispose };
  }

  if (sourceKind === 'gif') {
    const { buffer, width, height } = await resizeToCapPipeline(
      sharp(Buffer.from(media), { animated: true, pages: 1 }).gif(),
    );
    await fs.writeFile(pngPath, buffer);
    return { pngPath, width, height, sourceKind, compositionMediaType: 'image', dispose };
  }

  const vidPath = tempPath('.mp4');
  await fs.writeFile(vidPath, Buffer.from(media));
  const rawFrame = tempPath('-frame.png');
  const r = spawnSync(ffmpegInstaller.path, ['-y', '-i', vidPath, '-vframes', '1', rawFrame], {
    encoding: 'utf8',
  });
  await fs.unlink(vidPath).catch(() => {});
  if (r.status !== 0) {
    await fs.unlink(rawFrame).catch(() => {});
    throw new Error(`ffmpeg frame extract failed: ${(r.stderr as string)?.slice(-300) ?? 'unknown'}`);
  }
  const { buffer, width, height } = await resizeToCapPipeline(sharp(await fs.readFile(rawFrame)));
  await fs.unlink(rawFrame).catch(() => {});
  await fs.writeFile(pngPath, buffer);
  return { pngPath, width, height, sourceKind, compositionMediaType: 'image', dispose };
}
