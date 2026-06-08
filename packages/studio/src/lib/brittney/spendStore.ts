/**
 * SpendGovernor persistence — survives across requests within a process
 * and optionally syncs to an external KV store.
 *
 * Usage:
 *   const governor = await loadGovernor(teamId, capUsd);
 *   governor.record(actualUsd);
 *   await saveGovernor(teamId, governor);
 */

import { SpendGovernor, type SpendSnapshot } from './FleetOrchestrator';

// ─── Day key ─────────────────────────────────────────────────────────────────

function dayKey(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function storeKey(teamId: string): string {
  return `${teamId}:${dayKey()}`;
}

// ─── In-process cache (persists across requests in one Railway instance) ─────

const cache = new Map<string, SpendSnapshot>();

// ─── Optional external KV (set FLEET_SPEND_KV_URL + FLEET_SPEND_KV_TOKEN) ────

const KV_URL = process.env['FLEET_SPEND_KV_URL'];
const KV_TOKEN = process.env['FLEET_SPEND_KV_TOKEN'];

async function kvGet(key: string): Promise<SpendSnapshot | null> {
  if (!KV_URL) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: KV_TOKEN ? { Authorization: `Bearer ${KV_TOKEN}` } : {},
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return data as SpendSnapshot;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: SpendSnapshot): Promise<void> {
  if (!KV_URL) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(KV_TOKEN ? { Authorization: `Bearer ${KV_TOKEN}` } : {}),
      },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // non-fatal — in-process cache is the authoritative source
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load (or create) a SpendGovernor for a team, hydrated from the persisted
 * snapshot for today. Checks in-process cache first, then external KV.
 */
export async function loadGovernor(teamId: string, capUsd: number): Promise<SpendGovernor> {
  const key = storeKey(teamId);

  // 1. In-process cache
  let snapshot = cache.get(key) ?? null;

  // 2. External KV fallback (e.g. after a process restart)
  if (!snapshot) {
    snapshot = await kvGet(key);
    if (snapshot) cache.set(key, snapshot);
  }

  const governor = new SpendGovernor({ capUsd });
  if (snapshot) governor.hydrate(snapshot);
  return governor;
}

/**
 * Persist the governor's current snapshot after recording spend.
 * Writes to in-process cache immediately; KV write is best-effort.
 */
export async function saveGovernor(teamId: string, governor: SpendGovernor): Promise<void> {
  const key = storeKey(teamId);
  const snapshot = governor.snapshot();
  cache.set(key, snapshot);
  await kvSet(key, snapshot);
}
