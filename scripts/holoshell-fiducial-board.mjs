#!/usr/bin/env node
/**
 * HoloShell Fiducial Board
 *
 * Generates a deterministic printable calibration board with binary square
 * markers and machine-readable marker metadata. This is a HoloShell-native
 * fiducial pattern; it is not an ArUco/AprilTag dictionary encoder yet.
 */

import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainReceipt, sha256Bytes, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-fiducial-board/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const MARKER_GRID = 7;
const INNER_GRID = 5;

const MARKERS = [
  { id: 11, label: 'north-west', row: 0, col: 0, accent: [225, 32, 42] },
  { id: 23, label: 'north-center', row: 0, col: 1, accent: [0, 174, 204] },
  { id: 37, label: 'north-east', row: 0, col: 2, accent: [18, 170, 74] },
  { id: 41, label: 'center-west', row: 1, col: 0, accent: [255, 190, 42] },
  { id: 53, label: 'center', row: 1, col: 1, accent: [210, 42, 214] },
  { id: 67, label: 'center-east', row: 1, col: 2, accent: [38, 86, 225] },
  { id: 71, label: 'south-west', row: 2, col: 0, accent: [255, 120, 28] },
  { id: 83, label: 'south-center', row: 2, col: 1, accent: [0, 150, 120] },
  { id: 97, label: 'south-east', row: 2, col: 2, accent: [120, 70, 255] },
];

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-fiducial-board', date, 'fiducial-board-receipt.json');
}

function defaultPngForReceipt(outPath) {
  return join(dirname(outPath), 'fiducial-board.png');
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
  if (!Number.isInteger(width) || width < 420 || width > 4096) throw new Error('--width must be 420..4096');
  if (!Number.isInteger(height) || height < 320 || height > 4096) throw new Error('--height must be 320..4096');
}

function printHelp() {
  process.stdout.write(`HoloShell Fiducial Board ${VERSION}

Usage:
  node scripts/holoshell-fiducial-board.mjs [--out receipt.json] [--png board.png]
  node scripts/holoshell-fiducial-board.mjs --width 1280 --height 720
  node scripts/holoshell-fiducial-board.mjs --self-test

Notes:
  - Generates a deterministic printable board with 9 binary square markers.
  - Emits marker ids, expected cell payloads, and board coordinates for later detection.
  - HoloShell-native markers are ArUco-inspired, not OpenCV ArUco/AprilTag compatible.
`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
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

function markerPayload(id) {
  const bits = [];
  let value = (id * 73 + 41) & 0x1ffffff;
  for (let i = 0; i < INNER_GRID * INNER_GRID; i += 1) {
    value = (value * 1103515245 + 12345 + id + i) & 0x7fffffff;
    bits.push((value >>> 9) & 1);
  }
  bits[0] = 1;
  bits[4] = 0;
  bits[20] = id % 2;
  bits[24] = 1;
  return bits;
}

function drawMarker(rgb, width, height, marker, x, y, size) {
  const cell = size / MARKER_GRID;
  const payload = markerPayload(marker.id);
  fillRect(rgb, width, height, x, y, size, size, [255, 255, 255]);
  strokeRect(rgb, width, height, x, y, size, size, [0, 0, 0], Math.max(2, Math.round(cell * 0.16)));
  for (let row = 0; row < MARKER_GRID; row += 1) {
    for (let col = 0; col < MARKER_GRID; col += 1) {
      const border = row === 0 || col === 0 || row === MARKER_GRID - 1 || col === MARKER_GRID - 1;
      const bit = border ? 1 : payload[(row - 1) * INNER_GRID + (col - 1)];
      fillRect(
        rgb,
        width,
        height,
        x + col * cell,
        y + row * cell,
        cell + 0.5,
        cell + 0.5,
        bit ? [0, 0, 0] : [255, 255, 255]
      );
    }
  }
  const accentSize = Math.max(6, cell * 0.42);
  fillRect(rgb, width, height, x + size - accentSize * 1.25, y + accentSize * 0.25, accentSize, accentSize, marker.accent);
  return {
    id: `hs-${marker.id}`,
    numericId: marker.id,
    label: marker.label,
    dictionary: 'holoshell-native-binary-7x7-v1',
    row: marker.row,
    col: marker.col,
    cells: MARKER_GRID,
    innerCells: INNER_GRID,
    payload,
    accentRgb: marker.accent,
    corners: [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size },
    ].map((corner) => ({ x: Math.round(corner.x), y: Math.round(corner.y) })),
    center: { x: Math.round(x + size / 2), y: Math.round(y + size / 2) },
    size: Math.round(size),
  };
}

function drawBoard(width, height) {
  validateDimensions(width, height);
  const rgb = Buffer.alloc(width * height * 3, 248);
  const margin = Math.round(Math.min(width, height) * 0.07);
  const board = {
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
  };
  const gap = Math.round(Math.min(board.width, board.height) * 0.055);
  const markerSize = Math.floor(Math.min((board.width - gap * 4) / 3, (board.height - gap * 4) / 3));
  const startX = Math.round((width - markerSize * 3 - gap * 2) / 2);
  const startY = Math.round((height - markerSize * 3 - gap * 2) / 2);
  fillRect(rgb, width, height, 0, 0, width, height, [250, 250, 246]);
  strokeRect(rgb, width, height, board.x, board.y, board.width, board.height, [0, 0, 0], Math.max(3, Math.round(markerSize * 0.02)));
  fillRect(rgb, width, height, board.x + 6, board.y + 6, board.width - 12, board.height - 12, [255, 255, 255]);
  const markers = MARKERS.map((marker) => drawMarker(
    rgb,
    width,
    height,
    marker,
    startX + marker.col * (markerSize + gap),
    startY + marker.row * (markerSize + gap),
    markerSize
  ));
  const stroke = Math.max(3, Math.round(markerSize * 0.022));
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  fillRect(rgb, width, height, centerX - markerSize * 0.11, centerY - stroke / 2, markerSize * 0.22, stroke, [0, 174, 204]);
  fillRect(rgb, width, height, centerX - stroke / 2, centerY - markerSize * 0.11, stroke, markerSize * 0.22, [210, 42, 214]);
  return {
    rgb,
    geometry: {
      width,
      height,
      board,
      markerGrid: { rows: 3, columns: 3, markerSize, gap, cells: MARKER_GRID, innerCells: INNER_GRID },
      markers,
      fiducials: markers.map((marker) => ({
        id: marker.id,
        center: marker.center,
        size: marker.size,
        accentRgb: marker.accentRgb,
      })),
      primitives: [
        { id: 'cyan-center-axis', kind: 'axis', rgb: [0, 174, 204], center: { x: centerX, y: centerY } },
        { id: 'magenta-center-axis', kind: 'axis', rgb: [210, 42, 214], center: { x: centerX, y: centerY } },
      ],
      axes: [
        { id: 'horizontal-center-axis', from: { x: centerX - markerSize * 0.11, y: centerY }, to: { x: centerX + markerSize * 0.11, y: centerY }, color: [0, 174, 204] },
        { id: 'vertical-center-axis', from: { x: centerX, y: centerY - markerSize * 0.11 }, to: { x: centerX, y: centerY + markerSize * 0.11 }, color: [210, 42, 214] },
      ],
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
  if (receipt.target?.profile !== 'fiducial-board') errors.push('target profile mismatch');
  if (!Array.isArray(receipt.target?.markers) || receipt.target.markers.length !== 9) errors.push('marker metadata missing');
  if (!receipt.target?.markers?.every((marker) => marker.payload?.length === INNER_GRID * INNER_GRID)) {
    errors.push('marker payload missing');
  }
  if (!Array.isArray(receipt.target?.fiducials) || receipt.target.fiducials.length !== 9) errors.push('fiducials missing');
  if (receipt.target?.pngPath) {
    const hash = fileHash(receipt.target.pngPath);
    if (!hash) errors.push('target PNG file missing');
    else if (hash !== receipt.target.pngHash) errors.push('target PNG file hash mismatch');
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
  return errors;
}

export async function generateFiducialBoard(args = {}) {
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date ?? DEFAULT_DATE));
  const pngPath = resolve(REPO_ROOT, args.png ?? defaultPngForReceipt(outPath));
  const width = args.width ?? DEFAULT_WIDTH;
  const height = args.height ?? DEFAULT_HEIGHT;
  const board = drawBoard(width, height);
  const png = encodeRgbPng(board.rgb, width, height);
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, png);
  const pngHash = `sha256:${sha256Bytes(png)}`;
  const variant = sha256Text(JSON.stringify({ version: VERSION, width, height, geometry: board.geometry })).slice(0, 12);
  const stage = stageReceipt({
    name: 'target.generate-fiducial-board',
    input: { width, height, variant },
    output: {
      pngPath: rel(pngPath),
      pngHash,
      markerIds: board.geometry.markers.map((marker) => marker.id),
      dictionary: 'holoshell-native-binary-7x7-v1',
    },
    metrics: {
      outputBytes: png.byteLength,
      markerCount: board.geometry.markers.length,
      cellsPerMarker: MARKER_GRID * MARKER_GRID,
    },
    honestScope:
      'Generates a deterministic HoloShell-native fiducial board. It is not an OpenCV ArUco or AprilTag dictionary encoding.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-fiducial-board',
      stages: [stage],
      metrics: { status: 'pass', width, height, markerCount: board.geometry.markers.length },
      honestScope:
        'Known fiducial board geometry and PNG were generated locally for camera calibration experiments.',
    }),
    stages: [stage],
  };
  const receipt = withHash({
    id: `holoshell-fiducial-board-${variant}`,
    schemaVersion: RECEIPT_VERSION,
    boardVersion: VERSION,
    status: 'pass',
    action: 'generate-low-camera-fiducial-board-target',
    generatedAt: new Date().toISOString(),
    target: {
      profile: 'fiducial-board',
      dictionary: 'holoshell-native-binary-7x7-v1',
      compatibility: {
        opencvAruco: false,
        aprilTag: false,
        reason: 'The board is ArUco-inspired but uses a HoloShell-native deterministic marker dictionary.',
      },
      pngPath: rel(pngPath),
      pngHash,
      width,
      height,
      colorSpace: 'srgb-rgb8',
      board: board.geometry.board,
      markerGrid: board.geometry.markerGrid,
      markers: board.geometry.markers,
      fiducials: board.geometry.fiducials,
      primitives: board.geometry.primitives,
      axes: board.geometry.axes,
      variant,
    },
    honestScope:
      'Printable target for fiducial calibration experiments. This receipt proves target generation and metadata only, not camera detection or pose calibration.',
    chain,
    outputPath: rel(outPath),
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid fiducial board receipt: ${errors.join('; ')}`);
  writeJson(outPath, receipt);
  return receipt;
}

export async function selfTest() {
  const out = join('.scratch', 'holoshell-fiducial-board-self-test', 'receipt.json');
  const png = join('.scratch', 'holoshell-fiducial-board-self-test', 'board.png');
  const receipt = await generateFiducialBoard({ out, png, width: 420, height: 320 });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const bytes = readFileSync(resolve(REPO_ROOT, receipt.target.pngPath));
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('self-test board is not a PNG');
  if (receipt.target.pngHash !== `sha256:${sha256Bytes(bytes)}`) throw new Error('self-test PNG hash mismatch');
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
    process.stdout.write(`holoshell-fiducial-board self-test PASS ${receipt.hash}\n`);
    return;
  }
  const receipt = await generateFiducialBoard(args);
  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    receiptPath: receipt.outputPath,
    target: {
      path: receipt.target.pngPath,
      pngHash: receipt.target.pngHash,
      width: receipt.target.width,
      height: receipt.target.height,
      markerCount: receipt.target.markers.length,
      dictionary: receipt.target.dictionary,
      opencvArucoCompatible: receipt.target.compatibility.opencvAruco,
      aprilTagCompatible: receipt.target.compatibility.aprilTag,
    },
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-fiducial-board.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-fiducial-board FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
