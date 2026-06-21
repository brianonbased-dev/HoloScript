/**
 * SensorSamplingTrait — domain-neutral signal acquisition with noise models
 * and ring-buffer windowing (H2 'sensor' family).
 *
 * Sensors are identified by string IDs. Each sensor has a configurable noise
 * model applied to incoming raw readings before buffering. A fixed-capacity
 * ring buffer stores the last N readings per sensor, enabling simple windowed
 * statistics (mean, variance, min, max) without external state management.
 *
 * ## Noise models
 *
 *   - `'none'`       — raw value passed through unchanged.
 *   - `'gaussian'`   — additive Gaussian noise N(0, σ²) via Box-Muller.
 *   - `'uniform'`    — additive uniform noise U(−range, +range).
 *   - `'quantized'`  — round to nearest `step`, then optional gaussian.
 *
 * ## Domain-neutrality
 *
 * No domain nouns appear here. The same trait covers:
 *   - Robotics: joint-angle encoders, IMU, force/torque sensors.
 *   - IoT: temperature, pressure, humidity, flow.
 *   - Scientific: spectral intensity, particle count, magnetic field.
 *   - Quantum: qubit readout (binary sensor, bit-flip noise via bernoulli).
 *
 * ## Trait usage
 *
 *   onAttach: initialises per-sensor ring buffers from config.
 *   onEvent 'sensor.record': record a raw reading → apply noise → buffer →
 *     write result to node.__sensor_last[sensorId].
 *   onEvent 'sensor.read_window': compute windowed stats for a sensor →
 *     write to node.__sensor_window[sensorId].
 *   onEvent 'sensor.reset': clear all buffers.
 */

import type { TraitHandler } from './TraitTypes';

// ── Noise models ──────────────────────────────────────────────────────────────

/** Gaussian noise: additive N(0, σ²). */
export interface GaussianNoise {
  type: 'gaussian';
  /** Standard deviation σ. */
  sigma: number;
}

/** Uniform noise: additive U(−range, +range). */
export interface UniformNoise {
  type: 'uniform';
  /** Half-width of the uniform distribution. */
  range: number;
}

/**
 * Quantization noise: round to nearest `step`, then optional Gaussian.
 * Models ADC quantization (and binary sensors when step=1).
 */
export interface QuantizedNoise {
  type: 'quantized';
  /** Quantization step (e.g. 0.01 for a 2-decimal sensor). */
  step: number;
  /** Optional residual Gaussian σ after quantization. Default: 0. */
  residualSigma?: number;
}

/** No noise — raw value passed through. */
export interface NoNoise {
  type: 'none';
}

export type NoiseModel = GaussianNoise | UniformNoise | QuantizedNoise | NoNoise;

// ── Sensor config ─────────────────────────────────────────────────────────────

/** Configuration for one sensor channel. */
export interface SensorChannelConfig {
  /** Unique sensor identifier. */
  id: string;
  /** Human-readable unit label (e.g. 'm/s²', '°C', 'rad'). Not interpreted. */
  unit?: string;
  /** Noise model applied to incoming raw readings. Default: none. */
  noise?: NoiseModel;
  /** Ring-buffer capacity (number of readings to keep). Default: 32. */
  bufferSize?: number;
}

/** Trait configuration — list of sensor channels. */
export interface SensorSamplingConfig {
  /** Sensor channels to initialise. */
  sensors: SensorChannelConfig[];
}

// ── Reading types ─────────────────────────────────────────────────────────────

/** A raw + noisy reading for one sensor. */
export interface SensorReading {
  /** Sensor identifier. */
  sensorId: string;
  /** Raw (pre-noise) value. */
  rawValue: number;
  /** Value after noise application. */
  noisyValue: number;
  /** Monotonic timestamp (caller-supplied, e.g. simulation tick). */
  timestamp: number;
}

/** Windowed statistics over a sensor's ring buffer. */
export interface SensorWindowResult {
  sensorId: string;
  /** All buffered readings (oldest → newest). */
  readings: ReadonlyArray<SensorReading>;
  /** Number of readings in the buffer. */
  count: number;
  /** Arithmetic mean of noisyValue. NaN if buffer empty. */
  mean: number;
  /** Sample variance of noisyValue. NaN if fewer than 2 readings. */
  variance: number;
  /** Minimum noisyValue. Infinity if buffer empty. */
  min: number;
  /** Maximum noisyValue. -Infinity if buffer empty. */
  max: number;
}

// ── Event payload types ────────────────────────────────────────────────────────

/** Payload for `sensor.record` event. */
export interface SensorRecordRequest {
  /** Target sensor. If omitted and config has exactly one sensor, uses that. */
  sensorId?: string;
  /** Raw measured value. */
  rawValue: number;
  /** Monotonic timestamp. Default: 0. */
  timestamp?: number;
  /** Override noise model for this recording only. */
  noise?: NoiseModel;
}

/** Payload for `sensor.read_window` event. */
export interface SensorReadWindowRequest {
  /** Target sensor. If omitted, uses the first configured sensor. */
  sensorId?: string;
}

// ── Noise application ─────────────────────────────────────────────────────────

/**
 * Box-Muller transform: generates one N(0,1) sample using two U(0,1) inputs.
 * Pure function — callers supply the uniform random values to enable testing.
 */
export function boxMuller(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Apply a noise model to a raw value. Uses `Math.random()` for stochastic
 * models — determinism in tests can be achieved by mocking Math.random.
 */
export function applyNoise(raw: number, noise: NoiseModel): number {
  switch (noise.type) {
    case 'none':
      return raw;
    case 'gaussian': {
      const n = boxMuller(1 - Math.random(), Math.random());
      return raw + noise.sigma * n;
    }
    case 'uniform':
      return raw + (Math.random() * 2 - 1) * noise.range;
    case 'quantized': {
      const q = Math.round(raw / noise.step) * noise.step;
      if (!noise.residualSigma) return q;
      const n = boxMuller(1 - Math.random(), Math.random());
      return q + noise.residualSigma * n;
    }
  }
}

// ── Ring buffer ───────────────────────────────────────────────────────────────

/** Fixed-capacity circular buffer of SensorReadings. */
export class SensorRingBuffer {
  private readonly buf: SensorReading[];
  private head = 0;
  private _size = 0;

  constructor(readonly capacity: number) {
    this.buf = new Array<SensorReading>(capacity);
  }

  push(r: SensorReading): void {
    this.buf[this.head] = r;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  get size(): number {
    return this._size;
  }

  /** Returns readings oldest-first. */
  toArray(): SensorReading[] {
    if (this._size === 0) return [];
    const out: SensorReading[] = [];
    const start = this._size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this._size; i++) {
      out.push(this.buf[(start + i) % this.capacity]);
    }
    return out;
  }

  latest(): SensorReading | undefined {
    if (this._size === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buf[idx];
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
  }
}

// ── Public solver functions ────────────────────────────────────────────────────

/**
 * Record one reading: apply noise, return the SensorReading.
 * Callers are responsible for buffering (the TraitHandler does this via the
 * node's internal buffer map).
 */
export function recordReading(
  rawValue: number,
  noise: NoiseModel,
  sensorId: string,
  timestamp: number,
): SensorReading {
  return {
    sensorId,
    rawValue,
    noisyValue: applyNoise(rawValue, noise),
    timestamp,
  };
}

/** Compute windowed statistics over a ring buffer's current contents. */
export function computeWindowStats(
  sensorId: string,
  buffer: SensorRingBuffer,
): SensorWindowResult {
  const readings = buffer.toArray();
  const count = readings.length;
  if (count === 0) {
    return { sensorId, readings, count: 0, mean: NaN, variance: NaN, min: Infinity, max: -Infinity };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const r of readings) {
    sum += r.noisyValue;
    if (r.noisyValue < min) min = r.noisyValue;
    if (r.noisyValue > max) max = r.noisyValue;
  }
  const mean = sum / count;
  if (count < 2) {
    return { sensorId, readings, count, mean, variance: NaN, min, max };
  }
  let ss = 0;
  for (const r of readings) ss += (r.noisyValue - mean) ** 2;
  const variance = ss / (count - 1);
  return { sensorId, readings, count, mean, variance, min, max };
}

// ── Internal node state ───────────────────────────────────────────────────────

type SensorNodeState = Map<string, { buffer: SensorRingBuffer; config: SensorChannelConfig }>;

const NO_NOISE: NoNoise = { type: 'none' };

function getOrCreateState(node: Record<string, unknown>, config: SensorSamplingConfig): SensorNodeState {
  if (!(node.__sensor_state instanceof Map)) {
    const m: SensorNodeState = new Map();
    for (const ch of config.sensors) {
      m.set(ch.id, {
        buffer: new SensorRingBuffer(ch.bufferSize ?? 32),
        config: ch,
      });
    }
    node.__sensor_state = m;
  }
  return node.__sensor_state as SensorNodeState;
}

// ── TraitHandler ───────────────────────────────────────────────────────────────

export const sensorSamplingHandler: TraitHandler<SensorSamplingConfig> = {
  name: 'sensor_sampling',
  defaultConfig: { sensors: [] },

  onAttach(node, config) {
    const n = node as unknown as Record<string, unknown>;
    getOrCreateState(n, config);
    n.__sensor_last = {};
    n.__sensor_window = {};
  },

  onEvent(node, config, _ctx, event) {
    const n = node as unknown as Record<string, unknown>;
    const state = getOrCreateState(n, config);

    if (event.type === 'sensor.record') {
      const req = event as unknown as SensorRecordRequest;
      // Resolve sensor id
      const id = req.sensorId ?? config.sensors[0]?.id;
      if (!id) return;
      const entry = state.get(id);
      if (!entry) return;
      const noise = req.noise ?? entry.config.noise ?? NO_NOISE;
      const reading = recordReading(req.rawValue, noise, id, req.timestamp ?? 0);
      entry.buffer.push(reading);
      (n.__sensor_last as Record<string, SensorReading>)[id] = reading;
      return;
    }

    if (event.type === 'sensor.read_window') {
      const req = event as unknown as SensorReadWindowRequest;
      const id = req.sensorId ?? config.sensors[0]?.id;
      if (!id) return;
      const entry = state.get(id);
      if (!entry) return;
      const result = computeWindowStats(id, entry.buffer);
      (n.__sensor_window as Record<string, SensorWindowResult>)[id] = result;
      return;
    }

    if (event.type === 'sensor.reset') {
      for (const entry of state.values()) entry.buffer.clear();
      n.__sensor_last = {};
      n.__sensor_window = {};
      return;
    }
  },
};
