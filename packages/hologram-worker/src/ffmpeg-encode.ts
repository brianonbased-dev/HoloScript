import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

function tmp(suffix: string): string {
  return join(tmpdir(), `holo-enc-${randomBytes(6).toString('hex')}${suffix}`);
}

export async function encodeStereoMp4(
  leftPng: Buffer,
  rightPng: Buffer,
  fps: number,
): Promise<Uint8Array> {
  const left = tmp('-L.png');
  const right = tmp('-R.png');
  const out = tmp('.mp4');
  await fs.writeFile(left, leftPng);
  await fs.writeFile(right, rightPng);

  const args = [
    '-y',
    '-loop',
    '1',
    '-framerate',
    String(fps),
    '-t',
    '2',
    '-i',
    left,
    '-loop',
    '1',
    '-framerate',
    String(fps),
    '-t',
    '2',
    '-i',
    right,
    '-filter_complex',
    'hstack=inputs=2',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-c:v',
    'libx264',
    out,
  ];

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const proc = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (c) => {
      stderr += c.toString();
    });
    proc.on('error', rejectPromise);
    proc.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(stderr.slice(-400) || `ffmpeg exited ${code}`));
    });
  });

  const buf = await fs.readFile(out);
  await fs.unlink(left).catch(() => {});
  await fs.unlink(right).catch(() => {});
  await fs.unlink(out).catch(() => {});
  return new Uint8Array(buf);
}

export async function encodeParallaxWebm(previewPng: Buffer): Promise<Uint8Array> {
  const png = tmp('-p.png');
  const out = tmp('.webm');
  await fs.writeFile(png, previewPng);
  const args = ['-y', '-loop', '1', '-i', png, '-t', '2', '-c:v', 'libvpx-vp9', '-b:v', '500k', out];
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const proc = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (c) => {
      stderr += c.toString();
    });
    proc.on('error', rejectPromise);
    proc.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(stderr.slice(-400) || `ffmpeg exited ${code}`));
    });
  });
  const buf = await fs.readFile(out);
  await fs.unlink(png).catch(() => {});
  await fs.unlink(out).catch(() => {});
  return new Uint8Array(buf);
}
