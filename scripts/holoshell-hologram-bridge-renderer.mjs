#!/usr/bin/env node
/**
 * HoloShell HoloGram Bridge Renderer
 *
 * Deterministic local renderer for HoloMap point-cloud bridge artifacts. This
 * is the first native HoloMap -> HoloGram consumer: it reads the bridge JSON,
 * loads the exported PLY point cloud, and emits a Looking Glass-style quilt
 * preview PNG plus a receipt.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonical,
  chainReceipt,
  sha256Bytes,
  sha256Text,
  stageReceipt,
  withHash,
} from './holoshell/chain/receipts.mjs';
import { parseAsciiPly } from './holoshell/render/parse-ply.mjs';
import { analyzeQuiltQuality } from './holoshell/render/quilt-quality.mjs';
import { boundsFor, selectTemporalPoints } from './holoshell/render/temporal-fusion.mjs';

export const VERSION = '0.5.0';
export const RECEIPT_VERSION = 'holoshell-hologram-bridge-renderer/v5';
const TEMPORAL_MODES = new Set(['all', 'latest', 'fuse', 'aligned', 'tracked']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    bridge: undefined,
    out: undefined,
    tileWidth: 160,
    tileHeight: 120,
    views: undefined,
    columns: undefined,
    rows: undefined,
    exposure: undefined,
    autoExposure: true,
    parallaxScale: undefined,
    surfacePointOverlay: false,
    pointRadius: undefined,
    glowRadius: undefined,
    temporalMode: undefined,
    selfTest: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--bridge') args.bridge = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--tile-width') args.tileWidth = Number.parseInt(argv[++i], 10);
    else if (arg === '--tile-height') args.tileHeight = Number.parseInt(argv[++i], 10);
    else if (arg === '--views') args.views = Number.parseInt(argv[++i], 10);
    else if (arg === '--columns') args.columns = Number.parseInt(argv[++i], 10);
    else if (arg === '--rows') args.rows = Number.parseInt(argv[++i], 10);
    else if (arg === '--exposure') args.exposure = Number.parseFloat(argv[++i]);
    else if (arg === '--no-auto-exposure') args.autoExposure = false;
    else if (arg === '--auto-exposure') args.autoExposure = true;
    else if (arg === '--parallax-scale') args.parallaxScale = Number.parseFloat(argv[++i]);
    else if (arg === '--surface-point-overlay') args.surfacePointOverlay = true;
    else if (arg === '--no-surface-point-overlay') args.surfacePointOverlay = false;
    else if (arg === '--point-radius') args.pointRadius = Number.parseInt(argv[++i], 10);
    else if (arg === '--glow-radius') args.glowRadius = Number.parseInt(argv[++i], 10);
    else if (arg === '--temporal-mode') args.temporalMode = argv[++i];
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.help || args.selfTest) return args;
  if (!args.bridge) throw new Error('--bridge is required');
  if (!Number.isInteger(args.tileWidth) || args.tileWidth < 16 || args.tileWidth > 1024) {
    throw new Error('--tile-width must be an integer from 16 to 1024');
  }
  if (!Number.isInteger(args.tileHeight) || args.tileHeight < 16 || args.tileHeight > 1024) {
    throw new Error('--tile-height must be an integer from 16 to 1024');
  }
  if (
    args.views !== undefined &&
    (!Number.isInteger(args.views) || args.views < 1 || args.views > 128)
  ) {
    throw new Error('--views must be an integer from 1 to 128');
  }
  if (
    args.columns !== undefined &&
    (!Number.isInteger(args.columns) || args.columns < 1 || args.columns > 16)
  ) {
    throw new Error('--columns must be an integer from 1 to 16');
  }
  if (
    args.rows !== undefined &&
    (!Number.isInteger(args.rows) || args.rows < 1 || args.rows > 16)
  ) {
    throw new Error('--rows must be an integer from 1 to 16');
  }
  if (
    args.exposure !== undefined &&
    (!Number.isFinite(args.exposure) || args.exposure <= 0 || args.exposure > 16)
  ) {
    throw new Error('--exposure must be a number greater than 0 and at most 16');
  }
  if (
    args.parallaxScale !== undefined &&
    (!Number.isFinite(args.parallaxScale) || args.parallaxScale <= 0 || args.parallaxScale > 8)
  ) {
    throw new Error('--parallax-scale must be a number greater than 0 and at most 8');
  }
  if (
    args.pointRadius !== undefined &&
    (!Number.isInteger(args.pointRadius) || args.pointRadius < 1 || args.pointRadius > 32)
  ) {
    throw new Error('--point-radius must be an integer from 1 to 32');
  }
  if (
    args.glowRadius !== undefined &&
    (!Number.isInteger(args.glowRadius) || args.glowRadius < 0 || args.glowRadius > 64)
  ) {
    throw new Error('--glow-radius must be an integer from 0 to 64');
  }
  if (args.temporalMode !== undefined && !TEMPORAL_MODES.has(args.temporalMode)) {
    throw new Error('--temporal-mode must be one of: all, latest, fuse, aligned, tracked');
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell HoloGram Bridge Renderer ${VERSION}

Usage:
  node scripts/holoshell-hologram-bridge-renderer.mjs --bridge scan.hologram-bridge.json [--out receipt.json]
  node scripts/holoshell-hologram-bridge-renderer.mjs --bridge scan.hologram-bridge.json --exposure 2.5 --point-radius 5
  node scripts/holoshell-hologram-bridge-renderer.mjs --bridge scan.hologram-bridge.json --parallax-scale 3
  node scripts/holoshell-hologram-bridge-renderer.mjs --bridge scan.hologram-bridge.json --temporal-mode tracked
  node scripts/holoshell-hologram-bridge-renderer.mjs --self-test

Notes:
  - Reads HoloMap point-cloud bridge JSON emitted by holoshell:camera-scan.
  - Emits a deterministic quilt preview PNG and receipt.
  - Multi-frame point clouds with native tile-flow metadata default to --temporal-mode tracked.
  - Auto-exposes dim point clouds by default; pass --no-auto-exposure to disable.
  - Does not claim optical flow, MV-HEVC, or parallax video encoding.
`);
}

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(point) {
  return (0.2126 * point.r + 0.7152 * point.g + 0.0722 * point.b) / 255;
}

function mean(values) {
  if (values.length < 1) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeRenderStyle({ points, tileWidth, tileHeight, args, tileGrid, temporal }) {
  const avgLum = mean(points.map(luminance));
  const autoGain = args.autoExposure ? Math.max(1, Math.min(6, 0.42 / Math.max(0.05, avgLum))) : 1;
  const temporalCollapsed =
    temporal?.temporalMode !== 'all' &&
    temporal?.originalPointCount > temporal?.renderedPointCount &&
    temporal?.renderedPointCount > 0;
  const useSurfaceFill =
    temporalCollapsed &&
    Number.isInteger(tileGrid) &&
    tileGrid > 1 &&
    points.length === tileGrid * tileGrid;
  const temporalCoverageGain = temporalCollapsed
    ? 1 +
      Math.min(
        useSurfaceFill ? 0.15 : 0.8,
        Math.log2(temporal.originalPointCount / temporal.renderedPointCount) / 4
      )
    : 1;
  const exposure = args.exposure ?? Math.max(autoGain, temporalCoverageGain);
  const spacing = Math.sqrt((tileWidth * tileHeight) / Math.max(1, points.length));
  const resolutionRadius = Math.max(2, Math.round(Math.min(tileWidth, tileHeight) / 36));
  const densityRadius = Math.max(1, Math.round(spacing * 0.35));
  const gridDivisor = temporalCollapsed ? 0.95 : 1.4;
  const gridRadius =
    Number.isInteger(tileGrid) && tileGrid > 0
      ? Math.max(
          2,
          Math.min(12, Math.round(Math.min(tileWidth, tileHeight) / (tileGrid * gridDivisor)))
        )
      : Math.max(1, Math.min(resolutionRadius, densityRadius));
  const baseRadius = args.pointRadius ?? gridRadius;
  const glowRadius = args.glowRadius ?? Math.max(baseRadius + 2, Math.round(baseRadius * 1.25));
  const surfaceCellWidth = useSurfaceFill
    ? Math.ceil((tileWidth * 0.8 * 1.35) / tileGrid)
    : undefined;
  const surfaceCellHeight = useSurfaceFill
    ? Math.ceil((tileHeight * 0.8 * 1.35) / tileGrid)
    : undefined;
  const parallaxScale = args.parallaxScale ?? (temporalCollapsed ? 2 : 1.25);
  const surfacePointOverlay = useSurfaceFill && args.surfacePointOverlay;
  return {
    exposure,
    autoExposure: args.autoExposure,
    autoExposureGain: autoGain,
    parallaxScale,
    pointRadius: baseRadius,
    glowRadius,
    surfaceFill: useSurfaceFill,
    surfaceCellWidth,
    surfaceCellHeight,
    surfaceMesh: useSurfaceFill,
    surfaceMeshGrid: useSurfaceFill ? tileGrid : undefined,
    surfaceMeshAlpha: useSurfaceFill ? 0.82 : undefined,
    surfacePointOverlay,
    surfacePointRadius: surfacePointOverlay
      ? Math.max(1, Math.round(baseRadius * 0.65))
      : undefined,
    surfacePointAlpha: surfacePointOverlay ? 0.34 : undefined,
    averageSourceLuminance: Number(avgLum.toFixed(4)),
    averagePointSpacingPx: Number(spacing.toFixed(3)),
    temporalCoverageGain: Number(temporalCoverageGain.toFixed(3)),
    sourceTileGrid: Number.isInteger(tileGrid) && tileGrid > 0 ? tileGrid : undefined,
  };
}

function applyExposure(point, style) {
  const lift = 10;
  return [
    clampByte(point.r * style.exposure + lift),
    clampByte(point.g * style.exposure + lift),
    clampByte(point.b * style.exposure + lift),
  ];
}

function writeJson(path, value) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveInputPath(path, baseDir = REPO_ROOT) {
  if (!path) return undefined;
  const absolute = resolve(path);
  if (existsSync(absolute)) return absolute;
  const repoRelative = resolve(REPO_ROOT, path);
  if (existsSync(repoRelative)) return repoRelative;
  const baseRelative = resolve(baseDir, path);
  if (existsSync(baseRelative)) return baseRelative;
  return repoRelative;
}

function defaultOutputForBridge(bridgePath) {
  const base = basename(bridgePath).replace(/\.hologram-bridge\.json$/i, '');
  return join(dirname(bridgePath), `${base}.quilt-preview-receipt.json`);
}

function buildStageChain({ stages, metrics, honestScope }) {
  const receipt = chainReceipt({
    name: 'holoshell-hologram-bridge-render',
    stages,
    metrics,
    honestScope,
  });
  return {
    receipt,
    stages,
  };
}

function normalize(value, min, max) {
  const span = max - min;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-9) return 0.5;
  return (value - min) / span;
}

function blendPixel(rgba, width, x, y, r, g, b, alpha) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 4;
  if (offset < 0 || offset + 3 >= rgba.length) return;
  const inv = 1 - alpha;
  rgba[offset] = clampByte((rgba[offset] ?? 0) * inv + r * alpha);
  rgba[offset + 1] = clampByte((rgba[offset + 1] ?? 0) * inv + g * alpha);
  rgba[offset + 2] = clampByte((rgba[offset + 2] ?? 0) * inv + b * alpha);
  rgba[offset + 3] = 255;
}

function plotPoint(rgba, quiltWidth, quiltHeight, x, y, radius, color, alpha, softness = 0) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let py = cy - radius; py <= cy + radius; py += 1) {
    if (py < 0 || py >= quiltHeight) continue;
    for (let px = cx - radius; px <= cx + radius; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      const distSq = dx * dx + dy * dy;
      const radiusSq = radius * radius;
      if (distSq > radiusSq) continue;
      const falloff = softness > 0 ? Math.max(0, 1 - Math.sqrt(distSq) / Math.max(1, radius)) : 1;
      blendPixel(
        rgba,
        quiltWidth,
        px,
        py,
        color[0],
        color[1],
        color[2],
        alpha * (softness > 0 ? falloff : 1)
      );
    }
  }
}

function plotRect(rgba, quiltWidth, quiltHeight, x, y, width, height, color, alpha) {
  const left = Math.round(x - width / 2);
  const right = Math.round(x + width / 2);
  const top = Math.round(y - height / 2);
  const bottom = Math.round(y + height / 2);
  for (let py = top; py <= bottom; py += 1) {
    if (py < 0 || py >= quiltHeight) continue;
    for (let px = left; px <= right; px += 1) {
      if (px < 0 || px >= quiltWidth) continue;
      blendPixel(rgba, quiltWidth, px, py, color[0], color[1], color[2], alpha);
    }
  }
}

function projectPoint(
  point,
  bounds,
  zRange,
  tileX,
  tileY,
  tileWidth,
  tileHeight,
  cameraOffset,
  style = {}
) {
  const nx = normalize(point.x, bounds.min[0], bounds.max[0]);
  const ny = normalize(point.y, bounds.min[1], bounds.max[1]);
  const nz = (point.z - bounds.min[2]) / zRange;
  const parallax = cameraOffset * (0.05 + nz * 0.18) * (style.parallaxScale ?? 1);
  return {
    x: tileX + (0.1 + (nx + parallax) * 0.8) * tileWidth,
    y: tileY + (0.9 - ny * 0.8) * tileHeight,
    z: point.z,
    confidence: Math.max(0.2, Math.min(1, point.confidence)),
  };
}

function rasterizeTriangle(rgba, quiltWidth, quiltHeight, vertices, alpha) {
  const [a, b, c] = vertices;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(quiltWidth - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(quiltHeight - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 1e-6) return;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const x = px + 0.5;
      const y = py + 0.5;
      const w0 = ((b.x - x) * (c.y - y) - (b.y - y) * (c.x - x)) / area;
      const w1 = ((c.x - x) * (a.y - y) - (c.y - y) * (a.x - x)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
      const confidence = w0 * a.confidence + w1 * b.confidence + w2 * c.confidence;
      blendPixel(
        rgba,
        quiltWidth,
        px,
        py,
        clampByte(w0 * a.color[0] + w1 * b.color[0] + w2 * c.color[0]),
        clampByte(w0 * a.color[1] + w1 * b.color[1] + w2 * c.color[1]),
        clampByte(w0 * a.color[2] + w1 * b.color[2] + w2 * c.color[2]),
        alpha * (0.5 + confidence * 0.35)
      );
    }
  }
}

function renderSurfaceMesh(
  rgba,
  quiltWidth,
  quiltHeight,
  points,
  bounds,
  tile,
  cameraOffset,
  style
) {
  const gridSize = style.surfaceMeshGrid;
  if (!Number.isInteger(gridSize) || gridSize < 2 || points.length !== gridSize * gridSize) return;
  const zRange = Math.max(1e-9, bounds.max[2] - bounds.min[2]);
  const projected = points.map((point) => ({
    ...projectPoint(
      point,
      bounds,
      zRange,
      tile.x,
      tile.y,
      tile.width,
      tile.height,
      cameraOffset,
      style
    ),
    color: applyExposure(point, style),
  }));
  const triangles = [];
  for (let y = 0; y < gridSize - 1; y += 1) {
    for (let x = 0; x < gridSize - 1; x += 1) {
      const i0 = y * gridSize + x;
      const i1 = i0 + 1;
      const i2 = i0 + gridSize;
      const i3 = i2 + 1;
      const a = projected[i0];
      const b = projected[i1];
      const c = projected[i2];
      const d = projected[i3];
      triangles.push({ z: (a.z + b.z + c.z) / 3, vertices: [a, b, c] });
      triangles.push({ z: (c.z + b.z + d.z) / 3, vertices: [c, b, d] });
    }
  }
  triangles.sort((a, b) => a.z - b.z);
  for (const triangle of triangles) {
    rasterizeTriangle(
      rgba,
      quiltWidth,
      quiltHeight,
      triangle.vertices,
      style.surfaceMeshAlpha ?? 0.6
    );
  }
}

async function encodePng(rgba, width, height) {
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(rgba), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function renderQuiltPreview({
  points,
  bounds,
  tileWidth,
  tileHeight,
  views,
  columns,
  rows,
  style,
}) {
  const quiltWidth = tileWidth * columns;
  const quiltHeight = tileHeight * rows;
  const rgba = new Uint8Array(quiltWidth * quiltHeight * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 4;
    rgba[i + 1] = 7;
    rgba[i + 2] = 11;
    rgba[i + 3] = 255;
  }

  const sorted = [...points].sort((a, b) => a.z - b.z);
  const zRange = Math.max(1e-9, bounds.max[2] - bounds.min[2]);
  for (let view = 0; view < views; view += 1) {
    const col = view % columns;
    const row = Math.floor(view / columns);
    if (row >= rows) break;
    const tileX = col * tileWidth;
    const tileY = row * tileHeight;
    const denom = Math.max(1, views - 1);
    const cameraOffset = (view / denom - 0.5) * 2;
    const tile = { x: tileX, y: tileY, width: tileWidth, height: tileHeight };

    if (style.surfaceMesh) {
      renderSurfaceMesh(rgba, quiltWidth, quiltHeight, points, bounds, tile, cameraOffset, style);
    }

    for (const point of sorted) {
      const projected = projectPoint(
        point,
        bounds,
        zRange,
        tileX,
        tileY,
        tileWidth,
        tileHeight,
        cameraOffset,
        style
      );
      const px = projected.x;
      const py = projected.y;
      const confidence = projected.confidence;
      const color = applyExposure(point, style);
      if (style.surfaceMesh && !style.surfacePointOverlay) continue;
      if (style.surfaceMesh && style.surfacePointOverlay) {
        plotPoint(
          rgba,
          quiltWidth,
          quiltHeight,
          px,
          py,
          style.surfacePointRadius,
          color,
          style.surfacePointAlpha + confidence * 0.16,
          0.15
        );
        continue;
      }
      if (
        style.surfaceFill &&
        !style.surfaceMesh &&
        style.surfaceCellWidth > 0 &&
        style.surfaceCellHeight > 0
      ) {
        plotRect(
          rgba,
          quiltWidth,
          quiltHeight,
          px,
          py,
          style.surfaceCellWidth,
          style.surfaceCellHeight,
          color,
          0.34 + confidence * 0.2
        );
      }
      if (!style.surfaceMesh && style.glowRadius > style.pointRadius) {
        plotPoint(
          rgba,
          quiltWidth,
          quiltHeight,
          px,
          py,
          style.glowRadius,
          color,
          0.12 + confidence * 0.1,
          1
        );
      }
      plotPoint(
        rgba,
        quiltWidth,
        quiltHeight,
        px,
        py,
        style.pointRadius,
        color,
        0.58 + confidence * 0.36,
        0.35
      );
    }
  }

  return {
    png: await encodePng(rgba, quiltWidth, quiltHeight),
    quality: analyzeQuiltQuality({
      rgba,
      width: quiltWidth,
      height: quiltHeight,
      tileWidth,
      tileHeight,
      columns,
      rows,
      views,
    }),
    width: quiltWidth,
    height: quiltHeight,
  };
}

export async function renderBridge(args) {
  const bridgePath = resolveInputPath(args.bridge);
  if (!bridgePath || !existsSync(bridgePath))
    throw new Error(`Bridge JSON not found: ${args.bridge}`);
  const bridgeText = readFileSync(bridgePath, 'utf8');
  const bridgeHash = `sha256:${sha256Bytes(Buffer.from(bridgeText, 'utf8'))}`;
  const bridge = JSON.parse(bridgeText);
  if (bridge.schemaVersion !== 'hologram-bridge/holomap-pointcloud/v1') {
    throw new Error(`Unsupported bridge schema: ${bridge.schemaVersion ?? 'missing'}`);
  }

  const sourceAssets = bridge.source?.assets ?? {};
  const plyPath = resolveInputPath(sourceAssets.ply, dirname(bridgePath));
  if (!plyPath || !existsSync(plyPath))
    throw new Error(`PLY asset not found: ${sourceAssets.ply ?? 'missing'}`);
  const plyHash = `sha256:${sha256Bytes(readFileSync(plyPath))}`;
  const points = parseAsciiPly(plyPath);
  const temporal = selectTemporalPoints(points, bridge.source, args.temporalMode);
  const renderPoints = temporal.points;
  const bounds = boundsFor(renderPoints);
  const columns = args.columns ?? bridge.targets?.quilt?.columns ?? 8;
  const rows = args.rows ?? bridge.targets?.quilt?.rows ?? 6;
  const views = args.views ?? bridge.targets?.quilt?.views ?? columns * rows;
  if (views > columns * rows)
    throw new Error(`views (${views}) cannot exceed columns*rows (${columns * rows})`);
  const style = computeRenderStyle({
    points: renderPoints,
    tileWidth: args.tileWidth,
    tileHeight: args.tileHeight,
    args,
    tileGrid: bridge.source?.tileGrid,
    temporal: temporal.info,
  });

  const outPath = resolve(args.out ?? defaultOutputForBridge(bridgePath));
  const replay =
    bridge.source?.replayFingerprint ?? sha256Text(readFileSync(bridgePath, 'utf8')).slice(0, 16);
  const variant = sha256Text(
    JSON.stringify(
      canonical({
        rendererVersion: VERSION,
        tileWidth: args.tileWidth,
        tileHeight: args.tileHeight,
        views,
        columns,
        rows,
        style,
        temporal: temporal.info,
      })
    )
  ).slice(0, 8);
  const pngPath = resolve(
    dirname(outPath),
    `holoshell-quilt-${String(replay).slice(0, 12)}-${variant}.png`
  );
  mkdirSync(dirname(outPath), { recursive: true });

  const quilt = await renderQuiltPreview({
    points: renderPoints,
    bounds,
    tileWidth: args.tileWidth,
    tileHeight: args.tileHeight,
    views,
    columns,
    rows,
    style,
  });
  writeFileSync(pngPath, quilt.png);
  const pngHash = `sha256:${sha256Bytes(quilt.png)}`;
  const ingestStage = stageReceipt({
    name: 'ingest.bridge-and-ply',
    input: {
      bridgePath: rel(bridgePath),
      plyPath: rel(plyPath),
    },
    output: {
      bridgeHash,
      plyHash,
      sourceKind: bridge.source.kind,
      originalPointCount: points.length,
      targetViews: views,
    },
    metrics: {
      frameCount: bridge.source.frameCount,
      pointsPerFrame: bridge.source.frameLayout?.pointsPerFrame,
    },
    honestScope:
      'Loads the HoloMap bridge and ASCII PLY point cloud. This stage does not modify geometry.',
  });
  const temporalStage = stageReceipt({
    name: 'temporal.selection',
    input: {
      requestedMode: args.temporalMode ?? 'auto',
      originalPointCount: points.length,
      frameCount: bridge.source.frameCount,
    },
    output: temporal.info,
    metrics: {
      renderedPointCount: renderPoints.length,
      fallbackReason: temporal.info.fallbackReason,
    },
    honestScope:
      'Selects or fuses frame-major point clouds using bridge metadata; native tile-flow is not optical flow.',
  });
  const renderStage = stageReceipt({
    name: 'render.quilt-preview',
    input: {
      tileWidth: args.tileWidth,
      tileHeight: args.tileHeight,
      views,
      columns,
      rows,
      style,
      variant,
    },
    output: {
      pngHash,
      path: rel(pngPath),
      width: quilt.width,
      height: quilt.height,
      quality: quilt.quality,
    },
    metrics: {
      renderedPointCount: renderPoints.length,
      outputBytes: quilt.png.byteLength,
      qualityScore: quilt.quality.score,
      warningCount: quilt.quality.warnings.length,
    },
    honestScope:
      'Deterministic quilt preview rasterization. This is not MV-HEVC or parallax video encoding.',
  });
  const chain = buildStageChain({
    stages: [ingestStage, temporalStage, renderStage],
    metrics: {
      status: 'pass',
      pointCount: renderPoints.length,
      views,
      outputBytes: quilt.png.byteLength,
    },
    honestScope:
      'Bridge ingest, temporal point selection, and quilt preview rendering were executed as an ordered local chain.',
  });

  const receipt = withHash({
    id: `holoshell-hologram-quilt-${String(replay).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    rendererVersion: VERSION,
    status: 'pass',
    action: 'render-holomap-pointcloud-quilt-preview',
    bridgePath: rel(bridgePath),
    source: {
      kind: bridge.source.kind,
      replayFingerprint: bridge.source.replayFingerprint,
      pointCloudHash: bridge.source.pointCloudHash,
      pointCount: renderPoints.length,
      originalPointCount: points.length,
      frameCount: temporal.info.frameCount,
      pointsPerFrame: temporal.info.pointsPerFrame,
      temporalMode: temporal.info.temporalMode,
      temporalSelection: {
        requestedMode: temporal.info.requestedMode,
        selectedFrameIndex: temporal.info.selectedFrameIndex,
        renderedPointCount: temporal.info.renderedPointCount,
        originalPointCount: temporal.info.originalPointCount,
        layoutMatchesTileGrid: temporal.info.layoutMatchesTileGrid,
        framePoseCount: temporal.info.framePoseCount,
        fusedFrameCount: temporal.info.fusedFrameCount,
        trackedFrameCount: temporal.info.trackedFrameCount,
        meanObservationCount: temporal.info.meanObservationCount,
        alignmentMethod: temporal.info.alignmentMethod,
        correspondenceMethod: temporal.info.correspondenceMethod,
        correspondenceFrameCount: temporal.info.correspondenceFrameCount,
        correspondenceTrackCount: temporal.info.correspondenceTrackCount,
        correspondenceMeanMatchScore: temporal.info.correspondenceMeanMatchScore,
        correspondenceMeanOverlapRatio: temporal.info.correspondenceMeanOverlapRatio,
        correspondenceSearchRadiusTiles: temporal.info.correspondenceSearchRadiusTiles,
        referenceFrameIndex: temporal.info.referenceFrameIndex,
        referencePosePosition: temporal.info.referencePosePosition,
        fallbackReason: temporal.info.fallbackReason,
      },
      plyPath: rel(plyPath),
    },
    quilt: {
      path: rel(pngPath),
      pngHash,
      width: quilt.width,
      height: quilt.height,
      tileWidth: args.tileWidth,
      tileHeight: args.tileHeight,
      views,
      columns,
      rows,
      style,
      quality: quilt.quality,
      variant,
    },
    honestScope:
      'Rendered a deterministic quilt preview from HoloMap point-cloud geometry. Multi-frame previews use native tile-flow correspondence plus pose-centroid translation when bridge metadata is present; this is not optical flow, MV-HEVC, or parallax video encoding.',
    chain,
    outputPath: rel(outPath),
  });
  writeJson(outPath, receipt);
  return receipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (receipt.status !== 'pass') errors.push('status must be pass');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.quilt?.pngHash?.startsWith('sha256:')) errors.push('quilt PNG hash missing');
  if (!(receipt.quilt?.quality?.score >= 0)) errors.push('quilt quality score missing');
  if (!(receipt.source?.pointCount > 0)) errors.push('point count missing');
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:'))
    errors.push('chain receipt hash missing');
  if (!Array.isArray(receipt.chain?.stages) || receipt.chain.stages.length < 1)
    errors.push('chain stages missing');
  return errors;
}

export async function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'holoshell-hologram-bridge-renderer-'));
  try {
    const plyPath = join(dir, 'scan.ply');
    const bridgePath = join(dir, 'scan.hologram-bridge.json');
    const outPath = join(dir, 'receipt.json');
    writeFileSync(
      plyPath,
      [
        'ply',
        'format ascii 1.0',
        'element vertex 4',
        'property float x',
        'property float y',
        'property float z',
        'property uchar red',
        'property uchar green',
        'property uchar blue',
        'property float confidence',
        'end_header',
        '-0.4 -0.4 0.1 255 64 64 0.9',
        '0.4 -0.4 0.2 64 255 64 0.8',
        '-0.4 0.4 0.3 64 64 255 0.7',
        '0.4 0.4 0.4 255 255 64 0.6',
      ].join('\n') + '\n',
      'utf8'
    );
    const pointCloudHash = `sha256:${sha256Bytes(readFileSync(plyPath))}`;
    writeJson(bridgePath, {
      schemaVersion: 'hologram-bridge/holomap-pointcloud/v1',
      status: 'geometry-ready',
      source: {
        kind: 'holomap-pointcloud',
        replayFingerprint: 'selftest-replay',
        pointCloudHash,
        pointCount: 4,
        frameCount: 1,
        bounds: { min: [-0.4, -0.4, 0.1], max: [0.4, 0.4, 0.4] },
        assets: { ply: plyPath },
      },
      targets: {
        quilt: { status: 'ready-for-render', views: 4, columns: 2, rows: 2, sourceAsset: 'ply' },
      },
    });
    const receipt = await renderBridge({
      bridge: bridgePath,
      out: outPath,
      tileWidth: 32,
      tileHeight: 24,
    });
    const errors = validateReceipt(receipt);
    if (errors.length > 0) throw new Error(errors.join('; '));
    const png = readFileSync(resolve(REPO_ROOT, receipt.quilt.path));
    if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
      throw new Error('self-test quilt is not a PNG');
    }
    return receipt;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const receipt = await selfTest();
    process.stdout.write(`holoshell-hologram-bridge-renderer self-test PASS ${receipt.hash}\n`);
    return;
  }

  const receipt = await renderBridge(args);
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid receipt: ${errors.join('; ')}`);
  process.stdout.write(
    `${JSON.stringify({ status: receipt.status, receiptPath: receipt.outputPath, quilt: receipt.quilt }, null, 2)}\n`
  );
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('holoshell-hologram-bridge-renderer.mjs')
) {
  main().catch((error) => {
    process.stderr.write(
      `holoshell-hologram-bridge-renderer FAIL: ${error.stack ?? error.message}\n`
    );
    process.exitCode = 1;
  });
}
