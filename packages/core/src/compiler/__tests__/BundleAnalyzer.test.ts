import { describe, it, expect } from 'vitest';
import { BundleAnalyzer } from '../BundleAnalyzer';
import type { BundleInput } from '../BundleAnalyzer';

function simpleInput(): BundleInput {
  return {
    chunks: [
      {
        id: 'main',
        name: 'main',
        isEntry: true,
        isAsync: false,
        files: [
          { path: 'src/main.hsplus', content: 'object "App" { position: [0,0,0] }' },
          { path: 'src/utils.ts', content: 'export function helper() { return 42; }' },
        ],
      },
    ],
  };
}

function multiChunkInput(): BundleInput {
  return {
    chunks: [
      {
        id: 'entry',
        name: 'entry',
        isEntry: true,
        isAsync: false,
        files: [
          { path: 'src/app.hsplus', content: 'object "Root" { }' },
        ],
      },
      {
        id: 'lazy',
        name: 'lazy-module',
        isEntry: false,
        isAsync: true,
        files: [
          { path: 'src/lazy.ts', content: 'export const data = [1,2,3,4,5];' },
        ],
      },
    ],
    dependencies: {
      'src/app.hsplus': ['src/lazy.ts'],
    },
    exports: {
      'src/lazy.ts': ['data', 'unusedExport'],
    },
    usedExports: {
      'src/lazy.ts': ['data'],
    },
  };
}

describe('BundleAnalyzer', () => {
  it('analyzes simple bundle', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(simpleInput());
    expect(report.modules).toHaveLength(2);
    expect(report.chunks).toHaveLength(1);
    expect(report.metrics.moduleCount).toBe(2);
    expect(report.metrics.chunkCount).toBe(1);
  });

  it('computes sizes correctly', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(simpleInput());
    const totalSize = report.modules.reduce((s, m) => s + m.size, 0);
    expect(report.metrics.totalSize).toBe(totalSize);
  });

  it('estimates gzip size', () => {
    const analyzer = new BundleAnalyzer({ estimateGzip: true });
    const report = analyzer.analyze(simpleInput());
    for (const mod of report.modules) {
      expect(mod.gzipSize).toBeDefined();
      expect(mod.gzipSize!).toBeLessThan(mod.size);
    }
  });

  it('estimates minified size', () => {
    const analyzer = new BundleAnalyzer({ estimateMinified: true });
    const report = analyzer.analyze(simpleInput());
    for (const mod of report.modules) {
      expect(mod.minifiedSize).toBeDefined();
      expect(mod.minifiedSize!).toBeLessThanOrEqual(mod.size);
    }
  });

  it('detects module types from path', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(simpleInput());
    const holoMod = report.modules.find(m => m.path === 'src/main.hsplus');
    expect(holoMod?.type).toBe('holo');
  });

  it('tracks dependencies', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(multiChunkInput());
    const appMod = report.modules.find(m => m.path === 'src/app.hsplus');
    expect(appMod?.dependencies).toContain('src/lazy.ts');
  });

  it('tracks dependents (reverse)', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(multiChunkInput());
    const lazyMod = report.modules.find(m => m.path === 'src/lazy.ts');
    expect(lazyMod?.dependents).toContain('src/app.hsplus');
  });

  it('identifies unused exports', () => {
    const analyzer = new BundleAnalyzer({ trackUnusedExports: true });
    const report = analyzer.analyze(multiChunkInput());
    const lazyMod = report.modules.find(m => m.path === 'src/lazy.ts');
    expect(lazyMod?.unusedExports).toContain('unusedExport');
  });

  it('finds treeshaking opportunities', () => {
    const analyzer = new BundleAnalyzer({ trackUnusedExports: true });
    const report = analyzer.analyze(multiChunkInput());
    expect(report.treeshakingOpportunities.length).toBeGreaterThanOrEqual(1);
    const opp = report.treeshakingOpportunities[0];
    expect(opp.unusedExports).toContain('unusedExport');
  });

  it('detects side effects', () => {
    const analyzer = new BundleAnalyzer();
    const input: BundleInput = {
      chunks: [{
        id: 'c1',
        name: 'c1',
        isEntry: true,
        isAsync: false,
        files: [
          { path: 'a.ts', content: 'console.log("side effect");' },
          { path: 'b.ts', content: 'const pure = 42;' },
        ],
      }],
    };
    const report = analyzer.analyze(input);
    const a = report.modules.find(m => m.path === 'a.ts');
    const b = report.modules.find(m => m.path === 'b.ts');
    expect(a?.sideEffects).toBe(true);
    expect(b?.sideEffects).toBe(false);
  });

  it('finds duplicates', () => {
    const analyzer = new BundleAnalyzer();
    const dupContent = 'export const shared = true;';
    const input: BundleInput = {
      chunks: [{
        id: 'c1',
        name: 'c1',
        isEntry: true,
        isAsync: false,
        files: [
          { path: 'lib/util-a.ts', content: dupContent },
          { path: 'vendors/util-b.ts', content: dupContent },
        ],
      }],
    };
    const report = analyzer.analyze(input);
    expect(report.duplicates.length).toBeGreaterThanOrEqual(1);
    expect(report.duplicates[0].totalWaste).toBeGreaterThan(0);
  });

  it('separates entry and async chunk metrics', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(multiChunkInput());
    expect(report.metrics.initialLoadSize).toBeGreaterThan(0);
    expect(report.metrics.asyncChunksSize).toBeGreaterThan(0);
  });

  it('generates size warnings for large modules', () => {
    const analyzer = new BundleAnalyzer({
      sizeThresholds: { module: 10 }, // 10 bytes threshold
    });
    const report = analyzer.analyze(simpleInput());
    const sizeWarnings = report.warnings.filter(w => w.type === 'size');
    expect(sizeWarnings.length).toBeGreaterThan(0);
  });

  it('generates suggestions', () => {
    const analyzer = new BundleAnalyzer({
      sizeThresholds: { total: 1 }, // 1 byte threshold
    });
    const report = analyzer.analyze(simpleInput());
    expect(report.suggestions.length).toBeGreaterThan(0);
  });

  it('generates HTML report', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(simpleInput());
    const html = analyzer.generateHtmlReport(report);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('HoloScript Bundle Analysis');
  });

  it('reports version and timestamp', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze(simpleInput());
    expect(report.version).toBe('1.0.0');
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    const analyzer = new BundleAnalyzer();
    const report = analyzer.analyze({ chunks: [] });
    expect(report.modules).toHaveLength(0);
    expect(report.metrics.totalSize).toBe(0);
  });
});
