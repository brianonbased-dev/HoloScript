#!/usr/bin/env node
/**
 * HoloShell Execution Engine — Phase A, stale-process-cleanup lane.
 *
 * Flow: scan → createPreflightReceipt → writePreflightReceipt
 *       → [consent: classify + issue token]
 *       → executeReceipt → execution receipt on disk
 *
 * Receipt schema namespace: hololand.holoshell.stale-process-cleanup.*
 * Storage: HOLOSHELL_RECEIPTS_DIR (default ~/.ai-ecosystem/runtime/holoshell/receipts/)
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { verifyConsentToken } from './holoshell-consent-contract.mjs';

const RECEIPTS_DIR =
  process.env.HOLOSHELL_RECEIPTS_DIR ?? 'C:/Users/Josep/.ai-ecosystem/runtime/holoshell/receipts';

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

function hashValue(v) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex')}`;
}

// ── Process scanning ──────────────────────────────────────────────────────────

/**
 * Scan for stale git processes (git status --ignored running longer than minAgeMs).
 * These are the primary source of index.lock congestion in the multi-agent workflow.
 *
 * @param {{ minAgeMs?: number }} opts
 * @returns {{ pid: number, command: string, ageMs: number, reason: string }[]}
 */
export function scanStaleProcesses({ minAgeMs = 5 * 60 * 1000 } = {}) {
  const ps = [
    'Get-CimInstance Win32_Process',
    "| Where-Object { $_.Name -eq 'git.exe' -and $_.CommandLine -like '*--ignored*' }",
    '| Select-Object ProcessId, CommandLine,',
    '  @{Name="AgeMs";Expression={[int]((Get-Date) - $_.CreationDate).TotalMilliseconds}}',
    '| ConvertTo-Json -Compress',
  ].join(' ');

  let raw;
  try {
    raw = execSync(`powershell -NonInteractive -Command "${ps}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
  } catch {
    return [];
  }

  if (!raw || raw === 'null') return [];

  let items;
  try {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }

  return items
    .filter((p) => typeof p.AgeMs === 'number' && p.AgeMs > minAgeMs)
    .map((p) => ({
      pid: Number(p.ProcessId),
      command: String(p.CommandLine ?? '').slice(0, 120),
      ageMs: p.AgeMs,
      reason: 'git_status_ignored_stale',
    }));
}

// ── Preflight receipts ────────────────────────────────────────────────────────

export function readPreflightReceipt(preflightId) {
  const path = join(RECEIPTS_DIR, `${preflightId}.preflight.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function writePreflightReceipt(preflight) {
  ensureDir(RECEIPTS_DIR);
  const path = join(RECEIPTS_DIR, `${preflight.id}.preflight.json`);
  writeFileSync(path, JSON.stringify(preflight, null, 2));
  return path;
}

/**
 * Build a preflight receipt for a set of stale-process targets.
 * Does NOT write to disk — call writePreflightReceipt separately.
 */
export function createPreflightReceipt({ targets, requestedBy = 'holoshell' }) {
  const id = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    schema: 'hololand.holoshell.stale-process-cleanup.preflight.v0.1.0',
    id,
    operation: 'stale_process_cleanup',
    requestedBy,
    timestamp: new Date().toISOString(),
    targets: targets.map((t) => ({
      pid: t.pid,
      ageMs: t.ageMs,
      reason: t.reason,
      commandPreview: t.command.slice(0, 80),
    })),
    hashAlgorithm: 'sha256',
  };
  return { ...base, hash: hashValue({ ...base, hash: undefined }) };
}

// ── Execution ─────────────────────────────────────────────────────────────────

function isProcessAlive(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.includes(String(pid));
  } catch {
    return false;
  }
}

function killProcess(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message).slice(0, 120) };
  }
}

/**
 * Execute a preflight receipt.
 *
 * @param {{ consentToken: string, preflightId: string }} params
 * @returns {{ outcome: 'success'|'error', receipt?: object, reason?: string }}
 */
export function executeReceipt({ consentToken, preflightId }) {
  const preflight = readPreflightReceipt(preflightId);
  if (!preflight) {
    return { outcome: 'error', reason: 'preflight_not_found', preflightId };
  }

  const verification = verifyConsentToken(consentToken, {
    operation: preflight.operation,
    preflightId,
  });
  if (!verification.valid) {
    return { outcome: 'error', reason: `consent_invalid:${verification.reason}`, preflightId };
  }

  const results = [];
  for (const target of preflight.targets) {
    const beforeAlive = isProcessAlive(target.pid);
    if (!beforeAlive) {
      results.push({ pid: target.pid, outcome: 'already_gone', reason: target.reason });
      continue;
    }
    const kill = killProcess(target.pid);
    if (!kill.ok) {
      results.push({ pid: target.pid, outcome: 'kill_error', error: kill.error });
      continue;
    }
    const afterAlive = isProcessAlive(target.pid);
    results.push({
      pid: target.pid,
      outcome: afterAlive ? 'kill_failed' : 'killed',
      reason: target.reason,
      commandPreview: target.commandPreview,
    });
  }

  const executionBase = {
    schema: 'hololand.holoshell.stale-process-cleanup.execution.v0.1.0',
    id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    preflightId,
    operation: preflight.operation,
    consentLane: verification.lane,
    executedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      killed: results.filter((r) => r.outcome === 'killed').length,
      already_gone: results.filter((r) => r.outcome === 'already_gone').length,
      errors: results.filter((r) => ['kill_error', 'kill_failed'].includes(r.outcome)).length,
    },
    results,
    rollbackNote:
      'Process termination is not reversible. PIDs and command previews recorded for audit.',
    hashAlgorithm: 'sha256',
  };
  const executionReceipt = {
    ...executionBase,
    hash: hashValue({ ...executionBase, hash: undefined }),
  };

  ensureDir(RECEIPTS_DIR);
  writeFileSync(
    join(RECEIPTS_DIR, `${executionReceipt.id}.execution.json`),
    JSON.stringify(executionReceipt, null, 2)
  );

  return { outcome: 'success', receipt: executionReceipt };
}

// ── Queue inspection ──────────────────────────────────────────────────────────

/**
 * List pending consent receipts: preflights that have no matching execution.
 * Used by agents to observe the consent queue state.
 * When a preflightId disappears from this list, the operation was executed —
 * call listRecentExecutions to retrieve the receipt.
 */
export function listPendingReceipts() {
  if (!existsSync(RECEIPTS_DIR)) return [];
  try {
    const files = readdirSync(RECEIPTS_DIR);
    const executedIds = new Set(
      files
        .filter((f) => f.endsWith('.execution.json'))
        .map((f) => {
          try {
            return JSON.parse(readFileSync(join(RECEIPTS_DIR, f), 'utf8')).preflightId;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    );
    return files
      .filter((f) => f.endsWith('.preflight.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(RECEIPTS_DIR, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter((pf) => pf && !executedIds.has(pf.id))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

/**
 * Look up live process info for a list of PIDs via CIM.
 * Returns an array of { pid, command, ageMs } for PIDs that are still running.
 * PIDs not found in the process list are omitted.
 */
export function lookupProcessesByPid(pids) {
  if (!pids?.length) return [];
  const pidList = pids.map(Number).join(',');
  const ps = [
    'Get-CimInstance Win32_Process',
    `| Where-Object { @(${pidList}) -contains $_.ProcessId }`,
    '| Select-Object ProcessId, CommandLine,',
    '  @{Name="AgeMs";Expression={[int]((Get-Date) - $_.CreationDate).TotalMilliseconds}}',
    '| ConvertTo-Json -Compress',
  ].join(' ');
  try {
    const raw = execSync(`powershell -NonInteractive -Command "${ps}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
    if (!raw || raw === 'null') return [];
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((p) => ({
      pid: Number(p.ProcessId),
      command: String(p.CommandLine ?? '').slice(0, 120),
      ageMs: typeof p.AgeMs === 'number' ? p.AgeMs : 0,
    }));
  } catch {
    return [];
  }
}

/**
 * List recent execution receipts, newest first.
 * Agents poll this after a preflightId disappears from listPendingReceipts
 * to retrieve the outcome of an operator-approved operation.
 *
 * @param {{ limit?: number, preflightId?: string }} opts
 */
export function listRecentExecutions({ limit = 20, preflightId } = {}) {
  if (!existsSync(RECEIPTS_DIR)) return [];
  try {
    return readdirSync(RECEIPTS_DIR)
      .filter((f) => f.endsWith('.execution.json'))
      .map((f) => {
        try { return JSON.parse(readFileSync(join(RECEIPTS_DIR, f), 'utf8')); }
        catch { return null; }
      })
      .filter((r) => r && (!preflightId || r.preflightId === preflightId))
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
      .slice(0, limit);
  } catch { return []; }
}
