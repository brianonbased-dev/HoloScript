export const PREPROCESS_MODES = new Set(['raw', 'luma-clahe', 'nlm-light', 'bilateral-light']);

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lumaAt(rgb, offset) {
  return (
    0.2126 * (rgb[offset] ?? 0) + 0.7152 * (rgb[offset + 1] ?? 0) + 0.0722 * (rgb[offset + 2] ?? 0)
  );
}

function cloneFrame(frame, rgb = new Uint8Array(frame.rgb)) {
  return {
    ...frame,
    rgb,
  };
}

function changedPixelRatio(before, after, stride) {
  const pixels = Math.floor(before.length / stride);
  if (pixels < 1) return 0;
  let changed = 0;
  for (let i = 0; i < pixels; i += 1) {
    const p = i * stride;
    if (
      before[p] !== after[p] ||
      before[p + 1] !== after[p + 1] ||
      before[p + 2] !== after[p + 2]
    ) {
      changed += 1;
    }
  }
  return Number((changed / pixels).toFixed(6));
}

function applyLumaScale(frame, lumaMap) {
  const out = new Uint8Array(frame.rgb.length);
  for (let i = 0; i < frame.width * frame.height; i += 1) {
    const p = i * frame.stride;
    const oldY = lumaAt(frame.rgb, p);
    const newY = lumaMap[i] ?? oldY;
    const scale = oldY > 1e-6 ? newY / oldY : newY / 24;
    out[p] = clampByte((frame.rgb[p] ?? 0) * scale);
    out[p + 1] = clampByte((frame.rgb[p + 1] ?? 0) * scale);
    out[p + 2] = clampByte((frame.rgb[p + 2] ?? 0) * scale);
  }
  return out;
}

function clipHistogram(histogram, clipLimit) {
  let excess = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    if (histogram[i] > clipLimit) {
      excess += histogram[i] - clipLimit;
      histogram[i] = clipLimit;
    }
  }
  const redistribute = Math.floor(excess / histogram.length);
  const remainder = excess % histogram.length;
  for (let i = 0; i < histogram.length; i += 1) {
    histogram[i] += redistribute + (i < remainder ? 1 : 0);
  }
}

function claheFrame(frame) {
  const tileColumns = Math.min(8, frame.width);
  const tileRows = Math.min(8, frame.height);
  const tileWidth = Math.ceil(frame.width / tileColumns);
  const tileHeight = Math.ceil(frame.height / tileRows);
  const lumaMap = new Float32Array(frame.width * frame.height);
  const clipLimitFactor = 2.5;

  for (let ty = 0; ty < tileRows; ty += 1) {
    for (let tx = 0; tx < tileColumns; tx += 1) {
      const x0 = tx * tileWidth;
      const y0 = ty * tileHeight;
      const x1 = Math.min(frame.width, x0 + tileWidth);
      const y1 = Math.min(frame.height, y0 + tileHeight);
      const histogram = new Array(256).fill(0);
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const p = (y * frame.width + x) * frame.stride;
          histogram[clampByte(lumaAt(frame.rgb, p))] += 1;
          count += 1;
        }
      }
      const clipLimit = Math.max(1, Math.floor((count / 256) * clipLimitFactor));
      clipHistogram(histogram, clipLimit);
      const cdf = new Array(256).fill(0);
      let running = 0;
      for (let i = 0; i < histogram.length; i += 1) {
        running += histogram[i];
        cdf[i] = running;
      }
      const cdfMin = cdf.find((value) => value > 0) ?? 0;
      const denom = Math.max(1, count - cdfMin);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const idx = y * frame.width + x;
          const p = idx * frame.stride;
          const bin = clampByte(lumaAt(frame.rgb, p));
          lumaMap[idx] = clampByte(((cdf[bin] - cdfMin) / denom) * 255);
        }
      }
    }
  }

  return cloneFrame(frame, applyLumaScale(frame, lumaMap));
}

function colorDistanceSq(rgb, a, b) {
  const dr = (rgb[a] ?? 0) - (rgb[b] ?? 0);
  const dg = (rgb[a + 1] ?? 0) - (rgb[b + 1] ?? 0);
  const db = (rgb[a + 2] ?? 0) - (rgb[b + 2] ?? 0);
  return dr * dr + dg * dg + db * db;
}

function bilateralFrame(frame) {
  const out = new Uint8Array(frame.rgb.length);
  const sigmaSpatial = 1.1;
  const sigmaColor = 28;
  const twoSpatial = 2 * sigmaSpatial * sigmaSpatial;
  const twoColor = 2 * sigmaColor * sigmaColor;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const center = (y * frame.width + x) * frame.stride;
      let weightSum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const yy = y + oy;
        if (yy < 0 || yy >= frame.height) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const xx = x + ox;
          if (xx < 0 || xx >= frame.width) continue;
          const p = (yy * frame.width + xx) * frame.stride;
          const spatial = Math.exp(-(ox * ox + oy * oy) / twoSpatial);
          const color = Math.exp(-colorDistanceSq(frame.rgb, center, p) / twoColor);
          const weight = spatial * color;
          weightSum += weight;
          r += (frame.rgb[p] ?? 0) * weight;
          g += (frame.rgb[p + 1] ?? 0) * weight;
          b += (frame.rgb[p + 2] ?? 0) * weight;
        }
      }
      out[center] = clampByte(r / weightSum);
      out[center + 1] = clampByte(g / weightSum);
      out[center + 2] = clampByte(b / weightSum);
    }
  }
  return cloneFrame(frame, out);
}

function patchDistance(frame, ax, ay, bx, by) {
  let sum = 0;
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    const ya = ay + oy;
    const yb = by + oy;
    if (ya < 0 || ya >= frame.height || yb < 0 || yb >= frame.height) continue;
    for (let ox = -1; ox <= 1; ox += 1) {
      const xa = ax + ox;
      const xb = bx + ox;
      if (xa < 0 || xa >= frame.width || xb < 0 || xb >= frame.width) continue;
      const pa = (ya * frame.width + xa) * frame.stride;
      const pb = (yb * frame.width + xb) * frame.stride;
      sum += colorDistanceSq(frame.rgb, pa, pb);
      count += 3;
    }
  }
  return count > 0 ? sum / count : 0;
}

function nlmFrame(frame) {
  const out = new Uint8Array(frame.rgb.length);
  const h = 18;
  const h2 = h * h;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const center = (y * frame.width + x) * frame.stride;
      let weightSum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let oy = -2; oy <= 2; oy += 1) {
        const yy = y + oy;
        if (yy < 0 || yy >= frame.height) continue;
        for (let ox = -2; ox <= 2; ox += 1) {
          const xx = x + ox;
          if (xx < 0 || xx >= frame.width) continue;
          const p = (yy * frame.width + xx) * frame.stride;
          const distance = patchDistance(frame, x, y, xx, yy);
          const weight = Math.exp(-distance / h2);
          weightSum += weight;
          r += (frame.rgb[p] ?? 0) * weight;
          g += (frame.rgb[p + 1] ?? 0) * weight;
          b += (frame.rgb[p + 2] ?? 0) * weight;
        }
      }
      out[center] = clampByte(r / weightSum);
      out[center + 1] = clampByte(g / weightSum);
      out[center + 2] = clampByte(b / weightSum);
    }
  }
  return cloneFrame(frame, out);
}

export function preprocessFrame(frame, mode = 'raw') {
  if (!PREPROCESS_MODES.has(mode)) {
    throw new Error(`Unknown preprocess mode: ${mode}`);
  }
  if (mode === 'raw') {
    return {
      frame,
      summary: {
        mode,
        applied: false,
        changedPixelRatio: 0,
        parameters: {},
      },
    };
  }

  const processed =
    mode === 'luma-clahe'
      ? claheFrame(frame)
      : mode === 'nlm-light'
        ? nlmFrame(frame)
        : bilateralFrame(frame);

  return {
    frame: processed,
    summary: {
      mode,
      applied: true,
      changedPixelRatio: changedPixelRatio(frame.rgb, processed.rgb, frame.stride),
      parameters:
        mode === 'luma-clahe'
          ? { tileGrid: [8, 8], clipLimitFactor: 2.5 }
          : mode === 'nlm-light'
            ? { searchRadius: 2, patchRadius: 1, h: 18 }
            : { radius: 1, sigmaSpatial: 1.1, sigmaColor: 28 },
    },
  };
}
