/**
 * benchmark-harness.ts — Parse/Compile Performance Benchmarking
 *
 * Measures and compares WASM vs TypeScript fallback performance for:
 *   - Cold initialization time
 *   - Hot parse latency
 *   - Hot compile latency
 *   - Memory usage (approximate)
 *
 * Results are compared against the platform budgets defined in
 * platform-detect.ts (30ms parse, 300ms compile targets).
 *
 * Usage:
 *   import { runBenchmark } from '@/lib/benchmark-harness';
 *   const results = await runBenchmark();
 *   console.table(results.summary);
 *
 * @see ADAPTIVE_PLATFORM_LAYERS.md §5 Performance Requirements
 */

import { CompilerBridge, resetCompilerBridge } from './wasm-compiler-bridge';
import { checkBudget, type _PerformanceBudget } from './platform-detect';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface BenchmarkTimings {
  /** Cold initialization time (ms) */
  initMs: number;
  /** Average parse time (ms) over N iterations */
  parseMs: number;
  /** Average compile time (ms) over N iterations */
  compileMs: number;
  /** Min parse time (ms) */
  parseMinMs: number;
  /** Max parse time (ms) */
  parseMaxMs: number;
  /** Min compile time (ms) */
  compileMinMs: number;
  /** Max compile time (ms) */
  compileMaxMs: number;
  /** P95 parse time (ms) */
  parseP95Ms: number;
  /** P95 compile time (ms) */
  compileP95Ms: number;
}

export interface BenchmarkResult {
  /** Backend tested ('wasm-component' | 'typescript-fallback') */
  backend: string;
  /** Number of iterations */
  iterations: number;
  /** Test source code length (chars) */
  sourceLength: number;
  /** Timing results */
  timings: BenchmarkTimings;
  /** Budget check result */
  budgetCheck: { withinBudget: boolean; violations: string[] };
  /** Timestamp of benchmark run */
  timestamp: string;
}

export interface BenchmarkComparison {
  /** WASM results (null if WASM not available) */
  wasm: BenchmarkResult | null;
  /** TypeScript fallback results */
  typescript: BenchmarkResult;
  /** Speedup factor (WASM/TS): > 1 means WASM is faster */
  speedup: {
    parse: number;
    compile: number;
    init: number;
  } | null;
  /** Summary table for console.table() */
  summary: Array<Record<string, string | number>>;
}

export interface BenchmarkOptions {
  /** Number of parse/compile iterations (default: 50) */
  iterations?: number;
  /** HoloScript source to benchmark (default: built-in sample) */
  source?: string;
  /** Platform for budget check (default: 'browser') */
  platform?: string;
  /** Whether to test WASM backend (default: true) */
  testWasm?: boolean;
  /** WASM URL override */
  wasmUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Default Test Source
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_SOURCE = `composition "BenchmarkScene" {
  environment {
    skybox: "nebula"
    ambient_light: 0.4
    fog: { color: "#1a1a2e", near: 10, far: 100 }
  }

  template "InteractiveOrb" {
    @grabbable
    @collidable
    @glowing
    @physics
    geometry: "sphere"
    color: "#00ffff"

    state {
      health: 100
      power: 50
      active: true
    }

    physics: {
      type: "dynamic"
      mass: 1.0
      restitution: 0.7
      friction: 0.3
    }

    animation bounce {
      property: "position.y"
      from: 1
      to: 2.5
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }

    onGrab: {
      haptic.feedback("medium")
      this.color = "#ff00ff"
    }

    onRelease: {
      this.color = "#00ffff"
    }
  }

  template "Platform" {
    @collidable
    geometry: "cube"
    color: "#333366"
    physics: {
      type: "static"
    }
  }

  template "NPC" {
    @npc
    @pathfinding
    @talkable
    geometry: "humanoid"
    color: "#ffaa00"

    state {
      dialogue: "Hello, traveler!"
      mood: "friendly"
    }
  }

  spatial_group "Arena" {
    object "Orb_1" using "InteractiveOrb" {
      position: [0, 1.5, -2]
    }
    object "Orb_2" using "InteractiveOrb" {
      position: [3, 1.5, -2]
    }
    object "Orb_3" using "InteractiveOrb" {
      position: [-3, 1.5, -2]
    }
    object "Floor" using "Platform" {
      position: [0, -0.5, 0]
      scale: [20, 1, 20]
    }
    object "Guard" using "NPC" {
      position: [5, 0, 0]
    }
  }

  logic {
    on_player_enter("Arena") {
      audio.play("welcome.mp3")
    }
  }
}`;

// ═══════════════════════════════════════════════════════════════════
// Benchmark Runner
// ═══════════════════════════════════════════════════════════════════

/**
 * Run a single backend benchmark (parse + compile N iterations).
 */
async function benchmarkBackend(
  bridge: CompilerBridge,
  source: string,
  iterations: number,
  platform: string
): Promise<BenchmarkResult> {
  const backend = bridge.getStatus().backend;

  // ── Cold init is already done (measured externally) ─────────
  const initMs = bridge.getStatus().loadTimeMs;

  // ── Hot parse benchmark ────────────────────────────────────
  const parseTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await bridge.parse(source);
    parseTimes.push(performance.now() - start);
  }

  // ── Hot compile benchmark ──────────────────────────────────
  const compileTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await bridge.compile(source, 'threejs');
    compileTimes.push(performance.now() - start);
  }

  // ── Statistics ─────────────────────────────────────────────
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const p95 = (arr: number[]) => {
    const s = sorted(arr);
    return s[Math.ceil(s.length * 0.95) - 1] ?? 0;
  };

  const timings: BenchmarkTimings = {
    initMs,
    parseMs: avg(parseTimes),
    compileMs: avg(compileTimes),
    parseMinMs: Math.min(...parseTimes),
    parseMaxMs: Math.max(...parseTimes),
    compileMinMs: Math.min(...compileTimes),
    compileMaxMs: Math.max(...compileTimes),
    parseP95Ms: p95(parseTimes),
    compileP95Ms: p95(compileTimes),
  };

  const budgetCheck = checkBudget(platform, {
    maxInitTimeMs: timings.initMs,
    maxParseTimeMs: timings.parseP95Ms,
    maxCompileTimeMs: timings.compileP95Ms,
  });

  return {
    backend,
    iterations,
    sourceLength: source.length,
    timings,
    budgetCheck,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run the full benchmark suite comparing WASM and TypeScript backends.
 *
 * @param options - Benchmark configuration
 * @returns Comparison of both backends with speedup factors
 */
export async function runBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkComparison> {
  const {
    iterations = 50,
    source = DEFAULT_SOURCE,
    platform = 'browser',
    testWasm = true,
    wasmUrl = '/wasm/holoscript.js',
  } = options;

  // ── TypeScript fallback benchmark ──────────────────────────
  const tsBridge = new CompilerBridge();
  // Don't init — stay in TS fallback mode
  const tsInitStart = performance.now();
  // Warm up the dynamic import
  await tsBridge.parse('');
  const tsInitMs = performance.now() - tsInitStart;

  const tsResult = await benchmarkBackend(tsBridge, source, iterations, platform);
  tsResult.timings.initMs = tsInitMs;
  tsBridge.destroy();

  // ── WASM benchmark (if requested) ─────────────────────────
  let wasmResult: BenchmarkResult | null = null;

  if (testWasm) {
    try {
      const wasmBridge = new CompilerBridge();
      const wasmInitStart = performance.now();
      const status = await wasmBridge.init(wasmUrl);
      const wasmInitMs = performance.now() - wasmInitStart;

      if (status.wasmLoaded) {
        wasmResult = await benchmarkBackend(wasmBridge, source, iterations, platform);
        wasmResult.timings.initMs = wasmInitMs;
      }
      wasmBridge.destroy();
    } catch {
      // WASM not available — skip
    }
  }

  // ── Compute speedup ───────────────────────────────────────
  let speedup: BenchmarkComparison['speedup'] = null;
  if (wasmResult) {
    speedup = {
      parse: tsResult.timings.parseMs / wasmResult.timings.parseMs,
      compile: tsResult.timings.compileMs / wasmResult.timings.compileMs,
      init: tsResult.timings.initMs / wasmResult.timings.initMs,
    };
  }

  // ── Summary table ──────────────────────────────────────────
  const summary: Array<Record<string, string | number>> = [
    {
      Metric: 'Init (ms)',
      TypeScript: round(tsResult.timings.initMs),
      ...(wasmResult ? { WASM: round(wasmResult.timings.initMs) } : {}),
      ...(speedup ? { Speedup: `${round(speedup.init)}x` } : {}),
    },
    {
      Metric: 'Parse avg (ms)',
      TypeScript: round(tsResult.timings.parseMs),
      ...(wasmResult ? { WASM: round(wasmResult.timings.parseMs) } : {}),
      ...(speedup ? { Speedup: `${round(speedup.parse)}x` } : {}),
    },
    {
      Metric: 'Parse P95 (ms)',
      TypeScript: round(tsResult.timings.parseP95Ms),
      ...(wasmResult ? { WASM: round(wasmResult.timings.parseP95Ms) } : {}),
    },
    {
      Metric: 'Compile avg (ms)',
      TypeScript: round(tsResult.timings.compileMs),
      ...(wasmResult ? { WASM: round(wasmResult.timings.compileMs) } : {}),
      ...(speedup ? { Speedup: `${round(speedup.compile)}x` } : {}),
    },
    {
      Metric: 'Compile P95 (ms)',
      TypeScript: round(tsResult.timings.compileP95Ms),
      ...(wasmResult ? { WASM: round(wasmResult.timings.compileP95Ms) } : {}),
    },
    {
      Metric: 'Source size (chars)',
      TypeScript: tsResult.sourceLength,
      ...(wasmResult ? { WASM: wasmResult.sourceLength } : {}),
    },
    {
      Metric: 'Iterations',
      TypeScript: tsResult.iterations,
      ...(wasmResult ? { WASM: wasmResult.iterations } : {}),
    },
    {
      Metric: 'Budget OK?',
      TypeScript: tsResult.budgetCheck.withinBudget
        ? '✓'
        : `✗ (${tsResult.budgetCheck.violations.length} violations)`,
      ...(wasmResult
        ? {
            WASM: wasmResult.budgetCheck.withinBudget
              ? '✓'
              : `✗ (${wasmResult.budgetCheck.violations.length} violations)`,
          }
        : {}),
    },
  ];

  resetCompilerBridge();

  return {
    wasm: wasmResult,
    typescript: tsResult,
    speedup,
    summary,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// Quick Benchmark (for CI / smoke tests)
// ═══════════════════════════════════════════════════════════════════

/**
 * Run a quick 10-iteration benchmark (for CI).
 * Returns true if within budget, false otherwise.
 */
export async function quickBenchmark(platform = 'browser'): Promise<{
  passed: boolean;
  violations: string[];
  parseAvgMs: number;
  compileAvgMs: number;
}> {
  const result = await runBenchmark({
    iterations: 10,
    testWasm: false, // CI may not have WASM
    platform,
  });

  return {
    passed: result.typescript.budgetCheck.withinBudget,
    violations: result.typescript.budgetCheck.violations,
    parseAvgMs: result.typescript.timings.parseMs,
    compileAvgMs: result.typescript.timings.compileMs,
  };
}
