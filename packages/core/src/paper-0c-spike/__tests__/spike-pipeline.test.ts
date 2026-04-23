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
