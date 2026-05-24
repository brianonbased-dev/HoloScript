#!/usr/bin/env node
/**
 * HoloShell HoloGram Bridge Renderer
 *
 * Deterministic local renderer for HoloMap point-cloud bridge artifacts. This
 * is the first native HoloMap -> HoloGram consumer: it reads the bridge JSON,
 * loads the exported PLY point cloud, and emits a Looking Glass-style quilt
 * preview PNG plus a receipt.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (args.views !== undefined && (!Number.isInteger(args.views) || args.views < 1 || args.views > 128)) {
    throw new Error('--views must be an integer from 1 to 128');
  }
  if (args.columns !== undefined && (!Number.isInteger(args.columns) || args.columns < 1 || args.columns > 16)) {
    throw new Error('--columns must be an integer from 1 to 16');
  }
  if (args.rows !== undefined && (!Number.isInteger(args.rows) || args.rows < 1 || args.rows > 16)) {
    throw new Error('--rows must be an integer from 1 to 16');
  }
  if (args.exposure !== undefined && (!Number.isFinite(args.exposure) || args.exposure <= 0 || args.exposure > 16)) {
    throw new Error('--exposure must be a number greater than 0 and at most 16');
  }
  if (args.pointRadius !== undefined && (!Number.isInteger(args.pointRadius) || args.pointRadius < 1 || args.pointRadius > 32)) {
    throw new Error('--point-radius must be an integer from 1 to 32');
  }
  if (args.glowRadius !== undefined && (!Number.isInteger(args.glowRadius) || args.glowRadius < 0 || args.glowRadius > 64)) {
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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function hashValue(value) {
  return `sha256:${sha256Text(typeof value === 'string' ? value : JSON.stringify(canonical(value)))}`;
}

function withHash(receipt) {
  const base = { ...receipt, hashAlgorithm: 'sha256' };
  return { ...base, hash: hashValue(base) };
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
    ? 1 + Math.min(useSurfaceFill ? 0.15 : 0.8, Math.log2(temporal.originalPointCount / temporal.renderedPointCount) / 4)
    : 1;
  const exposure = args.exposure ?? Math.max(autoGain, temporalCoverageGain);
  const spacing = Math.sqrt((tileWidth * tileHeight) / Math.max(1, points.length));
  const resolutionRadius = Math.max(2, Math.round(Math.min(tileWidth, tileHeight) / 36));
  const densityRadius = Math.max(1, Math.round(spacing * 0.35));
  const gridDivisor = temporalCollapsed ? 0.95 : 1.4;
  const gridRadius =
    Number.isInteger(tileGrid) && tileGrid > 0
      ? Math.max(2, Math.min(12, Math.round(Math.min(tileWidth, tileHeight) / (tileGrid * gridDivisor))))
      : Math.max(1, Math.min(resolutionRadius, densityRadius));
  const baseRadius = args.pointRadius ?? gridRadius;
  const glowRadius = args.glowRadius ?? Math.max(baseRadius + 2, Math.round(baseRadius * 1.25));
  const surfaceCellWidth = useSurfaceFill ? Math.ceil((tileWidth * 0.8 * 1.35) / tileGrid) : undefined;
  const surfaceCellHeight = useSurfaceFill ? Math.ceil((tileHeight * 0.8 * 1.35) / tileGrid) : undefined;
  return {
    exposure,
    autoExposure: args.autoExposure,
    autoExposureGain: autoGain,
    pointRadius: baseRadius,
    glowRadius,
    surfaceFill: useSurfaceFill,
    surfaceCellWidth,
    surfaceCellHeight,
    surfaceMesh: useSurfaceFill,
    surfaceMeshGrid: useSurfaceFill ? tileGrid : undefined,
    surfaceMeshAlpha: useSurfaceFill ? 0.82 : undefined,
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

function parseAsciiPly(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line) => line.trim() === 'end_header');
  if (end < 0) throw new Error(`PLY missing end_header: ${path}`);
  const vertexLine = lines.slice(0, end).find((line) => line.startsWith('element vertex '));
  const expectedCount = vertexLine ? Number.parseInt(vertexLine.split(/\s+/)[2], 10) : undefined;
  const points = [];
  for (const line of lines.slice(end + 1)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length < 6 || parts.some((value) => Number.isNaN(value))) continue;
    points.push({
      x: parts[0],
      y: parts[1],
      z: parts[2],
      r: Math.max(0, Math.min(255, Math.round(parts[3]))),
      g: Math.max(0, Math.min(255, Math.round(parts[4]))),
      b: Math.max(0, Math.min(255, Math.round(parts[5]))),
      confidence: Number.isFinite(parts[6]) ? parts[6] : 1,
    });
  }
  if (Number.isInteger(expectedCount) && points.length !== expectedCount) {
    throw new Error(`PLY vertex count mismatch: expected ${expectedCount}, decoded ${points.length}`);
  }
  if (points.length < 1) throw new Error(`PLY has no vertices: ${path}`);
  return points;
}

function boundsFor(points) {
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  for (const point of points) {
    bounds.min[0] = Math.min(bounds.min[0], point.x);
    bounds.min[1] = Math.min(bounds.min[1], point.y);
    bounds.min[2] = Math.min(bounds.min[2], point.z);
    bounds.max[0] = Math.max(bounds.max[0], point.x);
    bounds.max[1] = Math.max(bounds.max[1], point.y);
    bounds.max[2] = Math.max(bounds.max[2], point.z);
  }
  return bounds;
}

function inferFrameLayout(points, source) {
  const sourceFrameCount = Number.isInteger(source?.frameCount) ? source.frameCount : undefined;
  const layoutFrameCount = Number.isInteger(source?.frameLayout?.frameCount)
    ? source.frameLayout.frameCount
    : undefined;
  const frameCount = sourceFrameCount ?? layoutFrameCount;
  if (!frameCount || frameCount < 2 || points.length % frameCount !== 0) return undefined;
  const layoutPointsPerFrame = Number.isInteger(source?.frameLayout?.pointsPerFrame)
    ? source.frameLayout.pointsPerFrame
    : undefined;
  const pointsPerFrame = layoutPointsPerFrame ?? points.length / frameCount;
  if (!Number.isInteger(pointsPerFrame) || pointsPerFrame < 1) return undefined;
  if (pointsPerFrame * frameCount !== points.length) return undefined;
  const expectedGridPoints =
    Number.isInteger(source?.tileGrid) && source.tileGrid > 0 ? source.tileGrid * source.tileGrid : undefined;
  return {
    frameCount,
    pointsPerFrame,
    layoutMatchesTileGrid: expectedGridPoints === undefined || expectedGridPoints === pointsPerFrame,
  };
}

function posePosition(frame) {
  const position = frame?.pose?.position;
  if (!Array.isArray(position) || position.length < 3) return undefined;
  const x = Number(position[0]);
  const y = Number(position[1]);
  const z = Number(position[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  return [x, y, z];
}

function frameEntriesForLayout(source, layout) {
  const explicitFrames = Array.isArray(source?.frames) ? source.frames : [];
  const frames = explicitFrames
    .map((frame, index) => {
      const pointOffset = Number.isInteger(frame.pointOffset) ? frame.pointOffset : index * layout.pointsPerFrame;
      const pointCount = Number.isInteger(frame.pointCount) ? frame.pointCount : layout.pointsPerFrame;
      return {
        frameIndex: Number.isInteger(frame.frameIndex) ? frame.frameIndex : index,
        timestampMs: Number.isFinite(Number(frame.timestampMs)) ? Number(frame.timestampMs) : undefined,
        pointOffset,
        pointCount,
        pose: frame.pose,
      };
    })
    .filter((frame) => frame.pointOffset >= 0 && frame.pointCount === layout.pointsPerFrame);

  if (frames.length === layout.frameCount) return frames;
  return Array.from({ length: layout.frameCount }, (_, index) => ({
    frameIndex: index,
    pointOffset: index * layout.pointsPerFrame,
    pointCount: layout.pointsPerFrame,
    pose: undefined,
  }));
}

function hasUsableFramePoses(frames) {
  return frames.length > 1 && frames.every((frame) => posePosition(frame));
}

function frameByIndex(frames) {
  return new Map(frames.map((frame) => [frame.frameIndex, frame]));
}

function usableTileCorrespondence(source, layout, frames) {
  const correspondence = source?.correspondence;
  if (!correspondence || !Array.isArray(correspondence.frameMatches)) return undefined;
  const gridSize = Number.isInteger(correspondence.gridSize)
    ? correspondence.gridSize
    : Math.round(Math.sqrt(layout.pointsPerFrame));
  if (gridSize < 2 || gridSize * gridSize !== layout.pointsPerFrame) return undefined;
  const framesByIndex = frameByIndex(frames);
  const referenceFrameIndex = Number.isInteger(correspondence.referenceFrameIndex)
    ? correspondence.referenceFrameIndex
    : frames[frames.length - 1]?.frameIndex;
  const referenceFrame = framesByIndex.get(referenceFrameIndex);
  if (!referenceFrame) return undefined;

  const matches = correspondence.frameMatches
    .map((match) => {
      const frameIndex = Number.isInteger(match.frameIndex) ? match.frameIndex : undefined;
      const frame = frameIndex !== undefined ? framesByIndex.get(frameIndex) : undefined;
      const shiftTiles = Array.isArray(match.shiftTiles) ? match.shiftTiles.map((value) => Math.trunc(Number(value))) : [];
      const pointOffset = Number.isInteger(match.pointOffset) ? match.pointOffset : frame?.pointOffset;
      const score = Number(match.score);
      if (!frame || shiftTiles.length < 2 || !Number.isInteger(pointOffset)) return undefined;
      return {
        frame,
        frameIndex: frame.frameIndex,
        pointOffset,
        shiftTiles: [shiftTiles[0], shiftTiles[1]],
        score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 1,
        matchedPointCount: Number.isInteger(match.matchedPointCount) ? match.matchedPointCount : undefined,
        overlapRatio: Number.isFinite(Number(match.overlapRatio)) ? Number(match.overlapRatio) : undefined,
      };
    })
    .filter(Boolean);

  if (!matches.some((match) => match.frameIndex === referenceFrame.frameIndex)) {
    matches.push({
      frame: referenceFrame,
      frameIndex: referenceFrame.frameIndex,
      pointOffset: referenceFrame.pointOffset,
      shiftTiles: [0, 0],
      score: 1,
      matchedPointCount: layout.pointsPerFrame,
      overlapRatio: 1,
    });
  }
  if (matches.length < 2) return undefined;

  return {
    method: correspondence.method ?? 'native-tile-flow-v1',
    gridSize,
    referenceFrame,
    referenceFrameIndex: referenceFrame.frameIndex,
    searchRadiusTiles: Number.isInteger(correspondence.searchRadiusTiles) ? correspondence.searchRadiusTiles : undefined,
    trackCount: Number.isInteger(correspondence.trackCount) ? correspondence.trackCount : layout.pointsPerFrame,
    meanMatchScore: Number.isFinite(Number(correspondence.meanMatchScore))
      ? Number(correspondence.meanMatchScore)
      : mean(matches.filter((match) => match.frameIndex !== referenceFrame.frameIndex).map((match) => match.score)),
    meanOverlapRatio: Number.isFinite(Number(correspondence.meanOverlapRatio))
      ? Number(correspondence.meanOverlapRatio)
      : mean(matches.map((match) => match.overlapRatio ?? 0)),
    matches: matches.sort((a, b) => a.frameIndex - b.frameIndex),
  };
}

function referenceCellSize(points, layout, referenceFrame, gridSize) {
  const start = referenceFrame.pointOffset;
  const end = start + layout.pointsPerFrame;
  const framePoints = points.slice(start, end);
  if (framePoints.length < 1) return { x: 0, y: 0 };
  const bounds = boundsFor(framePoints);
  return {
    x: Math.abs(bounds.max[0] - bounds.min[0]) / Math.max(1, gridSize - 1),
    y: Math.abs(bounds.max[1] - bounds.min[1]) / Math.max(1, gridSize - 1),
  };
}

function fuseTemporalFrames(points, layout, frames, options = {}) {
  const align = options.align === true;
  const referenceFrame = align ? frames[frames.length - 1] : undefined;
  const referencePose = align ? posePosition(referenceFrame) : undefined;
  const fused = [];
  for (let i = 0; i < layout.pointsPerFrame; i += 1) {
    let weightSum = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let confidence = 0;
    for (const frame of frames) {
      const point = points[frame.pointOffset + i];
      if (!point) continue;
      const weight = Math.max(0.05, Number.isFinite(point.confidence) ? point.confidence : 1);
      const currentPose = align ? posePosition(frame) : undefined;
      const dx = align && currentPose && referencePose ? referencePose[0] - currentPose[0] : 0;
      const dy = align && currentPose && referencePose ? referencePose[1] - currentPose[1] : 0;
      const dz = align && currentPose && referencePose ? referencePose[2] - currentPose[2] : 0;
      weightSum += weight;
      x += (point.x + dx) * weight;
      y += (point.y + dy) * weight;
      z += (point.z + dz) * weight;
      r += point.r * weight;
      g += point.g * weight;
      b += point.b * weight;
      confidence += Math.max(0, Math.min(1, point.confidence)) * weight;
    }
    if (weightSum <= 0) continue;
    fused.push({
      x: x / weightSum,
      y: y / weightSum,
      z: z / weightSum,
      r: clampByte(r / weightSum),
      g: clampByte(g / weightSum),
      b: clampByte(b / weightSum),
      confidence: confidence / weightSum,
    });
  }
  return fused;
}

function fuseTrackedFrames(points, layout, correspondence) {
  const referencePose = posePosition(correspondence.referenceFrame);
  const cell = referenceCellSize(points, layout, correspondence.referenceFrame, correspondence.gridSize);
  const fused = [];
  const observationCounts = [];
  for (let i = 0; i < layout.pointsPerFrame; i += 1) {
    const refX = i % correspondence.gridSize;
    const refY = Math.floor(i / correspondence.gridSize);
    let weightSum = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let confidence = 0;
    let observations = 0;
    for (const match of correspondence.matches) {
      const sourceX = refX + match.shiftTiles[0];
      const sourceY = refY + match.shiftTiles[1];
      if (sourceX < 0 || sourceY < 0 || sourceX >= correspondence.gridSize || sourceY >= correspondence.gridSize) {
        continue;
      }
      const localIndex = sourceY * correspondence.gridSize + sourceX;
      const point = points[match.pointOffset + localIndex];
      if (!point) continue;
      const currentPose = posePosition(match.frame);
      const dx = currentPose && referencePose ? referencePose[0] - currentPose[0] : 0;
      const dy = currentPose && referencePose ? referencePose[1] - currentPose[1] : 0;
      const dz = currentPose && referencePose ? referencePose[2] - currentPose[2] : 0;
      const confidenceWeight = Math.max(0.05, Number.isFinite(point.confidence) ? point.confidence : 1);
      const matchWeight = Math.max(0.08, match.score);
      const weight = confidenceWeight * matchWeight;
      weightSum += weight;
      x += (point.x - match.shiftTiles[0] * cell.x + dx) * weight;
      y += (point.y + match.shiftTiles[1] * cell.y + dy) * weight;
      z += (point.z + dz) * weight;
      r += point.r * weight;
      g += point.g * weight;
      b += point.b * weight;
      confidence += Math.max(0, Math.min(1, point.confidence)) * weight;
      observations += 1;
    }
    if (weightSum <= 0) continue;
    observationCounts.push(observations);
    fused.push({
      x: x / weightSum,
      y: y / weightSum,
      z: z / weightSum,
      r: clampByte(r / weightSum),
      g: clampByte(g / weightSum),
      b: clampByte(b / weightSum),
      confidence: confidence / weightSum,
    });
  }
  return {
    points: fused,
    stats: {
      renderedPointCount: fused.length,
      meanObservationCount: Number(mean(observationCounts).toFixed(3)),
      trackedFrameCount: correspondence.matches.length,
      correspondenceMethod: correspondence.method,
      correspondenceTrackCount: correspondence.trackCount,
      correspondenceMeanMatchScore: Number(correspondence.meanMatchScore.toFixed(6)),
      correspondenceMeanOverlapRatio: Number(correspondence.meanOverlapRatio.toFixed(6)),
      correspondenceSearchRadiusTiles: correspondence.searchRadiusTiles,
      referenceFrameIndex: correspondence.referenceFrameIndex,
    },
  };
}

function selectTemporalPoints(points, source, requestedMode) {
  const layout = inferFrameLayout(points, source);
  const frames = layout ? frameEntriesForLayout(source, layout) : [];
  const canAlign = hasUsableFramePoses(frames);
  const correspondence = layout ? usableTileCorrespondence(source, layout, frames) : undefined;
  const canTrack = Boolean(correspondence);
  const defaultMode = layout ? (canTrack ? 'tracked' : canAlign ? 'aligned' : 'latest') : 'all';
  const mode = requestedMode ?? defaultMode;
  const base = {
    requestedMode: requestedMode ?? 'auto',
    temporalMode: mode,
    frameCount: layout?.frameCount ?? source?.frameCount,
    pointsPerFrame: layout?.pointsPerFrame,
    originalPointCount: points.length,
    layoutMatchesTileGrid: layout?.layoutMatchesTileGrid,
    framePoseCount: frames.filter((frame) => posePosition(frame)).length || undefined,
    correspondenceFrameCount: correspondence?.matches.length,
  };

  if (!layout || mode === 'all') {
    return {
      points,
      info: {
        ...base,
        temporalMode: !layout && mode !== 'all' ? 'all' : mode,
        renderedPointCount: points.length,
        fallbackReason: !layout && mode !== 'all' ? 'frame layout could not be inferred from bridge metadata' : undefined,
      },
    };
  }

  if (mode === 'tracked' && correspondence) {
    const tracked = fuseTrackedFrames(points, layout, correspondence);
    return {
      points: tracked.points,
      info: {
        ...base,
        renderedPointCount: tracked.stats.renderedPointCount,
        fusedFrameCount: tracked.stats.trackedFrameCount,
        trackedFrameCount: tracked.stats.trackedFrameCount,
        meanObservationCount: tracked.stats.meanObservationCount,
        alignmentMethod: 'tile-flow-correspondence+pose-centroid-translation',
        correspondenceMethod: tracked.stats.correspondenceMethod,
        correspondenceTrackCount: tracked.stats.correspondenceTrackCount,
        correspondenceMeanMatchScore: tracked.stats.correspondenceMeanMatchScore,
        correspondenceMeanOverlapRatio: tracked.stats.correspondenceMeanOverlapRatio,
        correspondenceSearchRadiusTiles: tracked.stats.correspondenceSearchRadiusTiles,
        referenceFrameIndex: tracked.stats.referenceFrameIndex,
        referencePosePosition: posePosition(correspondence.referenceFrame),
      },
    };
  }

  if (mode === 'latest') {
    const selectedFrame = frames[frames.length - 1];
    const selectedFrameIndex = selectedFrame?.frameIndex ?? layout.frameCount - 1;
    const start = selectedFrame?.pointOffset ?? selectedFrameIndex * layout.pointsPerFrame;
    const selected = points.slice(start, start + layout.pointsPerFrame);
    return {
      points: selected,
      info: {
        ...base,
        selectedFrameIndex,
        renderedPointCount: selected.length,
      },
    };
  }

  const align = (mode === 'aligned' || (mode === 'tracked' && !correspondence)) && canAlign;
  const fused = fuseTemporalFrames(points, layout, frames, { align });
  const referenceFrame = align ? frames[frames.length - 1] : undefined;
  return {
    points: fused,
    info: {
      ...base,
      temporalMode: mode === 'tracked' && !correspondence ? (canAlign ? 'aligned' : 'fuse') : mode === 'aligned' && !canAlign ? 'fuse' : mode,
      renderedPointCount: fused.length,
      fusedFrameCount: frames.length,
      alignmentMethod: align ? 'pose-centroid-translation' : undefined,
      referenceFrameIndex: referenceFrame?.frameIndex,
      referencePosePosition: posePosition(referenceFrame),
      fallbackReason:
        mode === 'tracked' && !correspondence
          ? 'bridge did not include usable native tile-flow correspondence'
          : mode === 'aligned' && !canAlign
            ? 'bridge did not include usable per-frame poses'
            : undefined,
    },
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
      blendPixel(rgba, quiltWidth, px, py, color[0], color[1], color[2], alpha * (softness > 0 ? falloff : 1));
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

function projectPoint(point, bounds, zRange, tileX, tileY, tileWidth, tileHeight, cameraOffset) {
  const nx = normalize(point.x, bounds.min[0], bounds.max[0]);
  const ny = normalize(point.y, bounds.min[1], bounds.max[1]);
  const nz = (point.z - bounds.min[2]) / zRange;
  const parallax = cameraOffset * (0.05 + nz * 0.18);
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

function renderSurfaceMesh(rgba, quiltWidth, quiltHeight, points, bounds, tile, cameraOffset, style) {
  const gridSize = style.surfaceMeshGrid;
  if (!Number.isInteger(gridSize) || gridSize < 2 || points.length !== gridSize * gridSize) return;
  const zRange = Math.max(1e-9, bounds.max[2] - bounds.min[2]);
  const projected = points.map((point) => ({
    ...projectPoint(point, bounds, zRange, tile.x, tile.y, tile.width, tile.height, cameraOffset),
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
    rasterizeTriangle(rgba, quiltWidth, quiltHeight, triangle.vertices, style.surfaceMeshAlpha ?? 0.6);
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

async function renderQuiltPreview({ points, bounds, tileWidth, tileHeight, views, columns, rows, style }) {
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
      const projected = projectPoint(point, bounds, zRange, tileX, tileY, tileWidth, tileHeight, cameraOffset);
      const px = projected.x;
      const py = projected.y;
      const confidence = projected.confidence;
      const color = applyExposure(point, style);
      if (style.surfaceMesh) continue;
      if (style.surfaceFill && !style.surfaceMesh && style.surfaceCellWidth > 0 && style.surfaceCellHeight > 0) {
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
        plotPoint(rgba, quiltWidth, quiltHeight, px, py, style.glowRadius, color, 0.12 + confidence * 0.1, 1);
      }
      plotPoint(rgba, quiltWidth, quiltHeight, px, py, style.pointRadius, color, 0.58 + confidence * 0.36, 0.35);
    }
  }

  return {
    png: await encodePng(rgba, quiltWidth, quiltHeight),
    width: quiltWidth,
    height: quiltHeight,
  };
}

export async function renderBridge(args) {
  const bridgePath = resolveInputPath(args.bridge);
  if (!bridgePath || !existsSync(bridgePath)) throw new Error(`Bridge JSON not found: ${args.bridge}`);
  const bridge = JSON.parse(readFileSync(bridgePath, 'utf8'));
  if (bridge.schemaVersion !== 'hologram-bridge/holomap-pointcloud/v1') {
    throw new Error(`Unsupported bridge schema: ${bridge.schemaVersion ?? 'missing'}`);
  }

  const sourceAssets = bridge.source?.assets ?? {};
  const plyPath = resolveInputPath(sourceAssets.ply, dirname(bridgePath));
  if (!plyPath || !existsSync(plyPath)) throw new Error(`PLY asset not found: ${sourceAssets.ply ?? 'missing'}`);
  const points = parseAsciiPly(plyPath);
  const temporal = selectTemporalPoints(points, bridge.source, args.temporalMode);
  const renderPoints = temporal.points;
  const bounds = boundsFor(renderPoints);
  const columns = args.columns ?? bridge.targets?.quilt?.columns ?? 8;
  const rows = args.rows ?? bridge.targets?.quilt?.rows ?? 6;
  const views = args.views ?? bridge.targets?.quilt?.views ?? columns * rows;
  if (views > columns * rows) throw new Error(`views (${views}) cannot exceed columns*rows (${columns * rows})`);
  const style = computeRenderStyle({
    points: renderPoints,
    tileWidth: args.tileWidth,
    tileHeight: args.tileHeight,
    args,
    tileGrid: bridge.source?.tileGrid,
    temporal: temporal.info,
  });

  const outPath = resolve(args.out ?? defaultOutputForBridge(bridgePath));
  const replay = bridge.source?.replayFingerprint ?? sha256Text(readFileSync(bridgePath, 'utf8')).slice(0, 16);
  const variant = sha256Text(JSON.stringify(canonical({
    rendererVersion: VERSION,
    tileWidth: args.tileWidth,
    tileHeight: args.tileHeight,
    views,
    columns,
    rows,
    style,
    temporal: temporal.info,
  }))).slice(0, 8);
  const pngPath = resolve(dirname(outPath), `holoshell-quilt-${String(replay).slice(0, 12)}-${variant}.png`);
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
      variant,
    },
    honestScope:
      'Rendered a deterministic quilt preview from HoloMap point-cloud geometry. Multi-frame previews use native tile-flow correspondence plus pose-centroid translation when bridge metadata is present; this is not optical flow, MV-HEVC, or parallax video encoding.',
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
  if (!(receipt.source?.pointCount > 0)) errors.push('point count missing');
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
  process.stdout.write(`${JSON.stringify({ status: receipt.status, receiptPath: receipt.outputPath, quilt: receipt.quilt }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-hologram-bridge-renderer.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-hologram-bridge-renderer FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
