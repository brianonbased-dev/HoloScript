import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  runConjectureRunner,
  type ConjectureRunnerResult,
  type ConjectureRunnerSuite,
} from '@holoscript/engine/simulation';

import type {
  ConjectureGateState,
  StudioConjectureCandidateSummary,
  StudioConjecturePoint,
  StudioConjectureReceiptsResponse,
  StudioConjectureReplayResponse,
  StudioConjectureRun,
  StudioConjectureRunnerSuite,
} from '@/types/conjectureReceipts';

const MAX_RECEIPT_FILES = 24;
const DEFAULT_PROPOSED_BY = 'codex-hardware';
const PROOF_CARRYING_GEOMETRY_SMOKE_SUITE: StudioConjectureRunnerSuite =
  'proof-carrying-geometry-smoke';
const GENERATED_GEOMETRY_FAMILY_SUITE: StudioConjectureRunnerSuite = 'generated-geometry-family';

function repoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), '../..');
}

function receiptDir(): string {
  return (
    process.env.HOLOSCRIPT_CONJECTURE_RECEIPT_DIR || path.join(repoRoot(), '.scratch', 'conjecture')
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asParameterMap(value: unknown): Record<string, string | number | boolean | null> {
  const record = asRecord(value);
  if (!record) return {};

  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, part] of Object.entries(record)) {
    if (
      typeof part === 'string' ||
      typeof part === 'number' ||
      typeof part === 'boolean' ||
      part === null
    ) {
      out[key] = part;
    }
  }
  return out;
}

function isSuite(value: unknown): value is ConjectureRunnerSuite {
  return value === PROOF_CARRYING_GEOMETRY_SMOKE_SUITE || value === GENERATED_GEOMETRY_FAMILY_SUITE;
}

function gateState(status: string): ConjectureGateState {
  if (status === 'survived' || status === 'rediscovered') return 'survived';
  if (status === 'falsified') return 'falsified';
  return 'undecided';
}

function candidateSummary(value: unknown): StudioConjectureCandidateSummary {
  const evaluation = asRecord(value) ?? {};
  const facts = asRecord(evaluation.facts);
  const failedProbeIds = asArray(evaluation.probeResults)
    .map((probe) => asRecord(probe))
    .filter((probe): probe is Record<string, unknown> => probe !== null)
    .filter((probe) => asString(probe.status) === 'fail')
    .map((probe) => asString(probe.probeId))
    .filter(Boolean);

  return {
    candidateId: asString(evaluation.candidateId, 'candidate'),
    family: asString(evaluation.family, 'unknown-family'),
    status: asString(evaluation.status, 'undecided'),
    parameters: asParameterMap(evaluation.parameters),
    geometryHash: facts ? asString(facts.geometryHash) || null : null,
    failedProbeIds,
  };
}

function scenarioIdFor(receiptKey: string, classifications: Record<string, unknown>[]): string {
  const match = classifications.find((entry) => asString(entry.receiptKey) === receiptKey);
  return match ? asString(match.scenarioId, receiptKey) : receiptKey;
}

function roleFor(receiptKey: string, classifications: Record<string, unknown>[]): string {
  const match = classifications.find((entry) => asString(entry.receiptKey) === receiptKey);
  return match ? asString(match.role, 'unknown') : 'unknown';
}

function pointForReceipt(input: {
  receipt: Record<string, unknown>;
  runId: string;
  suite: StudioConjectureRunnerSuite;
  sourcePath: string;
  index: number;
  classifications: Record<string, unknown>[];
}): StudioConjecturePoint {
  const claim = asRecord(input.receipt.claim) ?? {};
  const evaluations = asArray(input.receipt.evaluations).map(candidateSummary);
  const counterexamples = asArray(input.receipt.counterexamples);
  const receiptKey = asString(input.receipt.receiptKey, `${input.runId}-${input.index}`);
  const status = asString(input.receipt.status, 'undecided');
  const state = gateState(status);
  const primaryCounterexample =
    evaluations.find((evaluation) => evaluation.failedProbeIds.length > 0) ?? null;

  return {
    id: `${input.runId}:${receiptKey}`,
    runId: input.runId,
    suite: input.suite,
    scenarioId: scenarioIdFor(receiptKey, input.classifications),
    role: roleFor(receiptKey, input.classifications),
    status,
    gateState: state,
    receiptKey,
    claimId: asString(claim.id, 'claim'),
    claimStatement: asString(claim.statement, 'No claim statement recorded.'),
    candidateCount: evaluations.length,
    counterexampleCount: counterexamples.length,
    candidateSummaries: evaluations,
    primaryCounterexample,
    receipt: input.receipt,
    replayable: state === 'falsified' && counterexamples.length > 0,
    x: (input.index % 8) - 3.5,
    y: state === 'survived' ? 1 : state === 'falsified' ? -1 : 0,
  };
}

function normalizeRunnerResult(
  result: unknown,
  sourcePath: string,
  fallbackRunId?: string
): StudioConjectureRun | null {
  const record = asRecord(result);
  if (!record || record.solverType !== 'conjecture.runner.v1' || !isSuite(record.suite)) {
    return null;
  }

  const receipts = asArray(record.receipts)
    .map((receipt) => asRecord(receipt))
    .filter((receipt): receipt is Record<string, unknown> => receipt !== null);
  if (receipts.length === 0) return null;

  const classifications = asArray(record.classifications)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const runId = fallbackRunId || path.basename(sourcePath, '.json');
  const suite = record.suite;
  const points = receipts.map((receipt, index) =>
    pointForReceipt({
      receipt,
      runId,
      suite,
      sourcePath,
      index,
      classifications,
    })
  );

  return {
    runId,
    suite,
    sourcePath,
    receiptKey: asString(record.receiptKey, runId),
    gatePassed: asBoolean(asRecord(record.gate)?.passed),
    points,
  };
}

async function readReceiptFile(filePath: string): Promise<StudioConjectureRun | null> {
  const text = await readFile(filePath, 'utf8');
  return normalizeRunnerResult(JSON.parse(text) as unknown, filePath);
}

async function receiptFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    const files = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const filePath = path.join(dir, name);
          const info = await stat(filePath);
          return { filePath, mtimeMs: info.mtimeMs };
        })
    );
    return files
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, MAX_RECEIPT_FILES)
      .map((file) => file.filePath);
  } catch {
    return [];
  }
}

function liveFallbackRun(): StudioConjectureRun {
  const result = runConjectureRunner({
    suite: GENERATED_GEOMETRY_FAMILY_SUITE,
    proposedBy: DEFAULT_PROPOSED_BY,
  });
  return normalizeRunnerResult(
    result,
    'live:generated-geometry-family',
    'live-generated-geometry-family'
  )!;
}

export async function listConjectureReceipts(): Promise<StudioConjectureReceiptsResponse> {
  const dir = receiptDir();
  const runs: StudioConjectureRun[] = [];
  for (const filePath of await receiptFiles(dir)) {
    const run = await readReceiptFile(filePath).catch(() => null);
    if (run) runs.push(run);
  }

  if (runs.length === 0) runs.push(liveFallbackRun());

  const points = runs.flatMap((run) => run.points);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    receiptDir: dir,
    runCount: runs.length,
    pointCount: points.length,
    runs,
    points,
  };
}

function replayOutputPath(suite: ConjectureRunnerSuite): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(receiptDir(), `studio-replay-${suite}-${stamp}.json`);
}

export async function replayConjectureReceipt(input: {
  targetReceiptKey: string;
  suite: StudioConjectureRunnerSuite;
  scenarioId?: string;
}): Promise<StudioConjectureReplayResponse> {
  const suite = input.suite;
  if (!isSuite(suite)) {
    throw new Error(`Unsupported conjecture suite: ${suite}`);
  }

  const result: ConjectureRunnerResult = runConjectureRunner({
    suite,
    proposedBy: DEFAULT_PROPOSED_BY,
  });
  const outPath = replayOutputPath(suite);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const run = normalizeRunnerResult(result, outPath, path.basename(outPath, '.json'));
  const point =
    run?.points.find((candidate) => candidate.scenarioId === input.scenarioId) ??
    run?.points.find((candidate) => candidate.receiptKey === input.targetReceiptKey) ??
    null;

  return {
    ok: true,
    replayedAt: new Date().toISOString(),
    suite,
    sourcePath: outPath,
    targetReceiptKey: input.targetReceiptKey,
    matched: point !== null,
    counterexampleMatched: point?.gateState === 'falsified' && point.counterexampleCount > 0,
    replayReceiptKey: point?.receiptKey ?? null,
    point,
  };
}
