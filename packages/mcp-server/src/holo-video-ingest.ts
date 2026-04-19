/**
 * Download video URLs and decode RGB frames via ffmpeg (PATH or ffmpeg-static).
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveFfmpegBinary(): string {
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) return envPath;
  try {
    // Optional bundled binary (added as dependency in @holoscript/mcp-server).
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
  const hash = createHash('sha256');
  let buf: Buffer;

  if (videoUrl.startsWith('file:')) {
    const filePath = fileURLToPath(videoUrl);
    buf = await fs.readFile(filePath);
    hash.update(buf);
  } else {
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw new Error(`holo_reconstruct_from_video: failed to fetch video (${res.status} ${res.statusText})`);
    }
    const ab = await res.arrayBuffer();
    buf = Buffer.from(ab);
    hash.update(buf);
  }

  const dir = await fs.mkdtemp(join(tmpdir(), 'holomap-mcp-'));
  const path = join(dir, `in-${randomBytes(8).toString('hex')}.bin`);
  await fs.writeFile(path, buf);

  const cleanup = async (): Promise<void> => {
    await fs.rm(dir, { recursive: true, force: true });
  };

  return { path, bytes: buf.length, sha256Hex: hash.digest('hex'), cleanup };
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

/** Best-effort probe: returns false if ffmpeg binary is missing or broken. */
export function ffmpegAvailableSync(ffmpegPath = resolveFfmpegBinary()): boolean {
  try {
    const r = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf8', timeout: 8000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
