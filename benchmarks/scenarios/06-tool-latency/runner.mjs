#!/usr/bin/env node
/**
 * benchmarks/scenarios/06-tool-latency/runner.mjs
 *
 * Measures end-to-end round-trip latency for four representative
 * holo_* MCP tool calls. Outputs a JSON result file compatible with
 * scripts/perf-regression-check.mjs:
 *
 *   {
 *     "scenario": "06-tool-latency",
 *     "results": [
 *       { "platform": "holo_query_codebase", "latencyMs": 320, "outputSizeBytes": 4096, "success": true },
 *       ...
 *     ],
 *     "summary": { "avgLatencyMs": 290, "failedTools": 0 }
 *   }
 *
 * Usage:
 *   node benchmarks/scenarios/06-tool-latency/runner.mjs
 *   HOLO_TOOL_LATENCY_TARGET=http://localhost:3001 node runner.mjs
 *
 * Environment variables:
 *   HOLO_TOOL_LATENCY_TARGET  — base URL override (default: https://mcp.holoscript.net)
 *   HOLOSCRIPT_API_KEY        — bearer token for mcp.holoscript.net
 *   HOLO_PERF_REGRESSION_REPO_ROOT — override for repo root (used in tests)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(
  process.env.HOLO_PERF_REGRESSION_REPO_ROOT || resolve(__dirname, "..", "..", ".."),
);

const TARGET_BASE =
  (process.env.HOLO_TOOL_LATENCY_TARGET || "https://mcp.holoscript.net").replace(/\/$/, "");
const API_KEY = process.env.HOLOSCRIPT_API_KEY || "";
const SCENARIO_ID = "06-tool-latency";
const SAMPLES_PER_TOOL = 3;
const TIMEOUT_MS = 30_000;

/** Minimal representative arguments per tool. Kept small to avoid cache-busting. */
const TOOL_CALLS = [
  {
    platform: "holo_query_codebase",
    body: { name: "holo_query_codebase", arguments: { query: "HoloScriptParser" } },
  },
  {
    platform: "holo_impact_analysis",
    body: {
      name: "holo_impact_analysis",
      arguments: { symbol: "HoloScriptParser", file: "packages/core/src/parser/index.ts" },
    },
  },
  {
    platform: "holo_ask_codebase",
    body: { name: "holo_ask_codebase", arguments: { question: "What is HoloScriptParser?" } },
  },
  {
    platform: "holo_semantic_search",
    body: { name: "holo_semantic_search", arguments: { query: "trait grab physics" } },
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Call a tool endpoint once and return { latencyMs, outputSizeBytes, success }.
 * Never throws — failures are recorded as success:false.
 */
async function callTool(toolBody) {
  const url = `${TARGET_BASE}/tools/call`;
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(toolBody),
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    const text = await response.text();
    const outputSizeBytes = Buffer.byteLength(text, "utf-8");
    if (!response.ok) {
      console.warn(`  [warn] ${toolBody.name}: HTTP ${response.status} (${latencyMs} ms)`);
      return { latencyMs, outputSizeBytes, success: false };
    }
    return { latencyMs, outputSizeBytes, success: true };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const label = err.name === "AbortError" ? "timeout" : err.message;
    console.warn(`  [warn] ${toolBody.name}: ${label} (${latencyMs} ms)`);
    return { latencyMs: TIMEOUT_MS, outputSizeBytes: 0, success: false };
  } finally {
    clearTimeout(timeout);
  }
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  console.log(`[06-tool-latency] target: ${TARGET_BASE}`);
  console.log(`[06-tool-latency] samples per tool: ${SAMPLES_PER_TOOL}`);

  const results = [];

  for (const { platform, body } of TOOL_CALLS) {
    console.log(`  running ${platform}...`);
    const samples = [];
    for (let i = 0; i < SAMPLES_PER_TOOL; i++) {
      const r = await callTool(body);
      samples.push(r);
    }

    // Use median of successful samples; if all failed use median of all
    const successful = samples.filter((s) => s.success);
    const source = successful.length > 0 ? successful : samples;
    const latencyMs = median(source.map((s) => s.latencyMs));
    const outputSizeBytes = median(source.map((s) => s.outputSizeBytes));
    const success = successful.length > 0;

    console.log(`    latencyMs=${latencyMs} outputSizeBytes=${outputSizeBytes} success=${success}`);
    results.push({ platform, latencyMs, outputSizeBytes, success });
  }

  const successfulResults = results.filter((r) => r.success);
  const avgLatencyMs =
    successfulResults.length > 0
      ? Math.round(successfulResults.reduce((s, r) => s + r.latencyMs, 0) / successfulResults.length)
      : 0;
  const failedTools = results.filter((r) => !r.success).length;

  const output = {
    scenario: SCENARIO_ID,
    results,
    summary: { avgLatencyMs, failedTools },
  };

  const date = todayIso();
  const outDir = join(REPO_ROOT, "benchmarks", "results", date);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${SCENARIO_ID}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(`[06-tool-latency] wrote results → ${outPath}`);
  console.log(`[06-tool-latency] summary: avgLatencyMs=${avgLatencyMs} failedTools=${failedTools}/${results.length}`);

  if (failedTools === results.length) {
    console.warn(
      "[06-tool-latency] all tools failed — likely missing auth or offline target. " +
        "Results recorded as success:false; perf-regression-check will skip this scenario " +
        "if no baseline entry exists.",
    );
  }
}

main().catch((err) => {
  console.error("[06-tool-latency] fatal:", err);
  process.exit(2);
});
