// Brittney CAEL (Calibrated Audit Event Log) — chain helper + sink writer.
//
// Mirrors the chain semantics of packages/holoscript-agent/src/cael-builder.ts:99
// (sha256 layer_hashes, fnv1a_chain = sha(prev|L6), trust_epoch tag) but uses a
// Brittney-shaped record because `CaelAuditRecord` is brain/board-task-centric
// and the user-facing chat path has neither. Reuses the chain primitive (sha256
// composite of layered hashes) so consumers — paper-17 SESL extractor at
// ai-ecosystem/scripts/extract-sesl-pairs.mjs and trust-epoch filter at
// scripts/lib/trust-epoch.mjs — accept records by checking
// `record.trust_epoch === 'post-w107'` (the literal the W.110 gate emits).
//
// Layer mapping (Brittney-specific):
//   L0 session identity     — sha256(`brittney-session:${sessionId}`)
//   L1 round input          — sha256(`round:${round}|model:${model}`)
//   L2 messages             — sha256(JSON of message thread for this round)
//   L3 response             — sha256(finalText accumulated this round)
//   L4 tool calls           — sha256(JSON of [{name,input,result}] for round)
//   L5 evidence + contract  — sha256(JSON of {evidence_paths, simContractCheck})
//   L6 composite            — sha256(L0|L1|L2|L3|L4|L5)
//
// Per W.110 artifact-grounding gate convention (HoloScript commit 4aab897ad):
// records carry trust_epoch:'post-w107'. Pre-tag records are implicitly
// 'pre-w107-untrusted' and excluded from Paper 17/25 corpora.

import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface SimContractCheck {
  passed: boolean;
  constraints?: string[];
}

export interface BrittneyCaelRecord {
  tick_iso: string;
  layer_hashes: string[];
  operation: string;
  prev_hash: string | null;
  fnv1a_chain: string;
  version_vector_fingerprint: string;
  /** Matches the literal trust-epoch.mjs filters on (W.110 gate output). */
  trust_epoch: 'post-w107';
  model: string;
  tool_iters: number;
  evidence_paths: string[];
  /** null when gate-1 (SimulationContract) has not landed for this session. */
  simContractCheck: SimContractCheck | null;
}

export interface BuildBrittneyCaelInput {
  sessionId: string;
  round: number;
  model: string;
  messages: unknown[];
  finalText: string;
  toolCalls: Array<{ name: string; input: unknown; result?: unknown }>;
  evidencePaths: string[];
  simContractCheck: SimContractCheck | null;
  prevChain: string | null;
}

const RUNTIME_VERSION = '7.0.0';
const PROVIDER = 'anthropic';
const BRAIN_CLASS = 'brittney';

function sha(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function buildBrittneyCaelRecord(input: BuildBrittneyCaelInput): BrittneyCaelRecord {
  const {
    sessionId,
    round,
    model,
    messages,
    finalText,
    toolCalls,
    evidencePaths,
    simContractCheck,
    prevChain,
  } = input;

  const l0 = sha(`brittney-session:${sessionId}`);
  const l1 = sha(`round:${round}|model:${model}`);
  const l2 = sha(JSON.stringify(messages));
  const l3 = sha(finalText);
  const l4 = sha(JSON.stringify(toolCalls));
  const l5 = sha(JSON.stringify({ evidencePaths, simContractCheck }));
  const l6 = sha([l0, l1, l2, l3, l4, l5].join('|'));

  const fnv1a_chain = sha(`${prevChain ?? ''}|${l6}`);

  return {
    tick_iso: new Date().toISOString(),
    layer_hashes: [l0, l1, l2, l3, l4, l5, l6],
    operation: `brittney-round:${sessionId}:${round}`,
    prev_hash: prevChain,
    fnv1a_chain,
    version_vector_fingerprint: `studio@${RUNTIME_VERSION}|brain@${BRAIN_CLASS}|provider@${PROVIDER}|model@${model}`,
    trust_epoch: 'post-w107',
    model,
    tool_iters: toolCalls.length,
    evidence_paths: evidencePaths,
    simContractCheck,
  };
}

function getSinkPath(sessionId: string): string {
  const root = process.env.BRITTNEY_AUDIT_ROOT || join(homedir(), '.ai-ecosystem', 'audit');
  return join(root, `brittney-${sessionId}.ndjson`);
}

export function appendCaelRecord(sessionId: string, record: BrittneyCaelRecord): void {
  const path = getSinkPath(sessionId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
}

// Per-process chain state. Within a single request the chain is built up across
// rounds; across requests within the same session-id it extends because the Map
// survives between Next.js route invocations on the same process. On a fresh
// process (cold start, container restart) the chain re-seeds from prev=null —
// honest semantics: we don't claim more continuity than we can prove.
const sessionChainState = new Map<string, string>();

export interface ChainAttachResult {
  sessionId: string;
  chainId: string;
  prevChain: string | null;
  isNew: boolean;
}

/** Open a new chain for `sessionId` or attach to its existing in-memory state. */
export function attachChain(sessionId: string): ChainAttachResult {
  const prev = sessionChainState.get(sessionId) ?? null;
  return {
    sessionId,
    chainId: sessionId,
    prevChain: prev,
    isNew: prev === null,
  };
}

export interface CommitRoundOptions {
  /** Set to false to skip filesystem write (tests). Defaults to true. */
  persist?: boolean;
}

/** Commit a built record: update in-memory chain state and (optionally) sink. */
export function commitRound(
  sessionId: string,
  record: BrittneyCaelRecord,
  opts: CommitRoundOptions = {}
): void {
  sessionChainState.set(sessionId, record.fnv1a_chain);
  if (opts.persist !== false) {
    try {
      appendCaelRecord(sessionId, record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Observability, not safety-critical: never block the chat on sink failure.
      console.warn(`[brittney-cael] sink write failed for ${sessionId}: ${msg}`);
    }
  }
}

export interface CloseChainResult {
  sessionId: string;
  finalChain: string | null;
  stopReason: string;
  closeRecord: BrittneyCaelRecord | null;
}

/** Close a chain: append a terminator record (if chain has content) and clear state. */
export function closeChain(
  sessionId: string,
  opts: { stopReason?: string; persist?: boolean } = {}
): CloseChainResult {
  const finalChain = sessionChainState.get(sessionId) ?? null;
  const stopReason = opts.stopReason ?? 'session-end';
  let closeRecord: BrittneyCaelRecord | null = null;

  if (finalChain !== null) {
    const tick_iso = new Date().toISOString();
    const fnv1a_chain = sha(`${finalChain}|close:${stopReason}`);
    closeRecord = {
      tick_iso,
      layer_hashes: [],
      operation: `brittney-close:${sessionId}:${stopReason}`,
      prev_hash: finalChain,
      fnv1a_chain,
      version_vector_fingerprint: `studio@${RUNTIME_VERSION}|brain@${BRAIN_CLASS}|provider@${PROVIDER}|model@close`,
      trust_epoch: 'post-w107',
      model: 'close',
      tool_iters: 0,
      evidence_paths: [],
      simContractCheck: null,
    };
    if (opts.persist !== false) {
      try {
        appendCaelRecord(sessionId, closeRecord);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[brittney-cael] close-marker write failed for ${sessionId}: ${msg}`);
      }
    }
  }

  sessionChainState.delete(sessionId);
  return { sessionId, finalChain, stopReason, closeRecord };
}

/**
 * Best-effort extraction of file paths the tools touched. Inspects common
 * field names on tool input + result. Empty list when no path-shaped fields.
 */
export function extractEvidencePaths(
  toolCalls: Array<{ name: string; input: unknown; result?: unknown }>
): string[] {
  const paths = new Set<string>();
  const PATH_KEYS = ['path', 'filePath', 'filename', 'file', 'paths', 'files'];

  function walk(value: unknown): void {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') return; // strings only matter when keyed
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (PATH_KEYS.includes(k)) {
          if (typeof v === 'string') paths.add(v);
          else if (Array.isArray(v)) {
            for (const item of v) if (typeof item === 'string') paths.add(item);
          }
        }
        walk(v);
      }
    }
  }

  for (const tc of toolCalls) {
    walk(tc.input);
    if (tc.result !== undefined) walk(tc.result);
  }

  return [...paths];
}

/** Derive a stable session id from the first user message when client omits one. */
export function deriveSessionId(messages: Array<{ role: string; content: string }>): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return sha(`empty:${Date.now()}`).slice(0, 16);
  return sha(`brittney:${first.content}`).slice(0, 16);
}

/** Test hook: clear in-memory chain state. Tests-only — not exported from index. */
export function _resetChainState(): void {
  sessionChainState.clear();
}
