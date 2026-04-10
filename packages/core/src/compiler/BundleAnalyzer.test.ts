/**
 * Bundle Analyzer Tests
 *
 * Sprint 4 Priority 5: Bundle Analyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BundleAnalyzer,
  createBundleAnalyzer,
  type BundleInput,
  type BundleAnalysisReport,
  type ModuleType,
} from './BundleAnalyzer';

/**
 * Create a test bundle input
 */
function createTestBundle(options?: {
  moduleCount?: number;
  chunkCount?: number;
  includeExternal?: boolean;
  includeDuplicates?: boolean;
  includeLargeModules?: boolean;
}): BundleInput {
  const {
    moduleCount = 5,
    chunkCount = 1,
    includeExternal = false,
    includeDuplicates = false,
    includeLargeModules = false,
  } = options ?? {};

  const chunks: BundleInput['chunks'] = [];
  const dependencies: Record<string, string[]> = {};
  const exports: Record<string, string[]> = {};
  const usedExports: Record<string, string[]> = {};

  for (let c = 0; c < chunkCount; c++) {
    const files: Array<{ path: string; content: string; type?: ModuleType }> = [];

    const modulesInChunk = Math.ceil(moduleCount / chunkCount);
    for (let m = 0; m < modulesInChunk; m++) {
      const globalIdx = c * modulesInChunk + m;
      const path = `src/module${globalIdx}.holo`;
      let content = `orb "Module${globalIdx}" { color: "red", index: ${globalIdx} }`;

      // Add large content if requested
      if (includeLargeModules && m === 0) {
        content = content + '\n' + 'x'.repeat(150 * 1024); // 150KB
      }

      files.push({
        path,
        content,
        type: 'holo',
      });

      // Add dependencies
      if (globalIdx > 0) {
        dependencies[path] = [`src/module${globalIdx - 1}.holo`];
      } else {
        dependencies[path] = [];
      }

      // Add exports
      exports[path] = ['default', 'helper', 'utils'];
      usedExports[path] = ['default']; // Only default is used
    }

    // Add external module if requested
    if (includeExternal && c === 0) {
      files.push({
        path: 'node_modules/three/three.js',
        content: 'export const THREE = {};' + 'x'.repeat(500),
        type: 'external',
      });
    }

    // Add duplicate if requested
    if (includeDuplicates && c === 0) {
      files.push({
        path: 'src/utils/helpers1.holo',
        content: 'template "Helper" { size: 1.0 }',
        type: 'template',
      });
      files.push({
        path: 'src/utils/helpers2.holo',
        content: 'template "Helper" { size: 1.0 }', // Same content
        type: 'template',
      });
    }

    chunks.push({
      id: `chunk_${c}`,
      name: c === 0 ? 'main' : `async_${c}`,
      isEntry: c === 0,
      isAsync: c > 0,
      files,
    });
  }

  return { chunks, dependencies, exports, usedExports };
}

describe('BundleAnalyzer', () => {
  let analyzer: BundleAnalyzer;

  beforeEach(() => {
    analyzer = createBundleAnalyzer({
      sizeThresholds: {
        module: 100 * 1024, // 100KB
        chunk: 250 * 1024, // 250KB
        total: 1024 * 1024, // 1MB
        initialLoad: 500 * 1024, // 500KB
      },
    });
  });

  describe('Basic Analysis', () => {
    it('should analyze a simple bundle', () => {
      const input = createTestBundle({ moduleCount: 3, chunkCount: 1 });
      const report = analyzer.analyze(input);

      expect(report.version).toBe('1.0.0');
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.chunks.length).toBe(1);
      expect(report.modules.length).toBe(3);
    });

    it('should calculate metrics', () => {
      const input = createTestBundle({ moduleCount: 5, chunkCount: 2 });
      const report = analyzer.analyze(input);

      expect(report.metrics.moduleCount).toBe(6); // 3 + 3 due to ceiling division
      expect(report.metrics.chunkCount).toBe(2);
      expect(report.metrics.totalSize).toBeGreaterThan(0);
      expect(report.metrics.avgModuleSize).toBeGreaterThan(0);
    });

    it('should track entry and async chunks', () => {
      const input = createTestBundle({ moduleCount: 4, chunkCount: 2 });
      const report = analyzer.analyze(input);

      const entryChunks = report.chunks.filter((c) => c.isEntry);
      const asyncChunks = report.chunks.filter((c) => c.isAsync);

      expect(entryChunks.length).toBe(1);
      expect(asyncChunks.length).toBe(1);
      expect(report.metrics.initialLoadSize).toBeGreaterThan(0);
      expect(report.metrics.asyncChunksSize).toBeGreaterThan(0);
    });
  });

  describe('Module Analysis', () => {
    it('should detect module types', () => {
      const input: BundleInput = {
        chunks: [
          {
            id: 'main',
            name: 'main',
            isEntry: true,
            isAsync: false,
            files: [
              { path: 'src/main.holo', content: 'orb "Main" {}', type: 'holo' },
              { path: 'src/MyTemplate.ts', content: 'template', type: 'template' },
              { path: 'node_modules/pkg/index.js', content: 'export {}', type: 'external' },
              { path: 'assets/model.json', content: '{}', type: 'json' },
            ],
          },
        ],
      };

      const report = analyzer.analyze(input);

      expect(report.modules.find((m) => m.path === 'src/main.holo')?.type).toBe('holo');
      expect(report.modules.find((m) => m.path.includes('node_modules'))?.type).toBe('external');
      expect(report.modules.find((m) => m.path.endsWith('.json'))?.type).toBe('json');
    });

    it('should calculate module sizes', () => {
      const content = 'orb "Test" { color: "red", size: 1.0 }';
      const input: BundleInput = {
        chunks: [
          {
            id: 'main',
            name: 'main',
            isEntry: true,
            isAsync: false,
            files: [{ path: 'test.holo', content }],
          },
        ],
      };

      const report = analyzer.analyze(input);
      const module = report.modules[0];

      expect(module.size).toBe(content.length);
      expect(module.gzipSize).toBeDefined();
      expect(module.gzipSize).toBeLessThan(module.size);
    });

    it('should generate unique module hashes', () => {
      const input: BundleInput = {
        chunks: [
          {
            id: 'main',
            name: 'main',
            isEntry: true,
            isAsync: false,
            files: [
              { path: 'a.holo', content: 'content A' },
              { path: 'b.holo', content: 'content B' },
            ],
          },
        ],
      };

      const report = analyzer.analyze(input);

      expect(report.modules[0].hash).not.toBe(report.modules[1].hash);
    });
  });

  describe('Dependency Analysis', () => {
    it('should track dependencies', () => {
      const input = createTestBundle({ moduleCount: 3 });
      const report = analyzer.analyze(input);

      // Module 1 should depend on module 0
      const module1 = report.modules.find((m) => m.path.includes('module1'));
      expect(module1?.dependencies).toContain('src/module0.holo');
    });

    it('should track dependents', () => {
      const input = createTestBundle({ moduleCount: 3 });
      const report = analyzer.analyze(input);

      // Module 0 should be a dependent of module 1
      const module0 = report.modules.find((m) => m.path.includes('module0'));
      expect(module0?.dependents).toContain('src/module1.holo');
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect duplicate modules', () => {
      const input = createTestBundle({ moduleCount: 2, includeDuplicates: true });
      const report = analyzer.analyze(input);

      expect(report.duplicates.length).toBeGreaterThan(0);
      expect(report.duplicates[0].instances.length).toBe(2);
      expect(report.duplicates[0].totalWaste).toBeGreaterThan(0);
    });

    it('should calculate duplicate waste', () => {
      const input = createTestBundle({ moduleCount: 2, includeDuplicates: true });
      const report = analyzer.analyze(input);

      expect(report.metrics.duplicateWaste).toBeGreaterThan(0);
    });
  });

  describe('Unused Exports', () => {
    it('should track unused exports', () => {
      const input = createTestBundle({ moduleCount: 2 });
      const report = analyzer.analyze(input);

      // Each module exports [default, helper, utils] but only default is used
      const module = report.modules[0];
      expect(module.exports).toContain('helper');
      expect(module.exports).toContain('utils');
      expect(module.unusedExports).toContain('helper');
      expect(module.unusedExports).toContain('utils');
    });

    it('should generate treeshaking opportunities', () => {
      const input = createTestBundle({ moduleCount: 3 });
      const report = analyzer.analyze(input);

      expect(report.treeshakingOpportunities.length).toBeGreaterThan(0);
      expect(report.treeshakingOpportunities[0].potentialSavings).toBeGreaterThan(0);
    });
  });

  describe('Size Warnings', () => {
    it('should warn about large modules', () => {
      const analyzer = createBundleAnalyzer({
        sizeThresholds: { module: 100 * 1024 },
      });

      const input = createTestBundle({ moduleCount: 2, includeLargeModules: true });
      const report = analyzer.analyze(input);

      const sizeWarnings = report.warnings.filter((w) => w.type === 'size');
      expect(sizeWarnings.length).toBeGreaterThan(0);
    });

    it('should categorize warning severity', () => {
      const analyzer = createBundleAnalyzer({
        sizeThresholds: { module: 50 * 1024 }, // Lower threshold
      });

      const input = createTestBundle({ moduleCount: 2, includeLargeModules: true });
      const report = analyzer.analyze(input);

      // Very large module should have error severity
      const errorWarnings = report.warnings.filter((w) => w.severity === 'error');
      expect(errorWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('Splitting Recommendations', () => {
    it('should recommend splitting large modules', () => {
      const analyzer = createBundleAnalyzer({
        sizeThresholds: { module: 100 * 1024 },
      });

      const input = createTestBundle({ moduleCount: 2, includeLargeModules: true });
      const report = analyzer.analyze(input);

      const asyncRecs = report.splittingRecommendations.filter((r) => r.type === 'async');
      expect(asyncRecs.length).toBeGreaterThan(0);
    });

    it('should recommend vendor chunks for external modules', () => {
      const input: BundleInput = {
        chunks: [
          {
            id: 'main',
            name: 'main',
            isEntry: true,
            isAsync: false,
            files: [
              { path: 'node_modules/a/index.js', content: 'a', type: 'external' },
              { path: 'node_modules/b/index.js', content: 'b', type: 'external' },
              { path: 'node_modules/c/index.js', content: 'c', type: 'external' },
              { path: 'node_modules/d/index.js', content: 'd', type: 'external' },
            ],
          },
        ],
      };

      const report = analyzer.analyze(input);

      const vendorRecs = report.splittingRecommendations.filter((r) => r.type === 'vendor');
      expect(vendorRecs.length).toBe(1);
    });
  });

  describe('Suggestions', () => {
    it('should provide suggestions based on analysis', () => {
      const analyzer = createBundleAnalyzer({
        sizeThresholds: { total: 100 }, // Very low threshold
      });

      const input = createTestBundle({ moduleCount: 5 });
      const report = analyzer.analyze(input);

      expect(report.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Report Generation', () => {
    it('should generate HTML report', () => {
      const input = createTestBundle({ moduleCount: 3 });
      const report = analyzer.analyze(input);
      const html = analyzer.generateHtmlReport(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('HoloScript Bundle Analysis Report');
      expect(html).toContain('Modules');
      expect(html).toContain('Chunks');
    });

    it('should generate JSON report', () => {
      const input = createTestBundle({ moduleCount: 3 });
      const report = analyzer.analyze(input);
      const json = analyzer.generateJsonReport(report);

      const parsed = JSON.parse(json);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.modules).toBeDefined();
      expect(parsed.chunks).toBeDefined();
    });
  });

  describe('Side Effects Detection', () => {
    it('should detect modules with side effects', () => {
      const input: BundleInput = {
        chunks: [
          {
            id: 'main',
            name: 'main',
            isEntry: true,
            isAsync: false,
            files: [
              { path: 'pure.holo', content: 'orb "Pure" { color: "red" }' },
              { path: 'sideeffect.js', content: 'console.log("hello"); window.foo = 1;' },
            ],
          },
        ],
      };

      const report = analyzer.analyze(input);

      const pureModule = report.modules.find((m) => m.path === 'pure.holo');
      const sideEffectModule = report.modules.find((m) => m.path === 'sideeffect.js');

      expect(pureModule?.sideEffects).toBe(false);
      expect(sideEffectModule?.sideEffects).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should identify largest and smallest modules', () => {
      const input: BundleInput = {
        chunks: [
          {
            id: 'main',
            name: 'main',
            isEntry: true,
            isAsync: false,
            files: [
              { path: 'small.holo', content: 'x' },
              { path: 'large.holo', content: 'x'.repeat(1000) },
              { path: 'medium.holo', content: 'x'.repeat(100) },
            ],
          },
        ],
      };

      const report = analyzer.analyze(input);

      expect(report.metrics.largestModule.path).toBe('large.holo');
      expect(report.metrics.largestModule.size).toBe(1000);
      expect(report.metrics.smallestModule.path).toBe('small.holo');
      expect(report.metrics.smallestModule.size).toBe(1);
    });
  });
});

describe('Factory Function', () => {
  it('should create analyzer with createBundleAnalyzer', () => {
    const analyzer = createBundleAnalyzer();
    expect(analyzer).toBeInstanceOf(BundleAnalyzer);
  });

  it('should accept options', () => {
    const analyzer = createBundleAnalyzer({
      debug: true,
      estimateGzip: false,
    });

    const input: BundleInput = {
      chunks: [
        {
          id: 'main',
          name: 'main',
          isEntry: true,
          isAsync: false,
          files: [{ path: 'test.holo', content: 'test' }],
        },
      ],
    };

    const report = analyzer.analyze(input);

    // gzip should be undefined when disabled
    expect(report.modules[0].gzipSize).toBeUndefined();
  });
});
