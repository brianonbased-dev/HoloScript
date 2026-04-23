/**
 * paper-0c Stage B — consume a CAEL JSONL trace and spike-encode each step.
 *
 * Produces a parallel spike-chain alongside the original CAEL JSONL hash chain.
 * This is the "bounded-loss cross-check" regime from the spec: the JSONL chain
 * remains the canonical reference; the spike-chain is independently verifiable.
 *
 * Input: a CAEL JSONL string (one JSON object per line, schema per the
 * CAELTrace/CAELTraceEntry pattern in engine/SimulationContract).
 *
 * Kept dep-free of engine internals: we only need the envelope shape
 * `{event, step?, state?, actions?}` which is stable across the trace format.
 */

import { encodeStep, extendChain, toHex, type SpikeBatch } from './spike-encoder';
import { quantumForField } from './quantum-registry';

export interface StageBResult {
  steps_encoded: number;
  spike_chain_hash: string;
  total_spikes: number;
  skipped_entries: number;
  duration_ms: number;
}

interface TraceEntryEnvelope {
  event?: string;
  step?: number;
  state?: Record<string, unknown>;
  actions?: unknown[];
}

/** Classify a field's value into float / vector3 / other. */
function classifyField(
  value: unknown
): { kind: 'float' | 'vector3' | 'skip'; value?: number | [number, number, number] } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'float', value };
  }
  if (Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return { kind: 'vector3', value: [value[0] as number, value[1] as number, value[2] as number] };
  }
  return { kind: 'skip' };
}

/** Extract action identifiers (strings) from a heterogenous actions array. */
function extractActionStrings(actions: unknown[] | undefined): string[] {
  if (!actions) return [];
  const out: string[] = [];
  for (const a of actions) {
    if (typeof a === 'string') out.push(a);
    else if (a && typeof a === 'object') {
      const maybe = a as { action?: unknown; type?: unknown; name?: unknown };
      const tag = maybe.action ?? maybe.type ?? maybe.name;
      if (typeof tag === 'string') out.push(tag);
    }
  }
  return out;
}

/**
 * Parse one JSONL line into an envelope, ignoring empty lines + parse errors.
 */
function parseLine(line: string): TraceEntryEnvelope | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object') return obj as TraceEntryEnvelope;
  } catch {
    /* skip malformed */
  }
  return null;
}

/**
 * Run Stage B over a CAEL JSONL string. Only `event === 'step'` (or `solve`)
 * entries contribute to the spike chain; init/final/interaction entries are
 * skipped unless they carry a state delta worth encoding (future extension).
 */
export function runStageB(jsonl: string): StageBResult {
  const t_start = Date.now();
  let chain = new Uint8Array(4);
  let steps_encoded = 0;
  let total_spikes = 0;
  let skipped = 0;

  const lines = jsonl.split(/\r?\n/);
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) {
      skipped++;
      continue;
    }
    if (entry.event !== 'step' && entry.event !== 'solve') {
      skipped++;
      continue;
    }

    const floats: Record<string, number> = {};
    const vectors: Record<string, [number, number, number]> = {};
    const quanta: Record<string, number> = {};

    if (entry.state) {
      for (const [field, value] of Object.entries(entry.state)) {
        const c = classifyField(value);
        if (c.kind === 'float') {
          floats[field] = c.value as number;
          quanta[field] = quantumForField(field);
        } else if (c.kind === 'vector3') {
          vectors[field] = c.value as [number, number, number];
          quanta[field] = quantumForField(field);
        }
      }
    }

    const actions = extractActionStrings(entry.actions);

    const batch: SpikeBatch = encodeStep(
      {
        step: entry.step ?? steps_encoded,
        floats,
        vectors,
        actions,
      },
      quanta
    );

    total_spikes += batch.spikes.length;
    chain = extendChain(chain, batch.digest);
    steps_encoded++;
  }

  return {
    steps_encoded,
    spike_chain_hash: toHex(chain),
    total_spikes,
    skipped_entries: skipped,
    duration_ms: Date.now() - t_start,
  };
}

/**
 * Generate a small synthetic JSONL trace for tests + smoke. Matches the
 * field-naming conventions the quantum registry recognizes.
 */
export function synthesizeSampleJSONL(num_steps: number = 10): string {
  const lines: string[] = [];
  lines.push(JSON.stringify({ event: 'init', step: 0, state: {} }));
  for (let step = 1; step <= num_steps; step++) {
    const theta = Math.sin(step * 0.1);
    lines.push(
      JSON.stringify({
        event: 'step',
        step,
        state: {
          position: [Math.cos(theta), Math.sin(theta), 0],
          velocity: theta * 0.5,
          temperature: 300 + step * 0.1,
          pressure: 101325,
        },
        actions: ['advance'],
      })
    );
  }
  lines.push(JSON.stringify({ event: 'final', step: num_steps + 1, state: {} }));
  return lines.join('\n');
}
