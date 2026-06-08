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
 * LLM (sovereign serving, P.008/P.009): resolves the warm serving box from the
 * orchestrator /serve registry exactly like Brittney's resolveFleet (scale-to-zero
 * aware) — no bespoke URL, no localhost. Env (all optional, prod defaults):
 *   FLEET_INFERENCE_KEY        bearer for the serving box's OpenAI /v1 (needed to call it)
 *   BRITTNEY_FLEET_MODEL       served model (default qwen2.5-coder:1.5b)
 *   MCP_ORCHESTRATOR_URL       /serve registry host (default prod orchestrator)
 *   HOLOSCRIPT_API_KEY         x-mcp-api-key for /serve/resolve
 *   HOLO_SELF_IMPROVE_LLM_URL  optional explicit /v1/chat/completions override (ops pin)
 * Cold serving → fails LOUD ("retry, autoscaler is warming") — never fakes, never localhost.
 * Production-over-dev (Vision Pillar 6).
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

/**
 * Sovereign LLM completion (P.008/P.009). Resolves the warm serving box from the
 * orchestrator /serve registry the SAME way Brittney's resolveFleet does — no bespoke
 * URL, no localhost, scale-to-zero aware. HOLO_SELF_IMPROVE_LLM_URL pins an explicit
 * /v1/chat/completions URL for ops overrides. Fails LOUD (never fakes generation).
 */
function buildLLMComplete(): LLMComplete {
  const explicitUrl = process.env['HOLO_SELF_IMPROVE_LLM_URL'];
  const orch = (
    process.env['BRITTNEY_FLEET_ORCH_URL'] ||
    process.env['MCP_ORCHESTRATOR_URL'] ||
    process.env['ORCHESTRATOR_URL'] ||
    'https://mcp-orchestrator-production-45f9.up.railway.app'
  ).replace(/\/+$/, '');
  const model = process.env['BRITTNEY_FLEET_MODEL'] || 'qwen2.5-coder:1.5b';
  const bearer = process.env['FLEET_INFERENCE_KEY'] || process.env['SERVE_INFERENCE_KEY'] || '';
  const resolveKey =
    process.env['BRITTNEY_FLEET_RESOLVE_KEY'] || process.env['HOLOSCRIPT_API_KEY'] || '';

  async function resolveChatUrl(): Promise<string> {
    if (explicitUrl) return explicitUrl;
    const r = await fetch(`${orch}/serve/resolve?model=${encodeURIComponent(model)}`, {
      headers: resolveKey ? { 'x-mcp-api-key': resolveKey } : {},
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      throw new Error(`/serve/resolve ${r.status} — cannot resolve sovereign serving endpoint`);
    }
    const body = (await r.json()) as { status?: string; url?: string };
    if (body.status !== 'warm' || !body.url) {
      throw new Error(
        `Sovereign serving is cold for "${model}" — the resolve bumped demand so the autoscaler ` +
          `will warm a box shortly. Re-run in ~1-2 min, or pin HOLO_SELF_IMPROVE_LLM_URL.`
      );
    }
    return `${body.url.replace(/\/+$/, '')}/v1/chat/completions`;
  }

  return async ({ system, user }) => {
    const url = await resolveChatUrl();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
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
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
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
