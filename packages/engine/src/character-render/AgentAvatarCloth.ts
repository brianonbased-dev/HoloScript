/**
 * Deterministic fixed-step cloth dynamics for sovereign character garments.
 *
 * The solver is intentionally small and pure-data: point masses are integrated in authored
 * local space, triangle edges become distance constraints, and per-vertex cloth weights pin
 * seams while allowing hems/cuffs/mantles to move. Sampling always restarts from the same rest
 * state and advances an integer number of fixed steps, making replay byte-identical.
 */

export interface ClothSimulationConfig {
  solver: 'xpbd';
  fixedStepHz: number;
  iterations: number;
  damping: number;
  gravity: [number, number, number];
  wind: [number, number, number];
  windFrequency: number;
  tetherStiffness: number;
  constraintStiffness: number;
  maxDisplacement: number;
}

export interface ClothSimulationReceipt {
  solver: 'xpbd';
  timeSeconds: number;
  fixedStepHz: number;
  fixedSteps: number;
  iterations: number;
  dynamicVertexCount: number;
  maxDisplacement: number;
  rmsDisplacement: number;
  positionDigest: string;
}

export const DEFAULT_CLOTH_SIMULATION: Readonly<ClothSimulationConfig> = Object.freeze({
  solver: 'xpbd',
  fixedStepHz: 120,
  iterations: 4,
  damping: 0.985,
  gravity: [0, -0.42, 0] as [number, number, number],
  wind: [0.34, 0.02, 0.2] as [number, number, number],
  windFrequency: 1.35,
  tetherStiffness: 8.5,
  constraintStiffness: 0.72,
  maxDisplacement: 0.2,
});

interface EdgeConstraint {
  a: number;
  b: number;
  restLength: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function buildEdges(rest: Float32Array, indices: Uint32Array): EdgeConstraint[] {
  const seen = new Set<string>();
  const edges: EdgeConstraint[] = [];
  const add = (a: number, b: number): void => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ai = lo * 3;
    const bi = hi * 3;
    const restLength = Math.hypot(
      rest[bi] - rest[ai],
      rest[bi + 1] - rest[ai + 1],
      rest[bi + 2] - rest[ai + 2]
    );
    if (restLength > 1e-7) edges.push({ a: lo, b: hi, restLength });
  };
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    add(a, b);
    add(b, c);
    add(c, a);
  }
  return edges;
}

function digestFloat32(values: Float32Array): string {
  let hash = 0x811c9dc5;
  const view = new DataView(values.buffer, values.byteOffset, values.byteLength);
  for (let offset = 0; offset < values.byteLength; offset += 4) {
    const bits = view.getUint32(offset, true);
    hash ^= bits & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (bits >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (bits >>> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (bits >>> 24) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class DeterministicClothSimulation {
  private readonly rest: Float32Array<ArrayBuffer>;
  private readonly weights: Float32Array<ArrayBuffer>;
  private readonly edges: EdgeConstraint[];
  private readonly config: ClothSimulationConfig;
  private readonly dynamicVertexCount: number;

  constructor(
    restPositions: Float32Array,
    indices: Uint32Array,
    clothWeights: Float32Array,
    config: Partial<ClothSimulationConfig> = {}
  ) {
    if (restPositions.length % 3 !== 0) {
      throw new Error('cloth rest positions must contain xyz triples');
    }
    if (clothWeights.length !== restPositions.length / 3) {
      throw new Error('cloth weights must contain one value per vertex');
    }
    this.rest = new Float32Array(restPositions);
    this.weights = new Float32Array(
      Array.from(clothWeights, (weight) => clamp(Number.isFinite(weight) ? weight : 0, 0, 1))
    );
    this.edges = buildEdges(this.rest, indices);
    this.config = {
      ...DEFAULT_CLOTH_SIMULATION,
      ...config,
      gravity: config.gravity ? [...config.gravity] : [...DEFAULT_CLOTH_SIMULATION.gravity],
      wind: config.wind ? [...config.wind] : [...DEFAULT_CLOTH_SIMULATION.wind],
      fixedStepHz: clamp(
        Math.round(config.fixedStepHz ?? DEFAULT_CLOTH_SIMULATION.fixedStepHz),
        30,
        240
      ),
      iterations: clamp(
        Math.round(config.iterations ?? DEFAULT_CLOTH_SIMULATION.iterations),
        1,
        12
      ),
      damping: clamp(config.damping ?? DEFAULT_CLOTH_SIMULATION.damping, 0.8, 1),
      tetherStiffness: clamp(
        config.tetherStiffness ?? DEFAULT_CLOTH_SIMULATION.tetherStiffness,
        0,
        30
      ),
      constraintStiffness: clamp(
        config.constraintStiffness ?? DEFAULT_CLOTH_SIMULATION.constraintStiffness,
        0,
        1
      ),
      maxDisplacement: clamp(
        config.maxDisplacement ?? DEFAULT_CLOTH_SIMULATION.maxDisplacement,
        0.01,
        0.6
      ),
    };
    this.dynamicVertexCount = Array.from(this.weights).filter((weight) => weight > 0).length;
  }

  getConfig(): ClothSimulationConfig {
    return {
      ...this.config,
      gravity: [...this.config.gravity],
      wind: [...this.config.wind],
    };
  }

  sample(timeSeconds: number): {
    positions: Float32Array<ArrayBuffer>;
    receipt: ClothSimulationReceipt;
  } {
    const targetTime = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
    const steps = Math.round(targetTime * this.config.fixedStepHz);
    const dt = 1 / this.config.fixedStepHz;
    const positions = new Float32Array(this.rest);
    const velocities = new Float32Array(this.rest.length);

    for (let step = 0; step < steps; step += 1) {
      const t = (step + 1) * dt;
      const gust =
        0.65 +
        0.35 *
          Math.sin(t * this.config.windFrequency * Math.PI * 2) *
          Math.sin(t * this.config.windFrequency * 0.47 * Math.PI * 2 + 0.73);
      for (let vertex = 0; vertex < this.weights.length; vertex += 1) {
        const weight = this.weights[vertex];
        const base = vertex * 3;
        if (weight <= 0) {
          positions[base] = this.rest[base];
          positions[base + 1] = this.rest[base + 1];
          positions[base + 2] = this.rest[base + 2];
          continue;
        }
        for (let axis = 0; axis < 3; axis += 1) {
          const displacement = positions[base + axis] - this.rest[base + axis];
          const acceleration =
            this.config.gravity[axis] +
            this.config.wind[axis] * gust -
            displacement * this.config.tetherStiffness;
          velocities[base + axis] =
            (velocities[base + axis] + acceleration * weight * dt) * this.config.damping;
          positions[base + axis] += velocities[base + axis] * dt;
        }
      }

      for (let iteration = 0; iteration < this.config.iterations; iteration += 1) {
        for (const edge of this.edges) {
          const aw = this.weights[edge.a];
          const bw = this.weights[edge.b];
          if (aw + bw <= 0) continue;
          const ai = edge.a * 3;
          const bi = edge.b * 3;
          const dx = positions[bi] - positions[ai];
          const dy = positions[bi + 1] - positions[ai + 1];
          const dz = positions[bi + 2] - positions[ai + 2];
          const length = Math.hypot(dx, dy, dz) || 1;
          const correction =
            ((length - edge.restLength) / length) * this.config.constraintStiffness;
          const inv = 1 / (aw + bw);
          const ac = correction * aw * inv;
          const bc = correction * bw * inv;
          positions[ai] += dx * ac;
          positions[ai + 1] += dy * ac;
          positions[ai + 2] += dz * ac;
          positions[bi] -= dx * bc;
          positions[bi + 1] -= dy * bc;
          positions[bi + 2] -= dz * bc;
        }
      }

      for (let vertex = 0; vertex < this.weights.length; vertex += 1) {
        const weight = this.weights[vertex];
        if (weight <= 0) continue;
        const base = vertex * 3;
        const dx = positions[base] - this.rest[base];
        const dy = positions[base + 1] - this.rest[base + 1];
        const dz = positions[base + 2] - this.rest[base + 2];
        const distance = Math.hypot(dx, dy, dz);
        const limit = this.config.maxDisplacement * weight;
        if (distance > limit && distance > 0) {
          const scale = limit / distance;
          positions[base] = this.rest[base] + dx * scale;
          positions[base + 1] = this.rest[base + 1] + dy * scale;
          positions[base + 2] = this.rest[base + 2] + dz * scale;
          velocities[base] *= 0.45;
          velocities[base + 1] *= 0.45;
          velocities[base + 2] *= 0.45;
        }
      }
    }

    let maxDisplacement = 0;
    let sumSquared = 0;
    for (let vertex = 0; vertex < this.weights.length; vertex += 1) {
      const base = vertex * 3;
      const distance = Math.hypot(
        positions[base] - this.rest[base],
        positions[base + 1] - this.rest[base + 1],
        positions[base + 2] - this.rest[base + 2]
      );
      maxDisplacement = Math.max(maxDisplacement, distance);
      sumSquared += distance * distance;
    }
    return {
      positions,
      receipt: {
        solver: 'xpbd',
        timeSeconds: targetTime,
        fixedStepHz: this.config.fixedStepHz,
        fixedSteps: steps,
        iterations: this.config.iterations,
        dynamicVertexCount: this.dynamicVertexCount,
        maxDisplacement,
        rmsDisplacement: Math.sqrt(sumSquared / Math.max(this.weights.length, 1)),
        positionDigest: digestFloat32(positions),
      },
    };
  }
}
