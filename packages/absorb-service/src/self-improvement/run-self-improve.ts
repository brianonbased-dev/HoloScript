#!/usr/bin/env tsx
/**
 * run-self-improve.ts — the fleet-runnable entry point for SelfImproveCommand.
 *
 * This is the link that lets the FLEET *perform* self-improvement (it could only
 * be unit-tested before — no production wiring existed). The fleet/HoloClaw already
 * knows how to spawn `npx tsx <entry>` daemons; this is that entry.
 *
 * SAFE by construction: propose-only. autoCommit is hard-forced false, the full
 * suite is skipped (bounded), generated tests are run for a REAL pass/fail then
 * removed so the tree is left clean. Nothing is committed; the output is a set of
 * *proposals* a human or a later gated step reviews.
 *
 * Usage:
 *   tsx run-self-improve.ts [--root <dir>] [--max-iterations N] [--json]
 *   tsx run-self-improve.ts --targets-only            # list coverage gaps (feeder)
 *
 * LLM (sovereign, OpenAI-protocol — P.009): set
 *   HOLO_SELF_IMPROVE_LLM_URL   full chat/completions URL of the sovereign serving
 *                               endpoint (P.008 vast/Studio serving) — a production
 *                               https:// URL, NEVER localhost.
 *   HOLO_SELF_IMPROVE_LLM_MODEL model id
 *   HOLO_SELF_IMPROVE_LLM_KEY   optional bearer
 * No URL → fails LOUD (never fakes generation, never silently falls back to localhost).
 * Production-over-dev (Vision Pillar 6): there is no localhost default by design.
 *
 * @module self-improvement
 */

import { SelfImproveCommand } from './SelfImproveCommand';
import { FleetSelfImproveIO, type LLMComplete } from './FleetSelfImproveIO';

interface CliArgs {
  rootDir: string;
  maxIterations: number;
  targetsOnly: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    rootDir: process.env['HOLOSCRIPT_REPO_ROOT'] || process.cwd(),
    maxIterations: 3,
    targetsOnly: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.rootDir = argv[++i] ?? args.rootDir;
    else if (a === '--max-iterations') args.maxIterations = Number(argv[++i]) || args.maxIterations;
    else if (a === '--targets-only') args.targetsOnly = true;
    else if (a === '--json') args.json = true;
  }
  return args;
}

/** Build a sovereign LLM completion fn (OpenAI-protocol). Fails loud if unconfigured. */
function buildLLMComplete(): LLMComplete {
  const url = process.env['HOLO_SELF_IMPROVE_LLM_URL'];
  const model = process.env['HOLO_SELF_IMPROVE_LLM_MODEL'] || 'qwen2.5-coder';
  const key = process.env['HOLO_SELF_IMPROVE_LLM_KEY'];
  if (!url) {
    return async () => {
      throw new Error(
        'HOLO_SELF_IMPROVE_LLM_URL is not set — refusing to fake test generation. ' +
          'Point it at the sovereign OpenAI-protocol chat endpoint (P.009).'
      );
    };
  }
  return async ({ system, user }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 2048,
        temperature: 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned no content');
    return content;
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const io = new FleetSelfImproveIO({ rootDir: args.rootDir, llmComplete: buildLLMComplete() });

  // Feeder mode: just surface the coverage gaps (no LLM, no writes).
  if (args.targetsOnly) {
    const targets = await io.queryUntested('');
    process.stdout.write(JSON.stringify({ rootDir: args.rootDir, count: targets.length, targets }, null, 2) + '\n');
    return;
  }

  const command = new SelfImproveCommand(io, {
    rootDir: args.rootDir,
    maxIterations: args.maxIterations,
    autoCommit: false, // HARD SAFETY: propose-only, never commit.
    fullSuiteMetrics: false, // bounded: per-file checks only.
    maxConsecutiveFailures: 3,
  });

  let result;
  try {
    result = await command.execute();
  } finally {
    // Always restore the tree, even on error/throw.
    const cleaned = io.cleanup();
    if (cleaned.failed.length) {
      process.stderr.write(`[self-improve] WARNING: cleanup left ${cleaned.failed.length} file(s): ${cleaned.failed.join(', ')}\n`);
    }
  }

  const proposals = io.getProposals();
  const summary = {
    mode: 'propose-only',
    rootDir: args.rootDir,
    abortReason: result.abortReason,
    iterations: result.iterations.length,
    proposalsGenerated: proposals.length,
    proposalsPassing: proposals.filter((p) => p.passed).length,
    finalQualityPercent: result.finalQuality?.scorePercent ?? null,
    totalDurationMs: result.totalDuration,
    // Full test bodies included so a reviewer/gated step can apply the passing ones.
    proposals: proposals.map((p) => ({ testFilePath: p.testFilePath, passed: p.passed, content: p.content })),
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stderr.write(
      `[self-improve] ${summary.proposalsPassing}/${summary.proposalsGenerated} proposals passing ` +
        `(${summary.iterations} iters, ${Math.round(summary.totalDurationMs / 1000)}s, abort=${summary.abortReason}). ` +
        `Tree restored. Re-run with --json to capture the proposed tests.\n`
    );
  }
}

// Run only when invoked directly (so the module stays importable for tests).
const invokedDirectly =
  typeof process.argv[1] === 'string' && process.argv[1].includes('run-self-improve');
if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`[self-improve] FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

export { main as runSelfImprove };
