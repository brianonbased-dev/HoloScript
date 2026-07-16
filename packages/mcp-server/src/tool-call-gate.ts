/**
 * tool-call-gate.ts — the single typed gate at the MCP tool-call fold point.
 *
 * WRAP-WITH-RECEIPTS (dependency-sovereignty-ladder, ratified 2026-07-16):
 * every agent-visible tool call funnels through exactly two
 * `setRequestHandler(CallToolRequestSchema)` sites — index.ts (stdio) and
 * http-server.ts (SSE/HTTP). The audit ruled: gate THERE. This module is that
 * gate. Both handlers route through `gateToolCall`, which
 *
 *   1. emits ONE NDJSON receipt per call — tool name, sha256 of the
 *      canonical-JSON args (NEVER the raw args: args may contain secrets),
 *      caller identity when the transport knows it, start/end timestamps,
 *      ok|error, and the error class — and
 *   2. provides the typed seam (`ToolCallCheck`) where FounderGate / x402 /
 *      envelope-validation checks run BEFORE dispatch.
 *
 * WHY THE DEFAULT CHECK IS PASS-THROUGH (a deliberate wiring decision, not a
 * stub): both transports already run their enforcement DOWNSTREAM of this fold
 * point — the HTTP entry runs `runTripleGate` + audit logging inside
 * `securedToolExecution`, and the stdio entry is a trusted local process whose
 * batch inner calls re-check `authorizeToolCall` (see the AUTH MODEL comment
 * above the stdio handler). Re-running those checks here would double-execute
 * them and change happy-path behavior, which this wrap is contractually
 * forbidden to do. The seam exists so the NEXT check (FounderGate, x402 seat
 * verification, envelope validation) lands in one place instead of two
 * handlers. `passThroughToolCallCheck` is the real, executable default.
 *
 * RECEIPT LANE — mirrors the repo's established append-only NDJSON receipt
 * pattern (compute-trace-store.ts / daemon-emergence-store.ts / holomesh
 * state.ts CAEL audit): synchronous `appendFileSync` under HOLOMESH_DATA_DIR,
 * best-effort (a persistence failure must never change a tool result), one
 * JSON object per line. Canonical-JSON hashing mirrors
 * `stableTrustStringify` (packages/core/src/trust/TrustReceipt.ts): keys
 * recursively sorted, `undefined` entries dropped, so equivalent arg payloads
 * hash identically regardless of key order.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Envelope / context types ─────────────────────────────────────────────────

/** The tool-call envelope as received at a transport fold point. */
export interface ToolCallEnvelope {
  /** MCP tool name exactly as the transport received it. */
  readonly name: string;
  /** Raw tool arguments. Never persisted — only their canonical-JSON sha256 is. */
  readonly args: Record<string, unknown>;
}

/** What the transport knows about the caller at the fold point. */
export interface ToolCallGateContext {
  /** Which transport entry produced this call. */
  readonly transport: 'stdio' | 'http';
  /**
   * Caller identity when available (OAuth agentId/clientId, envelope signer).
   * `null` for the trusted local stdio process, which has no identity envelope.
   */
  readonly callerId?: string | null;
  /** MCP session id when the transport tracks one. */
  readonly sessionId?: string;
  /** Granted scopes (OAuth or signing envelope) when the transport knows them. */
  readonly scopes?: readonly string[];
}

// ── Check seam (FounderGate / x402 / envelope validation plug in here) ───────

/** Decision returned by a pre-dispatch check. */
export interface ToolCallCheckDecision {
  readonly allowed: boolean;
  /** Stable identifier of the check that produced this decision. */
  readonly check: string;
  /** Human-readable denial reason (used in the thrown error when denied). */
  readonly reason?: string;
}

/**
 * A pre-dispatch check. Runs before the tool dispatch; a denial short-circuits
 * dispatch entirely (receipt still written, `ToolCallGateDeniedError` thrown).
 */
export type ToolCallCheck = (
  envelope: ToolCallEnvelope,
  ctx: ToolCallGateContext
) => ToolCallCheckDecision | Promise<ToolCallCheckDecision>;

/**
 * The real default check: allow everything. See the module docblock for why
 * this is correct wiring (downstream enforcement already exists per-transport)
 * rather than a placeholder.
 */
export const passThroughToolCallCheck: ToolCallCheck = () => ({
  allowed: true,
  check: 'pass-through',
});

/** Thrown when a `ToolCallCheck` denies a call. Propagates to the transport. */
export class ToolCallGateDeniedError extends Error {
  readonly tool: string;
  readonly check: string;

  constructor(tool: string, check: string, reason?: string) {
    super(`Tool call gate denied "${tool}" (check: ${check})${reason ? `: ${reason}` : ''}`);
    this.name = 'ToolCallGateDeniedError';
    this.tool = tool;
    this.check = check;
  }
}

// ── Receipt shape ─────────────────────────────────────────────────────────────

/** One NDJSON line per gated tool call. */
export interface ToolCallReceipt {
  readonly v: 1;
  readonly tool: string;
  /** sha256 hex of the canonical-JSON (recursively key-sorted) args. */
  readonly argsSha256: string;
  /** Caller identity or null (trusted local stdio / unknown). */
  readonly caller: string | null;
  readonly transport: 'stdio' | 'http';
  readonly sessionId?: string;
  /** ISO-8601 UTC start/end of the gated span (check + dispatch). */
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'error';
  /** Error constructor name when status === 'error'. */
  readonly errorClass?: string;
  /** The check that denied the call, when denial (not dispatch) produced the error. */
  readonly deniedBy?: string;
}

// ── Canonical JSON + hashing (pattern: core/trust stableTrustStringify) ──────

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeValue(entry);
      }
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON: recursively key-sorted, `undefined` entries dropped. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value)) ?? 'undefined';
}

/** sha256 hex digest of the canonical-JSON encoding of `value`. */
export function sha256OfCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJsonStringify(value)).digest('hex');
}

// ── Receipt persistence (pattern: compute-trace-store.ts append lane) ────────

const DATA_ROOT =
  process.env.HOLOMESH_DATA_DIR ||
  path.join(process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript'), 'holomesh');

const DEFAULT_RECEIPT_PATH = path.join(DATA_ROOT, 'tool-call-receipts', 'tool-calls.ndjson');

/**
 * Resolve the receipt NDJSON path. `HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH` wins
 * (read per-call so tests can redirect into a temp dir), else the HoloMesh
 * data-dir lane every other durable mcp-server store uses.
 */
export function resolveToolCallReceiptPath(): string {
  return process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH || DEFAULT_RECEIPT_PATH;
}

const ensuredDirs = new Set<string>();

function ensureReceiptDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (ensuredDirs.has(dir)) return;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  ensuredDirs.add(dir);
}

/**
 * Append one receipt line. Best-effort and synchronous, matching
 * appendComputeTrace / appendEmergenceRecord: a persistence failure must never
 * change the tool result, so errors are logged (stderr) and swallowed.
 */
export function writeToolCallReceipt(receipt: ToolCallReceipt): void {
  try {
    const filePath = resolveToolCallReceiptPath();
    ensureReceiptDir(filePath);
    fs.appendFileSync(filePath, `${JSON.stringify(receipt)}\n`, 'utf8');
  } catch (err) {
    console.error(`[ToolCallGate] receipt append failed: ${(err as Error).message}`);
  }
}

// ── Result classification ─────────────────────────────────────────────────────

/** How a dispatch result maps onto the receipt's ok|error status. */
export interface ToolCallResultClassification {
  readonly ok: boolean;
  readonly errorClass?: string;
}

export type ToolCallResultClassifier<T> = (result: T) => ToolCallResultClassification;

/**
 * Classifier for MCP result envelopes (`{ content, isError? }`). Both
 * transports catch tool failures and RETURN `isError: true` rather than
 * throwing, so without this the receipt would record every call as ok.
 */
export function classifyMcpEnvelopeResult(result: unknown): ToolCallResultClassification {
  if (
    result !== null &&
    typeof result === 'object' &&
    (result as { isError?: unknown }).isError === true
  ) {
    return { ok: false, errorClass: 'ToolResultError' };
  }
  return { ok: true };
}

// ── The gate ──────────────────────────────────────────────────────────────────

export interface ToolCallGateOptions<T> {
  /** Pre-dispatch check. Default: `passThroughToolCallCheck` (see module docblock). */
  readonly check?: ToolCallCheck;
  /** Maps the dispatch result onto ok|error for the receipt. Default: always ok. */
  readonly classifyResult?: ToolCallResultClassifier<T>;
}

function errorClassOf(error: unknown): string {
  if (error instanceof Error) {
    return error.constructor.name || error.name || 'Error';
  }
  return typeof error;
}

/**
 * Gate one tool call: run the check, dispatch, and emit exactly one receipt.
 *
 * Contract (WRAP-WITH-RECEIPTS):
 * - Happy path is behavior-neutral: the dispatch result is returned unchanged.
 * - A dispatch throw propagates unchanged (the receipt records it first).
 * - A check denial throws `ToolCallGateDeniedError` without dispatching.
 * - Exactly one receipt line is written per call, on every path.
 */
export async function gateToolCall<T>(
  envelope: ToolCallEnvelope,
  ctx: ToolCallGateContext,
  dispatch: (envelope: ToolCallEnvelope, ctx: ToolCallGateContext) => Promise<T> | T,
  options?: ToolCallGateOptions<T>
): Promise<T> {
  const check = options?.check ?? passThroughToolCallCheck;
  const startedAtMs = Date.now();

  const base = {
    v: 1 as const,
    tool: envelope.name,
    argsSha256: sha256OfCanonicalJson(envelope.args ?? {}),
    caller: ctx.callerId ?? null,
    transport: ctx.transport,
    ...(ctx.sessionId !== undefined ? { sessionId: ctx.sessionId } : {}),
    startedAt: new Date(startedAtMs).toISOString(),
  };

  const finishReceipt = (
    status: 'ok' | 'error',
    extra?: { errorClass?: string; deniedBy?: string }
  ): void => {
    const endedAtMs = Date.now();
    writeToolCallReceipt({
      ...base,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - startedAtMs,
      status,
      ...(extra?.errorClass !== undefined ? { errorClass: extra.errorClass } : {}),
      ...(extra?.deniedBy !== undefined ? { deniedBy: extra.deniedBy } : {}),
    });
  };

  const decision = await check(envelope, ctx);
  if (!decision.allowed) {
    finishReceipt('error', { errorClass: 'ToolCallGateDeniedError', deniedBy: decision.check });
    throw new ToolCallGateDeniedError(envelope.name, decision.check, decision.reason);
  }

  try {
    const result = await dispatch(envelope, ctx);
    const classification: ToolCallResultClassification = options?.classifyResult
      ? options.classifyResult(result)
      : { ok: true };
    if (classification.ok) {
      finishReceipt('ok');
    } else {
      finishReceipt('error', { errorClass: classification.errorClass ?? 'ToolResultError' });
    }
    return result;
  } catch (error) {
    finishReceipt('error', { errorClass: errorClassOf(error) });
    throw error;
  }
}
