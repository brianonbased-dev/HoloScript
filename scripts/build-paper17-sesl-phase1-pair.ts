#!/usr/bin/env tsx
/**
 * Build the first Paper 17 SESL Phase 1 CAEL-verified training pair.
 *
 * Usage:
 *   pnpm exec tsx scripts/build-paper17-sesl-phase1-pair.ts
 *   pnpm exec tsx scripts/build-paper17-sesl-phase1-pair.ts --input=phase-0.jsonl --limit=5
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { CAELRecorder } from '../packages/engine/src/simulation/CAELRecorder.ts';
import {
  hashCAELEntry,
  verifyCAELHashChain,
  type CAELTrace,
  type CAELTraceEntry,
} from '../packages/engine/src/simulation/CAELTrace.ts';
import {
  type FieldData,
  type SimSolver,
} from '../packages/engine/src/simulation/SimSolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CORPUS_DIR = path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs');
const DEFAULT_CREATED_AT = '2026-05-06T12:00:00.000Z';
const HARNESS_VERSION = 'paper17-phase1-cael-recorder-v1';
const SCORER_VERSION = 'paper17-phase1-smoke-score-v1';
const CONTRACT_ID = 'paper17-sesl-phase1-smoke-contract-v1';
const ADAPTER_FINGERPRINT = 'paper17-sesl-deterministic-smoke-solver-v1';

type JsonRecord = Record<string, unknown>;

interface HarnessOptions {
  input?: string;
  output?: string;
  traceDir?: string;
  index?: string;
  limit?: number;
  pairId?: string;
  createdAt?: string;
  dryRun?: boolean;
}

interface ResolvedOptions {
  input: string;
  output: string;
  traceDir: string;
  index: string;
  limit: number;
  pairId: string | null;
  createdAt: string;
  dryRun: boolean;
}

interface HarnessPair {
  schemaVersion: 'paper17.sesl.phase1.v1';
  pair_id: string;
  source_pair_id: string;
  phase: 'phase-1';
  source: 'paper17-phase1-cael-harness';
  prompt_text: string;
  holo: string;
  hsplus: string;
  outcome: 'success' | 'simulation_failure';
  simContractCheck: {
    passed: boolean;
    contractId: string;
    solverType: string;
    violations: number;
  };
  cael_trace: {
    format: 'cael.v1.json';
    path: string;
    traceHash: string;
    entryCount: number;
    finalHash: string;
    hashChain: { valid: boolean; brokenAt?: number; reason?: string };
    hash_chain_valid: boolean;
    simContractCheck: { passed: boolean; contractId: string };
  };
  cael_hash_chain_valid: boolean;
  score: number;
  scoring: {
    version: string;
    components: Record<string, number>;
  };
  harness_version: string;
  created_at: string;
  provenance: {
    phase0_source: unknown;
    trait_family_set: string[];
    composition_shape_hash: string;
  };
}

class SeslSmokeSolver implements SimSolver {
  readonly mode = 'transient' as const;
  readonly fieldNames = ['temperature', 'stress'] as const;
  private time = 0;
  private solved = false;

  step(dt: number): void {
    this.time = Number((this.time + dt).toFixed(12));
  }

  solve(): void {
    this.solved = true;
  }

  getField(name: string): FieldData | null {
    if (name === 'temperature') {
      return new Float32Array([293.15 + this.time, 293.2 + this.time, 293.25 + this.time]);
    }
    if (name === 'stress') {
      return new Float32Array([1000 + this.time * 100, 1005 + this.time * 100, 1010 + this.time * 100]);
    }
    return null;
  }

  getStats(): Record<string, unknown> {
    return {
      converged: true,
      currentTime: this.time,
      solved: this.solved,
      harness: HARNESS_VERSION,
    };
  }

  dispose(): void {}
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/build-paper17-sesl-phase1-pair.ts [options]

Options:
  --input <path>       Phase 0 JSONL seed corpus
  --output <path>      Phase 1 JSONL output (default research/paper-17-sesl-pairs/phase-1-corpus.jsonl)
  --trace-dir <path>   CAEL trace output directory
  --index <path>       INDEX.json summary path
  --limit <n>          Number of verified pairs to emit (default 1)
  --pair-id <id>       Emit only a specific source pair
  --created-at <iso>   Deterministic timestamp (default ${DEFAULT_CREATED_AT})
  --dry-run            Build and verify without writing files
`;
}

function parseArgs(argv = process.argv.slice(2)): HarnessOptions {
  const out: HarnessOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const [key, inlineValue] = arg.startsWith('--') ? arg.slice(2).split('=', 2) : [arg, undefined];
    const value = inlineValue ?? argv[i + 1];
    const consume = inlineValue === undefined;
    switch (key) {
      case 'input':
        out.input = path.resolve(String(value));
        if (consume) i += 1;
        break;
      case 'output':
        out.output = path.resolve(String(value));
        if (consume) i += 1;
        break;
      case 'trace-dir':
        out.traceDir = path.resolve(String(value));
        if (consume) i += 1;
        break;
      case 'index':
        out.index = path.resolve(String(value));
        if (consume) i += 1;
        break;
      case 'limit':
        out.limit = Number(value);
        if (consume) i += 1;
        break;
      case 'pair-id':
        out.pairId = String(value);
        if (consume) i += 1;
        break;
      case 'created-at':
        out.createdAt = String(value);
        if (consume) i += 1;
        break;
      case 'dry-run':
        out.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return out;
}

function resolveOptions(options: HarnessOptions): ResolvedOptions {
  const input = resolveInputPath(options.input);
  const limit = Math.floor(Number(options.limit ?? 1));
  const createdAt = options.createdAt ?? DEFAULT_CREATED_AT;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('--limit must be a positive number');
  }
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error('--created-at must be a valid ISO timestamp');
  }
  return {
    input,
    output: path.resolve(options.output ?? path.join(DEFAULT_CORPUS_DIR, 'phase-1-corpus.jsonl')),
    traceDir: path.resolve(options.traceDir ?? path.join(DEFAULT_CORPUS_DIR, 'cael-traces')),
    index: path.resolve(options.index ?? path.join(DEFAULT_CORPUS_DIR, 'INDEX.json')),
    limit,
    pairId: options.pairId ?? null,
    createdAt,
    dryRun: options.dryRun ?? false,
  };
}

function resolveInputPath(explicit?: string): string {
  const home = process.env.USERPROFILE || os.homedir();
  const candidates = [
    explicit,
    path.join(DEFAULT_CORPUS_DIR, 'fixtures', 'phase1-seed.jsonl'),
    path.join(home, '.ai-ecosystem', 'research', 'paper-17-sesl-corpus', 'phase-0-corpus.jsonl'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(String(candidate));
    if (fs.existsSync(resolved)) return resolved;
  }
  throw new Error(`No Phase 0 seed corpus found. Checked: ${candidates.map((c) => path.resolve(String(c))).join('; ')}`);
}

async function* readJsonl(filePath: string): AsyncGenerator<{ record?: JsonRecord; error?: Error; lineNumber: number }> {
  const input = fs.createReadStream(filePath, 'utf8');
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield { record: JSON.parse(line) as JsonRecord, lineNumber };
    } catch (err) {
      yield { error: err as Error, lineNumber };
    }
  }
}

function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return out;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sourceHolo(record: JsonRecord): string {
  return asString(record.holo) || asString(record.hsplus) || asString(record.holo_source);
}

function traitFamilySet(record: JsonRecord, holo: string): string[] {
  if (Array.isArray(record.trait_family_set)) {
    return record.trait_family_set.map(String).sort();
  }
  const traits = new Set<string>();
  const re = /@([A-Za-z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(holo))) traits.add(match[1].toLowerCase());
  return [...traits].sort();
}

function staticContractCheck(record: JsonRecord, holo: string): { passed: boolean; objectCount: number; traitCount: number; propertyCount: number } {
  const objectCount = (holo.match(/\bobject\s+"/g) || []).length;
  const traitCount = (holo.match(/@[A-Za-z0-9_-]+/g) || []).length;
  const propertyCount = (holo.match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:/gm) || []).length;
  return {
    passed: record.outcome === 'success' && holo.trim().length > 0 && (objectCount > 0 || traitCount > 0),
    objectCount,
    traitCount,
    propertyCount,
  };
}

function normalizePayload(payload: Record<string, unknown>, sourcePairId: string, createdAt: string, baseTimestamp: number): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const provenance = out.provenance as Record<string, unknown> | undefined;
  if (provenance) {
    provenance.runId = `run-paper17-sesl-${sourcePairId}`;
    provenance.wallTimeMs = 0;
    provenance.createdAt = createdAt;
    const interactions = provenance.interactions as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(interactions)) {
      interactions.forEach((interaction, index) => {
        interaction.timestamp = baseTimestamp + index;
      });
    }
  }
  return out;
}

function normalizeTrace(trace: CAELTrace, sourcePairId: string, createdAt: string): CAELTrace {
  const baseTimestamp = Date.parse(createdAt);
  const runId = `cael-paper17-sesl-${sourcePairId}`;
  const mode = trace[0]?.payload.hashMode === 'sha256' ? 'sha256' : 'fnv1a';
  let prevHash = 'cael.genesis';
  return trace.map((entry, index) => {
    const entryWithoutHash: Omit<CAELTraceEntry, 'hash'> = {
      version: entry.version,
      runId,
      index,
      event: entry.event,
      timestamp: baseTimestamp + index,
      simTime: entry.simTime,
      prevHash,
      payload: normalizePayload(entry.payload, sourcePairId, createdAt, baseTimestamp),
    };
    const hash = hashCAELEntry(entryWithoutHash, mode);
    prevHash = hash;
    return { ...entryWithoutHash, hash };
  });
}

function buildPair(record: JsonRecord, createdAt: string): { pair: HarnessPair; trace: CAELTrace; traceHash: string } {
  const sourcePairId = asString(record.pair_id) || `seed-${sha256Hex(stableJson(record)).slice(0, 12)}`;
  const promptText = asString(record.prompt_text);
  const holo = sourceHolo(record);
  const traits = traitFamilySet(record, holo);
  const gate = staticContractCheck(record, holo);

  const recorder = new CAELRecorder(
    new SeslSmokeSolver(),
    {
      vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      tetrahedra: new Uint32Array([0, 1, 2, 3]),
      sourcePairId,
      promptHash: sha256Hex(promptText),
      holoHash: sha256Hex(holo),
    },
    {
      solverType: 'paper17-sesl-smoke',
      fixedDt: 0.01,
      adapterFingerprint: ADAPTER_FINGERPRINT,
      useCryptographicHash: true,
    },
  );

  recorder.logInteraction('sesl.prompt_sampled', {
    sourcePairId,
    promptHash: sha256Hex(promptText),
    holoHash: sha256Hex(holo),
  });
  recorder.step(0.03);
  const provenance = recorder.finalize();
  const violations = recorder.getContractedSimulation().getViolations().filter((v) => v.severity === 'error').length;
  recorder.dispose();

  const trace = normalizeTrace(recorder.getTrace(), sourcePairId, createdAt);
  const verification = verifyCAELHashChain(trace);
  const traceHash = sha256Hex(stableJson(trace));
  const finalHash = trace.at(-1)?.hash ?? 'cael.nohash';
  const simContractPassed = gate.passed && violations === 0 && verification.valid;
  const components = {
    simContract: simContractPassed ? 1 : 0,
    caelHashChain: verification.valid ? 1 : 0,
    structuralDiversity: Math.min(1, (gate.objectCount + gate.traitCount + gate.propertyCount) / 6),
  };
  const score = Number((components.simContract * 0.6 + components.caelHashChain * 0.3 + components.structuralDiversity * 0.1).toFixed(6));

  return {
    pair: {
      schemaVersion: 'paper17.sesl.phase1.v1',
      pair_id: `phase1-${sourcePairId}`,
      source_pair_id: sourcePairId,
      phase: 'phase-1',
      source: 'paper17-phase1-cael-harness',
      prompt_text: promptText,
      holo,
      hsplus: holo,
      outcome: simContractPassed ? 'success' : 'simulation_failure',
      simContractCheck: {
        passed: simContractPassed,
        contractId: provenance.contractId || CONTRACT_ID,
        solverType: provenance.solverType,
        violations,
      },
      cael_trace: {
        format: 'cael.v1.json',
        path: `cael-traces/${traceHash}.json`,
        traceHash,
        entryCount: trace.length,
        finalHash,
        hashChain: verification,
        hash_chain_valid: verification.valid,
        simContractCheck: { passed: simContractPassed, contractId: provenance.contractId || CONTRACT_ID },
      },
      cael_hash_chain_valid: verification.valid,
      score,
      scoring: {
        version: SCORER_VERSION,
        components,
      },
      harness_version: HARNESS_VERSION,
      created_at: createdAt,
      provenance: {
        phase0_source: record.source ?? null,
        trait_family_set: traits,
        composition_shape_hash: asString(record.composition_shape_hash) || sha256Hex(holo),
      },
    },
    trace,
    traceHash,
  };
}

function relativeRepoPath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function writeIndex(options: ResolvedOptions, pairs: HarnessPair[]): JsonRecord {
  const total = pairs.length;
  const passed = pairs.filter((pair) => pair.simContractCheck.passed).length;
  const failed = total - passed;
  const caelVerifiedPairs = pairs.filter((pair) => pair.cael_hash_chain_valid && pair.outcome === 'success').length;
  const passRate = total > 0 ? Number((passed / total).toFixed(6)) : null;
  const gateTarget = 5000;
  const targetPassRate = 0.6;
  return {
    schemaVersion: 'paper17.sesl.index.v1',
    generatedAt: options.createdAt,
    harnessVersion: HARNESS_VERSION,
    corpusPath: relativeRepoPath(options.output),
    traceDir: relativeRepoPath(options.traceDir),
    gate: {
      target_pairs: gateTarget,
      target_pass_rate: targetPassRate,
      pairs_collected: total,
      cael_verified_pairs: caelVerifiedPairs,
      static_seed_pairs: 0,
      measured_pairs: total,
      passed,
      failed,
      pass_rate: passRate,
      pass_rate_ok: passRate !== null && passRate >= targetPassRate,
      volume_ok: caelVerifiedPairs >= gateTarget,
      gate_cleared: passRate !== null && passRate >= targetPassRate && caelVerifiedPairs >= gateTarget,
      gate_gap_cael_verified: Math.max(0, gateTarget - caelVerifiedPairs),
    },
    pairs: pairs.map((pair) => ({
      pair_id: pair.pair_id,
      source_pair_id: pair.source_pair_id,
      outcome: pair.outcome,
      score: pair.score,
      cael_trace_hash: pair.cael_trace.traceHash,
      cael_hash_chain_valid: pair.cael_hash_chain_valid,
      sim_contract_passed: pair.simContractCheck.passed,
    })),
  };
}

export async function runHarness(rawOptions: HarnessOptions = {}): Promise<{ summary: JsonRecord; emitted: HarnessPair[] }> {
  const options = resolveOptions(rawOptions);
  const emitted: HarnessPair[] = [];
  const traces: Array<{ traceHash: string; trace: CAELTrace }> = [];
  let readRecords = 0;
  let skippedRecords = 0;

  for await (const item of readJsonl(options.input)) {
    readRecords += 1;
    if (item.error || !item.record) {
      skippedRecords += 1;
      continue;
    }
    if (options.pairId && item.record.pair_id !== options.pairId) continue;
    const promptText = asString(item.record.prompt_text);
    const holo = sourceHolo(item.record);
    if (item.record.outcome !== 'success' || !promptText || !holo) {
      skippedRecords += 1;
      continue;
    }
    const built = buildPair(item.record, options.createdAt);
    if (built.pair.outcome === 'success' && built.pair.cael_hash_chain_valid) {
      emitted.push(built.pair);
      traces.push({ traceHash: built.traceHash, trace: built.trace });
    } else {
      skippedRecords += 1;
    }
    if (emitted.length >= options.limit) break;
  }

  if (emitted.length === 0) {
    throw new Error(`No CAEL-verified pairs emitted from ${readRecords} records (${skippedRecords} skipped).`);
  }

  const summary = writeIndex(options, emitted);
  summary.inputPath = options.input;
  summary.outputPath = options.output;
  summary.readRecords = readRecords;
  summary.skippedRecords = skippedRecords;

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.mkdirSync(options.traceDir, { recursive: true });
    fs.writeFileSync(options.output, `${emitted.map((pair) => JSON.stringify(pair)).join('\n')}\n`, 'utf8');
    for (const { traceHash, trace } of traces) {
      fs.writeFileSync(path.join(options.traceDir, `${traceHash}.json`), `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
    }
    fs.writeFileSync(options.index, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  return { summary, emitted };
}

async function main(): Promise<void> {
  const result = await runHarness(parseArgs());
  console.log(JSON.stringify(result.summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
