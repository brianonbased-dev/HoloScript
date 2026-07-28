/**
 * idle-accrual — the I.023 executor last mile, wired the architecturally-clean way.
 *
 * The always-on AgentRunner grows its OWN gated training corpus during idle ticks by
 * importing `@holoscript/core/evolution` IN-PROCESS (Web Crypto + fetch + pure parser —
 * the browser-safe slice, no node:fs), running ONE gated evolution step against the
 * sovereign-local Ollama, and appending only the NEW (cross-run-deduped) verifier-labeled
 * rows to a corpus JSONL. $0 (local metal); bounded (one proposal/tick); propose-not-ship.
 *
 * Why a GUARDED DYNAMIC import instead of a static dep: `@holoscript/holoscript-agent`
 * keeps a clean publish closure (deps = @holoscript/llm-provider + ethers only). Pulling
 * `@holoscript/core` into deps would bloat the published edge package. So:
 *   - the specifier is COMPUTED → esbuild emits a real runtime import (never bundles core);
 *   - the import is try/catch'd → on the published edge (core not installed) it fails
 *     gracefully and accrual self-disables; on the monorepo laptop (core hoisted/present)
 *     it resolves. Verified resolve-OK from this package's context 2026-06-25.
 *
 * DOUBLE default-OFF: requires BOTH `HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL=1` AND an explicit
 * `HOLOSCRIPT_AGENT_EVOLVE_CORPUS=<path>`. Unset (default) → returns undefined → the
 * runner's idle path is completely unchanged. Shipping this changes NO live agent's
 * behavior until the env is set — activation is a separate, reversible env flip.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** A verifier-labeled REC-SHAPE row, keyed for dedup on `target` (the proposed program). */
interface GradedRow {
  target: string;
  [k: string]: unknown;
}

/**
 * Minimal structural view of `@holoscript/core/evolution` — declared locally so this
 * package needs NO build-time dependency on @holoscript/core (the dynamic import is the
 * only coupling, and it's runtime + optional).
 */
export interface EvolutionModule {
  makeOllamaProposer(endpoint: string, model: string): unknown;
  makeOpenAICompatibleProposer?: (endpoint: string, model: string) => unknown;
  accrueOneStep(opts: {
    propose: unknown;
    agentId: string;
    tick?: number;
  }): Promise<{ target: string; rows: GradedRow[] }>;
  dedupRows(
    existingCorpus: string,
    rows: readonly GradedRow[]
  ): { fresh: GradedRow[]; deduped: number };
}

/** One injected accrual step. Returns a summary, or null when no capability ran. */
export interface IdleAccrual {
  (ctx: { tick: number; agentId: string }): Promise<{
    target: string;
    written: number;
    deduped: number;
    outcome: string;
  } | null>;
}

/** Pluggable fs (test seam — defaults to node:fs). */
interface AccrualFs {
  read(path: string): string;
  append(path: string, content: string): void;
  mkdirp(path: string): void;
}

const nodeFs: AccrualFs = {
  read: (p) => readFileSync(p, 'utf8'),
  append: (p, c) => appendFileSync(p, c, 'utf8'),
  mkdirp: (p) => {
    mkdirSync(p, { recursive: true });
  },
};

function truthy(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true';
}

type EvolveEndpointProtocol = 'ollama' | 'openai-compatible';

function endpointProtocol(endpoint: string): EvolveEndpointProtocol {
  const override = process.env.HOLOSCRIPT_AGENT_EVOLVE_PROTOCOL?.toLowerCase();
  if (override === 'openai-compatible' || override === 'openai') return 'openai-compatible';
  if (override === 'ollama') return 'ollama';
  if (process.env.HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL) return 'openai-compatible';
  if (/\/v1(?:\/chat\/completions)?\/?$/i.test(endpoint)) return 'openai-compatible';
  if (/:(18080|8000|8080)(?:\/|$)/.test(endpoint)) return 'openai-compatible';
  return 'ollama';
}

/**
 * Build the injected idle-accrual capability, or `undefined` when disabled / unavailable.
 * Wired at the composition root (index.ts) and passed to the AgentRunner, so the runner
 * itself stays @holoscript/core-free.
 *
 * `_module` / `_fs` are test seams (inject a fake core/evolution + in-memory fs); production
 * dynamic-imports core and uses node:fs.
 */
export async function makeIdleAccrual(opts: {
  handle: string;
  logger?: (ev: Record<string, unknown>) => void;
  _module?: EvolutionModule;
  _fs?: AccrualFs;
}): Promise<IdleAccrual | undefined> {
  const log = opts.logger ?? (() => undefined);
  const fs = opts._fs ?? nodeFs;

  if (!truthy(process.env.HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL)) return undefined;
  const corpusPath = process.env.HOLOSCRIPT_AGENT_EVOLVE_CORPUS;
  if (!corpusPath) {
    log({ ev: 'idle-accrual-disabled', reason: 'HOLOSCRIPT_AGENT_EVOLVE_CORPUS unset' });
    return undefined;
  }

  let mod: EvolutionModule;
  if (opts._module) {
    mod = opts._module;
  } else {
    // Computed specifier → esbuild leaves a real runtime import (core is never bundled),
    // and a missing core (published edge) fails gracefully here rather than at build/publish.
    const spec = ['@holoscript', 'core', 'evolution'].join('/');
    try {
      mod = (await import(spec)) as unknown as EvolutionModule;
    } catch (err) {
      log({
        ev: 'idle-accrual-disabled',
        reason: 'core/evolution unavailable (published-edge closure or not installed)',
        message: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  // Sovereign-local inference endpoint — EXPLICIT, never a hardcoded localhost default.
  // Reuses the agent's established local-LLM endpoint env (the same one its provider
  // already uses on a local-metal seat). No resolvable endpoint → DISABLE cleanly rather
  // than silently default — accrual must point at real sovereign metal or not run at all.
  const endpoint =
    process.env.HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL ??
    process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL ??
    process.env.HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL;
  if (!endpoint) {
    log({
      ev: 'idle-accrual-disabled',
      reason:
        'no sovereign-local inference endpoint (set HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL, HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL, or HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL)',
    });
    return undefined;
  }
  // qwen3:4b — W.738/W.745: NEVER qwen2.5 (emits prose, not the full revised program the proposer needs).
  const model =
    process.env.HOLOSCRIPT_AGENT_EVOLVE_MODEL ??
    process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL ??
    'qwen3:4b';
  const protocol = endpointProtocol(endpoint);
  if (protocol === 'openai-compatible' && !mod.makeOpenAICompatibleProposer) {
    log({
      ev: 'idle-accrual-disabled',
      reason: 'core/evolution lacks makeOpenAICompatibleProposer',
      endpoint,
      protocol,
    });
    return undefined;
  }
  const propose =
    protocol === 'openai-compatible'
      ? mod.makeOpenAICompatibleProposer!(endpoint, model)
      : mod.makeOllamaProposer(endpoint, model);
  log({ ev: 'idle-accrual-enabled', corpus: corpusPath, endpoint, model, protocol });

  return async (ctx) => {
    // Read the existing corpus for cross-run dedup (first run: no file yet → empty).
    let existing = '';
    try {
      existing = fs.read(corpusPath);
    } catch {
      /* first accrual: corpus file does not exist yet */
    }
    const { target, rows } = await mod.accrueOneStep({
      propose,
      agentId: ctx.agentId,
      tick: ctx.tick,
    });
    const { fresh, deduped } = mod.dedupRows(existing, rows);
    if (fresh.length > 0) {
      fs.mkdirp(dirname(corpusPath));
      fs.append(corpusPath, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    const outcome = rows.length === 0 ? 'no-candidate' : fresh.length > 0 ? 'accrued' : 'all-dup';
    return { target, written: fresh.length, deduped, outcome };
  };
}
