#!/usr/bin/env node
/**
 * benchmarks/scenarios/09-mcp-throughput/runner.mjs
 *
 * Measures MCP server throughput (rps) and latency percentiles via:
 *   1. 50 parallel fan-out requests (burst)
 *   2. 200 sequential steady-state requests
 *
 * Uses GET <target>/health as the probe endpoint (no auth required).
 * Bearer auth is passed if HOLOSCRIPT_API_KEY is set.
 *
 * Output JSON:
 *   {
 *     "scenario": "09-mcp-throughput",
 *     "results": [
 *       {
 *         "platform": "mcp-prod",
 *         "rps": 87.4,
 *         "p50LatencyMs": 8.2,
 *         "p95LatencyMs": 22.1,
 *         "p99LatencyMs": 45.3,
 *         "success": true
 *       }
 *     ],
 *     "summary": { "rps": 87.4, "totalRequests": 250, "failedRequests": 0 }
 *   }
 *
 * rps: higher-is-better (8% regression threshold)
 * p95LatencyMs: lower-is-better (10% regression threshold)
 *
 * Usage:
 *   node benchmarks/scenarios/09-mcp-throughput/runner.mjs
 *
 * Environment:
 *   HOLO_MCP_THROUGHPUT_TARGET — base URL (default: https://mcp.holoscript.net)
 *   HOLOSCRIPT_API_KEY         — Bearer token for authenticated endpoints
 *   HOLO_PERF_REGRESSION_REPO_ROOT — override repo root (used in tests)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(
  process.env.HOLO_PERF_REGRESSION_REPO_ROOT || resolve(__dirname, "..", "..", ".."),
);

const SCENARIO_ID = "09-mcp-throughput";
const PLATFORM = "mcp-prod";
const PARALLEL_REQUESTS = 50;
const SEQUENTIAL_REQUESTS = 200;
const REQUEST_TIMEOUT_MS = 10_000;

const BASE_URL = (
  process.env.HOLO_MCP_THROUGHPUT_TARGET || "https://mcp.holoscript.net"
).replace(/\/$/, "");
const API_KEY = process.env.HOLOSCRIPT_API_KEY || "";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function probeOnce(url, headers) {
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(url, { headers }, REQUEST_TIMEOUT_MS);
    const latency = performance.now() - t0;
    return { ok: res.ok || res.status < 500, latency };
  } catch {
    return { ok: false, latency: performance.now() - t0 };
  }
}

async function main() {
  const probeUrl = `${BASE_URL}/health`;
  const headers = {};
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  console.log(`[09-mcp-throughput] target=${probeUrl} parallel=${PARALLEL_REQUESTS} sequential=${SEQUENTIAL_REQUESTS}`);

  const allLatencies = [];
  let failed = 0;
  let success = false;

  try {
    // Phase 1: warm-up single request
    const warm = await probeOnce(probeUrl, headers);
    if (!warm.ok) {
      console.warn(`[09-mcp-throughput] target unreachable (${probeUrl}) — skipping benchmark, recording success:false`);
    } else {
      // Phase 2: 50 parallel fan-out
      console.log(`[09-mcp-throughput] phase-1: ${PARALLEL_REQUESTS} parallel requests`);
      const parallelT0 = performance.now();
      const parallelResults = await Promise.all(
        Array.from({ length: PARALLEL_REQUESTS }, () => probeOnce(probeUrl, headers)),
      );
      const parallelDurationMs = performance.now() - parallelT0;
      console.log(`[09-mcp-throughput] parallel done in ${parallelDurationMs.toFixed(1)}ms`);

      for (const r of parallelResults) {
        allLatencies.push(r.latency);
        if (!r.ok) failed++;
      }

      // Phase 3: 200 sequential steady-state
      console.log(`[09-mcp-throughput] phase-2: ${SEQUENTIAL_REQUESTS} sequential requests`);
      const seqT0 = performance.now();
      for (let i = 0; i < SEQUENTIAL_REQUESTS; i++) {
        const r = await probeOnce(probeUrl, headers);
        allLatencies.push(r.latency);
        if (!r.ok) failed++;
      }
      const seqDurationMs = performance.now() - seqT0;
      console.log(`[09-mcp-throughput] sequential done in ${seqDurationMs.toFixed(1)}ms`);

      // RPS: total successful requests / total elapsed wall-clock time in seconds
      const totalRequests = PARALLEL_REQUESTS + SEQUENTIAL_REQUESTS;
      const totalSuccessful = totalRequests - failed;
      const totalWallMs = parallelDurationMs + seqDurationMs;
      const rps = parseFloat(((totalSuccessful / totalWallMs) * 1000).toFixed(2));

      const sortedLatencies = [...allLatencies].sort((a, b) => a - b);
      const p50 = parseFloat(percentile(sortedLatencies, 50).toFixed(2));
      const p95 = parseFloat(percentile(sortedLatencies, 95).toFixed(2));
      const p99 = parseFloat(percentile(sortedLatencies, 99).toFixed(2));

      success = totalSuccessful > 0;
      const result = {
        platform: PLATFORM,
        rps,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        p99LatencyMs: p99,
        success,
      };

      console.log(
        `[09-mcp-throughput] rps=${rps} p50=${p50}ms p95=${p95}ms p99=${p99}ms failed=${failed}/${totalRequests}`,
      );

      const output = {
        scenario: SCENARIO_ID,
        results: [result],
        summary: { rps, totalRequests, failedRequests: failed },
      };

      const date = todayIso();
      const outDir = join(REPO_ROOT, "benchmarks", "results", date);
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, `${SCENARIO_ID}.json`);
      writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
      console.log(`[09-mcp-throughput] wrote results → ${outPath}`);
      return;
    }
  } catch (err) {
    console.warn(`[09-mcp-throughput] unexpected error: ${err.message}`);
  }

  // Record failure case
  const result = {
    platform: PLATFORM,
    rps: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    success: false,
  };
  console.warn("[09-mcp-throughput] recording success:false — set HOLO_MCP_THROUGHPUT_TARGET to an accessible MCP server.");

  const output = {
    scenario: SCENARIO_ID,
    results: [result],
    summary: { rps: 0, totalRequests: 0, failedRequests: 0 },
  };

  const date = todayIso();
  const outDir = join(REPO_ROOT, "benchmarks", "results", date);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${SCENARIO_ID}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`[09-mcp-throughput] wrote results → ${outPath}`);
}

main().catch((err) => {
  console.error("[09-mcp-throughput] fatal:", err);
  process.exit(2);
});
