#!/usr/bin/env node
/**
 * benchmarks/scenarios/08-wasm-parser-throughput/runner.mjs
 *
 * Measures the HoloScript WASM compiler parser throughput in MB/sec.
 * Loads N=10 representative .holo source strings from 1KB to ~100KB and
 * calls parse() on each, accumulating total bytes / total parse seconds.
 *
 * Output JSON:
 *   {
 *     "scenario": "08-wasm-parser-throughput",
 *     "results": [
 *       { "platform": "wasm-rust", "mbPerSec": 42.3, "parseTimeMs": 23.6, "success": true }
 *     ],
 *     "summary": { "mbPerSec": 42.3, "totalBytesKB": 550, "totalParseTimeMs": 23.6 }
 *   }
 *
 * IMPORTANT: mbPerSec is comparator: "higher-is-better".
 *
 * Usage:
 *   node benchmarks/scenarios/08-wasm-parser-throughput/runner.mjs
 *
 * Environment:
 *   HOLO_PERF_REGRESSION_REPO_ROOT — override repo root (used in tests)
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(
  process.env.HOLO_PERF_REGRESSION_REPO_ROOT || resolve(__dirname, "..", "..", ".."),
);

const SCENARIO_ID = "08-wasm-parser-throughput";
const PLATFORM = "wasm-rust";

/**
 * Generate .holo source strings of varying sizes.
 * We produce 10 synthetic sources so the runner is self-contained even
 * when fixture .holo files are unavailable.
 */
function generateSources() {
  const sources = [];

  // Sizes (bytes): [1KB, 2KB, 4KB, 8KB, 16KB, 24KB, 32KB, 50KB, 75KB, 100KB]
  const targetSizes = [1024, 2048, 4096, 8192, 16384, 24576, 32768, 51200, 76800, 102400];

  const baseObj = `  object "Entity_{i}" using "BaseTemplate" {\n    position: [{x}, {y}, {z}]\n    state { active: true, health: 100 }\n  }\n`;
  const baseTemplate = `template "BaseTemplate" {\n  geometry: "cube"\n  color: "#4a90e2"\n  physics: { mass: 1.0, restitution: 0.3 }\n}\n\n`;
  const header = `composition "BenchmarkScene_{n}" {\n  environment { skybox: "space", ambient_light: 0.4 }\n\n`;
  const footer = `}\n`;

  let i = 0;
  for (const targetSize of targetSizes) {
    let src = header.replace("{n}", i) + baseTemplate;
    let entityIdx = 0;
    while (src.length + footer.length < targetSize) {
      const entry = baseObj
        .replace("{i}", entityIdx)
        .replace("{x}", (entityIdx * 2).toFixed(1))
        .replace("{y}", "0.0")
        .replace("{z}", (entityIdx * -1.5).toFixed(1));
      src += entry;
      entityIdx++;
    }
    src += footer;
    sources.push(src);
    i++;
  }

  // Also try to pick up any .holo files from the benchmarks/scenarios directory
  const scenariosDir = join(REPO_ROOT, "benchmarks", "scenarios");
  try {
    const scenarioDirs = readdirSync(scenariosDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(scenariosDir, d.name));
    for (const dir of scenarioDirs) {
      try {
        const files = readdirSync(dir).filter((f) => f.endsWith(".holo"));
        for (const f of files) {
          const content = readFileSync(join(dir, f), "utf-8");
          if (content.length >= 128) sources.push(content);
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // scenariosDir not accessible
  }

  return sources;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  console.log(`[08-wasm-parser-throughput] loading WASM compiler`);

  const wasmPath = join(REPO_ROOT, "packages", "compiler-wasm", "pkg-node", "holoscript_wasm.js");

  let wasmMod = null;
  try {
    if (!existsSync(wasmPath)) throw new Error("pkg-node/holoscript_wasm.js not found — run wasm-pack in packages/compiler-wasm");
    wasmMod = await import(wasmPath);
    if (typeof wasmMod.init === "function") {
      wasmMod.init();
    }
    if (typeof wasmMod.parse !== "function") throw new Error("parse() not exported from WASM module");
    // Warm up
    wasmMod.parse(`composition "warmup" {}`);
    console.log(`[08-wasm-parser-throughput] WASM loaded, version=${wasmMod.version?.() ?? "unknown"}`);
  } catch (err) {
    console.warn(`[08-wasm-parser-throughput] WASM unavailable: ${err.message}`);
    wasmMod = null;
  }

  const sources = generateSources();
  console.log(`[08-wasm-parser-throughput] sources=${sources.length} total=${(sources.reduce((s, x) => s + x.length, 0) / 1024).toFixed(1)}KB`);

  let success = false;
  let mbPerSec = 0;
  let parseTimeMs = 0;
  let totalBytes = 0;

  if (wasmMod) {
    try {
      const times = [];
      let bytes = 0;

      for (const src of sources) {
        const t0 = performance.now();
        wasmMod.parse(src);
        const elapsed = performance.now() - t0;
        times.push(elapsed);
        bytes += src.length;
      }

      totalBytes = bytes;
      parseTimeMs = parseFloat(times.reduce((a, b) => a + b, 0).toFixed(3));
      const totalSec = parseTimeMs / 1000;
      const totalMB = totalBytes / (1024 * 1024);
      mbPerSec = parseFloat((totalMB / totalSec).toFixed(3));
      success = true;
    } catch (err) {
      console.warn(`[08-wasm-parser-throughput] parse loop failed: ${err.message}`);
    }
  }

  if (!success) {
    console.warn(
      "[08-wasm-parser-throughput] recording success:false. " +
        "Run `wasm-pack build --target nodejs` in packages/compiler-wasm to enable.",
    );
  }

  const result = { platform: PLATFORM, mbPerSec, parseTimeMs, success };
  console.log(
    `[08-wasm-parser-throughput] mbPerSec=${mbPerSec} parseTimeMs=${parseTimeMs} success=${success}`,
  );

  const output = {
    scenario: SCENARIO_ID,
    results: [result],
    summary: {
      mbPerSec,
      totalBytesKB: parseFloat((totalBytes / 1024).toFixed(1)),
      totalParseTimeMs: parseTimeMs,
    },
  };

  const date = todayIso();
  const outDir = join(REPO_ROOT, "benchmarks", "results", date);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${SCENARIO_ID}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`[08-wasm-parser-throughput] wrote results → ${outPath}`);
}

main().catch((err) => {
  console.error("[08-wasm-parser-throughput] fatal:", err);
  process.exit(2);
});
