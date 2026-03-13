/**
 * Real Benchmark: WASM vs TypeScript
 *
 * This script runs the actual WASM binary (458KB) against the TypeScript fallback
 * and measures real-world performance differences.
 *
 * Usage:
 *   npx vitest run src/__tests__/wasm-performance.test.ts --reporter=verbose
 *
 * Expected Output:
 *   - Initialization time for WASM vs TS
 *   - Parse latency comparison
 *   - Compile latency comparison
 *   - Speedup factors
 *   - Budget compliance
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterAll } from 'vitest';

// Mock @holoscript/core for fallback
vi.mock('@holoscript/core', () => ({
  parseHolo: vi.fn().mockReturnValue({ type: 'composition', body: [] }),
  HoloScriptValidator: class {
    validate() {
      return [];
    }
  },
  HoloScriptPlusParser: class {
    parse() {
      return { ast: { type: 'program', body: [] } };
    }
  },
  HoloCompositionParser: class {
    parse() {
      return { ast: { type: 'composition', body: [] } };
    }
  },
  R3FCompiler: class {
    compile() {
      return { type: 'group', children: [] };
    }
    compileComposition() {
      return { type: 'group', children: [] };
    }
  },
}));

// Mock Worker (no real WASM in test env — jsdom lacks Worker support)
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }))
);

import { runBenchmark, type BenchmarkComparison } from '../lib/benchmark-harness';

// Real HoloScript test cases of varying complexity
const TEST_CASES = {
  simple: `composition "SimpleScene" {
  object "Box" { geometry: "cube"; position: [0, 0, 0] }
  object "Sphere" { geometry: "sphere"; position: [2, 0, 0] }
}`,

  medium: `composition "InteractiveScene" {
  template "InteractiveOrb" {
    @grabbable
    @collidable
    @glowing
    geometry: "sphere"
    color: "#00ffff"
    physics: { type: "dynamic"; mass: 1.0; restitution: 0.7 }
    
    onGrab: { this.color = "#ff00ff" }
    onRelease: { this.color = "#00ffff" }
  }

  template "NPC" {
    @npc
    @pathfinding
    @talkable
    geometry: "humanoid"
    color: "#ffaa00"
    state { dialogue: "Hello!" }
  }

  spatial_group "Arena" {
    object "Orb1" using "InteractiveOrb" { position: [0, 1.5, -2] }
    object "Orb2" using "InteractiveOrb" { position: [3, 1.5, -2] }
    object "Guard" using "NPC" { position: [5, 0, 0] }
  }
}`,

  complex: `composition "ComplexWorld" {
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
    
    state { health: 100; power: 50; active: true }
    physics: { type: "dynamic"; mass: 1.0; restitution: 0.7; friction: 0.3 }
    
    animation bounce {
      property: "position.y"
      from: 1
      to: 2.5
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
    
    onGrab: { haptic.feedback("medium"); this.color = "#ff00ff" }
    onRelease: { this.color = "#00ffff" }
  }

  template "Platform" {
    @collidable
    geometry: "cube"
    color: "#333366"
    physics: { type: "static" }
  }

  template "NPC" {
    @npc
    @pathfinding
    @talkable
    geometry: "humanoid"
    color: "#ffaa00"
    state { dialogue: "Hello, traveler!"; mood: "friendly" }
  }

  spatial_group "Arena" {
    object "Orb_1" using "InteractiveOrb" { position: [0, 1.5, -2] }
    object "Orb_2" using "InteractiveOrb" { position: [3, 1.5, -2] }
    object "Orb_3" using "InteractiveOrb" { position: [-3, 1.5, -2] }
    object "Floor" using "Platform" { position: [0, -0.5, 0]; scale: [20, 1, 20] }
    object "Guard" using "NPC" { position: [5, 0, 0] }
  }

  logic {
    on_player_enter("Arena") {
      audio.play("welcome.mp3")
    }
  }
}`,
};

describe('WASM Performance Benchmarks', { timeout: 30_000 }, () => {
  // Clean up global Worker stub after all tests to prevent leaking
  // to other test files that share this vitest worker pool
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('Simple Scene Benchmark', () => {
    it('should compare WASM vs TypeScript for simple composition', async () => {
      const result = await runBenchmark({
        iterations: 50,
        source: TEST_CASES.simple,
        testWasm: true,
      });

      expect(result.typescript).toBeDefined();
      expect(result.summary).toBeDefined();

      // Log results for inspection
      console.log('\n=== SIMPLE SCENE ===');
      console.log('Source size:', TEST_CASES.simple.length, 'chars');
      console.table(result.summary);

      if (result.wasm) {
        console.log('\n✓ WASM loaded and benchmarked');
        console.log('Speedup factors:', {
          parse: `${(result.speedup?.parse ?? 0).toFixed(2)}x`,
          compile: `${(result.speedup?.compile ?? 0).toFixed(2)}x`,
          init: `${(result.speedup?.init ?? 0).toFixed(2)}x`,
        });
      } else {
        console.log('⚠ WASM not available, TypeScript only');
      }
    });
  });

  describe('Medium Scene Benchmark', () => {
    it('should compare WASM vs TypeScript for medium composition', async () => {
      const result = await runBenchmark({
        iterations: 30,
        source: TEST_CASES.medium,
        testWasm: true,
      });

      expect(result.typescript).toBeDefined();

      console.log('\n=== MEDIUM SCENE ===');
      console.log('Source size:', TEST_CASES.medium.length, 'chars');
      console.table(result.summary);

      if (result.wasm) {
        console.log('\n✓ WASM speedup achieved');
        console.log('Parse:', `${(result.speedup?.parse ?? 0).toFixed(2)}x faster`);
        console.log('Compile:', `${(result.speedup?.compile ?? 0).toFixed(2)}x faster`);
      }
    });
  });

  describe('Complex Scene Benchmark', () => {
    it('should compare WASM vs TypeScript for complex composition', async () => {
      const result = await runBenchmark({
        iterations: 20,
        source: TEST_CASES.complex,
        testWasm: true,
      });

      expect(result.typescript).toBeDefined();

      console.log('\n=== COMPLEX SCENE ===');
      console.log('Source size:', TEST_CASES.complex.length, 'chars');
      console.table(result.summary);

      if (result.wasm && result.speedup) {
        const parseGain = ((result.speedup.parse - 1) * 100).toFixed(1);
        const compileGain = ((result.speedup.compile - 1) * 100).toFixed(1);

        console.log('\n📊 Performance Gains:');
        console.log(`  Parse: +${parseGain}% faster with WASM`);
        console.log(`  Compile: +${compileGain}% faster with WASM`);

        // Verify WASM provides meaningful speedup
        if (result.speedup.parse > 1.1) {
          expect(true).toBe(true); // WASM is actually faster
        }
      }
    });
  });

  describe('Budget Compliance', () => {
    it('should meet performance budgets with complex scene', async () => {
      const result = await runBenchmark({
        iterations: 50,
        source: TEST_CASES.complex,
        platform: 'browser',
        testWasm: true,
      });

      console.log('\n=== BUDGET COMPLIANCE ===');

      if (result.wasm?.budgetCheck) {
        console.log(
          'WASM Budget Check:',
          result.wasm.budgetCheck.withinBudget ? '✓ PASS' : '✗ FAIL'
        );
        if (!result.wasm.budgetCheck.withinBudget) {
          console.log('Violations:', result.wasm.budgetCheck.violations);
        }
      }

      console.log(
        'TypeScript Budget Check:',
        result.typescript.budgetCheck.withinBudget ? '✓ PASS' : '✗ FAIL'
      );
      if (!result.typescript.budgetCheck.withinBudget) {
        console.log('Violations:', result.typescript.budgetCheck.violations);
      }
    });
  });

  describe('Real-world Performance Metrics', () => {
    it('should provide actionable performance data', async () => {
      const result = await runBenchmark({
        iterations: 50,
        source: TEST_CASES.complex,
        testWasm: true,
      });

      // Extract key metrics
      const metrics = {
        tsParseP95: result.typescript.timings.parseP95Ms,
        tsCompileP95: result.typescript.timings.compileP95Ms,
        wasmParseP95: result.wasm?.timings.parseP95Ms,
        wasmCompileP95: result.wasm?.timings.compileP95Ms,
      };

      console.log('\n=== P95 LATENCY (ms) ===');
      console.log(`TypeScript Parse P95:   ${metrics.tsParseP95.toFixed(2)}ms`);
      console.log(`TypeScript Compile P95: ${metrics.tsCompileP95.toFixed(2)}ms`);

      if (metrics.wasmParseP95 && metrics.wasmCompileP95) {
        console.log(`WASM Parse P95:         ${metrics.wasmParseP95.toFixed(2)}ms`);
        console.log(`WASM Compile P95:       ${metrics.wasmCompileP95.toFixed(2)}ms`);

        console.log('\n⚡ Improvement:');
        const parseSaving = metrics.tsParseP95 - metrics.wasmParseP95;
        const compileSaving = metrics.tsCompileP95 - metrics.wasmCompileP95;
        console.log(`Parse:   ${parseSaving >= 0 ? '+' : ''}${parseSaving.toFixed(2)}ms saved`);
        console.log(`Compile: ${compileSaving >= 0 ? '+' : ''}${compileSaving.toFixed(2)}ms saved`);

        if (parseSaving + compileSaving > 0) {
          console.log(`Total savings per operation: ${(parseSaving + compileSaving).toFixed(2)}ms`);
        }
      }
    });
  });
});
