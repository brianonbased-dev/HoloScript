import { describe, it, expect, beforeEach } from 'vitest';
import { SceneBundler } from '../build/SceneBundler';
import { PlatformExporter } from '../build/PlatformExporter';
import { BuildOptimizer } from '../build/BuildOptimizer';

describe('Build & Export Pipeline (Cycle 171)', () => {
  // ===========================================================================
  // SceneBundler
  // ===========================================================================
  describe('SceneBundler', () => {
    let bundler: SceneBundler;

    beforeEach(() => {
      bundler = new SceneBundler({ maxChunkSize: 1000 });
    });

    it('should register and count assets', () => {
      bundler.addAsset({ id: 'a', type: 'mesh', path: '/a.glb', sizeBytes: 100, references: [] });
      bundler.addAsset({
        id: 'b',
        type: 'texture',
        path: '/b.png',
        sizeBytes: 200,
        references: [],
      });
      expect(bundler.getAssetCount()).toBe(2);
    });

    it('should tree-shake unreachable assets', () => {
      bundler.addAsset({
        id: 'entry',
        type: 'script',
        path: '/main.js',
        sizeBytes: 50,
        references: ['used'],
      });
      bundler.addAsset({
        id: 'used',
        type: 'mesh',
        path: '/used.glb',
        sizeBytes: 100,
        references: [],
      });
      bundler.addAsset({
        id: 'unused',
        type: 'texture',
        path: '/unused.png',
        sizeBytes: 200,
        references: [],
      });
      bundler.addEntryPoint('entry');

      const removed = bundler.treeShake();
      expect(removed).toContain('unused');
      expect(bundler.getAssetCount()).toBe(2);
    });

    it('should split assets into size-limited chunks', () => {
      bundler.addAsset({ id: 'a', type: 'mesh', path: '/a', sizeBytes: 600, references: [] });
      bundler.addAsset({ id: 'b', type: 'mesh', path: '/b', sizeBytes: 600, references: [] });
      bundler.addEntryPoint('a');

      const chunks = bundler.splitChunks();
      expect(chunks.length).toBeGreaterThanOrEqual(2); // a=critical, b=separate chunk
    });

    it('should generate a complete manifest', () => {
      bundler.addAsset({
        id: 'main',
        type: 'script',
        path: '/main.js',
        sizeBytes: 100,
        references: ['tex'],
      });
      bundler.addAsset({
        id: 'tex',
        type: 'texture',
        path: '/tex.png',
        sizeBytes: 300,
        references: [],
      });
      bundler.addEntryPoint('main');

      const manifest = bundler.bundle();
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.totalAssets).toBe(2);
      expect(manifest.treeShakenCount).toBe(0);
      expect(manifest.chunks.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // PlatformExporter
  // ===========================================================================
  describe('PlatformExporter', () => {
    let exporter: PlatformExporter;

    beforeEach(() => {
      exporter = new PlatformExporter();
    });

    it('should list supported targets', () => {
      const targets = exporter.getSupportedTargets();
      expect(targets).toContain('web');
      expect(targets).toContain('vr-quest');
      expect(targets).toContain('desktop-win');
    });

    it('should configure a target with defaults', () => {
      const config = exporter.configure('web');
      expect(config.target).toBe('web');
      expect(config.polyfills).toContain('webxr-polyfill');
      expect(config.features).toContain('pwa');
    });

    it('should export web target with PWA files', () => {
      exporter.configure('web');
      const result = exporter.export('web');
      expect(result.target).toBe('web');
      expect(result.files.some((f) => f.path.includes('sw.js'))).toBe(true);
      expect(result.totalSize).toBeGreaterThan(0);
    });

    it('should export VR-Quest target with XR polyfills', () => {
      exporter.configure('vr-quest');
      const result = exporter.export('vr-quest');
      expect(result.files.some((f) => f.path.includes('polyfills.js'))).toBe(true);
    });

    it('should export multiple targets', () => {
      exporter.configure('web');
      exporter.configure('desktop-win');
      const results = exporter.exportAll();
      expect(results).toHaveLength(2);
    });

    it('should warn when minification is disabled', () => {
      exporter.configure('web', {
        optimizations: { minify: false, sourceMaps: false, compress: true },
      });
      const result = exporter.export('web');
      expect(result.warnings).toHaveLength(1);
    });
  });

  // ===========================================================================
  // BuildOptimizer
  // ===========================================================================
  describe('BuildOptimizer', () => {
    let optimizer: BuildOptimizer;

    beforeEach(() => {
      optimizer = new BuildOptimizer({ enabledPasses: ['minify', 'compress'] });
    });

    it('should add and track optimization targets', () => {
      optimizer.addTarget('bundle.js', 'js', 500000);
      expect(optimizer.getTargetCount()).toBe(1);
      expect(optimizer.getTarget('bundle.js')?.originalSize).toBe(500000);
    });

    it('should apply optimization passes with size reduction', () => {
      optimizer.addTarget('bundle.js', 'js', 500000);
      const saved = optimizer.applyPass('bundle.js', 'minify');
      expect(saved).toBeGreaterThan(0);
      expect(optimizer.getTarget('bundle.js')!.optimizedSize).toBeLessThan(500000);
    });

    it('should skip passes that dont apply to the type', () => {
      optimizer.addTarget('model.glb', 'mesh', 100000);
      const saved = optimizer.applyPass('model.glb', 'minify');
      expect(saved).toBe(0); // minify doesn't apply to mesh
    });

    it('should run all enabled passes and report results', () => {
      optimizer.addTarget('app.js', 'js', 500000);
      optimizer.addTarget('style.css', 'css', 50000);
      optimizer.addTarget('hero.png', 'texture', 200000);

      const result = optimizer.optimize();
      expect(result.totalSavings).toBeGreaterThan(0);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.passesRun).toEqual(['minify', 'compress']);
    });

    it('should enable and disable passes', () => {
      optimizer.enablePass('dead_code');
      expect(optimizer.getConfig().enabledPasses).toContain('dead_code');
      optimizer.disablePass('minify');
      expect(optimizer.getConfig().enabledPasses).not.toContain('minify');
    });
  });
});
