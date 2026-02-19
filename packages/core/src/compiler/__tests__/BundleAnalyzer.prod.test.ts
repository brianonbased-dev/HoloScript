/**
 * BundleAnalyzer — Production Test Suite
 *
 * Covers: size estimation, module type detection, dependency graphs,
 * duplicate detection, treeshaking, splitting recommendations,
 * circular dependency detection, performance metrics, warnings, HTML report.
 */
import { describe, it, expect } from 'vitest';
import { BundleAnalyzer, BundleInput } from '../BundleAnalyzer';

// ─── Helpers ────────────────────────────────────────────────────────
function makeBundle(overrides: Partial<BundleInput> = {}): BundleInput {
  return {
    chunks: [
      {
        id: 'main',
        name: 'main',
        isEntry: true,
        isAsync: false,
        files: [
          { path: 'src/app.holo', content: 'entity Player { trait collidable }' },
          { path: 'src/utils.ts', content: 'export function add(a,b){ return a+b; }' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('BundleAnalyzer — Production', () => {
  // ─── Construction ─────────────────────────────────────────────────
  it('uses default thresholds when none supplied', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(makeBundle());
    expect(report.version).toBe('1.0.0');
    expect(report.modules.length).toBeGreaterThan(0);
  });

  it('respects custom size thresholds', () => {
    const analyzer = new BundleAnalyzer({
      sizeThresholds: { module: 10 }, // very tight — 10 bytes
    });
    const report = analyzer.analyze(makeBundle());
    // with a 10-byte module threshold, our test modules should trigger size warnings
    const sizeWarnings = report.warnings.filter(w => w.type === 'size');
    expect(sizeWarnings.length).toBeGreaterThan(0);
  });

  // ─── Module Processing ────────────────────────────────────────────
  it('detects .holo extension as ModuleType holo', () => {
    const report = new BundleAnalyzer().analyze(makeBundle());
    const holoMod = report.modules.find(m => m.path.endsWith('.holo'));
    expect(holoMod?.type).toBe('holo');
  });

  it('detects .json extension as ModuleType json', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'data/config.json', content: '{"a":1}' }],
      }],
    });
    expect(report.modules[0].type).toBe('json');
  });

  it('detects asset types by extension', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'assets/logo.png', content: 'binary-data' }],
      }],
    });
    expect(report.modules[0].type).toBe('asset');
  });

  it('calculates gzip and minified sizes', () => {
    const analyzer = new BundleAnalyzer({ estimateGzip: true, estimateMinified: true });
    const content = '/* a comment */\n  export  const  x  =  1;\n';
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'src/mod.ts', content }],
      }],
    });
    const mod = report.modules[0];
    expect(mod.gzipSize).toBeLessThan(mod.size);
    expect(mod.minifiedSize).toBeLessThan(mod.size); // comments + whitespace removed
  });

  // ─── Side Effects Detection ───────────────────────────────────────
  it('detects side effects from console.log', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'src/init.ts', content: 'console.log("booting")' }],
      }],
    });
    expect(report.modules[0].sideEffects).toBe(true);
  });

  it('no side effects for pure module', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'src/pure.ts', content: 'export const x = 1;' }],
      }],
    });
    expect(report.modules[0].sideEffects).toBe(false);
  });

  // ─── Dependency Graph ─────────────────────────────────────────────
  it('builds forward and reverse dependency links', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [
          { path: 'a.ts', content: 'import b' },
          { path: 'b.ts', content: 'export {}' },
        ],
      }],
      dependencies: { 'a.ts': ['b.ts'] },
    });
    const a = report.modules.find(m => m.path === 'a.ts')!;
    const b = report.modules.find(m => m.path === 'b.ts')!;
    expect(a.dependencies).toContain('b.ts');
    expect(b.dependents).toContain('a.ts');
  });

  // ─── Duplicate Detection ──────────────────────────────────────────
  it('finds duplicate modules with identical content', () => {
    const dup = 'export const shared = true;';
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [
          { path: 'vendor/a/utils.ts', content: dup },
          { path: 'vendor/b/utils.ts', content: dup },
        ],
      }],
    });
    expect(report.duplicates.length).toBeGreaterThan(0);
    expect(report.duplicates[0].totalWaste).toBeGreaterThan(0);
  });

  // ─── Unused Exports (Treeshaking) ─────────────────────────────────
  it('identifies unused exports', () => {
    const analyzer = new BundleAnalyzer({ trackUnusedExports: true });
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'lib.ts', content: 'export function a(){}; export function b(){}' }],
      }],
      exports: { 'lib.ts': ['a', 'b'] },
      usedExports: { 'lib.ts': ['a'] },
    });
    const mod = report.modules[0];
    expect(mod.unusedExports).toEqual(['b']);
    expect(report.treeshakingOpportunities.length).toBeGreaterThan(0);
  });

  // ─── Circular Dependency Detection ────────────────────────────────
  it('detects circular dependencies', () => {
    const analyzer = new BundleAnalyzer({ detectCircular: true });
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [
          { path: 'a.ts', content: 'import b' },
          { path: 'b.ts', content: 'import a' },
        ],
      }],
      dependencies: { 'a.ts': ['b.ts'], 'b.ts': ['a.ts'] },
    });
    const circularWarnings = report.warnings.filter(w => w.type === 'circular');
    expect(circularWarnings.length).toBeGreaterThan(0);
  });

  // ─── Splitting Recommendations ────────────────────────────────────
  it('recommends splitting for large modules', () => {
    const largeContent = 'x'.repeat(200 * 1024); // 200KB > 100KB threshold
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'big.ts', content: largeContent }],
      }],
    });
    const asyncRecs = report.splittingRecommendations.filter(r => r.type === 'async');
    expect(asyncRecs.length).toBeGreaterThan(0);
  });

  it('recommends vendor chunk when many externals', () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: `node_modules/pkg${i}/index.ts`,
      content: `export const v${i} = ${i};`,
    }));
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{ id: 'c', name: 'c', isEntry: true, isAsync: false, files }],
    });
    const vendorRecs = report.splittingRecommendations.filter(r => r.type === 'vendor');
    expect(vendorRecs.length).toBeGreaterThan(0);
  });

  // ─── Performance Metrics ──────────────────────────────────────────
  it('calculates correct metrics', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(makeBundle());
    expect(report.metrics.moduleCount).toBe(2);
    expect(report.metrics.chunkCount).toBe(1);
    expect(report.metrics.totalSize).toBeGreaterThan(0);
    expect(report.metrics.largestModule.size).toBeGreaterThanOrEqual(report.metrics.smallestModule.size);
  });

  it('separates initial vs async load sizes', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [
        {
          id: 'entry', name: 'entry', isEntry: true, isAsync: false,
          files: [{ path: 'main.ts', content: 'entry code' }],
        },
        {
          id: 'lazy', name: 'lazy', isEntry: false, isAsync: true,
          files: [{ path: 'lazy.ts', content: 'lazy loaded' }],
        },
      ],
    });
    expect(report.metrics.initialLoadSize).toBeGreaterThan(0);
    expect(report.metrics.asyncChunksSize).toBeGreaterThan(0);
  });

  // ─── Suggestions ──────────────────────────────────────────────────
  it('suggests code splitting when total exceeds threshold', () => {
    const bigContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({
      chunks: [{
        id: 'c', name: 'c', isEntry: true, isAsync: false,
        files: [{ path: 'huge.ts', content: bigContent }],
      }],
    });
    expect(report.suggestions.some(s => s.includes('code splitting'))).toBe(true);
  });

  // ─── HTML Report ──────────────────────────────────────────────────
  it('generates valid HTML report', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(makeBundle());
    const html = analyzer.generateHtmlReport(report);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('HoloScript Bundle Analysis');
    expect(html).toContain('</html>');
  });
});
