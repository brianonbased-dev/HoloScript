/**
 * character-capture — emits viewable PNGs of the native-WebGPU humanoid (F.099: show, don't
 * reference). Off by default; runs only with CHARACTER_CAPTURE=1 on a live GPU. Writes
 * bind-pose + posed renders to .bench-logs/character-render/ via a tiny zlib PNG encoder
 * (no image deps). The normal suite skips this so CI stays fast.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import zlib from 'node:zlib';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { CharacterHost } from '../CharacterHost';
import { renderCharacter } from '../character-render';
import { quatFromAxisAngle } from '../skin-math';
import type { PixelGrid } from '../../native-render/gpu-verify';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
  crcInput.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}
function encodePNG(grid: PixelGrid): Uint8Array {
  const { width, height, data } = grid;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const idv = new DataView(ihdr.buffer);
  idv.setUint32(0, width);
  idv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    raw.set(data.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(Buffer.from(raw));
  return Buffer.concat([
    Buffer.from(sig),
    Buffer.from(pngChunk('IHDR', ihdr)),
    Buffer.from(pngChunk('IDAT', new Uint8Array(idat))),
    Buffer.from(pngChunk('IEND', new Uint8Array(0))),
  ]);
}

const enabled = GPU_LIVE && process.env.CHARACTER_CAPTURE === '1';
const itCapture = enabled ? it : it.skip;

describe('character-capture — viewable PNG proof', () => {
  itCapture('writes bind + posed humanoid PNGs', async () => {
    const outDir = resolve(__dirname, '../../../../../.bench-logs/character-render');
    mkdirSync(outDir, { recursive: true });

    const host = new CharacterHost({ entityId: 'brittney' });
    const bind = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 256 });
    writeFileSync(resolve(outDir, 'brittney-bind.png'), encodePNG(bind));

    host.setBoneRotation('left_upper_arm', quatFromAxisAngle(0, 0, 1, -1.1));
    host.setBoneRotation('right_upper_arm', quatFromAxisAngle(0, 0, 1, 1.1));
    const posed = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 256 });
    writeFileSync(resolve(outDir, 'brittney-posed.png'), encodePNG(posed));

    expect(bind.data.length).toBe(256 * 256 * 4);
    expect(posed.data.length).toBe(256 * 256 * 4);
  });
});
