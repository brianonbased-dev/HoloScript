/**
 * Particle effects — extracted from HoloScriptRuntime (W1-T4 slice 4)
 *
 * State-coupled subsystem: functions take the target
 * `Map<string, ParticleSystem>` as their first argument, letting HSR
 * retain ownership of the Map while the creation logic lives here.
 * This is a progression of the slice-3 **callback-injection pattern**
 * — instead of injecting a function, we inject the state container.
 *
 * No `this` binding anywhere. Fully testable in isolation: construct
 * a new `Map`, call a function, assert on the Map contents.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 * Any edit here must re-pass the characterization harness without
 * re-locking snapshots.
 *
 * **See**: W1-T4 slice 4 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (historical home,
 *         pre-extraction LOC marker: 2380-2467)
 *         packages/core/src/runtime/easing.ts (slice 1)
 *         packages/core/src/runtime/physics-math.ts (slice 2)
 *         packages/core/src/runtime/condition-evaluator.ts (slice 3)
 */

import type { ParticleSystem, SpatialPosition } from '../types';

/**
 * Color palette for data-type → particle color mapping used by
 * `createConnectionStream`. Pure lookup; extracted so it can be
 * unit-tested and extended without touching HSR.
 */
const DATA_TYPE_COLORS: Readonly<Record<string, string>> = {
  string: '#ff6b35',
  number: '#4ecdc4',
  boolean: '#45b7d1',
  object: '#96ceb4',
  array: '#ffeaa7',
  any: '#dda0dd',
  move: '#ff69b4',
};

/** Default color for unknown data types. */
const DEFAULT_DATA_TYPE_COLOR = '#ffffff';

/** Connection-stream step count — 20 particles stretched between endpoints. */
const CONNECTION_STREAM_STEPS = 20;

/** Flowing-stream max array-length sample (bounds particle count). */
const FLOW_STREAM_MAX_COUNT = 50;

/** Data-visualization max particles for array data. */
const DATAVIZ_ARRAY_MAX = 100;

/** Data-visualization max particles for object data (keys × 5). */
const DATAVIZ_OBJECT_MAX = 50;

/** Data-visualization object-key multiplier. */
const DATAVIZ_OBJECT_KEY_MULT = 5;

/** Default particle count for flowing streams when data is non-array. */
const FLOW_STREAM_DEFAULT_COUNT = 10;

/** Default particle count for data-viz when data is primitive. */
const DATAVIZ_DEFAULT_COUNT = 10;

/** Execution-effect particle count (fixed). */
const EXECUTION_EFFECT_COUNT = 30;

/** Connection-stream lifetime (ms). */
const CONNECTION_STREAM_LIFETIME_MS = 5000;

/** Default particle-effect lifetime (ms). */
const PARTICLE_DEFAULT_LIFETIME_MS = 3000;

/** Default particle speed. */
const PARTICLE_DEFAULT_SPEED = 0.01;

/** Connection-stream particle speed. */
const CONNECTION_STREAM_SPEED = 0.02;

/** Connection-stream color for flowing-stream helper. */
const FLOW_STREAM_COLOR = '#45b7d1';

/** Execution-effect color. */
const EXECUTION_EFFECT_COLOR = '#ff4500';

/** Data-viz color. */
const DATAVIZ_COLOR = '#32cd32';

/**
 * Look up the color for a data type (string, number, boolean, …).
 * Returns the default color for unknown types.
 */
export function getDataTypeColor(dataType: string): string {
  return DATA_TYPE_COLORS[dataType] ?? DEFAULT_DATA_TYPE_COLOR;
}

/**
 * Create a basic particle effect centered on `position`. Writes the
 * result into `particleSystems` under `name`, replacing any prior
 * entry with the same name.
 *
 * Particle positions are jittered ±1 m on each axis around the
 * center. `count` is clamped to `maxParticlesPerSystem` (security
 * limit — see `RUNTIME_SECURITY_LIMITS.maxParticlesPerSystem` in HSR).
 */
export function createParticleEffect(
  particleSystems: Map<string, ParticleSystem>,
  name: string,
  position: SpatialPosition,
  color: string,
  count: number,
  maxParticlesPerSystem: number,
): void {
  const limitedCount = Math.min(count, maxParticlesPerSystem);
  const particles: SpatialPosition[] = [];

  for (let i = 0; i < limitedCount; i++) {
    particles.push([
      position[0] + (Math.random() - 0.5) * 2,
      position[1] + (Math.random() - 0.5) * 2,
      position[2] + (Math.random() - 0.5) * 2,
    ]);
  }

  particleSystems.set(name, {
    particles,
    color,
    lifetime: PARTICLE_DEFAULT_LIFETIME_MS,
    speed: PARTICLE_DEFAULT_SPEED,
  });
}

/**
 * Create a connection-stream particle system between two spatial
 * positions. Emits 21 particles (steps = 20) evenly spaced along
 * the straight line from `fromPos` → `toPos`. Color is resolved
 * from `dataType` via `getDataTypeColor`.
 */
export function createConnectionStream(
  particleSystems: Map<string, ParticleSystem>,
  from: string,
  to: string,
  fromPos: SpatialPosition,
  toPos: SpatialPosition,
  dataType: string,
): void {
  const streamName = `connection_${from}_${to}`;
  const particles: SpatialPosition[] = [];

  for (let i = 0; i <= CONNECTION_STREAM_STEPS; i++) {
    const t = i / CONNECTION_STREAM_STEPS;
    particles.push([
      fromPos[0] + (toPos[0] - fromPos[0]) * t,
      fromPos[1] + (toPos[1] - fromPos[1]) * t,
      fromPos[2] + (toPos[2] - fromPos[2]) * t,
    ]);
  }

  particleSystems.set(streamName, {
    particles,
    color: getDataTypeColor(dataType),
    lifetime: CONNECTION_STREAM_LIFETIME_MS,
    speed: CONNECTION_STREAM_SPEED,
  });
}

/**
 * Create a flowing-stream particle effect. Particle count is
 * min(data.length, 50) for arrays, else a fixed default.
 * Delegates to `createParticleEffect`.
 */
export function createFlowingStream(
  particleSystems: Map<string, ParticleSystem>,
  name: string,
  position: SpatialPosition,
  data: unknown,
  maxParticlesPerSystem: number,
): void {
  const count = Array.isArray(data)
    ? Math.min(data.length, FLOW_STREAM_MAX_COUNT)
    : FLOW_STREAM_DEFAULT_COUNT;
  createParticleEffect(
    particleSystems,
    `${name}_flow`,
    position,
    FLOW_STREAM_COLOR,
    count,
    maxParticlesPerSystem,
  );
}

/** Create an execution-effect (fixed 30 orange particles). */
export function createExecutionEffect(
  particleSystems: Map<string, ParticleSystem>,
  name: string,
  position: SpatialPosition,
  maxParticlesPerSystem: number,
): void {
  createParticleEffect(
    particleSystems,
    `${name}_execution`,
    position,
    EXECUTION_EFFECT_COLOR,
    EXECUTION_EFFECT_COUNT,
    maxParticlesPerSystem,
  );
}

/**
 * Advance all particle systems by `deltaTime` ms. Jitters each
 * particle by ±0.5 × speed per axis and decrements lifetime.
 * Systems whose lifetime drops to ≤ 0 are removed from the Map.
 *
 * Called every frame by the host when visualizer is active.
 * Mutates `particleSystems` in place.
 */
export function updateParticles(
  particleSystems: Map<string, ParticleSystem>,
  deltaTime: number,
): void {
  for (const [name, system] of particleSystems) {
    system.lifetime -= deltaTime;
    system.particles.forEach((particle) => {
      particle[0] += (Math.random() - 0.5) * system.speed;
      particle[1] += (Math.random() - 0.5) * system.speed;
      particle[2] += (Math.random() - 0.5) * system.speed;
    });
    if (system.lifetime <= 0) {
      particleSystems.delete(name);
    }
  }
}

/**
 * Create a data-visualization particle effect. Count is based on
 * data shape: arrays → min(length, 100); objects → min(keys × 5, 50);
 * primitives → fixed default.
 */
export function createDataVisualization(
  particleSystems: Map<string, ParticleSystem>,
  name: string,
  data: unknown,
  position: SpatialPosition,
  maxParticlesPerSystem: number,
): void {
  let count = DATAVIZ_DEFAULT_COUNT;
  if (Array.isArray(data)) {
    count = Math.min(data.length, DATAVIZ_ARRAY_MAX);
  } else if (typeof data === 'object' && data !== null) {
    count = Math.min(Object.keys(data).length * DATAVIZ_OBJECT_KEY_MULT, DATAVIZ_OBJECT_MAX);
  }
  createParticleEffect(
    particleSystems,
    `${name}_visualization`,
    position,
    DATAVIZ_COLOR,
    count,
    maxParticlesPerSystem,
  );
}
