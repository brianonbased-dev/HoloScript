#!/usr/bin/env node
/**
 * HoloShell Target-In-Frame Analyzer
 *
 * Decodes the untouched camera control frame and checks whether the generated
 * control target appears in those pixels. This is a visibility gate,
 * not a camera-pose or fiducial-id solver.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainReceipt, sha256Bytes, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';
import { generateFiducialBoard } from './holoshell-fiducial-board.mjs';
import { generateTarget } from './holoshell-geometric-control-target.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-target-in-frame/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-target-in-frame', date, 'target-in-frame-receipt.json');
}

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    workflow: undefined,
    frame: undefined,
    target: undefined,
    out: undefined,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--workflow') args.workflow = argv[++i];
    else if (arg === '--frame') args.frame = argv[++i];
    else if (arg === '--target') args.target = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Target-In-Frame Analyzer ${VERSION}

Usage:
  node scripts/holoshell-target-in-frame-analyzer.mjs --workflow low-camera-workflow.json [--out receipt.json]
  node scripts/holoshell-target-in-frame-analyzer.mjs --frame camera-frame.jpg --target control-target-receipt.json
  node scripts/holoshell-target-in-frame-analyzer.mjs --self-test

Notes:
  - Reads the untouched camera control frame, not preprocessed HoloMap pixels.
  - Detects target visibility with palette, contrast, and checker/fiducial signal heuristics.
  - Does not claim ArUco/AprilTag ids, camera intrinsics, or solvePnP pose; board homography reprojection is planar-only.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));
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

async function decodeImage(path) {
  const sharp = (await import('sharp')).default;
  const imagePath = resolveInputPath(path);
  if (!imagePath || !existsSync(imagePath)) throw new Error(`Image not found: ${path}`);
  const { data, info } = await sharp(imagePath)
    .rotate()
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 3) throw new Error(`Expected RGB image, got ${info.channels} channels`);
  return {
    path: imagePath,
    rgb: Buffer.from(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function uniquePaletteColor(palette, candidate) {
  if (!Array.isArray(candidate.rgb) || candidate.rgb.length < 3) return;
  if (candidate.rgb.every((channel) => channel < 40) || candidate.rgb.every((channel) => channel > 215)) return;
  const key = candidate.rgb.slice(0, 3).join(',');
  if (palette.some((entry) => entry.key === key)) return;
  palette.push({
    key,
    id: candidate.id,
    kind: candidate.kind,
    rgb: candidate.rgb.slice(0, 3).map((value) => Math.round(value)),
  });
}

function paletteFromTarget(targetReceipt) {
  const target = targetReceipt?.target ?? targetReceipt;
  const palette = [];
  for (const primitive of target?.primitives ?? []) {
    uniquePaletteColor(palette, { id: primitive.id, kind: primitive.kind, rgb: primitive.rgb ?? primitive.color });
  }
  for (const fiducial of target?.fiducials ?? []) {
    uniquePaletteColor(palette, { id: fiducial.id, kind: 'fiducial-accent', rgb: fiducial.accentRgb ?? fiducial.accent });
  }
  for (const axis of target?.axes ?? []) {
    uniquePaletteColor(palette, { id: axis.id, kind: 'axis', rgb: axis.color });
  }
  return palette;
}

function colorDistanceSq(r, g, b, color) {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return dr * dr + dg * dg + db * db;
}

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function updateBounds(bounds, x, y) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function materializeBounds(bounds) {
  return bounds.maxX >= bounds.minX
    ? {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        width: bounds.maxX - bounds.minX + 1,
        height: bounds.maxY - bounds.minY + 1,
      }
    : undefined;
}

function pointFromBounds(id, x, y) {
  return { id, x: Math.round(x), y: Math.round(y) };
}

function cornersFromBounds(id, bounds) {
  return [
    pointFromBounds(`${id}-top-left`, bounds.minX, bounds.minY),
    pointFromBounds(`${id}-top-right`, bounds.maxX, bounds.minY),
    pointFromBounds(`${id}-bottom-right`, bounds.maxX, bounds.maxY),
    pointFromBounds(`${id}-bottom-left`, bounds.minX, bounds.maxY),
  ];
}

function mergeBounds(boundsList) {
  const merged = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
  for (const bounds of boundsList) {
    if (!bounds) continue;
    updateBounds(merged, bounds.minX, bounds.minY);
    updateBounds(merged, bounds.maxX, bounds.maxY);
  }
  return materializeBounds(merged);
}

function pixelLuminance(decoded, x, y) {
  const px = Math.max(0, Math.min(decoded.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(decoded.height - 1, Math.round(y)));
  const offset = (py * decoded.width + px) * decoded.channels;
  return luminance(decoded.rgb[offset], decoded.rgb[offset + 1], decoded.rgb[offset + 2]);
}

function averageLuminance(decoded, x, y, radius) {
  let sum = 0;
  let count = 0;
  const left = Math.max(0, Math.round(x - radius));
  const right = Math.min(decoded.width - 1, Math.round(x + radius));
  const top = Math.max(0, Math.round(y - radius));
  const bottom = Math.min(decoded.height - 1, Math.round(y + radius));
  for (let py = top; py <= bottom; py += 1) {
    for (let px = left; px <= right; px += 1) {
      sum += pixelLuminance(decoded, px, py);
      count += 1;
    }
  }
  return count > 0 ? sum / count : 1;
}

function darkMask(decoded, threshold = 0.24) {
  const total = decoded.width * decoded.height;
  const mask = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const offset = index * decoded.channels;
    const y = luminance(decoded.rgb[offset], decoded.rgb[offset + 1], decoded.rgb[offset + 2]);
    if (y <= threshold) mask[index] = 1;
  }
  return mask;
}

function connectedDarkComponents(decoded) {
  const { width, height } = decoded;
  const mask = darkMask(decoded);
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 };
    let pixels = 0;
    while (stack.length > 0) {
      const index = stack.pop();
      pixels += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      updateBounds(bounds, x, y);
      const neighbors = [
        index - 1,
        index + 1,
        index - width,
        index + width,
      ];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        const nx = next % width;
        if (Math.abs(nx - x) > 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    const box = materializeBounds(bounds);
    if (box) components.push({ ...box, pixels });
  }
  return components;
}

function markerLikeComponents(decoded) {
  const minSide = Math.max(8, Math.min(decoded.width, decoded.height) * 0.075);
  const maxSide = Math.min(decoded.width, decoded.height) * 0.48;
  return connectedDarkComponents(decoded)
    .map((component) => {
      const side = Math.max(component.width, component.height);
      const aspect = component.width / Math.max(1, component.height);
      const fillRatio = component.pixels / Math.max(1, component.width * component.height);
      const squareScore = 1 - Math.min(1, Math.abs(1 - aspect));
      const sizeScore = clamp01((side - minSide) / Math.max(1, maxSide - minSide));
      const fillScore = fillRatio >= 0.08 && fillRatio <= 0.88 ? 1 : 0;
      return {
        ...component,
        aspect: round(aspect),
        fillRatio: round(fillRatio),
        markerScore: round(squareScore * 0.58 + sizeScore * 0.22 + fillScore * 0.2),
      };
    })
    .filter((component) => {
      const side = Math.max(component.width, component.height);
      return (
        side >= minSide &&
        side <= maxSide &&
        component.aspect >= 0.62 &&
        component.aspect <= 1.62 &&
        component.fillRatio >= 0.08 &&
        component.fillRatio <= 0.88 &&
        component.markerScore >= 0.58
      );
    })
    .sort((a, b) => b.markerScore - a.markerScore || b.pixels - a.pixels);
}

function sampleMarkerPayload(decoded, bounds, markerGrid = 7, innerGrid = 5) {
  const payload = [];
  const cellWidth = bounds.width / markerGrid;
  const cellHeight = bounds.height / markerGrid;
  const radius = Math.max(0.5, Math.min(cellWidth, cellHeight) * 0.16);
  for (let row = 1; row <= innerGrid; row += 1) {
    for (let col = 1; col <= innerGrid; col += 1) {
      const x = bounds.minX + (col + 0.5) * cellWidth;
      const y = bounds.minY + (row + 0.5) * cellHeight;
      payload.push(averageLuminance(decoded, x, y, radius) <= 0.5 ? 1 : 0);
    }
  }
  return payload;
}

function hammingDistance(a, b) {
  const length = Math.min(a?.length ?? 0, b?.length ?? 0);
  if (length === 0 || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < length; i += 1) if (a[i] !== b[i]) distance += 1;
  return distance;
}

function bestMarkerMatch(decodedPayload, targetMarkers) {
  let best;
  for (const marker of targetMarkers) {
    const distance = hammingDistance(decodedPayload, marker.payload);
    if (!best || distance < best.distance) best = { marker, distance };
  }
  return best;
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return undefined;
    if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];
    const div = a[col][col];
    for (let k = col; k <= n; k += 1) a[col][k] /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) < 1e-14) continue;
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row) => row[n]);
}

function estimateHomography(correspondences) {
  if (!Array.isArray(correspondences) || correspondences.length < 4) return undefined;
  const normal = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0));
  const rhs = Array.from({ length: 8 }, () => 0);
  for (const point of correspondences) {
    const x = point.source.x;
    const y = point.source.y;
    const u = point.image.x;
    const v = point.image.y;
    const rows = [
      { a: [x, y, 1, 0, 0, 0, -u * x, -u * y], b: u },
      { a: [0, 0, 0, x, y, 1, -v * x, -v * y], b: v },
    ];
    for (const row of rows) {
      for (let i = 0; i < 8; i += 1) {
        rhs[i] += row.a[i] * row.b;
        for (let j = 0; j < 8; j += 1) normal[i][j] += row.a[i] * row.a[j];
      }
    }
  }
  const h = solveLinearSystem(normal, rhs);
  if (!h) return undefined;
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

function applyHomography(matrix, point) {
  const x = point.x;
  const y = point.y;
  const denom = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
  if (Math.abs(denom) < 1e-10) return undefined;
  return {
    x: (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / denom,
    y: (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / denom,
  };
}

function buildBoardCorrespondences(recoveredMarkers, targetMarkers) {
  const targetById = new Map(targetMarkers.map((marker) => [marker.id, marker]));
  const correspondences = [];
  for (const marker of recoveredMarkers) {
    const targetMarker = targetById.get(marker.id);
    if (!targetMarker || !Array.isArray(targetMarker.corners) || targetMarker.corners.length < 4) continue;
    for (let i = 0; i < 4; i += 1) {
      const source = targetMarker.corners[i];
      const image = marker.corners[i];
      if (!source || !image) continue;
      correspondences.push({
        markerId: marker.id,
        cornerIndex: i,
        source: { x: source.x, y: source.y },
        image: { x: image.x, y: image.y },
      });
    }
  }
  return correspondences;
}

function estimateBoardHomography(markers, target) {
  const targetMarkers = Array.isArray(target?.markers) ? target.markers : [];
  const correspondences = buildBoardCorrespondences(markers, targetMarkers);
  if (correspondences.length < 8) {
    return {
      status: 'insufficient-correspondences',
      correspondenceCount: correspondences.length,
      homographyReady: false,
      calibrationReady: false,
    };
  }
  const matrix = estimateHomography(correspondences);
  if (!matrix) {
    return {
      status: 'solve-failed',
      correspondenceCount: correspondences.length,
      homographyReady: false,
      calibrationReady: false,
    };
  }
  const residuals = correspondences.map((point) => {
    const projected = applyHomography(matrix, point.source);
    const dx = projected ? projected.x - point.image.x : Infinity;
    const dy = projected ? projected.y - point.image.y : Infinity;
    const error = Math.sqrt(dx * dx + dy * dy);
    return {
      markerId: point.markerId,
      cornerIndex: point.cornerIndex,
      source: point.source,
      projected: projected ? { x: round(projected.x, 3), y: round(projected.y, 3) } : undefined,
      observed: point.image,
      error: round(error, 6),
    };
  });
  const finiteErrors = residuals.map((residual) => residual.error).filter((error) => Number.isFinite(error));
  const rmsError = Math.sqrt(finiteErrors.reduce((sum, error) => sum + error * error, 0) / Math.max(1, finiteErrors.length));
  const maxError = finiteErrors.length > 0 ? Math.max(...finiteErrors) : Infinity;
  return {
    status: Number.isFinite(rmsError) ? 'homography-estimated' : 'solve-failed',
    model: 'planar-board-to-image-homography',
    homographyReady: Number.isFinite(rmsError),
    calibrationReady: false,
    solvePnPReady: false,
    cameraIntrinsicsRequired: true,
    correspondenceCount: correspondences.length,
    markerCount: markers.length,
    matrix: matrix.map((row) => row.map((value) => round(value, 8))),
    reprojection: {
      rmsPixels: round(rmsError),
      maxPixels: round(maxError),
      residuals,
    },
    honestScope:
      'Planar board-to-image homography from recovered marker corners. This is useful for 2D anchoring and reprojection error, not a 3D camera pose or camera calibration.',
  };
}

function recoverFiducialMarkers(decoded, target) {
  const targetMarkers = Array.isArray(target?.markers) ? target.markers : [];
  const markerGrid = Number(target?.markerGrid?.cells ?? 7);
  const innerGrid = Number(target?.markerGrid?.innerCells ?? 5);
  if (target?.profile !== 'fiducial-board' || targetMarkers.length === 0) {
    return {
      status: 'not-applicable',
      markers: [],
      recoveredMarkerCount: 0,
      markerCornerCount: 0,
      poseSolveInputReady: false,
    };
  }
  const components = markerLikeComponents(decoded);
  const byId = new Map();
  const maxDistance = Math.max(3, Math.ceil(innerGrid * innerGrid * 0.24));
  for (const component of components) {
    const decodedPayload = sampleMarkerPayload(decoded, component, markerGrid, innerGrid);
    const match = bestMarkerMatch(decodedPayload, targetMarkers);
    if (!match || match.distance > maxDistance) continue;
    const confidence = round(1 - match.distance / Math.max(1, innerGrid * innerGrid));
    const markerId = match.marker.id;
    const candidate = {
      id: markerId,
      numericId: match.marker.numericId,
      label: match.marker.label,
      row: match.marker.row,
      col: match.marker.col,
      dictionary: match.marker.dictionary ?? target.dictionary,
      corners: cornersFromBounds(markerId, component),
      center: {
        x: Math.round(component.minX + component.width / 2),
        y: Math.round(component.minY + component.height / 2),
      },
      bounds: {
        minX: component.minX,
        minY: component.minY,
        maxX: component.maxX,
        maxY: component.maxY,
        width: component.width,
        height: component.height,
      },
      decodedPayload,
      hammingDistance: match.distance,
      confidence,
      componentPixels: component.pixels,
      fillRatio: component.fillRatio,
      source: 'native-dark-component-payload-match',
    };
    const previous = byId.get(markerId);
    if (!previous || candidate.hammingDistance < previous.hammingDistance || candidate.confidence > previous.confidence) {
      byId.set(markerId, candidate);
    }
  }
  const markers = Array.from(byId.values()).sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0));
  const poseSolveInputReady = markers.length >= 4 && markers.every((marker) => marker.corners.length === 4);
  const homography = estimateBoardHomography(markers, target);
  return {
    status: poseSolveInputReady ? 'markers-detected' : 'markers-not-detected',
    markers,
    recoveredMarkerCount: markers.length,
    markerCornerCount: markers.length * 4,
    poseSolveInputReady,
    componentCount: components.length,
    dictionary: target.dictionary,
    bounds: mergeBounds(markers.map((marker) => marker.bounds)),
    homography,
    honestScope:
      'Native HoloShell marker recovery from dark square components and 5x5 payload sampling. Corners are axis-aligned image-space candidates, not solvePnP pose.',
  };
}

function analyzePixels(decoded, palette, options = {}) {
  const { rgb, width, height, channels } = decoded;
  const total = width * height;
  const lum = new Float32Array(total);
  const paletteCounts = new Map(palette.map((entry) => [entry.key, 0]));
  const colorBbox = { minX: width, minY: height, maxX: -1, maxY: -1 };
  const darkBbox = { minX: width, minY: height, maxX: -1, maxY: -1 };
  let colorMatches = 0;
  let dark = 0;
  let light = 0;
  let sumLum = 0;
  let sumLumSq = 0;

  for (let index = 0; index < total; index += 1) {
    const offset = index * channels;
    const r = rgb[offset];
    const g = rgb[offset + 1];
    const b = rgb[offset + 2];
    const y = luminance(r, g, b);
    lum[index] = y;
    sumLum += y;
    sumLumSq += y * y;
    if (y < 0.18) {
      dark += 1;
      const x = index % width;
      const yPos = Math.floor(index / width);
      updateBounds(darkBbox, x, yPos);
    }
    if (y > 0.82) light += 1;

    const saturationSpread = Math.max(r, g, b) - Math.min(r, g, b);
    if (saturationSpread < 42) continue;
    let best;
    let bestDist = Infinity;
    for (const entry of palette) {
      const dist = colorDistanceSq(r, g, b, entry.rgb);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry;
      }
    }
    if (best && bestDist <= 95 * 95) {
      colorMatches += 1;
      paletteCounts.set(best.key, (paletteCounts.get(best.key) ?? 0) + 1);
      const x = index % width;
      const yPos = Math.floor(index / width);
      updateBounds(colorBbox, x, yPos);
    }
  }

  let edgeSum = 0;
  let edgeCount = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 160000)));
  for (let y = 0; y < height - step; y += step) {
    for (let x = 0; x < width - step; x += step) {
      const i = y * width + x;
      edgeSum += Math.abs(lum[i] - lum[i + step]);
      edgeSum += Math.abs(lum[i] - lum[i + step * width]);
      edgeCount += 2;
    }
  }

  const meanLum = sumLum / total;
  const variance = Math.max(0, sumLumSq / total - meanLum * meanLum);
  const colorCoverage = colorMatches / total;
  const paletteHits = palette
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      rgb: entry.rgb,
      pixels: paletteCounts.get(entry.key) ?? 0,
      ratio: round((paletteCounts.get(entry.key) ?? 0) / total),
    }))
    .filter((entry) => entry.pixels > Math.max(3, total * 0.00012))
    .sort((a, b) => b.pixels - a.pixels);

  const diversityScore = clamp01(paletteHits.length / Math.max(4, Math.min(6, palette.length)));
  const colorCoverageScore = clamp01(colorCoverage / 0.035);
  const contrastScore = clamp01(Math.sqrt(variance) / 0.22);
  const blackWhiteScore = clamp01(Math.min(dark / total, light / total) / 0.11);
  const edgeEnergy = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const edgeScore = clamp01(edgeEnergy / 0.085);
  const darkRatio = dark / total;
  const lightRatio = light / total;
  const score = clamp01(
    diversityScore * 0.34 +
      colorCoverageScore * 0.24 +
      blackWhiteScore * 0.2 +
      edgeScore * 0.14 +
      contrastScore * 0.08
  );
  const isFiducialBoard = options.targetProfile === 'fiducial-board' || Number(options.markerCount ?? 0) >= 4;
  const chartDetected =
    score >= 0.64 &&
    paletteHits.length >= 4 &&
    colorCoverage >= 0.012 &&
    Math.min(darkRatio, lightRatio) >= 0.045;
  const fiducialBoardDetected =
    isFiducialBoard &&
    score >= 0.62 &&
    paletteHits.length >= 4 &&
    colorCoverage >= 0.0015 &&
    Math.min(darkRatio, lightRatio) >= 0.08 &&
    Math.sqrt(variance) >= 0.22;
  const detected = chartDetected || fiducialBoardDetected;
  const bounds = materializeBounds(fiducialBoardDetected ? darkBbox : colorBbox) ?? materializeBounds(colorBbox);

  return {
    status: detected ? 'detected' : 'not-detected',
    detected,
    detectionMode: fiducialBoardDetected ? 'fiducial-board-structure' : chartDetected ? 'palette-chart' : 'none',
    score: round(score),
    threshold: 0.64,
    paletteHitCount: paletteHits.length,
    paletteCoverage: round(colorCoverage),
    paletteHits,
    bounds,
    cornerCandidates:
      detected && bounds
        ? [
            { id: 'target-bounds-top-left', x: bounds.minX, y: bounds.minY },
            { id: 'target-bounds-top-right', x: bounds.maxX, y: bounds.minY },
            { id: 'target-bounds-bottom-right', x: bounds.maxX, y: bounds.maxY },
            { id: 'target-bounds-bottom-left', x: bounds.minX, y: bounds.maxY },
          ]
        : [],
    calibrationReady: false,
    metrics: {
      meanLuminance: round(meanLum),
      contrast: round(Math.sqrt(variance)),
      darkPixelRatio: round(darkRatio),
      lightPixelRatio: round(lightRatio),
      edgeEnergy: round(edgeEnergy),
      diversityScore: round(diversityScore),
      colorCoverageScore: round(colorCoverageScore),
      blackWhiteScore: round(blackWhiteScore),
      edgeScore: round(edgeScore),
      contrastScore: round(contrastScore),
      fiducialBoardMode: isFiducialBoard,
    },
    honestScope:
      'Heuristic visibility detection for the generated control target. Bounds are coarse target-presence candidates, not ArUco/AprilTag ids or solvePnP-ready corners.',
  };
}

function workflowInputs(workflow) {
  const framePath = workflow?.control?.frame?.path ?? workflow?.sweep?.control?.frame?.path;
  const targetPath = workflow?.target?.path;
  const inlineTarget = workflow?.target ? { hash: workflow.target.receiptHash, target: workflow.target } : undefined;
  return { framePath, targetPath, inlineTarget };
}

export async function analyzeTargetInFrame({ workflowReceipt, workflowPath, framePath, targetReceipt, targetPath, out } = {}) {
  const workflow = workflowReceipt ?? (workflowPath ? readJson(workflowPath) : undefined);
  const workflowDerived = workflowInputs(workflow);
  const resolvedFramePath = framePath ?? workflowDerived.framePath;
  const resolvedTargetPath = targetPath ?? workflowDerived.targetPath;
  const resolvedTargetReceipt =
    targetReceipt ?? (resolvedTargetPath ? readJson(resolvedTargetPath) : workflowDerived.inlineTarget);
  if (!resolvedFramePath) throw new Error('--frame is required when --workflow does not provide a control frame');
  if (!resolvedTargetReceipt) throw new Error('--target is required when --workflow does not provide a target receipt');

  const decoded = await decodeImage(resolvedFramePath);
  const palette = paletteFromTarget(resolvedTargetReceipt);
  if (palette.length < 4) throw new Error('Target receipt does not provide enough colored palette entries');
  const target = resolvedTargetReceipt?.target ?? resolvedTargetReceipt;
  const detection = analyzePixels(decoded, palette, {
    targetProfile: target?.profile,
    markerCount: Array.isArray(target?.markers) ? target.markers.length : undefined,
  });
  const markerRecovery = recoverFiducialMarkers(decoded, target);
  if (markerRecovery.status === 'markers-detected') {
    detection.status = 'detected';
    detection.detected = true;
    detection.detectionMode = 'fiducial-marker-corners';
    detection.bounds = markerRecovery.bounds ?? detection.bounds;
    detection.cornerCandidates = detection.bounds ? cornersFromBounds('target-bounds', detection.bounds) : detection.cornerCandidates;
  }
  detection.fiducialMarkers = markerRecovery.markers;
  detection.recoveredMarkerCount = markerRecovery.recoveredMarkerCount;
  detection.markerCornerCount = markerRecovery.markerCornerCount;
  detection.markerRecoveryStatus = markerRecovery.status;
  detection.poseSolveInputReady = markerRecovery.poseSolveInputReady;
  detection.boardPose = markerRecovery.homography;
  detection.boardHomographyReady = markerRecovery.homography?.homographyReady === true;
  detection.markerRecovery = {
    status: markerRecovery.status,
    recoveredMarkerCount: markerRecovery.recoveredMarkerCount,
    markerCornerCount: markerRecovery.markerCornerCount,
    poseSolveInputReady: markerRecovery.poseSolveInputReady,
    componentCount: markerRecovery.componentCount,
    dictionary: markerRecovery.dictionary,
    bounds: markerRecovery.bounds,
    homographyStatus: markerRecovery.homography?.status,
    honestScope: markerRecovery.honestScope,
  };
  const frameAbsolute = resolveInputPath(resolvedFramePath);
  const targetAbsolute = resolvedTargetPath ? resolveInputPath(resolvedTargetPath) : undefined;
  const stage = stageReceipt({
    name: 'target.detect-in-control-frame',
    input: {
      workflowPath: workflowPath ? rel(workflowPath) : undefined,
      framePath: rel(frameAbsolute),
      targetPath: targetAbsolute ? rel(targetAbsolute) : undefined,
      frameHash: fileHash(frameAbsolute),
      targetHash: targetAbsolute ? fileHash(targetAbsolute) : resolvedTargetReceipt.hash,
    },
    output: {
      status: detection.status,
      score: detection.score,
      paletteHitCount: detection.paletteHitCount,
      paletteCoverage: detection.paletteCoverage,
      bounds: detection.bounds,
      cornerCandidateCount: detection.cornerCandidates.length,
      recoveredMarkerCount: detection.recoveredMarkerCount,
      markerCornerCount: detection.markerCornerCount,
      poseSolveInputReady: detection.poseSolveInputReady,
      boardHomographyStatus: detection.boardPose?.status,
      boardHomographyReady: detection.boardHomographyReady,
    },
    metrics: detection.metrics,
    honestScope:
      'Reads only the untouched camera control frame and generated target receipt. This stage does not preprocess, reconstruct, or estimate camera pose.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-target-in-frame',
      stages: [stage],
      metrics: {
        analyzerStatus: 'pass',
        detectionStatus: detection.status,
        score: detection.score,
        recoveredMarkerCount: detection.recoveredMarkerCount,
        markerCornerCount: detection.markerCornerCount,
        boardHomographyStatus: detection.boardPose?.status,
        boardHomographyReady: detection.boardHomographyReady,
      },
      honestScope:
        'Single-stage target visibility analyzer. Detection can fail without failing the analyzer itself.',
    }),
    stages: [stage],
  };
  const receipt = withHash({
    id: `holoshell-target-in-frame-${sha256Text(`${fileHash(frameAbsolute)}:${resolvedTargetReceipt.hash ?? ''}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    analyzerVersion: VERSION,
    status: 'pass',
    action: 'detect-generated-target-in-untouched-camera-control-frame',
    generatedAt: new Date().toISOString(),
    workflowPath: workflowPath ? rel(workflowPath) : undefined,
    frame: {
      path: rel(frameAbsolute),
      fileHash: fileHash(frameAbsolute),
      width: decoded.width,
      height: decoded.height,
      channels: decoded.channels,
    },
    target: {
      path: targetAbsolute ? rel(targetAbsolute) : undefined,
      receiptHash: resolvedTargetReceipt.hash,
      profile: resolvedTargetReceipt.target?.profile,
      dictionary: resolvedTargetReceipt.target?.dictionary,
      pngPath: resolvedTargetReceipt.target?.pngPath,
      pngHash: resolvedTargetReceipt.target?.pngHash,
      markerCount: Array.isArray(resolvedTargetReceipt.target?.markers) ? resolvedTargetReceipt.target.markers.length : undefined,
      palette,
    },
    detection,
    honestScope:
      'Analyzes whether the generated control target is visible in the raw camera control frame. A pass receipt means the analyzer ran; detection.status says whether the target was found.',
    chain,
    outputPath: out ? rel(out) : undefined,
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid target-in-frame receipt: ${errors.join('; ')}`);
  if (out) writeJson(out, receipt);
  return receipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (receipt.status !== 'pass') errors.push('status must be pass');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.frame?.fileHash?.startsWith('sha256:')) errors.push('frame hash missing');
  if (!(receipt.frame?.width > 0) || !(receipt.frame?.height > 0)) errors.push('frame dimensions missing');
  if (!Array.isArray(receipt.target?.palette) || receipt.target.palette.length < 4) errors.push('target palette missing');
  if (!['detected', 'not-detected'].includes(receipt.detection?.status)) errors.push('detection status mismatch');
  if (!(receipt.detection?.score >= 0)) errors.push('detection score missing');
  if (!Array.isArray(receipt.detection?.cornerCandidates)) errors.push('corner candidates missing');
  if (receipt.detection?.status === 'detected' && receipt.detection.cornerCandidates.length < 4) {
    errors.push('detected target must provide bounds corner candidates');
  }
  if (receipt.detection?.poseSolveInputReady === true) {
    if (!(receipt.detection?.recoveredMarkerCount >= 4)) errors.push('poseSolveInputReady requires recovered markers');
    if (!(receipt.detection?.markerCornerCount >= 16)) errors.push('poseSolveInputReady requires marker corners');
    if (!receipt.detection?.fiducialMarkers?.every((marker) => Array.isArray(marker.corners) && marker.corners.length === 4)) {
      errors.push('poseSolveInputReady requires four corners per marker');
    }
  }
  if (receipt.detection?.boardHomographyReady === true) {
    if (receipt.detection?.boardPose?.status !== 'homography-estimated') errors.push('board homography status mismatch');
    if (!(receipt.detection?.boardPose?.reprojection?.rmsPixels >= 0)) errors.push('board homography reprojection RMS missing');
    if (receipt.detection?.boardPose?.calibrationReady !== false) errors.push('board homography must not claim camera calibration');
  }
  if (receipt.detection?.calibrationReady !== false) errors.push('calibrationReady must be false for heuristic detector');
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
  return errors;
}

async function writeSolidPng(path, width, height, rgb) {
  const sharp = (await import('sharp')).default;
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
  mkdirSync(dirname(resolve(REPO_ROOT, path)), { recursive: true });
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(resolve(REPO_ROOT, path));
}

export async function selfTest() {
  const dir = join('.scratch', 'holoshell-target-in-frame-self-test');
  const targetReceipt = await generateTarget({
    out: join(dir, 'target-receipt.json'),
    png: join(dir, 'target.png'),
    width: 640,
    height: 360,
  });
  const detected = await analyzeTargetInFrame({
    framePath: targetReceipt.target.pngPath,
    targetPath: targetReceipt.outputPath,
    out: join(dir, 'detected-receipt.json'),
  });
  if (detected.detection.status !== 'detected') throw new Error('self-test target PNG should be detected');
  const fiducialReceipt = await generateFiducialBoard({
    out: join(dir, 'fiducial-board-receipt.json'),
    png: join(dir, 'fiducial-board.png'),
    width: 640,
    height: 360,
  });
  const fiducialDetected = await analyzeTargetInFrame({
    framePath: fiducialReceipt.target.pngPath,
    targetPath: fiducialReceipt.outputPath,
    out: join(dir, 'fiducial-detected-receipt.json'),
  });
  if (fiducialDetected.detection.status !== 'detected') throw new Error('self-test fiducial board PNG should be detected');
  if (fiducialDetected.detection.recoveredMarkerCount !== 9) throw new Error('self-test fiducial board should recover nine markers');
  if (fiducialDetected.detection.boardPose?.status !== 'homography-estimated') {
    throw new Error('self-test fiducial board should estimate a board homography');
  }
  await writeSolidPng(join(dir, 'blank.png'), 320, 240, [128, 128, 128]);
  const missing = await analyzeTargetInFrame({
    framePath: join(dir, 'blank.png'),
    targetPath: targetReceipt.outputPath,
    out: join(dir, 'missing-receipt.json'),
  });
  if (missing.detection.status !== 'not-detected') throw new Error('self-test blank image should not detect target');
  return { detected, fiducialDetected, missing };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const { detected, fiducialDetected, missing } = await selfTest();
    process.stdout.write(`holoshell-target-in-frame self-test PASS ${detected.hash} ${fiducialDetected.hash} ${missing.hash}\n`);
    return;
  }
  const workflowPath = args.workflow ? resolve(REPO_ROOT, args.workflow) : undefined;
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const receipt = await analyzeTargetInFrame({
    workflowPath,
    framePath: args.frame,
    targetPath: args.target,
    out: outPath,
  });
  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    receiptPath: receipt.outputPath,
    detection: {
      status: receipt.detection.status,
      score: receipt.detection.score,
      paletteHitCount: receipt.detection.paletteHitCount,
      paletteCoverage: receipt.detection.paletteCoverage,
      detectionMode: receipt.detection.detectionMode,
      recoveredMarkerCount: receipt.detection.recoveredMarkerCount,
      markerCornerCount: receipt.detection.markerCornerCount,
      poseSolveInputReady: receipt.detection.poseSolveInputReady,
      boardHomographyStatus: receipt.detection.boardPose?.status,
      boardHomographyReady: receipt.detection.boardHomographyReady,
      bounds: receipt.detection.bounds,
      calibrationReady: receipt.detection.calibrationReady,
    },
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-target-in-frame-analyzer.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-target-in-frame FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
