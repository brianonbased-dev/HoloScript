/**
 * paper-0c spike-encoder/decoder tests — covers canonical ordering determinism,
 * digest stability, chain verification, roundtrip bounded-loss.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeStep,
  canonicalSort,
  fnv1a,
  serializeSpikes,
  extendChain,
  toHex,
  type Spike,
} from '../spike-encoder';
import { decodeStep, verifyBoundedLoss } from '../spike-decoder';
import { quantumForField, buildQuantaFor, FALLBACK_QUANTUM } from '../quantum-registry';
import { runStageB, synthesizeSampleJSONL } from '../stage-b-jsonl';
import { runStageC, referenceReplayer, type CanonicalStep, type SNNReplayer } from '../stage-c-shadow-replay';

describe('spike-encoder', () => {
  it('canonical-sorts by (neuron_id, timestamp_us, polarity)', () => {
    const spikes: Spike[] = [
      { neuron_id: 5, timestamp_us: 100, polarity: 1 },
      { neuron_id: 3, timestamp_us: 50, polarity: 1 },
      { neuron_id: 5, timestamp_us: 50, polarity: -1 },
      { neuron_id: 5, timestamp_us: 50, polarity: 1 },
    ];
    const sorted = canonicalSort(spikes);
    expect(sorted[0]).toEqual({ neuron_id: 3, timestamp_us: 50, polarity: 1 });
    expect(sorted[1]).toEqual({ neuron_id: 5, timestamp_us: 50, polarity: -1 });
    expect(sorted[2]).toEqual({ neuron_id: 5, timestamp_us: 50, polarity: 1 });
    expect(sorted[3]).toEqual({ neuron_id: 5, timestamp_us: 100, polarity: 1 });
  });

  it('encoding the same input produces deterministic digest across 50 randomized-input-order runs', () => {
    const input = {
      step: 42,
      floats: { velocity: 0.25, temp: 22.5, pressure: 101.3 },
      vectors: { position: [1.0, 2.5, -0.7] as [number, number, number] },
      actions: ['move_forward', 'rotate_left'],
    };
    const digests = new Set<string>();
    for (let i = 0; i < 50; i++) {
      // Randomize input key order by shuffling the object (v8 preserves insertion order)
      const shuffled: typeof input = {
        step: input.step,
        floats: {},
        vectors: {},
        actions: [...input.actions].sort(() => Math.random() - 0.5),
      };
      const keys = Object.keys(input.floats).sort(() => Math.random() - 0.5);
      for (const k of keys) shuffled.floats![k] = (input.floats as any)[k];
      for (const k of Object.keys(input.vectors)) {
        shuffled.vectors![k] = (input.vectors as any)[k];
      }
      const batch = encodeStep(shuffled);
      digests.add(toHex(batch.digest));
    }
    expect(digests.size).toBe(1);
  });

  it('fnv1a is 4 bytes and consistent with RFC-ish test vector', () => {
    // FNV-1a of empty input is offset basis 0x811c9dc5
    const d = fnv1a(new Uint8Array(0));
    expect(toHex(d)).toBe('811c9dc5');
    // FNV-1a of "a" is 0xe40c292c
    const d2 = fnv1a(new TextEncoder().encode('a'));
    expect(toHex(d2)).toBe('e40c292c');
  });

  it('serialize round-trip byte length is 10 bytes per spike', () => {
    const spikes: Spike[] = [
      { neuron_id: 1, timestamp_us: 0, polarity: 1 },
      { neuron_id: 2, timestamp_us: 1000, polarity: -1 },
    ];
    expect(serializeSpikes(spikes).length).toBe(20);
  });

  it('chain hash is deterministic and order-sensitive', () => {
    const zero = new Uint8Array(4);
    const a = encodeStep({ step: 1, floats: { x: 0.5 } }).digest;
    const b = encodeStep({ step: 2, floats: { x: 0.75 } }).digest;

    const ab = extendChain(extendChain(zero, a), b);
    const ba = extendChain(extendChain(zero, b), a);
    expect(toHex(ab)).not.toBe(toHex(ba));

    // Reproducibility
    const ab2 = extendChain(extendChain(zero, a), b);
    expect(toHex(ab)).toBe(toHex(ab2));
  });
});

describe('spike-decoder bounded-loss', () => {
  it('roundtrips float values within q_f/2 for 100 random values', () => {
    const q = 0.01;
    const opts = { fields: { v: { type: 'float' as const, quantum: q } } };
    for (let i = 0; i < 100; i++) {
      const value = (Math.random() - 0.5) * 20; // range [-10, 10]
      const batch = encodeStep({ step: 0, floats: { v: value } }, { v: q });
      const decoded = decodeStep(0, batch.spikes, opts);
      const violations = verifyBoundedLoss({ v: value }, undefined, decoded, opts);
      expect(violations).toEqual([]);
    }
  });

  it('roundtrips vector3 within q_f/2 per component', () => {
    const q = 0.01;
    const opts = { fields: { pos: { type: 'vector3' as const, quantum: q } } };
    const value: [number, number, number] = [1.234, -2.567, 0.001];
    const batch = encodeStep({ step: 0, vectors: { pos: value } }, { pos: q });
    const decoded = decodeStep(0, batch.spikes, opts);
    const violations = verifyBoundedLoss(undefined, { pos: value }, decoded, opts);
    expect(violations).toEqual([]);
  });

  it('detects bounded-loss violation when quantum mismatched at decode', () => {
    const q_encode = 0.1;
    const q_decode_wrong = 0.01;
    const opts = { fields: { v: { type: 'float' as const, quantum: q_decode_wrong } } };
    const batch = encodeStep({ step: 0, floats: { v: 1.0 } }, { v: q_encode });
    const decoded = decodeStep(0, batch.spikes, opts);
    // decoded value will be ~10 * 0.01 = 0.1 (because decoder assumes q_decode_wrong)
    // expected was 1.0 → delta ≈ 0.9 → far above q_decode_wrong/2 = 0.005
    const violations = verifyBoundedLoss({ v: 1.0 }, undefined, decoded, opts);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].field).toBe('v');
  });

  it('actions appear as neuron_ids in the action_space region after decode', () => {
    const batch = encodeStep({ step: 0, actions: ['move_forward', 'rotate_left'] });
    const decoded = decodeStep(0, batch.spikes, { fields: {} });
    expect(decoded.action_neuron_ids.length).toBe(2);
    for (const id of decoded.action_neuron_ids) {
      expect(id).toBeGreaterThanOrEqual(1_000_000);
    }
  });
});

describe('quantum-registry', () => {
  it('returns engine-matching quanta for known field families', () => {
    expect(quantumForField('velocity')).toBe(1e-3);
    expect(quantumForField('position')).toBe(1e-5);
    expect(quantumForField('temperature')).toBe(0.1);
    expect(quantumForField('stress')).toBe(1_000);
    expect(quantumForField('pressure')).toBe(100);
    expect(quantumForField('vonMisesStress')).toBe(1_000);
    expect(quantumForField('displacement')).toBe(1e-5);
  });

  it('falls back for unknown field names', () => {
    expect(quantumForField('zzz_unknown_field')).toBe(FALLBACK_QUANTUM);
    expect(quantumForField('')).toBe(FALLBACK_QUANTUM);
  });

  it('buildQuantaFor composes per-field quanta', () => {
    const q = buildQuantaFor(['velocity', 'position', 'mystery']);
    expect(q.velocity).toBe(1e-3);
    expect(q.position).toBe(1e-5);
    expect(q.mystery).toBe(FALLBACK_QUANTUM);
  });
});

describe('stage-b JSONL consumption', () => {
  it('encodes synthetic JSONL trace, produces deterministic chain hash', () => {
    const jsonl = synthesizeSampleJSONL(10);
    const r1 = runStageB(jsonl);
    const r2 = runStageB(jsonl);
    expect(r1.steps_encoded).toBe(10); // init + final skipped
    expect(r1.skipped_entries).toBeGreaterThanOrEqual(2);
    expect(r1.total_spikes).toBeGreaterThan(0);
    expect(r1.spike_chain_hash).toBe(r2.spike_chain_hash); // determinism
    expect(r1.spike_chain_hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('different traces produce different chain hashes', () => {
    const a = runStageB(synthesizeSampleJSONL(5));
    const b = runStageB(synthesizeSampleJSONL(10));
    expect(a.spike_chain_hash).not.toBe(b.spike_chain_hash);
  });

  it('skips malformed JSON lines gracefully', () => {
    const jsonl = [
      JSON.stringify({ event: 'step', step: 1, state: { velocity: 0.5 } }),
      'not json',
      '',
      JSON.stringify({ event: 'step', step: 2, state: { velocity: 0.75 } }),
    ].join('\n');
    const r = runStageB(jsonl);
    expect(r.steps_encoded).toBe(2);
    expect(r.skipped_entries).toBe(2);
  });
});

describe('stage-c shadow-replay', () => {
  const canonical_trace: CanonicalStep[] = [
    { step: 1, floats: { velocity: 0.5 } },
    { step: 2, floats: { velocity: 0.75 }, vectors: { position: [1, 0, 0] as [number, number, number] } },
    { step: 3, floats: { temperature: 300.5 } },
  ];
  const field_specs = {
    velocity: { type: 'float' as const },
    temperature: { type: 'float' as const },
    position: { type: 'vector3' as const },
  };

  it('referenceReplayer passes pass criterion trivially', () => {
    const replayer = referenceReplayer(canonical_trace);
    const r = runStageC(canonical_trace, replayer, { field_specs });
    expect(r.total_steps).toBe(3);
    expect(r.digest_match_count).toBe(3);
    expect(r.violation_step_count).toBe(0);
    expect(r.pass_criterion_hit).toBe(true);
  });

  it('detects digest mismatch when runtime perturbs spikes', () => {
    const ref = referenceReplayer(canonical_trace);
    const perturbed: SNNReplayer = {
      replayStep(step: number) {
        const spikes = ref.replayStep(step);
        // Drop one spike to force digest mismatch
        return spikes.slice(1);
      },
    };
    const r = runStageC(canonical_trace, perturbed, { field_specs });
    expect(r.digest_match_count).toBeLessThan(r.total_steps);
  });

  it('pass criterion requires ≥99.99% violation-free steps', () => {
    // Build 10000-step trace; one corrupted step → 1/10000 = 0.01% violation rate
    // violation rate 0.0001 is the exact threshold (≤ 0.0001 passes).
    const big: CanonicalStep[] = [];
    for (let i = 0; i < 10_000; i++) big.push({ step: i, floats: { velocity: 0.5 } });
    const ref = referenceReplayer(big);
    const oneBad: SNNReplayer = {
      replayStep(step: number) {
        if (step === 500) return []; // drop all spikes for one step
        return ref.replayStep(step);
      },
    };
    const r = runStageC(big, oneBad, { field_specs });
    expect(r.violation_step_count).toBe(1);
    expect(r.pass_criterion_hit).toBe(true); // 1/10000 ≤ 0.01% threshold
  });

  it('fail_fast stops at first violation', () => {
    const ref = referenceReplayer(canonical_trace);
    const broken: SNNReplayer = {
      replayStep(step: number) {
        if (step === 2) return []; // drop all spikes
        return ref.replayStep(step);
      },
    };
    const r = runStageC(canonical_trace, broken, { field_specs, fail_fast: true });
    // With fail_fast, we stop after step 2 (the first violation)
    expect(r.violation_step_count).toBe(1);
    expect(r.log.length).toBeLessThanOrEqual(2); // steps 1 and 2, not 3
  });
});
