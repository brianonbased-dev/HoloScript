import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  boxMuller,
  applyNoise,
  recordReading,
  computeWindowStats,
  SensorRingBuffer,
  sensorSamplingHandler,
  type SensorChannelConfig,
  type SensorWindowResult,
  type SensorReading,
} from '../SensorSamplingTrait';

// ── boxMuller ─────────────────────────────────────────────────────────────────

describe('boxMuller', () => {
  it('produces a finite number from valid inputs', () => {
    expect(isFinite(boxMuller(0.5, 0.3))).toBe(true);
  });

  it('is deterministic given the same inputs', () => {
    expect(boxMuller(0.2, 0.7)).toBeCloseTo(boxMuller(0.2, 0.7), 10);
  });
});

// ── applyNoise ────────────────────────────────────────────────────────────────

describe('applyNoise – none', () => {
  it('returns raw unchanged', () => {
    expect(applyNoise(3.14, { type: 'none' })).toBe(3.14);
  });
});

describe('applyNoise – uniform', () => {
  it('stays within [raw − range, raw + range]', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const v = applyNoise(10, { type: 'uniform', range: 2 });
    vi.restoreAllMocks();
    expect(v).toBeGreaterThanOrEqual(8);
    expect(v).toBeLessThanOrEqual(12);
  });

  it('when random=0 → raw − range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const v = applyNoise(5, { type: 'uniform', range: 1 });
    vi.restoreAllMocks();
    expect(v).toBeCloseTo(4, 6);
  });
});

describe('applyNoise – gaussian', () => {
  it('with sigma=0 effectively adds zero (near-zero random)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const v = applyNoise(7, { type: 'gaussian', sigma: 0 });
    vi.restoreAllMocks();
    expect(v).toBeCloseTo(7, 6);
  });

  it('returns a finite number', () => {
    const v = applyNoise(0, { type: 'gaussian', sigma: 1 });
    expect(isFinite(v)).toBe(true);
  });
});

describe('applyNoise – quantized', () => {
  it('rounds to nearest step', () => {
    expect(applyNoise(1.27, { type: 'quantized', step: 0.1 })).toBeCloseTo(1.3, 6);
    expect(applyNoise(1.24, { type: 'quantized', step: 0.1 })).toBeCloseTo(1.2, 6);
  });

  it('binary sensor: step=1 → integer', () => {
    expect(applyNoise(0.7, { type: 'quantized', step: 1 })).toBe(1);
    expect(applyNoise(0.3, { type: 'quantized', step: 1 })).toBe(0);
  });

  it('with residualSigma=0 result equals quantized value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // 1.7 / 0.5 = 3.4 → Math.round(3.4) = 3 → 3 * 0.5 = 1.5 (exact in IEEE 754)
    const v = applyNoise(1.7, { type: 'quantized', step: 0.5, residualSigma: 0 });
    vi.restoreAllMocks();
    expect(v).toBeCloseTo(1.5, 6);
  });
});

// ── recordReading ─────────────────────────────────────────────────────────────

describe('recordReading', () => {
  it('passes sensorId, rawValue, and timestamp through', () => {
    const r = recordReading(42, { type: 'none' }, 'temp', 100);
    expect(r.sensorId).toBe('temp');
    expect(r.rawValue).toBe(42);
    expect(r.noisyValue).toBe(42);
    expect(r.timestamp).toBe(100);
  });

  it('applies noise to noisyValue while preserving rawValue', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = recordReading(5, { type: 'uniform', range: 2 }, 's1', 0);
    vi.restoreAllMocks();
    expect(r.rawValue).toBe(5);
    expect(r.noisyValue).toBeCloseTo(3, 5); // 5 + (0*2-1)*2 = 5 - 2 = 3
  });
});

// ── SensorRingBuffer ──────────────────────────────────────────────────────────

function makeReading(v: number, id = 's'): SensorReading {
  return { sensorId: id, rawValue: v, noisyValue: v, timestamp: v };
}

describe('SensorRingBuffer', () => {
  it('starts empty', () => {
    const b = new SensorRingBuffer(4);
    expect(b.size).toBe(0);
    expect(b.toArray()).toEqual([]);
    expect(b.latest()).toBeUndefined();
  });

  it('stores readings up to capacity', () => {
    const b = new SensorRingBuffer(3);
    b.push(makeReading(1));
    b.push(makeReading(2));
    b.push(makeReading(3));
    expect(b.size).toBe(3);
    expect(b.toArray().map((r) => r.noisyValue)).toEqual([1, 2, 3]);
  });

  it('overwrites oldest when full (ring semantics)', () => {
    const b = new SensorRingBuffer(3);
    b.push(makeReading(1));
    b.push(makeReading(2));
    b.push(makeReading(3));
    b.push(makeReading(4)); // overwrites 1
    expect(b.size).toBe(3);
    expect(b.toArray().map((r) => r.noisyValue)).toEqual([2, 3, 4]);
  });

  it('latest() returns the most recent reading', () => {
    const b = new SensorRingBuffer(4);
    b.push(makeReading(10));
    b.push(makeReading(20));
    expect(b.latest()?.noisyValue).toBe(20);
  });

  it('clear() resets the buffer', () => {
    const b = new SensorRingBuffer(4);
    b.push(makeReading(1));
    b.push(makeReading(2));
    b.clear();
    expect(b.size).toBe(0);
    expect(b.toArray()).toEqual([]);
    expect(b.latest()).toBeUndefined();
  });

  it('maintains oldest-first order through multiple wraps', () => {
    const b = new SensorRingBuffer(3);
    for (let i = 1; i <= 7; i++) b.push(makeReading(i));
    // Last 3 should be 5, 6, 7
    expect(b.toArray().map((r) => r.noisyValue)).toEqual([5, 6, 7]);
  });
});

// ── computeWindowStats ────────────────────────────────────────────────────────

describe('computeWindowStats', () => {
  it('returns NaN/Inf for empty buffer', () => {
    const b = new SensorRingBuffer(4);
    const s = computeWindowStats('s', b);
    expect(s.count).toBe(0);
    expect(isNaN(s.mean)).toBe(true);
    expect(isNaN(s.variance)).toBe(true);
    expect(s.min).toBe(Infinity);
    expect(s.max).toBe(-Infinity);
  });

  it('computes correct mean for known values', () => {
    const b = new SensorRingBuffer(8);
    [2, 4, 6, 8].forEach((v) => b.push(makeReading(v)));
    const s = computeWindowStats('s', b);
    expect(s.mean).toBeCloseTo(5, 6);
    expect(s.min).toBe(2);
    expect(s.max).toBe(8);
    expect(s.count).toBe(4);
  });

  it('computes correct sample variance for [2,4,6,8]', () => {
    const b = new SensorRingBuffer(8);
    [2, 4, 6, 8].forEach((v) => b.push(makeReading(v)));
    const s = computeWindowStats('s', b);
    // mean=5; SS=(9+1+1+9)=20; var=20/3≈6.667
    expect(s.variance).toBeCloseTo(20 / 3, 5);
  });

  it('variance is NaN for single reading', () => {
    const b = new SensorRingBuffer(4);
    b.push(makeReading(7));
    const s = computeWindowStats('s', b);
    expect(s.mean).toBeCloseTo(7, 6);
    expect(isNaN(s.variance)).toBe(true);
  });

  it('sensorId passes through', () => {
    const b = new SensorRingBuffer(4);
    b.push(makeReading(1, 'imu'));
    const s = computeWindowStats('imu', b);
    expect(s.sensorId).toBe('imu');
  });
});

// ── TraitHandler ──────────────────────────────────────────────────────────────

function makeNode(): Record<string, unknown> {
  return {};
}

const basicConfig = {
  sensors: [
    { id: 'temp', unit: '°C', noise: { type: 'none' } as const, bufferSize: 8 },
    { id: 'pres', unit: 'Pa', noise: { type: 'none' } as const, bufferSize: 4 },
  ],
};

describe('sensorSamplingHandler.onAttach', () => {
  it('initialises state, last, and window', () => {
    const node = makeNode();
    sensorSamplingHandler.onAttach!(node as never, basicConfig, {} as never);
    expect(node.__sensor_state).toBeDefined();
    expect(node.__sensor_last).toBeDefined();
    expect(node.__sensor_window).toBeDefined();
  });
});

describe('sensorSamplingHandler.onEvent – sensor.record', () => {
  let node: Record<string, unknown>;

  beforeEach(() => {
    node = makeNode();
    sensorSamplingHandler.onAttach!(node as never, basicConfig, {} as never);
  });

  it('records a reading and writes to __sensor_last', () => {
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.record', sensorId: 'temp', rawValue: 21.5, timestamp: 1 } as never
    );
    const last = (node.__sensor_last as Record<string, SensorReading>)['temp'];
    expect(last.rawValue).toBe(21.5);
    expect(last.noisyValue).toBe(21.5);
    expect(last.timestamp).toBe(1);
  });

  it('defaults sensorId to first sensor when omitted', () => {
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.record', rawValue: 5 } as never
    );
    const last = (node.__sensor_last as Record<string, SensorReading>)['temp'];
    expect(last).toBeDefined();
    expect(last.rawValue).toBe(5);
  });

  it('buffers multiple readings', () => {
    for (let i = 1; i <= 4; i++) {
      sensorSamplingHandler.onEvent!(
        node as never,
        basicConfig,
        {} as never,
        { type: 'sensor.record', sensorId: 'temp', rawValue: i * 10, timestamp: i } as never
      );
    }
    // Check via read_window
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.read_window', sensorId: 'temp' } as never
    );
    const w = (node.__sensor_window as Record<string, SensorWindowResult>)['temp'];
    expect(w.count).toBe(4);
    expect(w.mean).toBeCloseTo(25, 5);
  });

  it('ignores unknown sensorId', () => {
    expect(() =>
      sensorSamplingHandler.onEvent!(
        node as never,
        basicConfig,
        {} as never,
        { type: 'sensor.record', sensorId: 'unknown', rawValue: 0 } as never
      )
    ).not.toThrow();
  });

  it('per-event noise override is applied', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      {
        type: 'sensor.record',
        sensorId: 'temp',
        rawValue: 10,
        noise: { type: 'uniform', range: 3 },
      } as never
    );
    vi.restoreAllMocks();
    const last = (node.__sensor_last as Record<string, SensorReading>)['temp'];
    expect(last.noisyValue).toBeCloseTo(7, 5); // 10 + (0*2-1)*3 = 7
  });
});

describe('sensorSamplingHandler.onEvent – sensor.read_window', () => {
  it('writes window stats to __sensor_window', () => {
    const node = makeNode();
    sensorSamplingHandler.onAttach!(node as never, basicConfig, {} as never);
    [1, 2, 3].forEach((v) =>
      sensorSamplingHandler.onEvent!(
        node as never,
        basicConfig,
        {} as never,
        { type: 'sensor.record', sensorId: 'pres', rawValue: v } as never
      )
    );
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.read_window', sensorId: 'pres' } as never
    );
    const w = (node.__sensor_window as Record<string, SensorWindowResult>)['pres'];
    expect(w.sensorId).toBe('pres');
    expect(w.count).toBe(3);
    expect(w.mean).toBeCloseTo(2, 5);
  });
});

describe('sensorSamplingHandler.onEvent – sensor.reset', () => {
  it('clears all buffers and last/window maps', () => {
    const node = makeNode();
    sensorSamplingHandler.onAttach!(node as never, basicConfig, {} as never);
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.record', sensorId: 'temp', rawValue: 99 } as never
    );
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.reset' } as never
    );
    expect(node.__sensor_last).toEqual({});
    expect(node.__sensor_window).toEqual({});
    // Buffer should now be empty → read_window gives count=0
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.read_window', sensorId: 'temp' } as never
    );
    const w = (node.__sensor_window as Record<string, SensorWindowResult>)['temp'];
    expect(w.count).toBe(0);
  });
});

describe('sensorSamplingHandler.onEvent – unknown', () => {
  it('does not throw on unknown event', () => {
    const node = makeNode();
    sensorSamplingHandler.onAttach!(node as never, basicConfig, {} as never);
    expect(() =>
      sensorSamplingHandler.onEvent!(
        node as never,
        basicConfig,
        {} as never,
        { type: 'something.else' } as never
      )
    ).not.toThrow();
  });
});

describe('ring-buffer overflow via trait', () => {
  it('pres bufferSize=4 only keeps last 4 readings', () => {
    const node = makeNode();
    sensorSamplingHandler.onAttach!(node as never, basicConfig, {} as never);
    for (let i = 1; i <= 6; i++) {
      sensorSamplingHandler.onEvent!(
        node as never,
        basicConfig,
        {} as never,
        { type: 'sensor.record', sensorId: 'pres', rawValue: i } as never
      );
    }
    sensorSamplingHandler.onEvent!(
      node as never,
      basicConfig,
      {} as never,
      { type: 'sensor.read_window', sensorId: 'pres' } as never
    );
    const w = (node.__sensor_window as Record<string, SensorWindowResult>)['pres'];
    expect(w.count).toBe(4);
    expect(w.readings.map((r) => r.rawValue)).toEqual([3, 4, 5, 6]);
  });
});
