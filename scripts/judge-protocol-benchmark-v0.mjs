#!/usr/bin/env node
/**
 * Judge-protocol transfer benchmark v0 (Phase A) — tracer bullet.
 *
 * Additive, standalone research harness. Does NOT modify, import as a
 * runtime dependency of, or change behavior in any production eval path
 * (packages/mcp-server/src/holotest-tools.ts's execute_eval, Studio/Fable5
 * benchmarks, or scripts/humanistic-gate.mjs). Scope: build + honestly run
 * the Phase A benchmark from
 * research/2026-07-15_stanford-judgmentbench-judge-protocol-EVOLVED.md
 * (ai-ecosystem repo) before any production gate changes (Phase B-G there).
 *
 * Compares, over the SAME 30 curated items (10 each: HoloScript/code, 3D
 * scene, agent trace) and the SAME judges:
 *   1. absolute rubric scoring
 *   2. blind direct pairwise comparison (A/B and B/A position swap)
 *   3. hybrid: preference-first, rubric as tie-break/diagnostic only
 *   4. deterministic/reference checks (admission veto, never overridden by
 *      preference — this is what the whole architecture is protecting)
 *
 * Usage:
 *   node scripts/judge-protocol-benchmark-v0.mjs                # dry run: corpus stats only, no network/spend
 *   node scripts/judge-protocol-benchmark-v0.mjs --run           # real run: makes real, metered LLM API calls
 *   node scripts/judge-protocol-benchmark-v0.mjs --run --concurrency 6
 *   node scripts/judge-protocol-benchmark-v0.mjs --run --out .scratch/judge-protocol-bench-v0/my-run.json
 *
 * Judges: Judge A (primary, all 30 items) and Judge B (secondary, a
 * stratified 6-item subset only, for cross-family agreement / effective
 * reviewer count) — both real API-backed provider families already
 * registered in this workspace via @holoscript/llm-provider's
 * createProviderManager (same call path production execute_eval uses).
 * Override with --judge-a / --judge-b if you have different providers
 * registered.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS, DOMAINS, REQUIRED_EDGE_CASES } from './judge-protocol-bench/fixtures.mjs';
import { evaluateItemAllJudges } from './judge-protocol-bench/protocols.mjs';
import { mean } from './judge-protocol-bench/metrics.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Predeclared BEFORE running (F.076 requires a predeclared margin, not a
// post-hoc one): comparative/hybrid must beat absolute rubric's mean
// per-comparison recovery by at least this many points, in a domain, to
// count as "improved" for that substrate.
const PREDECLARED_MARGIN = 0.15;
const MIN_IMPROVED_SUBSTRATES_TO_PASS = 2;

function parseArgs(argv) {
  const args = { run: false, concurrency: 4, out: null, judgeA: 'openai', judgeB: 'xai' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run') args.run = true;
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--judge-a') args.judgeA = argv[++i];
    else if (a === '--judge-b') args.judgeB = argv[++i];
  }
  return args;
}

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: `${__dirname}/..` }).toString().trim();
  } catch {
    return null;
  }
}

function printCorpusStats() {
  const byDomain = Object.fromEntries(DOMAINS.map((d) => [d, ITEMS.filter((i) => i.domain === d).length]));
  const edgeCaseCounts = {};
  for (const item of ITEMS) for (const ec of item.edgeCases ?? []) edgeCaseCounts[ec] = (edgeCaseCounts[ec] ?? 0) + 1;
  console.log(`Judge-protocol-benchmark-v0 — dry run (no network calls, no spend).`);
  console.log(`Total items: ${ITEMS.length} — by domain: ${JSON.stringify(byDomain)}`);
  console.log(`Edge-case coverage: ${JSON.stringify(edgeCaseCounts)}`);
  const missing = REQUIRED_EDGE_CASES.filter((ec) => !edgeCaseCounts[ec]);
  if (missing.length) console.log(`WARNING: missing required edge cases: ${missing.join(', ')}`);
  console.log(`\nPass --run to execute the real 4-protocol benchmark against live judges.`);
  console.log(`Run scripts/judge-protocol-bench/self-check.mjs first if fixtures were edited.`);
}

// 2 non-edge-case items per domain get the cross-family (Judge B) overlap
// pass, per the EVOLVED doc's "reserve human/independent-family overlap for
// a stratified subset" (line 154) rather than doubling the cost of the
// entire corpus.
const STRATIFIED_IDS = new Set(['code-01', 'code-02', 'scene-01', 'scene-02', 'trace-01', 'trace-02']);

function domainRollup(domain, itemReceipts) {
  const items = itemReceipts.filter((r) => r.domain === domain);
  const rollup = {
    domain,
    itemCount: items.length,
    absolute: {
      perComparisonRecovery: mean(items.map((r) => r.metrics.absolute.perComparisonRecovery)),
      taskLevelRho: mean(items.map((r) => r.metrics.absolute.taskLevelRho)),
    },
    comparative: {
      perComparisonRecovery: mean(items.map((r) => r.metrics.comparative.perComparisonRecovery)),
      taskLevelRho: mean(items.map((r) => r.metrics.comparative.taskLevelRho)),
      positionFlipRate: mean(items.map((r) => r.metrics.comparative.positionFlipRate)),
    },
    hybrid: {
      perComparisonRecovery: mean(items.map((r) => r.metrics.hybrid.perComparisonRecovery)),
      taskLevelRho: mean(items.map((r) => r.metrics.hybrid.taskLevelRho)),
    },
    anchorRecovery: {
      absolute: mean(items.map((r) => r.metrics.anchorRecovery.absolute)),
      comparative: mean(items.map((r) => r.metrics.anchorRecovery.comparative)),
      hybrid: mean(items.map((r) => r.metrics.anchorRecovery.hybrid)),
    },
    deterministicAdmissionAccuracy: mean(items.map((r) => (r.deterministic.accuracyOk ? 1 : 0))),
    launderingIncidents: {
      absolute: items.filter((r) => r.metrics.launderingDetected.absolute).map((r) => r.itemId),
      comparative: items.filter((r) => r.metrics.launderingDetected.comparative).map((r) => r.itemId),
      hybrid: items.filter((r) => r.metrics.launderingDetected.hybrid).map((r) => r.itemId),
    },
  };
  const injectionItems = items.filter((r) => r.metrics.injectionSuccess);
  rollup.injection = {
    itemsWithInjection: injectionItems.length,
    succeeded: injectionItems.filter((r) => r.metrics.injectionSuccess.succeeded).length,
  };
  return rollup;
}

function evaluateGate(domainRollups) {
  const perDomain = domainRollups.map((d) => {
    const baseline = d.absolute.perComparisonRecovery;
    const comparativeDelta = baseline != null && d.comparative.perComparisonRecovery != null
      ? d.comparative.perComparisonRecovery - baseline : null;
    const hybridDelta = baseline != null && d.hybrid.perComparisonRecovery != null
      ? d.hybrid.perComparisonRecovery - baseline : null;
    const noLaunderingRegression = d.launderingIncidents.comparative.length === 0 && d.launderingIncidents.hybrid.length === 0;
    const admissionUnchanged = d.deterministicAdmissionAccuracy === 1;
    const improved =
      admissionUnchanged && noLaunderingRegression &&
      ((comparativeDelta != null && comparativeDelta >= PREDECLARED_MARGIN) ||
        (hybridDelta != null && hybridDelta >= PREDECLARED_MARGIN));
    return {
      domain: d.domain,
      baselineAbsoluteRecovery: baseline,
      comparativeRecovery: d.comparative.perComparisonRecovery,
      hybridRecovery: d.hybrid.perComparisonRecovery,
      comparativeDelta,
      hybridDelta,
      admissionUnchanged,
      noLaunderingRegression,
      improved,
    };
  });
  const improvedCount = perDomain.filter((d) => d.improved).length;
  const allAdmissionUnchanged = perDomain.every((d) => d.admissionUnchanged);
  const pass = improvedCount >= MIN_IMPROVED_SUBSTRATES_TO_PASS && allAdmissionUnchanged;
  return {
    predeclaredMargin: PREDECLARED_MARGIN,
    minImprovedSubstratesRequired: MIN_IMPROVED_SUBSTRATES_TO_PASS,
    perDomain,
    improvedSubstrateCount: improvedCount,
    allAdmissionUnchanged,
    pass,
  };
}

function costEstimate(itemReceipts) {
  // Rough, clearly-labeled estimate from actual reported token usage where
  // the provider returned it — NOT a billed-invoice figure. $/MTok rates
  // are ballpark placeholders for a mini/fast-tier model, documented as
  // such; real spend should be read from the provider's own billing.
  const RATE_PER_MTOK = { openai: { in: 0.25, out: 2 }, xai: { in: 0.2, out: 0.5 }, openrouter: { in: 0.3, out: 1 } };
  let totalPromptTokens = 0, totalCompletionTokens = 0, estimatedUsd = 0, callCount = 0;
  function fold(usage, provider) {
    if (!usage) return;
    callCount++;
    const pt = usage.promptTokens ?? 0, ct = usage.completionTokens ?? 0;
    totalPromptTokens += pt;
    totalCompletionTokens += ct;
    const rate = RATE_PER_MTOK[provider] ?? { in: 0.5, out: 1.5 };
    estimatedUsd += (pt / 1e6) * rate.in + (ct / 1e6) * rate.out;
  }
  for (const r of itemReceipts) {
    for (const k of Object.keys(r.rubric.raw)) fold(r.rubric.raw[k].usage, r.rubric.raw[k].provider);
    for (const pr of r.comparative.preferenceResults) for (const jr of pr.judgeReceipts) fold(jr.usage, jr.provider);
  }
  return { callCount, totalPromptTokens, totalCompletionTokens, estimatedUsd: Math.round(estimatedUsd * 10000) / 10000, note: 'rough estimate from reported token usage, not a billed figure' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.run) {
    printCorpusStats();
    return;
  }

  console.log(`Running judge-protocol-benchmark-v0 live: judgeA=${args.judgeA} judgeB=${args.judgeB} concurrency=${args.concurrency}`);
  console.log(`Items: ${ITEMS.length}, stratified (cross-family) subset: ${[...STRATIFIED_IDS].join(', ')}`);

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const itemReceipts = [];
  for (const item of ITEMS) {
    const includeJudgeB = STRATIFIED_IDS.has(item.id);
    process.stdout.write(`  ${item.id} (${item.domain})${includeJudgeB ? ' [+judgeB]' : ''} ... `);
    const receipt = await evaluateItemAllJudges(item, {
      judgeA: args.judgeA, judgeB: args.judgeB, includeJudgeB, concurrency: args.concurrency,
    });
    itemReceipts.push(receipt);
    console.log('done');
  }
  const elapsedMs = Date.now() - t0;

  const domainRollups = DOMAINS.map((d) => domainRollup(d, itemReceipts));
  const gate = evaluateGate(domainRollups);
  const cost = costEstimate(itemReceipts);
  const crossFamilyItems = itemReceipts.filter((r) => r.crossFamily);
  const effectiveReviewerCount = mean(crossFamilyItems.map((r) => r.crossFamily.effectiveReviewerCount));
  const crossFamilyAgreementRate = mean(crossFamilyItems.map((r) => r.crossFamily.agreementRate));

  const result = {
    schema: 'judge-protocol-benchmark-v0.receipt',
    phase: 'A',
    sourceDoc: 'research/2026-07-15_stanford-judgmentbench-judge-protocol-EVOLVED.md',
    gitHead: gitHead(),
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs,
    config: { judgeA: args.judgeA, judgeB: args.judgeB, concurrency: args.concurrency, stratifiedIds: [...STRATIFIED_IDS] },
    corpus: { itemCount: ITEMS.length, domains: DOMAINS },
    // NOTE ON humanAgreement: no human raters were available in this
    // environment/session. This field is intentionally null rather than
    // fabricated — crossFamilyAgreementRate (a second LLM judge family) is
    // reported separately as an honest proxy, not a substitute.
    humanAgreement: null,
    crossFamilyAgreementRate,
    effectiveReviewerCount,
    domainRollups,
    gate,
    cost,
    items: itemReceipts,
  };

  const outPath = args.out ?? `${__dirname}/../.scratch/judge-protocol-bench-v0/run-${Date.now()}.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`\n=== F.076 gate result ===`);
  for (const d of gate.perDomain) {
    console.log(
      `  ${d.domain}: absolute=${fmt(d.baselineAbsoluteRecovery)} comparative=${fmt(d.comparativeRecovery)} ` +
      `(Δ${fmt(d.comparativeDelta, true)}) hybrid=${fmt(d.hybridRecovery)} (Δ${fmt(d.hybridDelta, true)}) ` +
      `admissionUnchanged=${d.admissionUnchanged} improved=${d.improved}`
    );
  }
  console.log(`  Substrates improved: ${gate.improvedSubstrateCount}/${DOMAINS.length} (need >= ${gate.minImprovedSubstratesRequired})`);
  console.log(`  GATE: ${gate.pass ? 'PASS' : 'FAIL'}`);
  console.log(`\nCross-family agreement rate: ${fmt(crossFamilyAgreementRate)}  effective reviewers: ${fmt(effectiveReviewerCount)}`);
  console.log(`Estimated cost: $${cost.estimatedUsd} across ${cost.callCount} calls (${cost.note})`);
  console.log(`\nReceipt written: ${outPath}`);
}

function fmt(x, signed = false) {
  if (x == null) return 'n/a';
  const s = x.toFixed(3);
  return signed && x >= 0 ? `+${s}` : s;
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
