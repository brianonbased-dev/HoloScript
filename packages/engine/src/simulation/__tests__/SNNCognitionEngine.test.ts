/**
 * SNNCognitionEngine tests — Paper #2 (SNN → CAEL integration)
 *
 * Verifies that the snn-webgpu CPUReferenceSimulator backed engine correctly:
 *   1. Produces spike data from sensor readings in a single tick
 *   2. Uses biophysically correct LIF equations (mV-range membrane voltages)
 *   3. Integrates with CAELAgentLoop so every spike train is committed to
 *      the CAEL hash-chain trace (provenance claim for Paper #2)
 *   4. Encode output is deterministic (required for hash-chain integrity)
 *   5. Zero-signal input produces no spikes (neuron resting state)
 *   6. High-signal input drives spiking above resting rate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SNNCognitionEngine } from '../SNNCognitionEngine';
import type { SensorReading } from '../CAELAgent';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSensorReading(
  values: number[],
  fieldName = 'von_mises_stress',
  simTime = 0,
): SensorReading {
  return {
    fieldName,
    simTime,
    values: new Float32Array(values),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SNNCognitionEngine', () => {
  let engine: SNNCognitionEngine;

  beforeEach(() => {
    engine = new SNNCognitionEngine({
      neuronCount: 32,
      lifParams: { tau: 20, vThreshold: -55, vReset: -75, vRest: -65, dt: 1 },
      inputScalemV: 20,
    });
  });

  it('has the expected id', () => {
    const custom = new SNNCognitionEngine({ id: 'test-engine', neuronCount: 16 });
    expect(custom.id).toBe('test-engine');
    expect(engine.id).toBe('snn-cognition-engine');
  });

  it('returns zero spikes for zero-current input', () => {
    const sensors: SensorReading[] = [makeSensorReading([0, 0, 0, 0])];
    const snap = engine.think(sensors, 0.001); // 1ms tick

    // With 0 input current and starting at vRest, neurons should not reach threshold
    expect(snap.spikeCount).toBe(0);
    expect(snap.spikes).toHaveLength(0);
  });

  it('returns spikes when strong input is injected', () => {
    // inputScalemV=20, full-signal input → 20mV current
    // vRest=-65, vThreshold=-55 → gap=10mV → strong 20mV drives firing
    const sensors: SensorReading[] = [makeSensorReading(Array(32).fill(1.0))];
    const snap = engine.think(sensors, 0.016); // ~16ms tick (60Hz frame)

    expect(snap.spikeCount).toBeGreaterThan(0);
    expect(snap.spikes.length).toBeGreaterThan(0);
    // Each spike should have a population tag
    expect(snap.spikes[0].population).toBe('snn-lif');
  });

  it('produces biophysically valid membrane voltages (mV range)', () => {
    const sensors: SensorReading[] = [makeSensorReading([0.5, 0.5])];
    engine.think(sensors, 0.001);
    const voltages = engine.getMembraneVoltages();

    expect(voltages).toBeInstanceOf(Float32Array);
    expect(voltages.length).toBe(32);

    // All voltages should be in [-80mV, -50mV] for a resting/lightly-driven network
    for (let i = 0; i < voltages.length; i++) {
      expect(voltages[i]).toBeGreaterThanOrEqual(-80);
      expect(voltages[i]).toBeLessThanOrEqual(-48); // allow small numeric tolerance
    }
  });

  it('encode output is deterministic and includes required CAEL fields', () => {
    engine.reset();
    const sensors: SensorReading[] = [makeSensorReading([0.3, 0.6, 0.9])];

    const snap = engine.think(sensors, 0.001);
    const enc1 = engine.encode(snap);

    engine.reset();
    const snap2 = engine.think(sensors, 0.001);
    const enc2 = engine.encode(snap2);

    // Deterministic
    expect(JSON.stringify(enc1)).toBe(JSON.stringify(enc2));

    // Required CAEL provenance fields
    expect(enc1).toHaveProperty('id');
    expect(enc1).toHaveProperty('spikeCount');
    expect(enc1).toHaveProperty('spikes');
    expect(enc1).toHaveProperty('goalStack');
    expect(enc1).toHaveProperty('extra');
    expect((enc1.extra as Record<string, unknown>)['lifBackend']).toBe('cpu-reference');
  });

  it('goal stack reflects firing activity', () => {
    // Zero input → idle goal
    const zeroSensors: SensorReading[] = [makeSensorReading([0, 0])];
    engine.reset();
    const snapIdle = engine.think(zeroSensors, 0.001);
    expect(snapIdle.goalStack[0].id).toBe('idle');

    // High input → stabilize_structure (high firing rate)
    engine.reset();
    const highSensors: SensorReading[] = [makeSensorReading(Array(32).fill(1.0))];
    const snapActive = engine.think(highSensors, 0.016);
    // Should be 'stabilize_structure' or 'monitor_structure' depending on rate
    expect(['stabilize_structure', 'monitor_structure']).toContain(
      snapActive.goalStack[0].id,
    );
  });

  it('integrates with CAELAgentLoop — spikes are recorded in CAEL trace', async () => {
    const { CAELRecorder } = await import('../CAELRecorder');
    const {
      CAELAgentLoop,
      FieldSensorBridge,
      SimpleActionSelector,
      StructuralActionMapper,
    } = await import('../CAELAgent');
    const { parseCAELJSONL, verifyCAELHashChain } = await import('../CAELTrace');

    // Minimal mock solver — avoids ThermalSolver config complexity
    const mockSolver = {
      mode: 'transient' as const,
      fieldNames: ['von_mises_stress'],
      step(_dt: number) {},
      solve() {},
      getField(name: string) {
        if (name === 'von_mises_stress') return new Float32Array([0.3, 0.5, 0.7, 0.9]);
        return null;
      },
      getStats() { return {}; },
      dispose() {},
    };

    const recorder = new CAELRecorder(
      mockSolver,
      { solverType: 'mock', vertices: new Float64Array([0,0,0,1,0,0,0,1,0,0,0,1]), tetrahedra: new Uint32Array([0,1,2,3]) },
    );

    const snnEngine = new SNNCognitionEngine({ neuronCount: 8, inputScalemV: 20 });

    const loop = new CAELAgentLoop(recorder, {
      agentId: 'test-agent',
      sensor: new FieldSensorBridge({ points: [{ x: 0.25 }, { x: 0.5 }, { x: 0.75 }] }),
      cognition: snnEngine,
      actionSelector: new SimpleActionSelector(),
      actionMapper: new StructuralActionMapper({}),
    });

    // Run 3 ticks
    loop.tick(0.001);
    loop.tick(0.001);
    loop.tick(0.001);

    const jsonl = loop.toJSONL();
    const lines = jsonl.split('\n').filter(Boolean);

    // init + (perception + cognition + action + world_delta + step) × 3
    expect(lines.length).toBeGreaterThan(10);

    const cognitionLines = lines.filter((l) => l.includes('cael.cognition'));
    expect(cognitionLines.length).toBe(3);

    const firstCognition = JSON.parse(cognitionLines[0]) as Record<string, unknown>;
    expect(firstCognition.event).toBe('interaction');
    const payload = firstCognition.payload as Record<string, unknown>;
    expect(payload.type).toBe('cael.cognition');
    const data = payload.data as Record<string, unknown>;
    const cognitionData = data.cognition as Record<string, unknown>;
    expect(cognitionData.id).toBe('snn-cognition-engine');

    // Hash chain must be valid
    const entries = parseCAELJSONL(jsonl);
    const verify = verifyCAELHashChain(entries);
    expect(verify.valid).toBe(true);
  });
});
