export function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function average(values) {
  if (values.length < 1) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function analyzeFrameQuality(frame) {
  const pixels = frame.width * frame.height;
  if (pixels <= 0) {
    return {
      status: 'warn',
      score: 0,
      warnings: ['empty-frame'],
    };
  }

  const lum = new Float32Array(pixels);
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < pixels; i += 1) {
    const p = i * frame.stride;
    const y =
      0.2126 * (frame.rgb[p] ?? 0) +
      0.7152 * (frame.rgb[p + 1] ?? 0) +
      0.0722 * (frame.rgb[p + 2] ?? 0);
    lum[i] = y;
    sum += y;
    sumSq += y * y;
    if (y < 20) dark += 1;
    if (y > 235) bright += 1;
  }

  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const idx = y * frame.width + x;
      if (x + 1 < frame.width) {
        edgeSum += Math.abs((lum[idx] ?? 0) - (lum[idx + 1] ?? 0));
        edgeCount += 1;
      }
      if (y + 1 < frame.height) {
        edgeSum += Math.abs((lum[idx] ?? 0) - (lum[idx + frame.width] ?? 0));
        edgeCount += 1;
      }
    }
  }

  const mean = sum / pixels;
  const variance = Math.max(0, sumSq / pixels - mean * mean);
  const brightness = mean / 255;
  const contrast = Math.sqrt(variance) / 255;
  const edgeEnergy = edgeCount > 0 ? edgeSum / edgeCount / 255 : 0;
  const brightnessScore = Math.max(0, 1 - Math.abs(brightness - 0.45) / 0.45);
  const contrastScore = Math.min(1, contrast / 0.18);
  const edgeScore = Math.min(1, edgeEnergy / 0.08);
  const score = 0.4 * brightnessScore + 0.35 * contrastScore + 0.25 * edgeScore;
  const warnings = [];
  if (brightness < 0.08) warnings.push('underexposed');
  if (brightness > 0.92) warnings.push('overexposed');
  if (contrast < 0.025) warnings.push('low-contrast');
  if (edgeEnergy < 0.008) warnings.push('low-detail-or-blur');

  return {
    status: warnings.length > 0 ? 'warn' : 'pass',
    score: round(score, 4),
    brightness: round(brightness, 4),
    contrast: round(contrast, 4),
    edgeEnergy: round(edgeEnergy, 4),
    darkPixelRatio: round(dark / pixels, 4),
    brightPixelRatio: round(bright / pixels, 4),
    warnings,
  };
}

export function summarizeQuality(frames) {
  const qualities = frames.map((frame) => frame.quality).filter(Boolean);
  const warnings = [...new Set(qualities.flatMap((quality) => quality.warnings ?? []))];
  return {
    status: warnings.length > 0 ? 'warn' : 'pass',
    averageScore: round(average(qualities.map((quality) => quality.score ?? 0)), 4),
    averageBrightness: round(average(qualities.map((quality) => quality.brightness ?? 0)), 4),
    averageContrast: round(average(qualities.map((quality) => quality.contrast ?? 0)), 4),
    averageEdgeEnergy: round(average(qualities.map((quality) => quality.edgeEnergy ?? 0)), 4),
    warnings,
  };
}
