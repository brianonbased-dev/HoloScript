#!/usr/bin/env node
/**
 * perf-regression-check — fail CI when current benchmark results regress
 * by more than the configured threshold (default 5%) against a committed
 * baseline.
 *
 * The check is decoupled from how benchmarks are run. Any process that
 * emits JSON files matching the schema below into
 * `benchmarks/results/<date>/<scenario>.json` (or a path passed via
 * --results) can feed this script.
 *
 *   {
 *     "scenario": "01-basic-scene",
 *     "results": [
 *       { "platform": "unity",  "compileTimeMs": 42, "outputSizeBytes": 12345 },
 *       { "platform": "unreal", "compileTimeMs": 38, "outputSizeBytes": 11800 },
 *       ...
 *     ],
 *     "summary": { "avgCompileTimeMs": 40, ... }
 *   }
 *
 * Baseline file at `benchmarks/baseline.json` (committed, hand-seeded
 * after the first clean benchmark run):
 *
 *   {
 *     "version": "v1",
 *     "frozen_at": "<ISO timestamp>",
 *     "frozen_by_commit": "<sha>",
 *     "axes": {
 *       "compileTimeMs": { "regression_threshold_pct": 5,  "comparator": "lower-is-better" },
 *       "outputSizeBytes": { "regression_threshold_pct": 30, "comparator": "lower-is-better" }
 *     },
 *     "scenarios": {
 *       "01-basic-scene": {
 *         "platforms": {
 *           "unity":   { "compileTimeMs": 42, "outputSizeBytes": 12345 },
 *           "unreal":  { "compileTimeMs": 38, "outputSizeBytes": 11800 }
 *         }
 *       }
 *     }
 *   }
 *
 * Usage:
 *   node scripts/perf-regression-check.mjs                       # check today's results
 *   node scripts/perf-regression-check.mjs --date 2026-04-27     # check specific date
 *   node scripts/perf-regression-check.mjs --results path/file   # check a single results file
 *   node scripts/perf-regression-check.mjs --threshold 10        # override 5% threshold
 *   node scripts/perf-regression-check.mjs --update-baseline     # write current → baseline (manual seed)
 *
 * Exit codes:
 *   0 — no regressions, or baseline not yet seeded (warning printed)
 *   1 — regression detected on at least one (scenario, platform, axis) tuple
 *   2 — invocation error (bad path, malformed JSON, etc.)
 *
 * The "regression" signal is asymmetric: improvements are silent, only
 * regressions trip the gate. Improvements DO get reported in the
 * summary section so the team sees wins.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Allow tests + alt-cwd invocations to redirect the repo root via
// HOLO_PERF_REGRESSION_REPO_ROOT. Defaults to the script's parent (../).
const REPO_ROOT = resolve(
  process.env.HOLO_PERF_REGRESSION_REPO_ROOT || resolve(__dirname, ".."),
);
const BASELINE_PATH = join(REPO_ROOT, "benchmarks", "baseline.json");
const RESULTS_DIR = join(REPO_ROOT, "benchmarks", "results");

const args = process.argv.slice(2);
function argFlag(name) {
  return args.includes(name);
}
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const explicitThreshold = argValue("--threshold");
const explicitResults = argValue("--results");
const explicitDate = argValue("--date");
const updateBaseline = argFlag("--update-baseline");

function fail(msg, code = 2) {
  console.error(`[perf-regression-check] FAIL: ${msg}`);
  process.exit(code);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function loadJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch (e) {
    fail(`could not read JSON at ${p}: ${e.message}`);
  }
}

function listResultsForDate(date) {
  const dir = join(RESULTS_DIR, date);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    out.push(join(dir, name));
  }
  return out;
}

function loadCurrent() {
  if (explicitResults) {
    const p = resolve(REPO_ROOT, explicitResults);
    if (!existsSync(p)) fail(`--results path not found: ${p}`);
    return [{ path: p, data: loadJson(p) }];
  }
  const date = explicitDate ?? todayIso();
  const files = listResultsForDate(date);
  if (files.length === 0) {
    console.log(`[perf-regression-check] no results found for ${date} — nothing to check`);
    process.exit(0);
  }
  return files.map((p) => ({ path: p, data: loadJson(p) }));
}

function pctChange(baseline, current) {
  if (baseline === 0) return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((current - baseline) / baseline) * 100;
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return "∞";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function main() {
  if (updateBaseline) {
    console.log(`[perf-regression-check] --update-baseline: rewriting ${BASELINE_PATH} from current results`);
    const current = loadCurrent();
    const scenarios = {};
    for (const { data } of current) {
      const scen = data.scenario;
      const platforms = {};
      for (const r of data.results ?? []) {
        if (r.success === false) continue;
          const captured = {};
          for (const [k, v] of Object.entries(r)) {
            if (k !== "platform" && k !== "success" && typeof v === "number") {
              captured[k] = v;
            }
          }
          platforms[r.platform] = captured;
      }
      scenarios[scen] = { platforms };
    }
    const baseline = {
      version: "v1",
      frozen_at: new Date().toISOString(),
      frozen_by_commit: gitHead(),
      axes: {
        compileTimeMs: { regression_threshold_pct: 5, comparator: "lower-is-better" },
        outputSizeBytes: { regression_threshold_pct: 30, comparator: "lower-is-better" },
          latencyMs: { regression_threshold_pct: 10, comparator: "lower-is-better" },
      },
      scenarios,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf-8");
    console.log(`[perf-regression-check] wrote baseline with ${Object.keys(scenarios).length} scenario(s)`);
    process.exit(0);
  }

  if (!existsSync(BASELINE_PATH)) {
    console.log(
      `[perf-regression-check] WARNING: ${BASELINE_PATH} does not exist yet — no regression check performed.`,
    );
    console.log(
      `  To seed: run benchmarks, then run \`node scripts/perf-regression-check.mjs --update-baseline\``,
    );
    console.log(
      `  Empty baseline = first-time setup; CI will not gate until baseline is committed.`,
    );
    process.exit(0);
  }

  const baseline = loadJson(BASELINE_PATH);
  const current = loadCurrent();

  const overrides = {};
  if (explicitThreshold !== null) {
    const v = Number(explicitThreshold);
    if (!Number.isFinite(v)) fail(`--threshold must be a number, got ${explicitThreshold}`);
    overrides.compileTimeMs = v;
    overrides.outputSizeBytes = v;
  }

  const regressions = [];
  const improvements = [];
  const newScenarios = [];
  const missingScenarios = [];

  for (const { path, data } of current) {
    const scenario = data.scenario;
    const baseScen = baseline.scenarios?.[scenario];
    if (!baseScen) {
      newScenarios.push({ scenario, path });
      continue;
    }
    for (const r of data.results ?? []) {
      if (r.success === false) continue;
      const basePlat = baseScen.platforms?.[r.platform];
      if (!basePlat) {
        newScenarios.push({ scenario: `${scenario}/${r.platform}`, path });
        continue;
      }
      for (const axis of Object.keys(baseline.axes ?? {})) {
        const cur = r[axis];
        const base = basePlat[axis];
        if (typeof cur !== "number" || typeof base !== "number") continue;
        const pct = pctChange(base, cur);
        const threshold =
          overrides[axis] ?? baseline.axes[axis].regression_threshold_pct ?? 5;
        const entry = {
          scenario,
          platform: r.platform,
          axis,
          baseline: base,
          current: cur,
          pct,
          threshold,
        };
        if (pct > threshold) regressions.push(entry);
        else if (pct < 0) improvements.push(entry);
      }
    }
  }

  for (const sc of Object.keys(baseline.scenarios ?? {})) {
    if (!current.some((c) => c.data.scenario === sc)) missingScenarios.push(sc);
  }

  // Report
  console.log(`[perf-regression-check] baseline frozen_at=${baseline.frozen_at} commit=${baseline.frozen_by_commit?.slice(0, 8) ?? "?"}`);
  console.log(`[perf-regression-check] checked ${current.length} result file(s) against ${Object.keys(baseline.scenarios ?? {}).length} baseline scenario(s)`);

  if (improvements.length > 0) {
    console.log(`\n[perf-regression-check] ${improvements.length} improvement(s):`);
    for (const i of improvements.slice(0, 10)) {
      console.log(`  ✓ ${i.scenario} / ${i.platform} / ${i.axis}: ${i.baseline} → ${i.current} (${fmtPct(i.pct)})`);
    }
  }
  if (newScenarios.length > 0) {
    console.log(`\n[perf-regression-check] ${newScenarios.length} new scenario/platform combo(s) (not in baseline yet):`);
    for (const n of newScenarios.slice(0, 10)) console.log(`  + ${n.scenario}`);
    console.log(`  → run with --update-baseline to add them.`);
  }
  if (missingScenarios.length > 0) {
    console.log(`\n[perf-regression-check] WARNING: ${missingScenarios.length} baseline scenario(s) not in current results:`);
    for (const m of missingScenarios.slice(0, 10)) console.log(`  - ${m}`);
  }
  if (regressions.length > 0) {
    console.log(`\n[perf-regression-check] ${regressions.length} REGRESSION(s) detected:`);
    for (const r of regressions) {
      console.log(
        `  ✗ ${r.scenario} / ${r.platform} / ${r.axis}: ${r.baseline} → ${r.current} (${fmtPct(r.pct)}, threshold +${r.threshold}%)`,
      );
    }
    console.log(`\n[perf-regression-check] FAIL: regression threshold exceeded.`);
    process.exit(1);
  }

  console.log(`\n[perf-regression-check] PASS — no regression beyond threshold.`);
}

main();
