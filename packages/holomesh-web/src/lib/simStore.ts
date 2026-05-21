/**
 * simStore — Paper 26 simulation state store.
 *
 * In-memory singleton with write-through to /data/sim-paper26.json so the
 * dashboard survives Railway service restarts.  Falls back to memory-only
 * when /data is not writable (local dev).
 *
 * Receipt chain: each checkpoint snapshot is ECDSA-signed (SHA-256 of the
 * canonical JSON, signed with HOLOSCRIPT_SIGNING_KEY).  Receipts accumulate
 * in the store; Base anchoring is triggered asynchronously via the MCP
 * twin_earth_capture_receipt tool (fire-and-forget).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PopulationMetrics {
  tick:             number;
  medianGamma:      number;
  p90Gamma:         number;
  meanTotalLoss:    number;
  stdTotalLoss:     number;
  meanDiversity:    number;
  lifecycleDistrib: Record<string, number>;
}

export interface SimReceipt {
  tick:       number;
  hash:       string;   // SHA-256 of canonical snapshot JSON
  signature:  string;   // ECDSA signature (hex), empty if no signing key
  issuedAt:   string;   // ISO timestamp
  baseBlock?: string;   // Base block number once anchored
  baseTxHash?:string;   // Base transaction hash once anchored
}

export interface SimState {
  label:           string;
  agents:          number;
  targetTicks:     number;
  currentTick:     number;
  running:         boolean;
  startedAt:       string | null;
  lastPushAt:      string | null;
  elapsedMs:       number;
  population:      PopulationMetrics[];   // full history (capped at 1000)
  latestMetrics:   PopulationMetrics | null;
  receipts:        SimReceipt[];
  config: {
    innerFreq:      number;
    latentDim:      number;
    sycophancyFrac: number;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

const DATA_FILE = process.env['SIM_DATA_PATH'] ?? '/data/sim-paper26.json';

function tryRead(): SimState | null {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) as SimState;
  } catch {
    return null;
  }
}

function tryWrite(state: SimState): void {
  try {
    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // /data not writable in local dev — silent fallback to memory-only
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton state
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_STATE: SimState = {
  label:          'paper26',
  agents:         0,
  targetTicks:    1000,
  currentTick:    0,
  running:        false,
  startedAt:      null,
  lastPushAt:     null,
  elapsedMs:      0,
  population:     [],
  latestMetrics:  null,
  receipts:       [],
  config:         null,
};

let _state: SimState = tryRead() ?? { ...DEFAULT_STATE };

// SSE subscriber registry
const _subscribers = new Set<(data: string) => void>();

// ─────────────────────────────────────────────────────────────────────────────
// Receipt signing
// ─────────────────────────────────────────────────────────────────────────────

function signSnapshot(snapshot: PopulationMetrics): SimReceipt {
  const canonical = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');

  let signature = '';
  const signingKey = process.env['HOLOSCRIPT_SIGNING_KEY'];
  if (signingKey) {
    try {
      // ECDSA P-256 sign — key expected as PEM or hex private key
      const sign = crypto.createSign('SHA256');
      sign.update(hash);
      sign.end();
      signature = sign.sign(signingKey, 'hex');
    } catch {
      // Key format issue — skip signature but don't block the push
    }
  }

  return {
    tick:      snapshot.tick,
    hash,
    signature,
    issuedAt:  new Date().toISOString(),
  };
}

async function anchorToBase(receipt: SimReceipt): Promise<void> {
  const apiKey  = process.env['HOLOSCRIPT_API_KEY'];
  const mcpBase = process.env['MCP_BASE_URL'] ?? 'https://mcp.holoscript.net';
  if (!apiKey) return;

  try {
    const body = JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'tools/call',
      params: {
        name: 'twin_earth_capture_receipt',
        arguments: {
          receipt_type: 'sim_checkpoint',
          payload: JSON.stringify({ tick: receipt.tick, hash: receipt.hash }),
          label: `paper26-tick-${receipt.tick}`,
        },
      },
    });

    const resp = await fetch(`${mcpBase}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': apiKey },
      body,
    });

    if (resp.ok) {
      const rpc = await resp.json() as { result?: { content?: { text?: string }[] } };
      const text = rpc.result?.content?.[0]?.text;
      if (text) {
        const data = JSON.parse(text) as { blockNumber?: string; txHash?: string };
        receipt.baseBlock  = data.blockNumber;
        receipt.baseTxHash = data.txHash;
      }
    }
  } catch {
    // Non-blocking — Base anchoring is best-effort
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function getState(): SimState {
  return _state;
}

export function pushMetrics(
  metrics: PopulationMetrics,
  meta: { label?: string; agents?: number; targetTicks?: number; running?: boolean; elapsedMs?: number; config?: SimState['config'] },
): void {
  if (!_state.startedAt) _state.startedAt = new Date().toISOString();
  _state.lastPushAt    = new Date().toISOString();
  _state.label         = meta.label        ?? _state.label;
  _state.agents        = meta.agents       ?? _state.agents;
  _state.targetTicks   = meta.targetTicks  ?? _state.targetTicks;
  _state.running       = meta.running      ?? true;
  _state.elapsedMs     = meta.elapsedMs    ?? _state.elapsedMs;
  _state.config        = meta.config       ?? _state.config;
  _state.currentTick   = metrics.tick;
  _state.latestMetrics = metrics;

  // Cap history at 1000 entries (sparse: keep every entry up to 100, then every 5th)
  if (_state.population.length < 100 || metrics.tick % 5 === 0) {
    _state.population.push(metrics);
    if (_state.population.length > 1000) {
      _state.population = _state.population.slice(-1000);
    }
  }

  // Generate receipt on every push
  const receipt = signSnapshot(metrics);
  _state.receipts.push(receipt);
  if (_state.receipts.length > 200) _state.receipts = _state.receipts.slice(-200);

  // Anchor to Base asynchronously (fire-and-forget, updates receipt in-place)
  void anchorToBase(receipt);

  tryWrite(_state);

  // Broadcast to SSE subscribers
  const payload = JSON.stringify({ metrics, receipt });
  for (const sub of _subscribers) {
    try { sub(payload); } catch { _subscribers.delete(sub); }
  }
}

export function subscribe(callback: (data: string) => void): () => void {
  _subscribers.add(callback);
  return () => { _subscribers.delete(callback); };
}

export function resetState(): void {
  _state = { ...DEFAULT_STATE };
  tryWrite(_state);
}
