#!/usr/bin/env node
/**
 * evolve-accrual-daemon — the I.023 executor as a standalone, schedulable runner.
 *
 * Grows the gated training corpus by running evolution steps against sovereign-local
 * Ollama ($0 metal), consuming the SAME `@holoscript/core/evolution` primitives the
 * AgentRunner idle path uses (accrueOneStep + dedupRows + makeOllamaProposer) — the gate
 * is core's single source of truth; this is just another consumer + its own fs glue. The
 * laptop has the repo + core (resolves via workspace hoisting), so no bundle is needed
 * (the deleted Jetson-bundle premise does not apply here).
 *
 * TWO run modes:
 *   --once / HOLOSCRIPT_AGENT_EVOLVE_MAX_TICKS=N → run N gated steps then EXIT (the
 *     scheduled-task model: the OS scheduler is the loop, no perpetual process — F.101).
 *   default → loop forever on HOLOSCRIPT_AGENT_EVOLVE_INTERVAL_MS (in-process daemon).
 *
 * Corpus rows are REC-SHAPE (harvest_real.py-ready) and append to
 * `<HOLOSCRIPT_AGENT_EVOLVE_CORPUS>` (convention: training/evolve-corpus/<agentId>/trace.jsonl).
 * dedupRows keeps a re-run from piling duplicates (content-unique by proposed program).
 *
 * Required env: HOLOSCRIPT_AGENT_EVOLVE_CORPUS + a sovereign endpoint
 * (HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL or HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL). No cloud, no $.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CORPUS = process.env.HOLOSCRIPT_AGENT_EVOLVE_CORPUS;
const ENDPOINT =
  process.env.HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL ??
  process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL ??
  process.env.HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL;
// qwen3:4b-instruct (local) / qwen3:4b (Jetson). W.738/W.745: NEVER qwen2.5.
const MODEL = process.env.HOLOSCRIPT_AGENT_EVOLVE_MODEL ?? 'qwen3:4b-instruct';
const AGENT_ID = process.env.HOLOSCRIPT_AGENT_EVOLVE_AGENT_ID ?? 'laptop-evolve';
const INTERVAL_MS = Number(process.env.HOLOSCRIPT_AGENT_EVOLVE_INTERVAL_MS ?? 900_000); // 15 min
const ONCE =
  process.argv.includes('--once') || process.env.HOLOSCRIPT_AGENT_EVOLVE_MAX_TICKS != null;
const MAX_TICKS = process.argv.includes('--once')
  ? 1
  : Number(process.env.HOLOSCRIPT_AGENT_EVOLVE_MAX_TICKS ?? 0);

const log = (ev) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...ev }));

function endpointProtocol(endpoint) {
  const override = process.env.HOLOSCRIPT_AGENT_EVOLVE_PROTOCOL?.toLowerCase();
  if (override === 'openai-compatible' || override === 'openai') return 'openai-compatible';
  if (override === 'ollama') return 'ollama';
  if (process.env.HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL) return 'openai-compatible';
  if (/\/v1(?:\/chat\/completions)?\/?$/i.test(endpoint)) return 'openai-compatible';
  if (/:(18080|8000|8080)(?:\/|$)/.test(endpoint)) return 'openai-compatible';
  return 'ollama';
}

function countProposerErrors(receipt) {
  if (!receipt?.traceJSONL) return 0;
  let count = 0;
  for (const line of receipt.traceJSONL.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row.note === 'string' && row.note.startsWith('propose_error:')) count++;
    } catch {
      /* ignore malformed receipt lines */
    }
  }
  return count;
}

if (!CORPUS || !ENDPOINT) {
  log({
    ev: 'fatal',
    reason:
      'require HOLOSCRIPT_AGENT_EVOLVE_CORPUS + (HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL|HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL|HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL)',
  });
  process.exit(1);
}

// Same core primitives the in-agent path uses — the gate is core's SSOT.
const { makeOllamaProposer, makeOpenAICompatibleProposer, accrueOneStep, dedupRows } =
  await import('@holoscript/core/evolution');
const PROTOCOL = endpointProtocol(ENDPOINT);
const propose =
  PROTOCOL === 'openai-compatible'
    ? makeOpenAICompatibleProposer(ENDPOINT, MODEL, {
        apiKey: process.env.HOLOSCRIPT_AGENT_EVOLVE_API_KEY,
      })
    : makeOllamaProposer(ENDPOINT, MODEL);
log({
  ev: 'accrual-daemon-start',
  corpus: CORPUS,
  endpoint: ENDPOINT,
  protocol: PROTOCOL,
  model: MODEL,
  agentId: AGENT_ID,
  once: ONCE,
  intervalMs: ONCE ? null : INTERVAL_MS,
});

let tick = 0;
let errorCount = 0;
let writtenTotal = 0;
let stopped = false;
const onSig = () => {
  stopped = true;
  log({ ev: 'accrual-daemon-stop' });
  setTimeout(() => process.exit(0), 200);
};
process.on('SIGINT', onSig);
process.on('SIGTERM', onSig);

async function step() {
  tick++;
  let existing = '';
  try {
    existing = readFileSync(CORPUS, 'utf8');
  } catch {
    /* first run: no corpus yet */
  }
  try {
    const { target, rows, receipt } = await accrueOneStep({ propose, agentId: AGENT_ID, tick });
    const proposerErrors = countProposerErrors(receipt);
    if (proposerErrors > 0) throw new Error(`proposer failed for ${proposerErrors} candidate(s)`);
    const { fresh, deduped } = dedupRows(existing, rows);
    if (fresh.length) {
      mkdirSync(dirname(CORPUS), { recursive: true });
      appendFileSync(CORPUS, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    }
    log({
      ev: 'accrual-step',
      tick,
      target,
      written: fresh.length,
      deduped,
      outcome: rows.length === 0 ? 'no-candidate' : fresh.length ? 'accrued' : 'all-dup',
    });
    writtenTotal += fresh.length;
    return { ok: true, written: fresh.length };
  } catch (err) {
    errorCount++;
    log({ ev: 'accrual-error', tick, message: err?.message ?? String(err) });
    return { ok: false, written: 0 };
  }
}

await step(); // immediate first step
if (ONCE) {
  while (tick < MAX_TICKS && !stopped) await step();
  log({ ev: 'accrual-daemon-done', ticks: tick, errors: errorCount, written: writtenTotal });
  // Same delayed-exit idiom as onSig: an immediate process.exit() races the
  // proposer's keep-alive sockets during native teardown, which Windows
  // surfaces as STATUS_STACK_BUFFER_OVERRUN (0xC0000409) in Task Scheduler
  // even after a productive run.
  process.exitCode = errorCount > 0 ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 250);
}
const timer = setInterval(() => {
  if (stopped) clearInterval(timer);
  else void step();
}, INTERVAL_MS);
