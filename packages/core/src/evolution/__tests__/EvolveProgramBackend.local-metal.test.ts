/**
 * LOCAL-METAL proof for the gated evolutionary loop.
 *
 * Runs {@link runEvolution} with a SOVEREIGN proposer on local metal (the Jetson
 * Ollama endpoint) — no cloud. The small on-device model is a weak coder, which
 * is exactly the point: the verifier-gate tolerates a weak proposer (bad
 * mutations are discarded), so the loop is SOUND regardless of proposer strength.
 *
 * Guarded — skipped in normal/CI runs. To reproduce on local metal:
 *   EVOLVE_LOCAL_METAL_PROOF=1 \
 *   pnpm --filter @holoscript/core exec vitest run \
 *     src/evolution/__tests__/EvolveProgramBackend.local-metal.test.ts
 * Optional overrides: EVOLVE_OLLAMA_ENDPOINT, EVOLVE_PROPOSER_MODEL.
 *
 * @see ../EvolveProgramBackend.ts
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  runEvolution,
  makeOllamaProposer,
  toGradedTraceRow,
  type Gate,
  type EvolveTraceRecord,
} from '../EvolveProgramBackend';

const ENABLED = process.env.EVOLVE_LOCAL_METAL_PROOF === '1';
const ENDPOINT = process.env.EVOLVE_OLLAMA_ENDPOINT ?? 'http://holojetson.local:11434';
const MODEL = process.env.EVOLVE_PROPOSER_MODEL ?? 'brittney-edge:v0-4';

describe.skipIf(!ENABLED)('runEvolution on LOCAL METAL (Jetson Ollama)', () => {
  it('runs the gated loop with a sovereign local proposer and emits an auditable receipt', async () => {
    const seed =
      'function greet(name) { return "Hello, " + name + "! Welcome to HoloScript."; }';
    const propose = makeOllamaProposer(ENDPOINT, MODEL);
    // Real gate: still greets BY NAME (semantic marker), and shorter is better.
    // A mutation that drops the marker fails and is discarded — the guardrail.
    const gate: Gate = async (code) => ({
      passed: /function\s+greet\s*\(/.test(code) && /name/.test(code),
      score: code.length,
    });

    // The DATA BRIDGE: capture every gated candidate as verifier-labeled training
    // signal — the proof that failures become training data on local metal.
    const traceRecs: EvolveTraceRecord[] = [];
    const { bestCode, receipt } = await runEvolution(
      seed,
      {
        goal: 'make this function shorter while it still greets by name',
        generations: 3,
        population: 2,
        archiveSize: 6,
        proposerModel: MODEL,
      },
      { propose, gate, onCandidate: (r) => traceRecs.push(r) },
    );

    // Whatever the small on-device model produced, the loop must be sound + auditable.
    expect(receipt.verifierGated).toBe(true);
    expect(receipt.selfShips).toBe(false);
    expect(receipt.verifyUrl).toMatch(/^cael:sha256:[0-9a-f]{64}$/);
    expect(['IMPROVED', 'NO_IMPROVEMENT', 'SEED_INVALID']).toContain(receipt.result);

    mkdirSync('.scratch/evolve-proof', { recursive: true });
    writeFileSync('.scratch/evolve-proof/receipt.json', JSON.stringify(receipt, null, 2));
    writeFileSync('.scratch/evolve-proof/best.txt', bestCode ?? '(no improvement surfaced)');

    // The TRAINING DATA the loop generated from its own gated attempts (the second
    // loop) — graded REC-SHAPE rows ready for the grader-gated harvest -> DPO/SFT.
    const ts = new Date().toISOString();
    const rows = traceRecs.map((r) => toGradedTraceRow(r, { agentId: 'jetson-evolve', ts }));
    writeFileSync(
      '.scratch/evolve-proof/trace.jsonl',
      rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
    );
    const chosen = rows.filter((row) => (row.grader as { passed: boolean }).passed).length;
    const rejected = rows.length - chosen;
    expect(rows.length).toBe(receipt.evaluated - 1); // every gated candidate except the seed
    // eslint-disable-next-line no-console
    console.log(
      `[evolve][local-metal] result=${receipt.result} seed=${receipt.seedScore} -> best=${receipt.bestScore} ` +
        `| model=${MODEL} evaluated=${receipt.evaluated} discarded=${receipt.discarded} survivors=${receipt.survivors} ` +
        `| TRAINING ROWS=${rows.length} (chosen/SFT=${chosen}, rejected/DPO=${rejected})`,
    );
  }, 180000);
});
