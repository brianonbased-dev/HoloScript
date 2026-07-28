/**
 * EvolveProgramBackend — the gated evolutionary executor behind the
 * `@evolve_program` trait (mirrors how `GenerativeDensifierBackend` backs
 * `@provenance_densify`).
 *
 * The thesis, in code: **the verifier-gate IS the engine.** A candidate that
 * fails the correctness gate is DISCARDED — never archived (line: `if
 * (!gate.passed) continue`). Fitness (lower-is-better) selects among survivors;
 * a Darwin-style archive keeps diverse parents so the search escapes local
 * optima; every candidate is recorded for provenance. The search is bounded by
 * `generations` (the compute guardrail). It PROPOSES — `runEvolution` surfaces a
 * winning candidate's code only when it genuinely beat the seed; promotion to the
 * live tree is a caller/human decision. It NEVER self-ships.
 *
 * Pure + injectable: {@link runEvolution} takes `propose` (a sovereign
 * local-metal LLM) and `gate` (an EXISTING fitness command) as inputs, so the
 * loop is deterministic and unit-testable with mocks. {@link makeOllamaProposer}
 * wires the default sovereign proposer to local metal (e.g. the Jetson Ollama
 * endpoint) — no cloud dependency.
 *
 * D.101: this is the named backend of a trait, reusing existing gates as fitness
 * — language work, not standalone tooling (the @provenance_densify precedent).
 *
 * @package @holoscript/core/evolution
 */

/** The evolution policy (the runtime shape of the `@evolve_program` trait data). */
export interface EvolvePolicy {
  /** Natural-language objective handed to the proposer each generation. */
  goal: string;
  /** Bounded search depth — the compute guardrail. */
  generations: number;
  /** Candidates proposed per generation. */
  population: number;
  /** Darwin-archive size (diverse parents to escape local optima). */
  archiveSize: number;
  /** Sovereign proposer model on local metal (recorded in the receipt). */
  proposerModel: string;
}

/** One evaluated candidate — the provenance unit. */
export interface EvolveCandidate {
  id: number;
  gen: number;
  parentId: number | null;
  /** Did it pass the correctness gate? A `false` candidate is discarded. */
  passed: boolean;
  /** Fitness, lower-is-better. `Infinity` for a failed/un-scored candidate. */
  score: number;
  /** Byte length of the candidate (a cheap secondary signal). */
  bytes: number;
  /** Short note on what happened to this candidate. */
  note: string;
}

/** Proposes a mutation: returns the FULL revised program (no diff applier exists). */
export type Proposer = (parentCode: string, goal: string, policy: EvolvePolicy) => Promise<string>;

/** The correctness + fitness oracle. `passed` is the hard gate; `score` is lower-is-better. */
export type Gate = (candidateCode: string) => Promise<{ passed: boolean; score: number }>;

/**
 * One gated proposal, as training signal. THE second loop: every candidate that
 * reaches the gate — pass OR fail — is verifier-labeled supervision for the
 * proposer model. `passed:true` is an imitation (SFT) example; `passed:false` is
 * a contrast (DPO-rejected) example. This is how the loop closes on the "small
 * agent problem": a weak local proposer's gated failures fine-tune the next
 * model so it proposes better. See {@link toGradedTraceRow}.
 */
export interface EvolveTraceRecord {
  gen: number;
  parentId: number;
  parentCode: string;
  goal: string;
  candidateCode: string;
  passed: boolean;
  /** Fitness, lower-is-better. `Infinity` when the candidate failed the gate. */
  score: number;
}

/** Injected effects, so the loop is pure + deterministic under test. */
export interface EvolveIO {
  propose: Proposer;
  gate: Gate;
  /** ISO timestamp source (injected for deterministic tests). */
  now?: () => string;
  /**
   * Called once per GATED candidate (gen >= 1) with verifier-labeled training
   * signal — the data bridge to the harvest → DPO/SFT → HoloTune pipeline.
   * Pure: the loop hands you the record; YOU decide the sink (file/stdout/none).
   */
  onCandidate?: (rec: EvolveTraceRecord) => void;
}

export type EvolveOutcome = 'IMPROVED' | 'NO_IMPROVEMENT' | 'SEED_INVALID';

/** The auditable receipt — the native `{result, traceJSONL, verifyUrl}` envelope. */
export interface EvolveReceipt {
  result: EvolveOutcome;
  generations: number;
  /** Candidates that reached the gate (excludes empty/unchanged/propose-error). */
  evaluated: number;
  /** Candidates that PASSED the gate (the archived survivors, incl. seed). */
  survivors: number;
  /** Candidates DISCARDED by the gate (the guardrail at work). */
  discarded: number;
  seedScore: number | null;
  bestScore: number | null;
  improvementPct: number | null;
  proposerModel: string;
  /** Always true — there is no ungated path. */
  verifierGated: true;
  /** Always false — the loop proposes; a human promotes. */
  selfShips: false;
  /** Newline-delimited per-candidate JSON records (the full provenance trail). */
  traceJSONL: string;
  /** Content anchor over the trace: `cael:sha256:<hex>`. */
  verifyUrl: string;
  ts: string;
}

export interface EvolveResult {
  /** The winning candidate's code — ONLY when it genuinely beat the seed; else null. */
  bestCode: string | null;
  receipt: EvolveReceipt;
}

export interface OpenAICompatibleProposerOptions {
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

interface Member {
  cand: EvolveCandidate;
  code: string;
}

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildProposerPrompt(parentCode: string, goal: string): string {
  return (
    `You are improving a program toward a goal. GOAL: ${goal}\n\n` +
    `Return ONLY the full revised program - no prose, no explanation, no markdown code fences.\n\n` +
    `--- CURRENT PROGRAM ---\n${parentCode}\n--- END ---`
  );
}

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
}

function openAICompatibleChatUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/**
 * Run the gated evolutionary search over `seedCode` under `policy`. Returns the
 * winning code (only if it beat the seed) plus a full provenance receipt.
 *
 * Guarantees:
 *  - the seed must PASS the gate, else `SEED_INVALID` (you cannot evolve from an
 *    invalid baseline);
 *  - a candidate that FAILS the gate is discarded, never archived;
 *  - `bestCode` is non-null only when `bestScore < seedScore` (propose-not-ship).
 */
export async function runEvolution(
  seedCode: string,
  policy: EvolvePolicy,
  io: EvolveIO
): Promise<EvolveResult> {
  const now = io.now ?? (() => new Date().toISOString());
  const trace: EvolveCandidate[] = [];
  let nextId = 0;
  let evaluated = 0;
  let discarded = 0;
  const push = (c: EvolveCandidate): EvolveCandidate => {
    trace.push(c);
    return c;
  };

  const finalize = async (
    result: EvolveOutcome,
    seedScore: number | null,
    bestScore: number | null
  ): Promise<EvolveReceipt> => {
    const traceJSONL = trace.map((c) => JSON.stringify(c)).join('\n');
    const improvementPct =
      seedScore !== null && bestScore !== null && seedScore > 0
        ? Math.round(((seedScore - bestScore) / seedScore) * 1000) / 10
        : null;
    return {
      result,
      generations: policy.generations,
      evaluated,
      survivors: trace.filter((c) => c.passed).length,
      discarded,
      seedScore,
      bestScore,
      improvementPct,
      proposerModel: policy.proposerModel,
      verifierGated: true,
      selfShips: false,
      traceJSONL,
      verifyUrl: `cael:sha256:${await sha256Hex(traceJSONL)}`,
      ts: now(),
    };
  };

  // Seed must pass the gate — you cannot evolve from an invalid baseline.
  const seedGate = await io.gate(seedCode);
  evaluated++;
  const seed = push({
    id: nextId++,
    gen: 0,
    parentId: null,
    passed: seedGate.passed,
    score: seedGate.passed ? seedGate.score : Infinity,
    bytes: seedCode.length,
    note: 'seed',
  });
  if (!seedGate.passed) {
    discarded++;
    return { bestCode: null, receipt: await finalize('SEED_INVALID', null, null) };
  }

  const archive: Member[] = [{ cand: seed, code: seedCode }];
  let best: Member = { cand: seed, code: seedCode };
  let propIdx = 0;

  for (let gen = 1; gen <= policy.generations; gen++) {
    for (let p = 0; p < policy.population; p++) {
      // Round-robin parent selection over the score-sorted archive: deterministic,
      // biased toward the best (index 0) but cycling for diversity.
      const parent = archive[propIdx % archive.length];
      propIdx++;

      let code: string;
      try {
        code = (await io.propose(parent.code, policy.goal, policy)).trim();
      } catch (err) {
        push({
          id: nextId++,
          gen,
          parentId: parent.cand.id,
          passed: false,
          score: Infinity,
          bytes: 0,
          note: `propose_error:${(err as Error).message}`,
        });
        continue;
      }

      // Cheap pre-gate filter: skip empty or no-op mutations (not a gate failure).
      if (!code || code === parent.code) {
        push({
          id: nextId++,
          gen,
          parentId: parent.cand.id,
          passed: false,
          score: Infinity,
          bytes: code.length,
          note: 'empty_or_unchanged',
        });
        continue;
      }

      const g = await io.gate(code);
      evaluated++;
      const cand = push({
        id: nextId++,
        gen,
        parentId: parent.cand.id,
        passed: g.passed,
        score: g.passed ? g.score : Infinity,
        bytes: code.length,
        note: g.passed ? 'gated_pass' : 'gated_fail_discarded',
      });

      // DATA BRIDGE: every gated candidate — pass OR fail — is verifier-labeled
      // training signal for the proposer model (the second loop). A discarded
      // failure is still emitted: it is the DPO-rejected example.
      io.onCandidate?.({
        gen,
        parentId: parent.cand.id,
        parentCode: parent.code,
        goal: policy.goal,
        candidateCode: code,
        passed: g.passed,
        score: g.passed ? g.score : Infinity,
      });

      // THE GUARDRAIL: a candidate that fails correctness is discarded, never kept.
      if (!g.passed) {
        discarded++;
        continue;
      }

      // Survivor → archive; keep the top `archiveSize` by score (lower is better).
      archive.push({ cand, code });
      archive.sort((a, b) => a.cand.score - b.cand.score);
      if (archive.length > policy.archiveSize) archive.length = policy.archiveSize;
      if (cand.score < best.cand.score) best = { cand, code };
    }
  }

  const improved = best.cand.id !== seed.id && best.cand.score < seed.score;
  return {
    // Propose-not-ship: only surface code that genuinely beat the seed.
    bestCode: improved ? best.code : null,
    receipt: await finalize(
      improved ? 'IMPROVED' : 'NO_IMPROVEMENT',
      seed.score,
      best.cand.score === Infinity ? null : best.cand.score
    ),
  };
}

/**
 * Default sovereign proposer wired to a local Ollama endpoint (local metal — e.g.
 * the Jetson at `http://jetson.local:11434`). Asks for the FULL revised
 * program (no diff applier exists in the repo) and strips markdown fences. The
 * caller chooses the model; never pass a blacklisted qwen2.5 (W.738).
 */
export function makeOllamaProposer(endpoint: string, model: string): Proposer {
  const base = endpoint.replace(/\/+$/, '');
  return async (parentCode, goal) => {
    const prompt = buildProposerPrompt(parentCode, goal);
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.7 } }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const body = (await res.json()) as { response?: string };
    return stripMarkdownFences(body.response ?? '');
  };
}

/**
 * Proposer for HoloLlama/OpenAI-compatible chat-completions servers. This keeps
 * the evolution core vendor-neutral while preserving the same prompt contract as
 * the legacy Ollama path.
 */
export function makeOpenAICompatibleProposer(
  endpoint: string,
  model: string,
  opts: OpenAICompatibleProposerOptions = {}
): Proposer {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const temperature = opts.temperature ?? 0.7;
  return async (parentCode, goal) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
    const res = await fetchImpl(openAICompatibleChatUrl(endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        stream: false,
        temperature,
        ...(opts.maxTokens == null ? {} : { max_tokens: opts.maxTokens }),
        messages: [
          {
            role: 'system',
            content:
              'You are a HoloScript program-evolution proposer. Return only the full revised program.',
          },
          { role: 'user', content: buildProposerPrompt(parentCode, goal) },
        ],
      }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`openai-compatible ${res.status}: ${raw.slice(0, 160)}`);
    let body: {
      choices?: Array<{ message?: { content?: string | null }; text?: string | null }>;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      throw new Error('openai-compatible invalid JSON response');
    }
    const content = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text ?? '';
    const code = stripMarkdownFences(content);
    if (!code) throw new Error('openai-compatible empty response');
    return code;
  };
}

/** A graded training row in the ecosystem REC-SHAPE — the exact shape
 *  `scripts/trace-writer.mjs` writes and `harvest_real.py` reads
 *  (`{system, user, target, grader, family, modality, source, agentId, ts}`),
 *  so evolve traces flow into the existing grader-gated harvest unchanged. */
export interface GradedTraceRow {
  system: string;
  user: string;
  target: string;
  grader: Record<string, unknown>;
  family: string;
  modality: string;
  source: string;
  agentId: string;
  ts: string;
}

/**
 * Convert a gated evolve candidate into a graded training row. The harvest's
 * grader-gate (close-the-poison-vector) routes it: `passed:true` → the SFT
 * corpus (imitate good proposals); `passed:false` → kept for DPO/contrast
 * (the verifier-labeled "don't propose this" signal). `user` is the proposer
 * prompt the model should learn to answer well; `target` is what it proposed.
 */
export function toGradedTraceRow(
  rec: EvolveTraceRecord,
  opts: { agentId: string; ts: string; source?: string }
): GradedTraceRow {
  return {
    system:
      'HoloScript program-evolution proposer: improve the program toward the goal while keeping it valid.',
    user:
      `GOAL: ${rec.goal}\n\n` +
      `Improve this program toward the goal. Return ONLY the full revised program.\n\n` +
      `--- CURRENT PROGRAM ---\n${rec.parentCode}\n--- END ---`,
    target: rec.candidateCode,
    grader: {
      passed: rec.passed,
      score: rec.passed ? rec.score : null,
      kind: 'evolve-gated',
      gen: rec.gen,
      parentId: rec.parentId,
    },
    family: 'program-evolution',
    modality: 'code',
    source: opts.source ?? 'evolve-loop',
    agentId: opts.agentId,
    ts: opts.ts,
  };
}
