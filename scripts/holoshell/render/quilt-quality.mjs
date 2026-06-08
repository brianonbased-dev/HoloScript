function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values) {
  if (values.length < 1) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function lumaAt(rgba, offset) {
  return (0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2] || 0) / 255;
}

function isForeground(rgba, offset) {
  const r = rgba[offset] ?? 0;
  const g = rgba[offset + 1] ?? 0;
  const b = rgba[offset + 2] ?? 0;
  const dr = r - 4;
  const dg = g - 7;
  const db = b - 11;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  return lumaAt(rgba, offset) > 0.055 || distance > 24;
}

function tileBounds(tileIndex, columns, tileWidth, tileHeight) {
  const col = tileIndex % columns;
  const row = Math.floor(tileIndex / columns);
  return {
    x0: col * tileWidth,
    y0: row * tileHeight,
    x1: (col + 1) * tileWidth,
    y1: (row + 1) * tileHeight,
  };
}

function tileStats({ rgba, width, bounds }) {
  let foreground = 0;
  let count = 0;
  let lumaSum = 0;
  let lumaSqSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      const offset = (y * width + x) * 4;
      const luma = lumaAt(rgba, offset);
      lumaSum += luma;
      lumaSqSum += luma * luma;
      count += 1;
      if (isForeground(rgba, offset)) foreground += 1;
      if (x > bounds.x0 && y > bounds.y0) {
        const left = lumaAt(rgba, offset - 4);
        const up = lumaAt(rgba, offset - width * 4);
        edgeSum += Math.abs(luma - left) + Math.abs(luma - up);
        edgeCount += 2;
      }
    }
  }

  const meanLuminance = count > 0 ? lumaSum / count : 0;
  const variance = count > 0 ? Math.max(0, lumaSqSum / count - meanLuminance * meanLuminance) : 0;
  return {
    foregroundCoverage: count > 0 ? foreground / count : 0,
    meanLuminance,
    contrast: Math.sqrt(variance),
    edgeEnergy: edgeCount > 0 ? edgeSum / edgeCount : 0,
  };
}

function tileDifference({ rgba, width, a, b }) {
  let sum = 0;
  let count = 0;
  for (let ay = a.y0, by = b.y0; ay < a.y1 && by < b.y1; ay += 1, by += 1) {
    for (let ax = a.x0, bx = b.x0; ax < a.x1 && bx < b.x1; ax += 1, bx += 1) {
      const ao = (ay * width + ax) * 4;
      const bo = (by * width + bx) * 4;
      sum +=
        Math.abs((rgba[ao] ?? 0) - (rgba[bo] ?? 0)) +
        Math.abs((rgba[ao + 1] ?? 0) - (rgba[bo + 1] ?? 0)) +
        Math.abs((rgba[ao + 2] ?? 0) - (rgba[bo + 2] ?? 0));
      count += 3;
    }
  }
  return count > 0 ? sum / (count * 255) : 0;
}

function gradeFor(score) {
  if (score >= 0.9) return 'excellent';
  if (score >= 0.75) return 'good';
  if (score >= 0.6) return 'usable';
  if (score >= 0.4) return 'weak';
  return 'poor';
}

export function analyzeQuiltQuality({
  rgba,
  width,
  height,
  tileWidth,
  tileHeight,
  columns,
  rows,
  views,
}) {
  if (!(rgba instanceof Uint8Array)) throw new Error('rgba must be a Uint8Array');
  if (rgba.length !== width * height * 4)
    throw new Error('rgba length does not match width/height');
  const tileCount = Math.min(views, columns * rows);
  const stats = [];
  for (let i = 0; i < tileCount; i += 1) {
    stats.push(
      tileStats({
        rgba,
        width,
        bounds: tileBounds(i, columns, tileWidth, tileHeight),
      })
    );
  }

  const coverageValues = stats.map((stat) => stat.foregroundCoverage);
  const edgeValues = stats.map((stat) => stat.edgeEnergy);
  const contrastValues = stats.map((stat) => stat.contrast);
  const lumaValues = stats.map((stat) => stat.meanLuminance);
  const deltas = [];
  for (let i = 1; i < tileCount; i += 1) {
    deltas.push(
      tileDifference({
        rgba,
        width,
        a: tileBounds(i - 1, columns, tileWidth, tileHeight),
        b: tileBounds(i, columns, tileWidth, tileHeight),
      })
    );
  }

  const foregroundCoverage = average(coverageValues);
  const coverageStdDev = stdDev(coverageValues);
  const edgeEnergy = average(edgeValues);
  const contrast = average(contrastValues);
  const viewDeltaMean = average(deltas);
  const viewDeltaStdDev = stdDev(deltas);
  const coverageScore = clamp01(foregroundCoverage / 0.42);
  const edgeScore = clamp01(edgeEnergy / 0.06);
  const contrastScore = clamp01(contrast / 0.35);
  const detailScore = clamp01(edgeScore * 0.72 + contrastScore * 0.28);
  const consistencyScore = clamp01(1 - coverageStdDev / 0.18);
  const viewDeltaScore = clamp01(
    viewDeltaMean < 0.06 ? viewDeltaMean / 0.06 : 1 - Math.max(0, viewDeltaMean - 0.18) / 0.32
  );
  const brightnessScore = clamp01(1 - Math.abs(average(lumaValues) - 0.32) / 0.32);
  const fragmentationPenalty =
    edgeEnergy > 0.07 && contrast > 0.26 ? clamp01((edgeEnergy - 0.07) / 0.05) * 0.28 : 0;
  const score = clamp01(
    coverageScore * 0.18 +
      detailScore * 0.34 +
      consistencyScore * 0.1 +
      viewDeltaScore * 0.28 +
      brightnessScore * 0.1 -
      fragmentationPenalty
  );
  const warnings = [];
  if (foregroundCoverage < 0.16) warnings.push('low-foreground-coverage');
  if (edgeEnergy < 0.035) warnings.push('low-detail-energy');
  if (coverageStdDev > 0.14) warnings.push('uneven-view-coverage');
  if (viewDeltaMean < 0.02) warnings.push('low-view-parallax');
  if (viewDeltaMean > 0.28) warnings.push('high-view-flicker');
  if (fragmentationPenalty > 0) warnings.push('high-fragmentation-edge-noise');

  return {
    score: round(score),
    grade: gradeFor(score),
    foregroundCoverage: round(foregroundCoverage),
    coverageStdDev: round(coverageStdDev),
    meanLuminance: round(average(lumaValues)),
    contrast: round(contrast),
    edgeEnergy: round(edgeEnergy),
    viewDeltaMean: round(viewDeltaMean),
    viewDeltaStdDev: round(viewDeltaStdDev),
    dimensions: {
      coverageScore: round(coverageScore),
      detailScore: round(detailScore),
      consistencyScore: round(consistencyScore),
      viewDeltaScore: round(viewDeltaScore),
      brightnessScore: round(brightnessScore),
      fragmentationPenalty: round(fragmentationPenalty),
    },
    warnings,
    honestScope:
      'Raster-side quilt quality heuristics: foreground coverage, local detail, per-view consistency, and adjacent-view change. This is not human aesthetic judgment.',
  };
}
