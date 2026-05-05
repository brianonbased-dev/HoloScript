export interface RoomPlaneSensing {
  floorConfidence: number;
  wallConfidence: number;
  motion: number;
  samples: number;
}

export const emptyPlaneSensing: RoomPlaneSensing = {
  floorConfidence: 0,
  wallConfidence: 0,
  motion: 0,
  samples: 0,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function analyzeRoomPlaneFrame(
  frame: ImageData,
  previousLuma: Uint8Array | null,
): RoomPlaneSensing & { luma: Uint8Array } {
  const { data, width, height } = frame;
  const luma = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    luma[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }

  let floorEnergy = 0;
  let floorCount = 0;
  let wallEnergy = 0;
  let wallCount = 0;
  let wallEdges = 0;
  let motionEnergy = 0;
  let motionCount = 0;
  const floorStart = Math.floor(height * 0.58);
  const wallStart = Math.floor(height * 0.12);
  const wallEnd = Math.floor(height * 0.78);

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const idx = y * width + x;
      const dx = Math.abs(luma[idx] - luma[idx - 1]);
      const dy = Math.abs(luma[idx] - luma[idx - width]);

      if (y >= floorStart) {
        floorEnergy += dx + dy;
        floorCount += 1;
      }

      if (y >= wallStart && y <= wallEnd) {
        wallEnergy += dx;
        wallEdges += dx > 18 ? 1 : 0;
        wallCount += 1;
      }

      if (previousLuma && previousLuma.length === luma.length) {
        motionEnergy += Math.abs(luma[idx] - previousLuma[idx]);
        motionCount += 1;
      }
    }
  }

  const floorTexture = floorCount > 0 ? floorEnergy / floorCount / 255 : 0;
  const wallEdgeEnergy = wallCount > 0 ? wallEnergy / wallCount / 255 : 0;
  const wallEdgeDensity = wallCount > 0 ? wallEdges / wallCount : 0;
  const motion = motionCount > 0 ? motionEnergy / motionCount / 255 : 0;

  return {
    luma,
    floorConfidence: clamp01(floorTexture * 8.5 + motion * 1.7),
    wallConfidence: clamp01(wallEdgeEnergy * 9 + wallEdgeDensity * 2.4 + motion),
    motion: clamp01(motion * 6),
    samples: 1,
  };
}

function accumulateCoverage(previous: number, evidence: number): number {
  const normalized = clamp01(evidence);
  if (normalized < 0.015) return previous;

  const steadyGain = 0.02 + normalized * 0.12;
  const catchUpGain = Math.max(0, normalized - previous) * 0.16;
  return clamp01(Math.max(previous, previous + steadyGain + catchUpGain));
}

export function accumulatePlaneSensing(previous: RoomPlaneSensing, next: RoomPlaneSensing): RoomPlaneSensing {
  return {
    floorConfidence: accumulateCoverage(previous.floorConfidence, next.floorConfidence),
    wallConfidence: accumulateCoverage(previous.wallConfidence, next.wallConfidence),
    motion: previous.samples === 0 ? next.motion : previous.motion * 0.55 + next.motion * 0.45,
    samples: previous.samples + 1,
  };
}
