/**
 * Hand-off primitives for the edge runner (hand-off fix, 2026-10-07).
 *
 * Root cause this closes (hw-handoff/holoscript-agent-handoff-fix-proposal-20261005.md):
 * a Jetson agent at n_ctx 4096 claimed tasks it could not fit, failed them
 * (no-artifact gate, llama 400 "exceeds the available context size"), never
 * released them, and re-claimed the same tasks within a minute of the 24h
 * claim-TTL reaper, pinning the HOLOMESH_CLAIM_CAP (5) and stalling the board.
 *
 * Pieces (all pure / injectable so they unit-test without a network):
 *  (ii)  TaskDenylist — per-task failure denylist persisted to disk (default 7d,
 *        longer than the 24h reaper) so a restart doesn't re-grab failed work.
 *  (iii) classifyExecutionError / isClaimCapExceededError — failure kinds.
 *  (v)   fetchLocalFit / assessTaskFit / estimateTokens — pre-claim fit check
 *        against llama-server /props n_ctx (60% budget) plus route tags
 *        (`ctx-16k+`, `laptop-or-fleet`) naming who should take the task instead.
 *        promptCaps / capText — tool-result caps (12k read, 8k response/stdout).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BoardTask } from './types.js';

// ─── Failure kinds ───────────────────────────────────────────────────────────

export type FailureKind = 'capability_mismatch' | 'no_artifact' | 'ctx_overflow' | 'exec_error';
export type RouteTag = 'ctx-16k+' | 'laptop-or-fleet';

/** Route a released task by why it failed: context → bigger window; anything else → laptop/fleet. */
export function routeTagFor(kind: FailureKind): RouteTag {
  return kind === 'ctx_overflow' ? 'ctx-16k+' : 'laptop-or-fleet';
}

/** Thrown by the runner's own pre-send guard when a prompt would exceed 90% of n_ctx. */
export class ContextOverflowError extends Error {
  readonly kind = 'ctx_overflow' as const;
  constructor(
    readonly estTokens: number,
    readonly nCtx: number
  ) {
    super(`prompt ~${estTokens} tok exceeds 90% of n_ctx ${nCtx}; not sent`);
    this.name = 'ContextOverflowError';
  }
}

const CTX_OVERFLOW_RE =
  /exceeds? the available context size|context (?:length|window|size) (?:exceeded|is exceeded)|maximum context length|too many tokens|prompt is too long/i;

/** llama-server 400 "request (9063 tokens) exceeds the available context size (4096 tokens)" and kin. */
export function isCtxOverflowError(err: unknown): boolean {
  if (err instanceof ContextOverflowError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return CTX_OVERFLOW_RE.test(msg);
}

export function classifyExecutionError(err: unknown): 'ctx_overflow' | 'exec_error' {
  return isCtxOverflowError(err) ? 'ctx_overflow' : 'exec_error';
}

/** Server 403 `claim_cap_exceeded` (framework board-ops evaluateBoardClaimGate). */
export function isClaimCapExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(' 403') && msg.includes('claim_cap_exceeded');
}

// ─── (ii) Persistent per-task denylist ───────────────────────────────────────

export const DEFAULT_FAILURE_COOLDOWN_MS = 7 * 24 * 3600_000;

export interface DenylistEntry {
  until: number;
  kind: FailureKind;
  reason: string;
  at: number;
}

export function defaultDenylistPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HOLOSCRIPT_AGENT_DENYLIST_PATH) return env.HOLOSCRIPT_AGENT_DENYLIST_PATH;
  const stateDir =
    env.HOLOSCRIPT_AGENT_STATE_DIR ?? join(homedir(), '.holoscript-agent', 'cost-state');
  return join(stateDir, 'task-denylist.json');
}

export function failureCooldownMs(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.HOLOSCRIPT_AGENT_FAILURE_COOLDOWN_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_FAILURE_COOLDOWN_MS;
}

/**
 * taskId → entry. Persisted as JSON (atomic tmp+rename) on every change; expired
 * entries are pruned on load and on lookup. `path: null` keeps it in memory only.
 * Disk errors never throw into the tick: a denylist we can't save still works
 * in-process (fails toward "skip the task", never toward "re-claim it").
 */
export class TaskDenylist {
  private entries = new Map<string, DenylistEntry>();
  constructor(
    readonly path: string | null,
    private readonly onError: (message: string) => void = () => undefined
  ) {
    this.load();
  }

  private load(now = Date.now()): void {
    if (!this.path) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, DenylistEntry>;
      for (const [id, e] of Object.entries(raw ?? {})) {
        if (e && typeof e.until === 'number' && e.until > now) this.entries.set(id, e);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') this.onError(`denylist load: ${(err as Error).message}`);
    }
  }

  private save(): void {
    if (!this.path) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries), null, 2), 'utf8');
      renameSync(tmp, this.path);
    } catch (err) {
      this.onError(`denylist save: ${(err as Error).message}`);
    }
  }

  add(
    taskId: string,
    kind: FailureKind,
    reason: string,
    ttlMs: number,
    now = Date.now()
  ): DenylistEntry {
    const e: DenylistEntry = { until: now + ttlMs, kind, reason: reason.slice(0, 300), at: now };
    this.entries.set(taskId, e);
    this.save();
    return e;
  }

  get(taskId: string, now = Date.now()): DenylistEntry | undefined {
    const e = this.entries.get(taskId);
    if (!e) return undefined;
    if (now >= e.until) {
      this.entries.delete(taskId);
      this.save();
      return undefined;
    }
    return e;
  }

  isDenied(taskId: string, now = Date.now()): boolean {
    return this.get(taskId, now) !== undefined;
  }

  size(): number {
    return this.entries.size;
  }
}

// ─── (v) Fit check ───────────────────────────────────────────────────────────

/** chars/3.5 — the proposal's estimator; deliberately a little generous for code/JSON. */
export const CHARS_PER_TOKEN_EST = 3.5;
export function estimateTokens(chars: number | string): number {
  const n = typeof chars === 'string' ? chars.length : chars;
  return Math.ceil(n / CHARS_PER_TOKEN_EST);
}

export interface LocalFit {
  nCtx: number;
  model?: string;
  source: 'props' | 'env';
}

/** Strip a trailing /v1 (OpenAI-compatible base) so /props hits llama-server's root. */
export function propsUrlFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/props`;
}

/**
 * GET {base}/props → default_generation_settings.n_ctx (llama-server), falling back to
 * a top-level n_ctx, then HOLOSCRIPT_AGENT_NUM_CTX / HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX.
 * Read-only; never sends a completion. Returns null when nothing is known.
 */
export async function fetchLocalFit(
  baseUrl: string | undefined,
  opts: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<LocalFit | null> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (baseUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
    try {
      const res = await fetchImpl(propsUrlFor(baseUrl), { signal: controller.signal });
      if (res.ok) {
        const j = (await res.json()) as {
          n_ctx?: number;
          model_alias?: string;
          model_path?: string;
          default_generation_settings?: { n_ctx?: number; model?: string };
        };
        const nCtx = Number(j.default_generation_settings?.n_ctx ?? j.n_ctx);
        if (Number.isFinite(nCtx) && nCtx > 0) {
          return {
            nCtx,
            model: j.model_alias ?? j.default_generation_settings?.model ?? j.model_path,
            source: 'props',
          };
        }
      }
    } catch {
      /* fall through to env */
    } finally {
      clearTimeout(timer);
    }
  }
  const envCtx = Number(env.HOLOSCRIPT_AGENT_NUM_CTX ?? env.HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX);
  if (Number.isFinite(envCtx) && envCtx > 0) return { nCtx: envCtx, source: 'env' };
  return null;
}

/** Tags that mean "needs a big window / whole-repo view" — never an edge claim. */
export const BIG_CONTEXT_TAGS = [
  'large-context',
  'repo-wide',
  'multi-file',
  'gpu-cuda-large',
  'ctx-16k+',
];
/** Tags that mean "handed off away from the edge" — never re-claimed by an edge agent. */
export const HANDOFF_TAGS = ['laptop-or-fleet'];

export interface FitOptions {
  /** Fraction of n_ctx the static prompt may use at claim time (default 0.6). */
  claimBudgetFraction?: number;
  /** Tokens every request carries besides the task: system prompt + tool schemas. */
  overheadTokens: number;
  /** Extra reserve (default 256). */
  reserveTokens?: number;
  /** Agent presence capability tags (for required_tags screening). */
  capabilityTags?: string[];
  /** Skip the hand-off / big-context route-tag refusals (big-context seats). */
  skipRouteTags?: boolean;
}

export type FitVerdict =
  | { fit: true; estTokens: number; budget: number }
  | {
      fit: false;
      estTokens: number;
      budget: number;
      reason: 'over-budget' | 'big-context-tag' | 'handoff-tag' | 'required-model' | 'capability';
      detail: string;
      route?: RouteTag;
    };

/** The user turn the runner sends for a task (moved here from runner.ts so the fit check measures the exact text). */
export function buildTaskPrompt(task: BoardTask): string {
  return [
    `Board task to execute: ${task.id}`,
    `Title: ${task.title}`,
    `Priority: ${task.priority}`,
    `Tags: ${(task.tags ?? []).join(', ')}`,
    '',
    'Description:',
    task.description ?? '(no description)',
    '',
    'Produce the deliverable: call write_file (or bash with a build command) to create all required output files FIRST. Apply your brain composition rules — anti-patterns, decision loop, and scope tier all bind. After calling the tool(s), return a short plain-text summary of what you did for posting to /room.',
  ].join('\n');
}

export function assessTaskFit(
  task: BoardTask & { requiredModel?: string },
  fit: LocalFit,
  opts: FitOptions
): FitVerdict {
  const frac = opts.claimBudgetFraction ?? 0.6;
  const budget = Math.floor(fit.nCtx * frac);
  const estTokens =
    estimateTokens(buildTaskPrompt(task)) + opts.overheadTokens + (opts.reserveTokens ?? 256);
  const tags = (task.tags ?? []).map((t) => t.toLowerCase());
  const required = (task.required_tags ?? []).map((t) => t.toLowerCase());
  const caps = new Set((opts.capabilityTags ?? []).map((t) => t.toLowerCase()));
  // A big-context seat (claim profile `big-context`) is the hand-off target, so it
  // skips the route-tag refusals below and only applies the size/capability checks.
  const handoff = opts.skipRouteTags
    ? undefined
    : [...tags, ...required].find((t) => HANDOFF_TAGS.includes(t));
  if (handoff) {
    return {
      fit: false,
      estTokens,
      budget,
      reason: 'handoff-tag',
      detail: handoff,
      route: 'laptop-or-fleet',
    };
  }
  const big = opts.skipRouteTags
    ? undefined
    : [...tags, ...required].find((t) => BIG_CONTEXT_TAGS.includes(t));
  if (big) {
    return {
      fit: false,
      estTokens,
      budget,
      reason: 'big-context-tag',
      detail: big,
      route: 'ctx-16k+',
    };
  }
  const missing = required.filter((r) => !caps.has(r));
  if (missing.length) {
    return {
      fit: false,
      estTokens,
      budget,
      reason: 'capability',
      detail: `missing required_tags: ${missing.join(',')}`,
    };
  }
  if (task.requiredModel && fit.model && task.requiredModel !== fit.model) {
    return {
      fit: false,
      estTokens,
      budget,
      reason: 'required-model',
      detail: `${task.requiredModel} != ${fit.model}`,
      route: 'laptop-or-fleet',
    };
  }
  if (estTokens > budget) {
    return {
      fit: false,
      estTokens,
      budget,
      reason: 'over-budget',
      detail: `~${estTokens} tok > ${Math.round(frac * 100)}% of n_ctx ${fit.nCtx} (${budget})`,
      route: 'ctx-16k+',
    };
  }
  return { fit: true, estTokens, budget };
}

/** Total prompt estimate for a request (messages + tool schemas). */
export function estimatePromptTokens(messages: readonly unknown[], tools: unknown): number {
  let chars = 0;
  for (const m of messages) {
    const c = (m as { content?: unknown }).content;
    chars += typeof c === 'string' ? c.length : JSON.stringify(c ?? '').length;
  }
  chars += JSON.stringify(tools ?? []).length;
  return estimateTokens(chars);
}

// ─── (v) Tool-result caps ────────────────────────────────────────────────────

export interface PromptCaps {
  readChars: number;
  responseChars: number;
  stdoutChars: number;
}

function envInt(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
}

export function promptCaps(env: NodeJS.ProcessEnv = process.env): PromptCaps {
  return {
    readChars: envInt(env.HOLOSCRIPT_AGENT_READ_CAP_CHARS, 12_000),
    responseChars: envInt(env.HOLOSCRIPT_AGENT_RESPONSE_CAP_CHARS, 8_000),
    stdoutChars: envInt(env.HOLOSCRIPT_AGENT_STDOUT_CAP_CHARS, 8_000),
  };
}

/**
 * Cap text for a tool result. `mode: 'head'` keeps the start (files, bodies);
 * `'head-tail'` keeps both ends (build/test output, where the verdict is at the end).
 */
export function capText(
  text: string,
  cap: number,
  mode: 'head' | 'head-tail',
  what = 'text'
): string {
  if (text.length <= cap) return text;
  if (mode === 'head')
    return `${text.slice(0, cap)}\n…[truncated, full ${what} is ${text.length} chars]`;
  const head = Math.floor(cap / 2);
  const tail = cap - head;
  return `${text.slice(0, head)}\n…[${text.length - cap} chars of ${what} elided]…\n${text.slice(text.length - tail)}`;
}
