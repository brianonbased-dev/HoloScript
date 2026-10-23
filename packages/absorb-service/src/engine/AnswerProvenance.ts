/**
 * AnswerProvenance - per-answer replay envelope + cross-cascade binding (A19).
 *
 * Our own code (PAPER_VOICE 0b). Idea credit: snapshot+commit keyed results
 * (knowing2026) and per-call receipts (toolreceipts2026); this module binds
 * a single derived ANSWER (not an edge, not an index) to
 * `{graphSnapshotHash, gitCommitHash, evidenceHash, cascadeLayers}`.
 *
 * - canonicalJson: sorted keys, no whitespace, undefined dropped.
 * - evidenceHash: sha256 over canonical JSON of the cited symbols/files,
 *   ordered (sorted by file, line, name).
 * - cascade chain: each layer `{layer, inputHash, outputHash}` where
 *   inputHash === previous layer's outputHash. `verifyCascadeChain` re-hashes
 *   recorded outputs and reports the first failing layer.
 */

import { createHash } from 'node:crypto';

export type CascadeLayerName = 'keyword' | 'graph' | 'embed' | 'llm';

export interface CascadeLayerRecord {
  layer: CascadeLayerName | string;
  inputHash: string;
  outputHash: string;
  /** Optional recorded output used to re-derive outputHash during verification. */
  output?: unknown;
  /** Free-form note, e.g. LLM replay mode. */
  mode?: string;
}

export interface EvidenceItem {
  filePath: string;
  name?: string;
  line?: number;
  type?: string;
}

export interface ReplayEnvelope {
  graphSnapshotHash: string;
  gitCommitHash: string | null;
  evidenceHash: string;
  cascadeLayers: CascadeLayerRecord[];
}

export interface CascadeVerification {
  ok: boolean;
  /** Index of the first failing layer, or -1. */
  failedAt: number;
  failedLayer: string | null;
  reason: string | null;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function sortEvidence(items: EvidenceItem[]): EvidenceItem[] {
  return items
    .map((i) => ({
      filePath: i.filePath.replace(/\\/g, '/'),
      name: i.name,
      line: i.line,
      type: i.type,
    }))
    .sort(
      (a, b) =>
        a.filePath.localeCompare(b.filePath) ||
        (a.line ?? 0) - (b.line ?? 0) ||
        (a.name ?? '').localeCompare(b.name ?? '')
    );
}

export function computeEvidenceHash(items: EvidenceItem[]): string {
  return hashCanonical(sortEvidence(items));
}

/** Hash a serialized graph snapshot (e.g. CodebaseGraph.serialize()). */
export function computeGraphSnapshotHash(serialized: string): string {
  return sha256Hex(serialized);
}

/** Build a chained cascade: layer i input = layer i-1 output (layer 0 input = query hash). */
export class CascadeBinder {
  private readonly layers: CascadeLayerRecord[] = [];
  private lastHash: string;

  constructor(query: unknown) {
    this.lastHash = hashCanonical({ query });
  }

  get queryHash(): string {
    return this.layers.length ? this.layers[0].inputHash : this.lastHash;
  }

  add(layer: CascadeLayerName | string, output: unknown, mode?: string): CascadeLayerRecord {
    const rec: CascadeLayerRecord = {
      layer,
      inputHash: this.lastHash,
      outputHash: hashCanonical(output),
      output,
    };
    if (mode) rec.mode = mode;
    this.layers.push(rec);
    this.lastHash = rec.outputHash;
    return rec;
  }

  records(includeOutputs = true): CascadeLayerRecord[] {
    return this.layers.map((l) => {
      if (includeOutputs) return { ...l };
      const { output: _o, ...rest } = l;
      return rest;
    });
  }
}

/**
 * Verify a cascade chain end to end. Checks (1) the first input equals the
 * query hash when a query is given, (2) every inputHash equals the previous
 * outputHash, (3) every recorded output re-hashes to its outputHash.
 */
export function verifyCascadeChain(
  layers: CascadeLayerRecord[],
  opts: { query?: unknown; expectedLayers?: string[] } = {}
): CascadeVerification {
  const fail = (i: number, reason: string): CascadeVerification => ({
    ok: false,
    failedAt: i,
    failedLayer: layers[i]?.layer ?? null,
    reason,
  });
  if (opts.expectedLayers) {
    const names = layers.map((l) => l.layer).join('>');
    if (names !== opts.expectedLayers.join('>')) {
      return { ok: false, failedAt: -1, failedLayer: null, reason: `layer order ${names}` };
    }
  }
  for (let i = 0; i < layers.length; i += 1) {
    const l = layers[i];
    if (i === 0 && opts.query !== undefined && l.inputHash !== hashCanonical({ query: opts.query })) {
      return fail(i, 'first inputHash does not match query hash');
    }
    if (i > 0 && l.inputHash !== layers[i - 1].outputHash) {
      return fail(i, `inputHash != ${layers[i - 1].layer}.outputHash`);
    }
    if (l.output !== undefined && hashCanonical(l.output) !== l.outputHash) {
      return fail(i, 'recorded output does not hash to outputHash');
    }
  }
  return { ok: true, failedAt: -1, failedLayer: null, reason: null };
}

export function buildReplayEnvelope(input: {
  serializedGraph: string;
  gitCommitHash: string | null;
  evidence: EvidenceItem[];
  cascadeLayers?: CascadeLayerRecord[];
}): ReplayEnvelope {
  return {
    graphSnapshotHash: computeGraphSnapshotHash(input.serializedGraph),
    gitCommitHash: input.gitCommitHash,
    evidenceHash: computeEvidenceHash(input.evidence),
    cascadeLayers: input.cascadeLayers ?? [],
  };
}