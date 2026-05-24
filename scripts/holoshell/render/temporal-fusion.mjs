function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mean(values) {
  if (values.length < 1) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function boundsFor(points) {
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

export function posePosition(frame) {
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

export function selectTemporalPoints(points, source, requestedMode) {
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
