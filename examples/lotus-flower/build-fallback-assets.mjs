#!/usr/bin/env node
/**
 * Generate deterministic fallback media for the staged Lotus artifact.
 *
 * These assets are intentionally simple, provenance-friendly placeholders:
 * they keep pollen/audio/light references from disappearing silently while the
 * final CAEL-grounded photo/material asset pipeline is still pending.
 *
 * Usage:
 *   node examples/lotus-flower/build-fallback-assets.mjs
 *   node examples/lotus-flower/build-fallback-assets.mjs --check
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(ROOT, 'audio');
const SPRITE_DIR = path.join(ROOT, 'sprites');
const MANIFEST_PATH = path.join(ROOT, 'fallback-assets.manifest.json');
const SEED_LABEL = 'LOTUS_FALLBACK_ASSET_SEED:v1:0x0000DEAD';
const CHECK_MODE = process.argv.includes('--check');

const ASSETS = [
  {
    path: 'sprites/pollen_disc.png',
    role: 'pollen_particle_sprite',
    mimeType: 'image/png',
    build: () => buildPollenPng(96),
  },
  {
    path: 'sprites/light_quanta.png',
    role: 'genesis_light_column_sprite',
    mimeType: 'image/png',
    build: () => buildLightQuantaPng(96),
  },
  {
    path: 'audio/garden_pond_loop.ogg',
    role: 'ambient_pond_loop',
    mimeType: 'audio/ogg',
    build: () => buildOgg('garden_pond_loop', buildPondSamples(4, 48000)),
  },
  {
    path: 'audio/genesis_chime_loop.ogg',
    role: 'dormant_genesis_chime_loop',
    mimeType: 'audio/ogg',
    build: () => buildOgg('genesis_chime_loop', buildChimeSamples(3, 48000)),
  },
];

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();
const OGG_CRC_TABLE = makeOggCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeOggCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) : r << 1;
    }
    table[i] = r >>> 0;
  }
  return table;
}

function oggCrc(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) & 0xff) ^ byte]) >>> 0;
  }
  return crc >>> 0;
}

function canonicalizeOggPages(input, streamSerial) {
  const bytes = Buffer.from(input);
  let offset = 0;
  let sequence = 0;
  while (offset < bytes.length) {
    if (bytes.toString('ascii', offset, offset + 4) !== 'OggS') {
      throw new Error(`Invalid OGG page at byte ${offset}`);
    }
    const segments = bytes[offset + 26];
    const segmentTableStart = offset + 27;
    const payloadStart = segmentTableStart + segments;
    let payloadLength = 0;
    for (let i = 0; i < segments; i++) {
      payloadLength += bytes[segmentTableStart + i];
    }
    const pageEnd = payloadStart + payloadLength;
    if (pageEnd > bytes.length) {
      throw new Error(`Truncated OGG page at byte ${offset}`);
    }

    bytes.writeUInt32LE(streamSerial >>> 0, offset + 14);
    bytes.writeUInt32LE(sequence >>> 0, offset + 18);
    bytes.writeUInt32LE(0, offset + 22);
    const checksum = oggCrc(bytes.subarray(offset, pageEnd));
    bytes.writeUInt32LE(checksum, offset + 22);

    sequence += 1;
    offset = pageEnd;
  }
  return bytes;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function buildPollenPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const r = Math.sqrt(dx * dx + dy * dy);
      const vein = 0.5 + 0.5 * Math.sin((dx * 9 + dy * 5) * Math.PI);
      const glow = Math.max(0, 1 - r);
      const alpha = Math.pow(glow, 1.9) * (0.78 + 0.22 * vein);
      const i = (y * size + x) * 4;
      rgba[i] = clampByte(255);
      rgba[i + 1] = clampByte(192 + 44 * glow);
      rgba[i + 2] = clampByte(68 + 48 * vein);
      rgba[i + 3] = clampByte(255 * alpha);
    }
  }
  return encodePng(size, size, rgba);
}

function buildLightQuantaPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const star = Math.pow(Math.abs(Math.cos(angle * 4)), 18);
      const core = Math.exp(-radius * radius * 18);
      const ray = Math.max(0, 1 - radius) * star;
      const alpha = Math.min(1, core + ray * 0.8);
      const i = (y * size + x) * 4;
      rgba[i] = clampByte(236 + 19 * core);
      rgba[i + 1] = clampByte(248);
      rgba[i + 2] = clampByte(255);
      rgba[i + 3] = clampByte(255 * Math.pow(alpha, 1.35));
    }
  }
  return encodePng(size, size, rgba);
}

function buildPondSamples(seconds, sampleRate) {
  const count = seconds * sampleRate;
  const samples = new Float32Array(count);
  let noise = 0.13750776;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    noise = (noise * 16807) % 1;
    const ripple =
      0.18 * Math.sin(Math.PI * 2 * 110 * t) +
      0.08 * Math.sin(Math.PI * 2 * 220 * t + 0.6) +
      0.04 * Math.sin(Math.PI * 2 * 330 * t + 1.2);
    const water = 0.04 * Math.sin(Math.PI * 2 * 2 * t) + 0.025 * (noise - 0.5);
    samples[i] = (ripple + water) * 0.35;
  }
  return { samples, sampleRate };
}

function buildChimeSamples(seconds, sampleRate) {
  const count = seconds * sampleRate;
  const samples = new Float32Array(count);
  const tones = [528, 660, 792, 1056];
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const loopPhase = t / seconds;
    const loopEnvelope = Math.sin(Math.PI * loopPhase) ** 2;
    let value = 0;
    for (const [idx, hz] of tones.entries()) {
      value += Math.sin(Math.PI * 2 * hz * t + idx * 0.4) * (0.2 / (idx + 1));
    }
    samples[i] = value * loopEnvelope * 0.65;
  }
  return { samples, sampleRate };
}

function encodeWav({ samples, sampleRate }) {
  const dataSize = samples.length * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    bytes.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return bytes;
}

async function buildOgg(name, sampleSpec) {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not resolve; cannot generate deterministic OGG fallback audio');
  }
  await mkdir(AUDIO_DIR, { recursive: true });
  const tempWav = path.join(AUDIO_DIR, `.${name}.tmp.wav`);
  const tempOgg = path.join(AUDIO_DIR, `.${name}.tmp.ogg`);
  await writeFile(tempWav, encodeWav(sampleSpec));
  await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-bitexact',
    '-y',
    '-i',
    tempWav,
    '-map_metadata',
    '-1',
    '-codec:a',
    'libvorbis',
    '-q:a',
    '4',
    '-serial_offset',
    '13750776',
    '-page_duration',
    '1000000',
    tempOgg,
  ]);
  const ogg = canonicalizeOggPages(
    await readFile(tempOgg),
    createHash('sha256').update(`${SEED_LABEL}:${name}`).digest().readUInt32LE(0),
  );
  await rm(tempWav, { force: true });
  await rm(tempOgg, { force: true });
  return ogg;
}

async function writeGeneratedAssets() {
  await mkdir(AUDIO_DIR, { recursive: true });
  await mkdir(SPRITE_DIR, { recursive: true });

  const entries = [];
  for (const asset of ASSETS) {
    const bytes = await asset.build();
    const out = path.join(ROOT, asset.path);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, bytes);
    const info = await stat(out);
    entries.push({
      path: asset.path.replaceAll('\\', '/'),
      role: asset.role,
      mime_type: asset.mimeType,
      byte_length: info.size,
      content_hash: sha256(bytes),
      provenance: {
        source: 'deterministic_fallback_generator',
        seed: SEED_LABEL,
        final_art_status: 'replaceable_by_cael_signed_media',
      },
    });
  }

  const manifest = {
    schema: 'holoscript.lotus.fallback-assets.v1',
    status: 'deterministic_fallback_assets',
    generated_by: 'examples/lotus-flower/build-fallback-assets.mjs',
    generated_on: '2026-05-06',
    purpose:
      'Fail-loud deterministic media for staged Lotus pollen/audio/light paths until CAEL-signed final assets land.',
    assets: entries,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function checkManifest() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const failures = [];
  for (const asset of manifest.assets ?? []) {
    const filePath = path.join(ROOT, asset.path);
    try {
      const bytes = await readFile(filePath);
      const info = await stat(filePath);
      const hash = sha256(bytes);
      if (hash !== asset.content_hash) {
        failures.push(`${asset.path}: hash mismatch ${hash} != ${asset.content_hash}`);
      }
      if (info.size !== asset.byte_length) {
        failures.push(`${asset.path}: byte length mismatch ${info.size} != ${asset.byte_length}`);
      }
    } catch (err) {
      failures.push(`${asset.path}: missing or unreadable (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Lotus fallback asset check failed:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  }
  return manifest;
}

try {
  const manifest = CHECK_MODE ? await checkManifest() : await writeGeneratedAssets();
  const label = CHECK_MODE ? 'verified' : 'generated';
  console.log(`Lotus fallback assets ${label}: ${manifest.assets.length} files`);
  for (const asset of manifest.assets) {
    console.log(`- ${asset.path} ${asset.content_hash}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
