#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseHolo } from '@holoscript/core/parser';
import { WebGPUCompiler, createTestCompilerToken } from '@holoscript/core/compiler';

const receiptPath = process.argv[2];
if (!receiptPath) {
  console.error('usage: node scripts/validate-holollama-founder-proof-surface.mjs <receipt.json>');
  process.exit(2);
}

const receiptFile = resolve(receiptPath);
const receiptDir = dirname(receiptFile);
const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readRelative(pathFromReceipt) {
  return readFileSync(resolve(receiptDir, pathFromReceipt));
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function parsePng(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('not a PNG');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);

  const channelsByType = new Map([
    [0, 1],
    [2, 3],
    [4, 2],
    [6, 4],
  ]);
  const channels = channelsByType.get(colorType);
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);

  let rawOffset = 0;
  let pixelOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    const scanline = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const reconstructed = Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? reconstructed[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;

      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);

      reconstructed[x] = (scanline[x] + predictor) & 0xff;
    }

    reconstructed.copy(pixels, pixelOffset);
    pixelOffset += stride;
    previous = reconstructed;
  }

  return { width, height, channels, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function pngStats(buffer) {
  const png = parsePng(buffer);
  let min = 255;
  let max = 0;
  let sum = 0;
  const seen = new Set();

  for (let i = 0; i < png.pixels.length; i += png.channels) {
    const r = png.pixels[i];
    const g = png.pixels[i + Math.min(1, png.channels - 1)];
    const b = png.pixels[i + Math.min(2, png.channels - 1)];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    sum += r + g + b;
    if (seen.size < 2048) seen.add(`${r},${g},${b}`);
  }

  const pixelCount = png.width * png.height;
  return {
    width: png.width,
    height: png.height,
    uniqueRgbSamples: seen.size,
    minRgb: min,
    maxRgb: max,
    meanRgb: sum / (pixelCount * 3),
  };
}

check(receipt.schema === 'holollama.founder-proof-surface.receipt.v1', 'schema mismatch');
check(Boolean(receipt.founderFeltValueLine), 'missing founder-felt value line');
check(
  receipt.semanticDisposition?.status === 'not_proven',
  'receipt must not claim semantic success from screenshot-only proof'
);

const sourcePath = receipt.source?.path;
check(Boolean(sourcePath), 'missing source path');
if (sourcePath) {
  const source = readRelative(sourcePath).toString('utf8');
  check(receipt.source.sha256 === sha256Text(source), 'source sha256 mismatch');

  const parse = parseHolo(source);
  check(parse.success === true && Boolean(parse.ast), 'source did not parse');
  if (parse.success && parse.ast) {
    const compiled = new WebGPUCompiler().compile(parse.ast, createTestCompilerToken());
    check(receipt.compile?.target === 'webgpu', 'compile target must be webgpu');
    check(receipt.compile?.outputSha256 === sha256Text(compiled), 'compile output sha256 mismatch');
    check(String(compiled).includes('navigator.gpu'), 'compile output missing WebGPU marker');
  }
}

const htmlPath = receipt.surface?.htmlPath;
check(Boolean(htmlPath), 'missing HTML surface path');
if (htmlPath) {
  const html = readRelative(htmlPath).toString('utf8');
  check(receipt.surface.htmlSha256 === sha256Text(html), 'HTML surface sha256 mismatch');
  check(html.includes('joseph-intent-proof.surface.png'), 'HTML surface does not reference render screenshot');
  check(
    normalizeWhitespace(html).includes(normalizeWhitespace(receipt.founderFeltValueLine)),
    'HTML surface missing founder-felt value line'
  );
}

for (const image of receipt.images || []) {
  const path = resolve(receiptDir, image.path);
  check(existsSync(path), `missing image ${image.path}`);
  if (!existsSync(path)) continue;

  const buffer = readFileSync(path);
  check(image.sha256 === sha256Buffer(buffer), `${image.id} sha256 mismatch`);
  check(buffer.length === image.bytes, `${image.id} byte length mismatch`);

  let stats;
  try {
    stats = pngStats(buffer);
  } catch (error) {
    failures.push(`${image.id} PNG parse failed: ${error.message}`);
    continue;
  }

  check(stats.width === image.width, `${image.id} width mismatch`);
  check(stats.height === image.height, `${image.id} height mismatch`);
  check(stats.uniqueRgbSamples >= 16, `${image.id} appears blank`);
  check(stats.maxRgb - stats.minRgb >= 16, `${image.id} has insufficient pixel contrast`);
}

if (failures.length) {
  console.error(`[holollama-founder-proof-surface] FAIL ${receiptPath}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `[holollama-founder-proof-surface] PASS ${receiptPath}: ${receipt.images.length} image(s), surface=${receipt.surface.htmlPath}`
);
