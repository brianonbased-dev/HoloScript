import { average, round } from '../image/quality-metrics.mjs';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tileDescriptorsForFrame(frame, gridN) {
  const descriptors = [];
  const tileW = Math.max(1, Math.floor(frame.width / gridN));
  const tileH = Math.max(1, Math.floor(frame.height / gridN));
  for (let ty = 0; ty < gridN; ty += 1) {
    for (let tx = 0; tx < gridN; tx += 1) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = tx === gridN - 1 ? frame.width : x0 + tileW;
      const y1 = ty === gridN - 1 ? frame.height : y0 + tileH;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let lumaSum = 0;
      let lumaSqSum = 0;
      let edgeXSum = 0;
      let edgeYSum = 0;
      let edgeXCount = 0;
      let edgeYCount = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        let previousLuma;
        for (let x = x0; x < x1; x += 1) {
          const p = (y * frame.width + x) * frame.stride;
          const r = frame.rgb[p] ?? 0;
          const g = frame.rgb[p + 1] ?? 0;
          const b = frame.rgb[p + 2] ?? 0;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          rSum += r;
          gSum += g;
          bSum += b;
          lumaSum += luma;
          lumaSqSum += luma * luma;
          if (previousLuma !== undefined) {
            edgeXSum += Math.abs(luma - previousLuma);
            edgeXCount += 1;
          }
          if (y > y0) {
            const up = ((y - 1) * frame.width + x) * frame.stride;
            const upLuma =
              0.2126 * (frame.rgb[up] ?? 0) +
              0.7152 * (frame.rgb[up + 1] ?? 0) +
              0.0722 * (frame.rgb[up + 2] ?? 0);
            edgeYSum += Math.abs(luma - upLuma);
            edgeYCount += 1;
          }
          previousLuma = luma;
          count += 1;
        }
      }
      const denom = Math.max(1, count);
      const lumaMean = lumaSum / denom;
      const lumaVariance = Math.max(0, lumaSqSum / denom - lumaMean * lumaMean);
      descriptors.push({
        index: ty * gridN + tx,
        tile: [tx, ty],
        r: rSum / denom / 255,
        g: gSum / denom / 255,
        b: bSum / denom / 255,
        luma: lumaMean / 255,
        texture: Math.sqrt(lumaVariance) / 255,
        edgeX: edgeXCount > 0 ? edgeXSum / edgeXCount / 255 : 0,
        edgeY: edgeYCount > 0 ? edgeYSum / edgeYCount / 255 : 0,
      });
    }
  }
  return descriptors;
}

function descriptorScore(a, b) {
  const colorDiff = (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 3;
  const edgeDiff = (Math.abs(a.edgeX - b.edgeX) + Math.abs(a.edgeY - b.edgeY)) / 2;
  const diff =
    0.38 * Math.abs(a.luma - b.luma) +
    0.27 * colorDiff +
    0.2 * Math.abs(a.texture - b.texture) +
    0.15 * edgeDiff;
  return clamp(1 - diff * 1.8, 0, 1);
}

function estimateTileShift(sourceDescriptors, referenceDescriptors, gridN, searchRadiusTiles) {
  let best = {
    shift: [0, 0],
    score: Number.NEGATIVE_INFINITY,
    descriptorScore: 0,
    overlapRatio: 0,
    matchedPointCount: 0,
  };
  const totalTiles = gridN * gridN;
  for (let dy = -searchRadiusTiles; dy <= searchRadiusTiles; dy += 1) {
    for (let dx = -searchRadiusTiles; dx <= searchRadiusTiles; dx += 1) {
      let sum = 0;
      let count = 0;
      for (let refY = 0; refY < gridN; refY += 1) {
        const srcY = refY + dy;
        if (srcY < 0 || srcY >= gridN) continue;
        for (let refX = 0; refX < gridN; refX += 1) {
          const srcX = refX + dx;
          if (srcX < 0 || srcX >= gridN) continue;
          const reference = referenceDescriptors[refY * gridN + refX];
          const source = sourceDescriptors[srcY * gridN + srcX];
          if (!reference || !source) continue;
          sum += descriptorScore(source, reference);
          count += 1;
        }
      }
      if (count < 1) continue;
      const avgScore = sum / count;
      const overlapRatio = count / totalTiles;
      const score = avgScore * (0.82 + 0.18 * overlapRatio);
      const distance = Math.abs(dx) + Math.abs(dy);
      const bestDistance = Math.abs(best.shift[0]) + Math.abs(best.shift[1]);
      if (
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) <= 1e-9 && distance < bestDistance)
      ) {
        best = {
          shift: [dx, dy],
          score,
          descriptorScore: avgScore,
          overlapRatio,
          matchedPointCount: count,
        };
      }
    }
  }
  return best;
}

export function buildNativeTileCorrespondence({ frames, bridgeFrames, pointsPerFrame }) {
  if (!Array.isArray(frames) || !Array.isArray(bridgeFrames) || bridgeFrames.length < 2)
    return undefined;
  const gridN = Math.round(Math.sqrt(pointsPerFrame));
  if (!Number.isInteger(gridN) || gridN < 2 || gridN * gridN !== pointsPerFrame) return undefined;

  const framesByIndex = new Map(frames.map((frame) => [frame.index, frame]));
  const acceptedFrames = bridgeFrames
    .map((bridgeFrame) => ({
      ...bridgeFrame,
      rgbFrame: framesByIndex.get(bridgeFrame.frameIndex),
    }))
    .filter((frame) => frame.rgbFrame && frame.pointCount === pointsPerFrame);
  if (acceptedFrames.length < 2) return undefined;

  const referenceFrame = acceptedFrames[acceptedFrames.length - 1];
  const referenceDescriptors = tileDescriptorsForFrame(referenceFrame.rgbFrame, gridN);
  const searchRadiusTiles = Math.max(1, Math.min(gridN - 1, Math.ceil(gridN * 0.22)));
  const frameMatches = acceptedFrames.map((frame) => {
    const estimate =
      frame.frameIndex === referenceFrame.frameIndex
        ? {
            shift: [0, 0],
            score: 1,
            descriptorScore: 1,
            overlapRatio: 1,
            matchedPointCount: pointsPerFrame,
          }
        : estimateTileShift(
            tileDescriptorsForFrame(frame.rgbFrame, gridN),
            referenceDescriptors,
            gridN,
            searchRadiusTiles
          );
    return {
      frameIndex: frame.frameIndex,
      pointOffset: frame.pointOffset,
      shiftTiles: estimate.shift,
      score: round(estimate.score, 6),
      descriptorScore: round(estimate.descriptorScore, 6),
      overlapRatio: round(estimate.overlapRatio, 6),
      matchedPointCount: estimate.matchedPointCount,
    };
  });
  const nonReference = frameMatches.filter(
    (match) => match.frameIndex !== referenceFrame.frameIndex
  );
  const meanMatchScore = average(nonReference.map((match) => match.score));
  const meanOverlapRatio = average(nonReference.map((match) => match.overlapRatio));
  const meanAbsShiftTiles = average(
    nonReference.map((match) => Math.abs(match.shiftTiles[0]) + Math.abs(match.shiftTiles[1]))
  );
  return {
    method: 'native-tile-flow-v1',
    pointOrder: 'reference-grid-with-shift-observations',
    gridSize: gridN,
    referenceFrameIndex: referenceFrame.frameIndex,
    referencePointOffset: referenceFrame.pointOffset,
    searchRadiusTiles,
    trackCount: pointsPerFrame,
    frameMatchCount: frameMatches.length,
    meanMatchScore: round(meanMatchScore, 6),
    meanOverlapRatio: round(meanOverlapRatio, 6),
    meanAbsShiftTiles: round(meanAbsShiftTiles, 4),
    frameMatches,
  };
}
