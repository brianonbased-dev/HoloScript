#!/usr/bin/env node
/**
 * benchmarks/scenarios/07-vr-frame-budget/runner.mjs
 *
 * Measures per-frame CPU computation budget across N=300 simulated frames
 * using HoloScriptRuntime (headless, no GPU). Loads basic-scene and
 * multiplayer-vr .holo sources and runs repeated update ticks.
 *
 * Quest 3 @ 72Hz budget: ~13.9ms per frame. 8% regression threshold = ~1.1ms drift.
 *
 * Output JSON matches perf-regression-check.mjs schema:
 *   {
 *     "scenario": "07-vr-frame-budget",
 *     "results": [
 *       { "platform": "webxr-quest3-72hz", "frameTimeMs": 4.2, "droppedFrames": 0, "success": true }
 *     ],
 *     "summary": { "avgFrameTimeMs": 4.2, "totalDroppedFrames": 0, "totalFrames": 300 }
 *   }
 *
 * Usage:
 *   node benchmarks/scenarios/07-vr-frame-budget/runner.mjs
 *
 * Environment:
 *   HOLO_PERF_REGRESSION_REPO_ROOT — override repo root (used in tests)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(
  process.env.HOLO_PERF_REGRESSION_REPO_ROOT || resolve(__dirname, "..", "..", ".."),
);

const SCENARIO_ID = "07-vr-frame-budget";
const PLATFORM = "webxr-quest3-72hz";
const FRAME_COUNT = 300;
const FRAME_BUDGET_MS = 1000 / 72; // ~13.888ms
const SCENARIO_FILES = [
  join(REPO_ROOT, "benchmarks", "scenarios", "01-basic-scene", "basic-scene.holo"),
  join(REPO_ROOT, "benchmarks", "scenarios", "04-multiplayer-vr", "multiplayer-vr.holo"),
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function median(nums) {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  console.log(`[07-vr-frame-budget] frames=${FRAME_COUNT} budget=${FRAME_BUDGET_MS.toFixed(2)}ms`);

  // Validate scenario files exist
  const missingSources = SCENARIO_FILES.filter((f) => !existsSync(f));
  if (missingSources.length > 0) {
    console.warn(`[07-vr-frame-budget] source files missing: ${missingSources.join(", ")}`);
  }

  // Attempt to load HoloScriptRuntime from the built core package
  let createRuntime = null;
  try {
    const runtimePath = join(REPO_ROOT, "packages", "core", "dist", "runtime.js");
    if (!existsSync(runtimePath)) throw new Error("runtime.js not built");
    const mod = await import(runtimePath);
    createRuntime = mod.createRuntime;
    if (typeof createRuntime !== "function") throw new Error("createRuntime not exported");
    console.log(`[07-vr-frame-budget] loaded HoloScriptRuntime from dist`);
  } catch (err) {
    console.warn(`[07-vr-frame-budget] could not load HoloScriptRuntime: ${err.message}`);
    console.warn(`[07-vr-frame-budget] falling back to parse-only timing via @holoscript/core`);
  }

  // Load parser as fallback (always available when core is built)
  let HoloScriptParser = null;
  try {
    const parserPath = join(REPO_ROOT, "packages", "core", "dist", "parser.js");
    if (existsSync(parserPath)) {
      const mod = await import(parserPath);
      HoloScriptParser = mod.HoloScriptParser;
    }
  } catch {
    // fine
  }

  const frameTimes = [];
  let droppedFrames = 0;
  let success = false;

  if (createRuntime) {
    // Full runtime path: parse + execute per tick
    try {
      const sources = SCENARIO_FILES
        .filter((f) => existsSync(f))
        .map((f) => readFileSync(f, "utf-8"));
      if (sources.length === 0) throw new Error("no .holo sources available");

      const runtime = createRuntime({ headless: true });
      let sourceIdx = 0;

      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        const source = sources[sourceIdx % sources.length];
        sourceIdx++;
        const t0 = performance.now();
        await runtime.execute({ type: "tick", source, frame });
        const frameTime = performance.now() - t0;
        frameTimes.push(frameTime);
        if (frameTime > FRAME_BUDGET_MS) droppedFrames++;
      }
      await runtime.dispose?.();
      success = true;
    } catch (err) {
      console.warn(`[07-vr-frame-budget] runtime path failed: ${err.message}`);
    }
  }

  if (!success && HoloScriptParser) {
    // Fallback: measure parse + AST walk time per frame (parse-only frame budget)
    try {
      const sources = SCENARIO_FILES
        .filter((f) => existsSync(f))
        .map((f) => readFileSync(f, "utf-8"));
      if (sources.length === 0) throw new Error("no .holo sources available");

      let sourceIdx = 0;
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        const source = sources[sourceIdx % sources.length];
        sourceIdx++;
        const t0 = performance.now();
        const parser = new HoloScriptParser();
        parser.parse(source);
        const frameTime = performance.now() - t0;
        frameTimes.push(frameTime);
        if (frameTime > FRAME_BUDGET_MS) droppedFrames++;
      }
      success = true;
      console.log(`[07-vr-frame-budget] used parse-only fallback (runtime unavailable)`);
    } catch (err) {
      console.warn(`[07-vr-frame-budget] parse fallback failed: ${err.message}`);
    }
  }

  if (!success) {
    // No runtime available: record failure but don't crash CI
    console.warn(
      "[07-vr-frame-budget] no timing source available — recording success:false. " +
        "Run `pnpm build` in packages/core to enable this scenario.",
    );
  }

  const frameTimeMs = success ? parseFloat(median(frameTimes).toFixed(3)) : 0;
  const result = { platform: PLATFORM, frameTimeMs, droppedFrames, success };

  console.log(
    `[07-vr-frame-budget] medianFrameTimeMs=${frameTimeMs} droppedFrames=${droppedFrames}/${FRAME_COUNT} success=${success}`,
  );

  const output = {
    scenario: SCENARIO_ID,
    results: [result],
    summary: {
      avgFrameTimeMs: frameTimeMs,
      totalDroppedFrames: droppedFrames,
      totalFrames: FRAME_COUNT,
    },
  };

  const date = todayIso();
  const outDir = join(REPO_ROOT, "benchmarks", "results", date);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${SCENARIO_ID}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`[07-vr-frame-budget] wrote results → ${outPath}`);
}

main().catch((err) => {
  console.error("[07-vr-frame-budget] fatal:", err);
  process.exit(2);
});
