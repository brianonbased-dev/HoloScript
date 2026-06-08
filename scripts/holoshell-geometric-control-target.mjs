#!/usr/bin/env node
/**
 * HoloShell Geometric Control Target
 *
 * Generates a deterministic high-contrast camera target for low-quality camera
 * calibration. The receipt describes the known geometry. It does not claim the
 * target was visible to any camera until a capture workflow records that frame.
 */

import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chainReceipt,
  sha256Bytes,
  sha256Text,
  stageReceipt,
  withHash,
} from './holoshell/chain/receipts.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-geometric-control-target/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join(
    '.scratch',
    'holoshell-geometric-control-target',
    date,
    'geometric-control-target-receipt.json'
  );
}

function defaultPngForReceipt(outPath) {
  return join(dirname(outPath), 'geometric-control-target.png');
}

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    out: undefined,
    png: undefined,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    selfTest: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--png') args.png = argv[++i];
    else if (arg === '--width') args.width = Number.parseInt(argv[++i], 10);
    else if (arg === '--height') args.height = Number.parseInt(argv[++i], 10);
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.help || args.selfTest) return args;
  validateDimensions(args.width, args.height);
  return args;
}

function validateDimensions(width, height) {
  if (!Number.isInteger(width) || width < 320 || width > 4096)
    throw new Error('--width must be 320..4096');
  if (!Number.isInteger(height) || height < 240 || height > 4096)
    throw new Error('--height must be 240..4096');
}

function printHelp() {
  process.stdout.write(`HoloShell Geometric Control Target ${VERSION}

Usage:
  node scripts/holoshell-geometric-control-target.mjs [--out receipt.json] [--png target.png]
  node scripts/holoshell-geometric-control-target.mjs --width 1280 --height 720
  node scripts/holoshell-geometric-control-target.mjs --self-test

Notes:
  - Generates a deterministic PNG with checkerboard, fiducials, and colored primitives.
  - The receipt describes a known camera target, not a camera capture.
  - Low-camera workflows use this target beside the untouched camera control frame.
`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodeRgbPng(rgb, width, height) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function putPixel(rgb, width, height, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return;
  const index = (py * width + px) * 3;
  rgb[index] = color[0];
  rgb[index + 1] = color[1];
  rgb[index + 2] = color[2];
}

function fillRect(rgb, width, height, x, y, rectWidth, rectHeight, color) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(width, Math.ceil(x + rectWidth));
  const bottom = Math.min(height, Math.ceil(y + rectHeight));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) putPixel(rgb, width, height, px, py, color);
  }
}

function strokeRect(rgb, width, height, x, y, rectWidth, rectHeight, color, thickness = 1) {
  fillRect(rgb, width, height, x, y, rectWidth, thickness, color);
  fillRect(rgb, width, height, x, y + rectHeight - thickness, rectWidth, thickness, color);
  fillRect(rgb, width, height, x, y, thickness, rectHeight, color);
  fillRect(rgb, width, height, x + rectWidth - thickness, y, thickness, rectHeight, color);
}

function drawLine(rgb, width, height, x0, y0, x1, y1, color, thickness = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(1, Math.ceil(Math.max(dx, dy)));
  const radius = Math.max(0, Math.floor(thickness / 2));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    fillRect(rgb, width, height, x - radius, y - radius, thickness, thickness, color);
  }
}

function fillCircle(rgb, width, height, cx, cy, radius, color) {
  const left = Math.floor(cx - radius);
  const right = Math.ceil(cx + radius);
  const top = Math.floor(cy - radius);
  const bottom = Math.ceil(cy + radius);
  const radiusSq = radius * radius;
  for (let py = top; py <= bottom; py += 1) {
    for (let px = left; px <= right; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= radiusSq) putPixel(rgb, width, height, px, py, color);
    }
  }
}

function fillTriangle(rgb, width, height, vertices, color) {
  const [a, b, c] = vertices;
  const minX = Math.floor(Math.min(a.x, b.x, c.x));
  const maxX = Math.ceil(Math.max(a.x, b.x, c.x));
  const minY = Math.floor(Math.min(a.y, b.y, c.y));
  const maxY = Math.ceil(Math.max(a.y, b.y, c.y));
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 1e-6) return;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const x = px + 0.5;
      const y = py + 0.5;
      const w0 = ((b.x - x) * (c.y - y) - (b.y - y) * (c.x - x)) / area;
      const w1 = ((c.x - x) * (a.y - y) - (c.y - y) * (a.x - x)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001) putPixel(rgb, width, height, px, py, color);
    }
  }
}

function fillDiamond(rgb, width, height, cx, cy, radius, color) {
  for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py += 1) {
    for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px += 1) {
      if (Math.abs(px - cx) + Math.abs(py - cy) <= radius)
        putPixel(rgb, width, height, px, py, color);
    }
  }
}

function drawCheckerboard(rgb, width, height, area, columns, rows) {
  const cellWidth = area.width / columns;
  const cellHeight = area.height / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const color = (row + col) % 2 === 0 ? [12, 12, 12] : [245, 245, 245];
      fillRect(
        rgb,
        width,
        height,
        area.x + col * cellWidth,
        area.y + row * cellHeight,
        cellWidth + 0.5,
        cellHeight + 0.5,
        color
      );
    }
  }
  strokeRect(
    rgb,
    width,
    height,
    area.x,
    area.y,
    area.width,
    area.height,
    [0, 0, 0],
    Math.max(3, Math.round(width * 0.003))
  );
}

function drawFiducial(rgb, width, height, center, size, accent) {
  const x = center.x - size / 2;
  const y = center.y - size / 2;
  fillRect(rgb, width, height, x, y, size, size, [0, 0, 0]);
  fillRect(
    rgb,
    width,
    height,
    x + size * 0.17,
    y + size * 0.17,
    size * 0.66,
    size * 0.66,
    [255, 255, 255]
  );
  fillRect(
    rgb,
    width,
    height,
    x + size * 0.34,
    y + size * 0.34,
    size * 0.32,
    size * 0.32,
    [0, 0, 0]
  );
  fillCircle(rgb, width, height, center.x, center.y, Math.max(3, size * 0.08), accent);
}

function buildTargetGeometry(width, height) {
  const margin = Math.round(Math.min(width, height) * 0.07);
  const board = {
    x: margin * 1.55,
    y: margin * 1.18,
    width: width - margin * 3.1,
    height: height - margin * 2.36,
  };
  const center = { x: width / 2, y: height / 2 };
  const fiducialSize = Math.round(Math.min(width, height) * 0.115);
  const shapeRadius = Math.round(Math.min(width, height) * 0.082);
  return {
    margin,
    board,
    center,
    fiducialSize,
    checkerboard: {
      columns: 12,
      rows: 8,
      area: board,
    },
    fiducials: [
      {
        id: 'top-left',
        center: { x: margin, y: margin },
        size: fiducialSize,
        accent: [255, 38, 38],
      },
      {
        id: 'top-right',
        center: { x: width - margin, y: margin },
        size: fiducialSize,
        accent: [35, 190, 70],
      },
      {
        id: 'bottom-left',
        center: { x: margin, y: height - margin },
        size: fiducialSize,
        accent: [42, 104, 255],
      },
      {
        id: 'bottom-right',
        center: { x: width - margin, y: height - margin },
        size: fiducialSize,
        accent: [255, 190, 42],
      },
    ],
    primitives: [
      {
        id: 'red-square',
        kind: 'square',
        center: { x: board.x + board.width * 0.22, y: board.y + board.height * 0.25 },
        size: shapeRadius * 1.65,
        color: [225, 32, 42],
      },
      {
        id: 'green-circle',
        kind: 'circle',
        center: { x: board.x + board.width * 0.78, y: board.y + board.height * 0.25 },
        radius: shapeRadius * 0.86,
        color: [18, 170, 74],
      },
      {
        id: 'blue-triangle',
        kind: 'triangle',
        center: { x: board.x + board.width * 0.22, y: board.y + board.height * 0.75 },
        radius: shapeRadius * 1.05,
        color: [38, 86, 225],
      },
      {
        id: 'magenta-diamond',
        kind: 'diamond',
        center: { x: board.x + board.width * 0.78, y: board.y + board.height * 0.75 },
        radius: shapeRadius * 1.05,
        color: [210, 42, 214],
      },
      {
        id: 'cyan-cross',
        kind: 'cross',
        center,
        size: shapeRadius * 2.15,
        color: [0, 174, 204],
      },
    ],
    axes: [
      {
        id: 'x-axis-red',
        from: { x: board.x, y: center.y },
        to: { x: board.x + board.width, y: center.y },
        color: [230, 35, 42],
      },
      {
        id: 'y-axis-green',
        from: { x: center.x, y: board.y + board.height },
        to: { x: center.x, y: board.y },
        color: [22, 172, 78],
      },
      {
        id: 'diagonal-blue',
        from: { x: board.x, y: board.y + board.height },
        to: { x: board.x + board.width, y: board.y },
        color: [36, 92, 230],
      },
    ],
  };
}

function renderTarget(width, height) {
  validateDimensions(width, height);
  const rgb = Buffer.alloc(width * height * 3, 255);
  const geometry = buildTargetGeometry(width, height);
  const stroke = Math.max(3, Math.round(Math.min(width, height) * 0.006));

  fillRect(rgb, width, height, 0, 0, width, height, [252, 252, 248]);
  strokeRect(
    rgb,
    width,
    height,
    stroke,
    stroke,
    width - stroke * 2,
    height - stroke * 2,
    [0, 0, 0],
    stroke
  );
  drawCheckerboard(
    rgb,
    width,
    height,
    geometry.checkerboard.area,
    geometry.checkerboard.columns,
    geometry.checkerboard.rows
  );

  for (const axis of geometry.axes) {
    drawLine(
      rgb,
      width,
      height,
      axis.from.x,
      axis.from.y,
      axis.to.x,
      axis.to.y,
      axis.color,
      stroke
    );
  }

  for (const fiducial of geometry.fiducials) {
    drawFiducial(rgb, width, height, fiducial.center, fiducial.size, fiducial.accent);
  }

  for (const primitive of geometry.primitives) {
    if (primitive.kind === 'square') {
      fillRect(
        rgb,
        width,
        height,
        primitive.center.x - primitive.size / 2,
        primitive.center.y - primitive.size / 2,
        primitive.size,
        primitive.size,
        primitive.color
      );
      strokeRect(
        rgb,
        width,
        height,
        primitive.center.x - primitive.size / 2,
        primitive.center.y - primitive.size / 2,
        primitive.size,
        primitive.size,
        [0, 0, 0],
        Math.max(2, Math.round(stroke * 0.7))
      );
    } else if (primitive.kind === 'circle') {
      fillCircle(
        rgb,
        width,
        height,
        primitive.center.x,
        primitive.center.y,
        primitive.radius,
        primitive.color
      );
      fillCircle(
        rgb,
        width,
        height,
        primitive.center.x,
        primitive.center.y,
        primitive.radius * 0.34,
        [0, 0, 0]
      );
    } else if (primitive.kind === 'triangle') {
      fillTriangle(
        rgb,
        width,
        height,
        [
          { x: primitive.center.x, y: primitive.center.y - primitive.radius },
          {
            x: primitive.center.x - primitive.radius * 1.05,
            y: primitive.center.y + primitive.radius * 0.9,
          },
          {
            x: primitive.center.x + primitive.radius * 1.05,
            y: primitive.center.y + primitive.radius * 0.9,
          },
        ],
        primitive.color
      );
    } else if (primitive.kind === 'diamond') {
      fillDiamond(
        rgb,
        width,
        height,
        primitive.center.x,
        primitive.center.y,
        primitive.radius,
        primitive.color
      );
      fillDiamond(
        rgb,
        width,
        height,
        primitive.center.x,
        primitive.center.y,
        primitive.radius * 0.32,
        [255, 255, 255]
      );
    } else if (primitive.kind === 'cross') {
      const bar = primitive.size * 0.26;
      fillRect(
        rgb,
        width,
        height,
        primitive.center.x - primitive.size / 2,
        primitive.center.y - bar / 2,
        primitive.size,
        bar,
        primitive.color
      );
      fillRect(
        rgb,
        width,
        height,
        primitive.center.x - bar / 2,
        primitive.center.y - primitive.size / 2,
        bar,
        primitive.size,
        primitive.color
      );
      strokeRect(
        rgb,
        width,
        height,
        primitive.center.x - primitive.size / 2,
        primitive.center.y - bar / 2,
        primitive.size,
        bar,
        [0, 0, 0],
        2
      );
      strokeRect(
        rgb,
        width,
        height,
        primitive.center.x - bar / 2,
        primitive.center.y - primitive.size / 2,
        bar,
        primitive.size,
        [0, 0, 0],
        2
      );
    }
  }

  return {
    rgb,
    geometry: {
      width,
      height,
      checkerboard: geometry.checkerboard,
      fiducials: geometry.fiducials.map((fiducial) => ({
        id: fiducial.id,
        center: fiducial.center,
        size: fiducial.size,
        accentRgb: fiducial.accent,
      })),
      primitives: geometry.primitives.map((primitive) => ({
        ...primitive,
        color: undefined,
        rgb: primitive.color,
      })),
      axes: geometry.axes,
    },
  };
}

function writeJson(path, value) {
  const absolute = resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function fileHash(path) {
  const absolute = resolve(REPO_ROOT, path);
  if (!existsSync(absolute)) return undefined;
  return `sha256:${sha256Bytes(readFileSync(absolute))}`;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (receipt.status !== 'pass') errors.push('status must be pass');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.target?.pngHash?.startsWith('sha256:')) errors.push('target PNG hash missing');
  if (!receipt.target?.pngPath) errors.push('target PNG path missing');
  if (!(receipt.target?.width >= 320)) errors.push('target width missing');
  if (!(receipt.target?.height >= 240)) errors.push('target height missing');
  if (!Array.isArray(receipt.target?.primitives) || receipt.target.primitives.length < 5) {
    errors.push('target primitives missing');
  }
  if (!Array.isArray(receipt.target?.fiducials) || receipt.target.fiducials.length !== 4) {
    errors.push('target fiducials missing');
  }
  if (receipt.target?.pngPath) {
    const hash = fileHash(receipt.target.pngPath);
    if (!hash) errors.push('target PNG file missing');
    else if (hash !== receipt.target.pngHash) errors.push('target PNG file hash mismatch');
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:'))
    errors.push('chain receipt hash missing');
  if (!Array.isArray(receipt.chain?.stages) || receipt.chain.stages.length !== 1)
    errors.push('chain stage missing');
  return errors;
}

export async function generateTarget(args = {}) {
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date ?? DEFAULT_DATE));
  const pngPath = resolve(REPO_ROOT, args.png ?? defaultPngForReceipt(outPath));
  const width = args.width ?? DEFAULT_WIDTH;
  const height = args.height ?? DEFAULT_HEIGHT;
  const target = renderTarget(width, height);
  const png = encodeRgbPng(target.rgb, width, height);

  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, png);
  const pngHash = `sha256:${sha256Bytes(png)}`;
  const variant = sha256Text(
    JSON.stringify({
      version: VERSION,
      width,
      height,
      geometry: target.geometry,
    })
  ).slice(0, 12);

  const stage = stageReceipt({
    name: 'target.generate-geometric-control',
    input: {
      width,
      height,
      variant,
    },
    output: {
      pngPath: rel(pngPath),
      pngHash,
      primitives: target.geometry.primitives.map((primitive) => primitive.id),
      fiducials: target.geometry.fiducials.map((fiducial) => fiducial.id),
    },
    metrics: {
      outputBytes: png.byteLength,
      checkerboardColumns: target.geometry.checkerboard.columns,
      checkerboardRows: target.geometry.checkerboard.rows,
      primitiveCount: target.geometry.primitives.length,
      fiducialCount: target.geometry.fiducials.length,
    },
    honestScope:
      'Generates a deterministic high-contrast target. This stage does not prove the target appeared in a camera frame.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-geometric-control-target',
      stages: [stage],
      metrics: {
        status: 'pass',
        width,
        height,
        outputBytes: png.byteLength,
      },
      honestScope:
        'Known target geometry and output PNG were generated locally as camera calibration evidence.',
    }),
    stages: [stage],
  };
  const receipt = withHash({
    id: `holoshell-geometric-control-target-${variant}`,
    schemaVersion: RECEIPT_VERSION,
    targetVersion: VERSION,
    status: 'pass',
    action: 'generate-low-camera-geometric-control-target',
    generatedAt: new Date().toISOString(),
    target: {
      pngPath: rel(pngPath),
      pngHash,
      width,
      height,
      colorSpace: 'srgb-rgb8',
      checkerboard: target.geometry.checkerboard,
      fiducials: target.geometry.fiducials,
      primitives: target.geometry.primitives,
      axes: target.geometry.axes,
      variant,
    },
    honestScope:
      'Offline generated geometry control for inferior-camera workflows. It is a known reference image, not proof of camera capture by itself.',
    chain,
    outputPath: rel(outPath),
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0)
    throw new Error(`Invalid geometric control target receipt: ${errors.join('; ')}`);
  writeJson(outPath, receipt);
  return receipt;
}

export async function selfTest() {
  const out = join('.scratch', 'holoshell-geometric-control-target-self-test', 'receipt.json');
  const png = join('.scratch', 'holoshell-geometric-control-target-self-test', 'target.png');
  const receipt = await generateTarget({ out, png, width: 320, height: 240 });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const bytes = readFileSync(resolve(REPO_ROOT, receipt.target.pngPath));
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    throw new Error('self-test target is not a PNG');
  if (receipt.target.pngHash !== `sha256:${sha256Bytes(bytes)}`)
    throw new Error('self-test PNG hash mismatch');
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const receipt = await selfTest();
    process.stdout.write(`holoshell-geometric-control-target self-test PASS ${receipt.hash}\n`);
    return;
  }
  const receipt = await generateTarget(args);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: receipt.status,
        receiptPath: receipt.outputPath,
        target: {
          path: receipt.target.pngPath,
          pngHash: receipt.target.pngHash,
          width: receipt.target.width,
          height: receipt.target.height,
          primitiveCount: receipt.target.primitives.length,
          fiducialCount: receipt.target.fiducials.length,
        },
      },
      null,
      2
    )}\n`
  );
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('holoshell-geometric-control-target.mjs')
) {
  main().catch((error) => {
    process.stderr.write(
      `holoshell-geometric-control-target FAIL: ${error.stack ?? error.message}\n`
    );
    process.exitCode = 1;
  });
}
