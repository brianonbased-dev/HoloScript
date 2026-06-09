export const maxDuration = 30;

/**
 * /api/self-improve/status — Persist and serve self-improve run receipts.
 *
 * GET  → returns the latest N receipts (default 20).
 * POST → appends a new receipt. Called by run-self-improve.ts or any fleet job.
 *
 * Storage: ~/.holoscript/studio/self-improve-receipts.json
 * (same directory as daemon-jobs.json — reuses the existing stable var-data
 *  pattern from packages/studio/src/app/api/daemon/jobs/store.ts)
 *
 * Receipt shape mirrors the SelfImproveResult output from run-self-improve.ts:
 *   mode, abortReason, iterations, proposalsGenerated, proposalsPassing,
 *   finalQualityPercent, totalDurationMs, passRate (derived), runAt.
 *
 * Surfaced by <SelfImproveRunsPanel /> on /integrations (D.081: every infra
 * capability gets a perceivable Studio surface; F.099 show-don't-reference).
 *
 * @module api/self-improve/status
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ─── Storage ────────────────────────────────────────────────────────────────
const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
const STORE_DIR = path.join(HOME_DIR, '.holoscript', 'studio');
const RECEIPTS_PATH = path.join(STORE_DIR, 'self-improve-receipts.json');
const MAX_RECEIPTS = 50;

export interface SelfImproveReceipt {
  /** ISO timestamp of the run */
  runAt: string;
  /** Unique run id (generated server-side if not provided by the caller) */
  runId: string;
  /** "propose-only" | "auto-commit" */
  mode: string;
  /** Why the loop stopped */
  abortReason: 'converged' | 'max_iterations' | 'max_failures' | 'no_targets' | null;
  /** Total iteration count */
  iterations: number;
  /** Total proposals generated (all) */
  proposalsGenerated: number;
  /** Proposals whose generated vitest tests actually passed */
  proposalsPassing: number;
  /** Derived: proposalsPassing / proposalsGenerated (null when 0 generated) */
  passRate: number | null;
  /** Composite quality score, 0-100, from SelfImproveCommand (null if not computed) */
  finalQualityPercent: number | null;
  /** Wall-clock duration in ms */
  totalDurationMs: number;
  /** Abs path of the repo root that was improved */
  rootDir?: string;
}

interface ReceiptsFile {
  receipts: SelfImproveReceipt[];
}

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function loadReceipts(): SelfImproveReceipt[] {
  try {
    if (!fs.existsSync(RECEIPTS_PATH)) return [];
    const raw = fs.readFileSync(RECEIPTS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ReceiptsFile;
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function saveReceipts(receipts: SelfImproveReceipt[]): void {
  ensureStoreDir();
  const file: ReceiptsFile = { receipts };
  fs.writeFileSync(RECEIPTS_PATH, JSON.stringify(file, null, 2), 'utf8');
}

// ─── Derive aggregate stats from all receipts ───────────────────────────────
function buildSummary(receipts: SelfImproveReceipt[]) {
  const n = receipts.length;
  if (n === 0) {
    return { totalRuns: 0, overallPassRate: null, lastRunAt: null, lastAbortReason: null };
  }
  const latest = receipts[receipts.length - 1];
  const totalGenerated = receipts.reduce((s, r) => s + r.proposalsGenerated, 0);
  const totalPassing = receipts.reduce((s, r) => s + r.proposalsPassing, 0);
  return {
    totalRuns: n,
    overallPassRate: totalGenerated > 0 ? Math.round((totalPassing / totalGenerated) * 100) : null,
    lastRunAt: latest.runAt,
    lastAbortReason: latest.abortReason,
  };
}

// ─── GET /api/self-improve/status ───────────────────────────────────────────
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), MAX_RECEIPTS);
  const receipts = loadReceipts();
  const recent = receipts.slice(-limit).reverse(); // newest first for UI
  return NextResponse.json({
    summary: buildSummary(receipts),
    receipts: recent,
    storeFile: RECEIPTS_PATH,
  });
}

// ─── POST /api/self-improve/status ──────────────────────────────────────────
// Called by run-self-improve.ts (or any automated job) after a run completes.
// Body shape matches the summary produced by run-self-improve.ts --json output.
export async function POST(request: NextRequest) {
  let body: Partial<SelfImproveReceipt>;
  try {
    body = (await request.json()) as Partial<SelfImproveReceipt>;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const receipt: SelfImproveReceipt = {
    runAt: body.runAt ?? new Date().toISOString(),
    runId: body.runId ?? `run_${Date.now()}`,
    mode: body.mode ?? 'propose-only',
    abortReason: body.abortReason ?? null,
    iterations: Number(body.iterations ?? 0),
    proposalsGenerated: Number(body.proposalsGenerated ?? 0),
    proposalsPassing: Number(body.proposalsPassing ?? 0),
    passRate:
      (body.proposalsGenerated ?? 0) > 0
        ? (body.proposalsPassing ?? 0) / body.proposalsGenerated!
        : null,
    finalQualityPercent: body.finalQualityPercent ?? null,
    totalDurationMs: Number(body.totalDurationMs ?? 0),
    rootDir: body.rootDir,
  };

  const receipts = loadReceipts();
  receipts.push(receipt);
  // Keep at most MAX_RECEIPTS
  const trimmed = receipts.slice(-MAX_RECEIPTS);
  saveReceipts(trimmed);

  return NextResponse.json({ success: true, receipt }, { status: 201 });
}
