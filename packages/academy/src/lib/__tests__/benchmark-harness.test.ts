// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @holoscript/core for fallback methods
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

// Mock Worker (no real WASM in test env)
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }))
);

import { runBenchmark, quickBenchmark } from '../benchmark-harness';

describe('benchmark-harness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runBenchmark', () => {
    it('should return a valid comparison object', async () => {
      const result = await runBenchmark({ iterations: 3, testWasm: false });

      expect(result).toHaveProperty('typescript');
      expect(result).toHaveProperty('wasm');
      expect(result).toHaveProperty('speedup');
      expect(result).toHaveProperty('summary');

      // WASM not tested
      expect(result.wasm).toBeNull();
      expect(result.speedup).toBeNull();
    });

    it('should run TypeScript fallback benchmark', async () => {
      const result = await runBenchmark({ iterations: 3, testWasm: false });
      const ts = result.typescript;

      expect(ts.backend).toBe('typescript-fallback');
      expect(ts.iterations).toBe(3);
      expect(ts.sourceLength).toBeGreaterThan(0);
      expect(ts.timings.parseMs).toBeGreaterThanOrEqual(0);
      expect(ts.timings.compileMs).toBeGreaterThanOrEqual(0);
      expect(ts.timings.initMs).toBeGreaterThanOrEqual(0);
      expect(ts.timestamp).toBeTruthy();
    });

    it('should compute statistics correctly', async () => {
      const result = await runBenchmark({ iterations: 5, testWasm: false });
      const t = result.typescript.timings;

      // Min <= Avg <= Max
      expect(t.parseMinMs).toBeLessThanOrEqual(t.parseMs);
      expect(t.parseMs).toBeLessThanOrEqual(t.parseMaxMs);
      expect(t.compileMinMs).toBeLessThanOrEqual(t.compileMs);
      expect(t.compileMs).toBeLessThanOrEqual(t.compileMaxMs);

      // P95 >= Avg (usually)
      expect(t.parseP95Ms).toBeGreaterThanOrEqual(t.parseMinMs);
      expect(t.compileP95Ms).toBeGreaterThanOrEqual(t.compileMinMs);
    });

    it('should generate a summary table', async () => {
      const result = await runBenchmark({ iterations: 3, testWasm: false });

      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary[0]).toHaveProperty('Metric');
      expect(result.summary[0]).toHaveProperty('TypeScript');
    });

    it('should check budget', async () => {
      const result = await runBenchmark({ iterations: 3, testWasm: false });
      const check = result.typescript.budgetCheck;

      expect(check).toHaveProperty('withinBudget');
      expect(check).toHaveProperty('violations');
      expect(typeof check.withinBudget).toBe('boolean');
      expect(Array.isArray(check.violations)).toBe(true);
    });

    it('should accept custom source', async () => {
      const source = 'template "Tiny" { geometry: "cube" }';
      const result = await runBenchmark({ iterations: 2, testWasm: false, source });
      expect(result.typescript.sourceLength).toBe(source.length);
    });
  });

  describe('quickBenchmark', () => {
    it('should return pass/fail with metrics', async () => {
      const result = await quickBenchmark();

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('parseAvgMs');
      expect(result).toHaveProperty('compileAvgMs');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.parseAvgMs).toBe('number');
      expect(typeof result.compileAvgMs).toBe('number');
    });
  });
});
