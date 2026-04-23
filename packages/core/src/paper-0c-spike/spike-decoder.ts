/**
 * paper-0c spike-decoder — inverse of spike-encoder with bounded-loss guarantee.
 *
 * Per the encoding spec, reconstruction is invertible up to quantum q_f: for each
 * field, `|decoded_value - canonical_value| <= q_f / 2`. This module provides
 * the decode + a verifier that asserts the bound holds.
 */

import type { Spike, FieldQuanta } from './spike-encoder';
import { fieldToNeuronBase } from './spike-encoder';

export interface DecodedStep {
  step: number;
  floats: Record<string, number>;
  vectors: Record<string, [number, number, number]>;
  action_neuron_ids: number[]; // we only preserve identities, not text (one-way hash)
}

export interface FieldSpec {
  type: 'float' | 'vector3';
  quantum?: number;
}

export interface DecodeOptions {
  fields: Record<string, FieldSpec>;
  /** Override quanta per field; falls back to FieldSpec.quantum then 1e-3. */
  quanta?: FieldQuanta;
}

const DEFAULT_QUANTUM = 1e-3;

/** Group spikes by neuron_id for fast lookup. */
function groupByNeuron(spikes: Spike[]): Map<number, Spike[]> {
  const out = new Map<number, Spike[]>();
  for (const s of spikes) {
    let arr = out.get(s.neuron_id);
    if (!arr) {
      arr = [];
      out.set(s.neuron_id, arr);
    }
    arr.push(s);
  }
  return out;
}

function decodeRateCoded(spikes: Spike[] | undefined, quantum: number): number {
  if (!spikes || spikes.length === 0) return 0;
  // All spikes on one neuron share polarity (encoder invariant)
  const n = spikes.length;
  const polarity = spikes[0].polarity;
  const magnitude = n * quantum;
  return polarity === 1 ? magnitude : -magnitude;
}

export function decodeStep(
  step: number,
  spikes: Spike[],
  opts: DecodeOptions
): DecodedStep {
  const byNeuron = groupByNeuron(spikes);
  const out: DecodedStep = { step, floats: {}, vectors: {}, action_neuron_ids: [] };

  for (const [field, spec] of Object.entries(opts.fields)) {
    const q = opts.quanta?.[field] ?? spec.quantum ?? DEFAULT_QUANTUM;
    const base = fieldToNeuronBase(field);
    if (spec.type === 'float') {
      out.floats[field] = decodeRateCoded(byNeuron.get(base), q);
    } else if (spec.type === 'vector3') {
      out.vectors[field] = [
        decodeRateCoded(byNeuron.get(base), q),
        decodeRateCoded(byNeuron.get(base + 1), q),
        decodeRateCoded(byNeuron.get(base + 2), q),
      ];
    }
  }

  // Actions: any neuron in action_space_base region that's not a declared field
  const ACTION_SPACE_BASE = 1_000_000;
  for (const neuron_id of byNeuron.keys()) {
    if (neuron_id >= ACTION_SPACE_BASE) out.action_neuron_ids.push(neuron_id);
  }
  out.action_neuron_ids.sort((a, b) => a - b);

  return out;
}

export interface BoundedLossViolation {
  field: string;
  component?: number; // for vectors
  expected: number;
  decoded: number;
  delta: number;
  bound: number;
}

/**
 * Verify bounded-loss guarantee: |decoded - expected| <= quantum / 2 per field.
 * Returns an empty array if all fields are within bound; else a list of violations.
 */
export function verifyBoundedLoss(
  expected_floats: Record<string, number> | undefined,
  expected_vectors: Record<string, [number, number, number]> | undefined,
  decoded: DecodedStep,
  opts: DecodeOptions
): BoundedLossViolation[] {
  const violations: BoundedLossViolation[] = [];

  if (expected_floats) {
    for (const [field, expected] of Object.entries(expected_floats)) {
      const q = opts.quanta?.[field] ?? opts.fields[field]?.quantum ?? DEFAULT_QUANTUM;
      const got = decoded.floats[field] ?? 0;
      const delta = Math.abs(got - expected);
      if (delta > q / 2) {
        violations.push({ field, expected, decoded: got, delta, bound: q / 2 });
      }
    }
  }

  if (expected_vectors) {
    for (const [field, expected] of Object.entries(expected_vectors)) {
      const q = opts.quanta?.[field] ?? opts.fields[field]?.quantum ?? DEFAULT_QUANTUM;
      const got = decoded.vectors[field] ?? [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const delta = Math.abs(got[k] - expected[k]);
        if (delta > q / 2) {
          violations.push({ field, component: k, expected: expected[k], decoded: got[k], delta, bound: q / 2 });
        }
      }
    }
  }

  return violations;
}
