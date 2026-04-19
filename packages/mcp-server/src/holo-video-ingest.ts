/**
 * Download video URLs and decode RGB frames via ffmpeg (PATH or ffmpeg-static).
 * HTTP(S) downloads stream to disk with size and time limits.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const DEFAULT_MAX_VIDEO_BYTES = 256 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

export function resolveFfmpegBinary(): string {
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) return envPath;
  try {
    const ffmpegStatic = require('ffmpeg-static') as string | null | undefined;
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0) return ffmpegStatic;
  } catch {
    /* optional */
  }
  return 'ffmpeg';
}

export async function fetchVideoToTempFile(videoUrl: string): Promise<{
  path: string;
  bytes: number;
  sha256Hex: string;
  cleanup: () => Promise<void>;
}> {
  const maxBytes = Number(process.env.HOLOMAP_MCP_MAX_VIDEO_BYTES ?? DEFAULT_MAX_VIDEO_BYTES);
  const timeoutMs = Number(process.env.HOLOMAP_MCP_FETCH_VIDEO_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);

  const dir = await fs.mkdtemp(join(tmpdir(), 'holomap-mcp-'));
  const destPath = join(dir, `in-${randomBytes(8).toString('hex')}.bin`);
  const hash = createHash('sha256');

  const cleanup = async (): Promise<void> => {
    await fs.rm(dir, { recursive: true, force: true });
  };

  if (videoUrl.startsWith('file:')) {
    const filePath = fileURLToPath(videoUrl);
    const buf = await fs.readFile(filePath);
    if (buf.length > maxBytes) {
      await cleanup();
      throw new Error(
        `holo_reconstruct_from_video: file exceeds HOLOMAP_MCP_MAX_VIDEO_BYTES (${maxBytes})`,
      );
    }
    hash.update(buf);
    await fs.writeFile(destPath, buf);
    return { path: destPath, bytes: buf.length, sha256Hex: hash.digest('hex'), cleanup };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(videoUrl, { signal: ac.signal });
  } catch (e) {
    clearTimeout(timer);
    await cleanup();
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `holo_reconstruct_from_video: fetch timed out after ${timeoutMs}ms (HOLOMAP_MCP_FETCH_VIDEO_TIMEOUT_MS)`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    await cleanup();
    throw new Error(`holo_reconstruct_from_video: failed to fetch video (${res.status} ${res.statusText})`);
  }
  if (!res.body) {
    await cleanup();
    throw new Error('holo_reconstruct_from_video: empty response body');
  }

  const ws = createWriteStream(destPath);
  let total = 0;

  try {
    const webBody = res.body as import('stream/web').ReadableStream<Uint8Array>;
    const nodeReadable = Readable.fromWeb(webBody);
    for await (const chunk of nodeReadable) {
      const c = chunk as Buffer;
      total += c.length;
      if (total > maxBytes) {
        ws.destroy();
        await cleanup();
        throw new Error(
          `holo_reconstruct_from_video: download exceeds HOLOMAP_MCP_MAX_VIDEO_BYTES (${maxBytes})`,
        );
      }
      hash.update(c);
      if (!ws.write(c)) {
        await once(ws, 'drain');
      }
    }
    ws.end();
    await finished(ws);
  } catch (e) {
    ws.destroy();
    await cleanup();
    throw e;
  }

  return { path: destPath, bytes: total, sha256Hex: hash.digest('hex'), cleanup };
}

/**
 * Stream RGB24 frames WxHx3 at sampled fps (ffmpeg), capped at maxFrames.
 */
export async function ingestVideoRgbFrames(options: {
  videoPath: string;
  width: number;
  height: number;
  fps: number;
  maxFrames: number;
  ffmpegPath?: string;
}): Promise<{ frames: Array<{ index: number; rgb: Uint8Array }>; ffmpegPath: string }> {
  const ffmpegPath = options.ffmpegPath ?? resolveFfmpegBinary();
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    options.videoPath,
    '-vf',
    `fps=${options.fps},scale=${options.width}:${options.height}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr: string[] = [];
  proc.stderr?.on('data', (c: Buffer) => stderr.push(c.toString()));

  const frameSize = options.width * options.height * 3;
  const frames: Array<{ index: number; rgb: Uint8Array }> = [];
  let buf = Buffer.alloc(0);
  let index = 0;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    proc.on('error', (err) => rejectPromise(err));
    proc.stdout.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= frameSize && index < options.maxFrames) {
        const raw = buf.subarray(0, frameSize);
        buf = buf.subarray(frameSize);
        frames.push({ index, rgb: new Uint8Array(raw) });
        index += 1;
      }
      if (index >= options.maxFrames) {
        proc.stdout.destroy();
        proc.kill('SIGKILL');
      }
    });
    proc.on('close', (code, signal) => {
      if (frames.length > 0 && (signal === 'SIGKILL' || code === 255 || code === 1)) {
        resolvePromise();
        return;
      }
      if (code !== 0 && frames.length === 0) {
        rejectPromise(
          new Error(
            `ffmpeg exited ${code}: ${stderr.join('').slice(-800) || 'no stderr — is ffmpeg installed?'}`,
          ),
        );
        return;
      }
      resolvePromise();
    });
  });

  return { frames, ffmpegPath };
}

export function ffmpegAvailableSync(ffmpegPath = resolveFfmpegBinary()): boolean {
  try {
    const r = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf8', timeout: 8000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
