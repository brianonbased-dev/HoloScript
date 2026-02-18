/**
 * Sprint 20 Acceptance Tests — Build Module + PostFX
 *
 * Covers:
 *   - packages/core/src/build/BuildOptimizer.ts
 *     BuildOptimizer: addTarget, applyPass, optimize(), enablePass/disablePass
 *
 *   - packages/core/src/build/SceneBundler.ts
 *     SceneBundler: addAsset, treeShake(), splitChunks(), bundle()
 *
 *   - packages/core/src/build/PlatformExporter.ts
 *     PlatformExporter: configure, export(), exportAll(), getSupportedTargets
 *
 *   - packages/core/src/postfx/index.ts
 *     Default configs, createPostFXPipeline(), mergeEffectConfig()
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  BuildOptimizer,
  type OptimizationResult,
} from '../build/BuildOptimizer.js';

import {
  SceneBundler,
  type BundleAsset,
  type BundleManifest,
} from '../build/SceneBundler.js';

import {
  PlatformExporter,
  type PlatformTarget,
} from '../build/PlatformExporter.js';

import {
  DEFAULT_BLOOM_CONFIG,
  DEFAULT_COLOR_GRADING_CONFIG,
  DEFAULT_VIGNETTE_CONFIG,
  DEFAULT_POSTFX_PIPELINE,
  createPostFXPipeline,
  mergeEffectConfig,
} from '../postfx/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAsset(id: string, type: BundleAsset['type'] = 'mesh', refs: string[] = []): BundleAsset {
  return { id, type, path: `/assets/${id}`, sizeBytes: 1024, references: refs };
}

// =============================================================================
// Feature 1A: BuildOptimizer — instantiation + config
// =============================================================================

describe('Feature 1A: BuildOptimizer — instantiation', () => {
  it('can be instantiated with no args', () => {
    expect(new BuildOptimizer()).toBeDefined();
  });

  it('default enabledPasses includes minify', () => {
    const o = new BuildOptimizer();
    expect(o.getConfig().enabledPasses).toContain('minify');
  });

  it('default enabledPasses includes compress', () => {
    const o = new BuildOptimizer();
    expect(o.getConfig().enabledPasses).toContain('compress');
  });

  it('default enabledPasses includes dead_code', () => {
    const o = new BuildOptimizer();
    expect(o.getConfig().enabledPasses).toContain('dead_code');
  });

  it('custom enabledPasses respected', () => {
    const o = new BuildOptimizer({ enabledPasses: ['tree_shake'] });
    expect(o.getConfig().enabledPasses).toEqual(['tree_shake']);
  });

  it('default textureMaxSize is 2048', () => {
    expect(new BuildOptimizer().getConfig().textureMaxSize).toBe(2048);
  });

  it('getConfig() returns a copy (not reference)', () => {
    const o = new BuildOptimizer();
    const cfg = o.getConfig();
    cfg.textureMaxSize = 9999;
    expect(o.getConfig().textureMaxSize).toBe(2048);
  });
});

// =============================================================================
// Feature 1B: BuildOptimizer — addTarget / getTarget / getTargetCount
// =============================================================================

describe('Feature 1B: BuildOptimizer — addTarget', () => {
  let opt: BuildOptimizer;

  beforeEach(() => { opt = new BuildOptimizer(); });

  it('getTargetCount() starts at 0', () => {
    expect(opt.getTargetCount()).toBe(0);
  });

  it('addTarget increments count', () => {
    opt.addTarget('main.js', 'js', 50000);
    expect(opt.getTargetCount()).toBe(1);
  });

  it('getTarget() returns the target', () => {
    opt.addTarget('main.js', 'js', 50000);
    expect(opt.getTarget('main.js')).toBeDefined();
  });

  it('getTarget() returns undefined for unknown id', () => {
    expect(opt.getTarget('unknown')).toBeUndefined();
  });

  it('target has correct type', () => {
    opt.addTarget('tex.png', 'texture', 20000);
    expect(opt.getTarget('tex.png')?.type).toBe('texture');
  });

  it('target originalSize matches input', () => {
    opt.addTarget('main.js', 'js', 50000);
    expect(opt.getTarget('main.js')?.originalSize).toBe(50000);
  });

  it('initial passesApplied is empty', () => {
    opt.addTarget('main.js', 'js', 50000);
    expect(opt.getTarget('main.js')?.passesApplied).toHaveLength(0);
  });
});

// =============================================================================
// Feature 1C: BuildOptimizer — applyPass
// =============================================================================

describe('Feature 1C: BuildOptimizer — applyPass()', () => {
  let opt: BuildOptimizer;

  beforeEach(() => {
    opt = new BuildOptimizer();
    opt.addTarget('main.js', 'js', 100000);
  });

  it('returns 0 for unknown target', () => {
    expect(opt.applyPass('unknown', 'minify')).toBe(0);
  });

  it('minify on js reduces size', () => {
    const savings = opt.applyPass('main.js', 'minify');
    expect(savings).toBeGreaterThan(0);
  });

  it('optimizedSize decreases after pass', () => {
    opt.applyPass('main.js', 'minify');
    const target = opt.getTarget('main.js')!;
    expect(target.optimizedSize).toBeLessThan(target.originalSize);
  });

  it('pass is recorded in passesApplied', () => {
    opt.applyPass('main.js', 'minify');
    expect(opt.getTarget('main.js')?.passesApplied).toContain('minify');
  });

  it('returns 0 when pass does not apply to type', () => {
    opt.addTarget('model.mesh', 'mesh', 50000);
    // minify only applies to js/css/html
    expect(opt.applyPass('model.mesh', 'minify')).toBe(0);
  });

  it('mesh_decimate applies to mesh type', () => {
    opt.addTarget('model.mesh', 'mesh', 50000);
    const savings = opt.applyPass('model.mesh', 'mesh_decimate');
    expect(savings).toBeGreaterThan(0);
  });
});

// =============================================================================
// Feature 1D: BuildOptimizer — optimize() result shape
// =============================================================================

describe('Feature 1D: BuildOptimizer — optimize()', () => {
  let result: OptimizationResult;

  beforeEach(() => {
    const opt = new BuildOptimizer({ enabledPasses: ['minify', 'compress'] });
    opt.addTarget('app.js', 'js', 200000);
    opt.addTarget('style.css', 'css', 50000);
    result = opt.optimize();
  });

  it('returns targets array', () => {
    expect(Array.isArray(result.targets)).toBe(true);
    expect(result.targets).toHaveLength(2);
  });

  it('totalOriginalSize equals sum of all originalSizes', () => {
    expect(result.totalOriginalSize).toBe(250000);
  });

  it('totalOptimizedSize is less than totalOriginalSize', () => {
    expect(result.totalOptimizedSize).toBeLessThan(result.totalOriginalSize);
  });

  it('totalSavings is positive', () => {
    expect(result.totalSavings).toBeGreaterThan(0);
  });

  it('savingsPercent is between 0 and 100', () => {
    expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
    expect(result.savingsPercent).toBeLessThanOrEqual(100);
  });

  it('passesRun matches enabledPasses', () => {
    expect(result.passesRun).toContain('minify');
    expect(result.passesRun).toContain('compress');
  });

  it('duration is a non-negative number', () => {
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Feature 1E: BuildOptimizer — enablePass / disablePass
// =============================================================================

describe('Feature 1E: BuildOptimizer — enablePass/disablePass', () => {
  let opt: BuildOptimizer;

  beforeEach(() => { opt = new BuildOptimizer({ enabledPasses: ['minify'] }); });

  it('enablePass adds new pass', () => {
    opt.enablePass('tree_shake');
    expect(opt.getConfig().enabledPasses).toContain('tree_shake');
  });

  it('enablePass is idempotent (no duplicates)', () => {
    opt.enablePass('minify');
    const count = opt.getConfig().enabledPasses.filter((p) => p === 'minify').length;
    expect(count).toBe(1);
  });

  it('disablePass removes a pass', () => {
    opt.disablePass('minify');
    expect(opt.getConfig().enabledPasses).not.toContain('minify');
  });
});

// =============================================================================
// Feature 2A: SceneBundler — instantiation + addAsset
// =============================================================================

describe('Feature 2A: SceneBundler — instantiation', () => {
  it('can be instantiated with no args', () => {
    expect(new SceneBundler()).toBeDefined();
  });

  it('getAssetCount() starts at 0', () => {
    expect(new SceneBundler().getAssetCount()).toBe(0);
  });

  it('addAsset increments count', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('mesh1'));
    expect(b.getAssetCount()).toBe(1);
  });

  it('getAsset() returns the asset', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('tex1', 'texture'));
    expect(b.getAsset('tex1')).toBeDefined();
  });

  it('getAsset() returns undefined for unknown id', () => {
    expect(new SceneBundler().getAsset('nope')).toBeUndefined();
  });

  it('asset type is preserved', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('snd', 'audio'));
    expect(b.getAsset('snd')?.type).toBe('audio');
  });
});

// =============================================================================
// Feature 2B: SceneBundler — treeShake()
// =============================================================================

describe('Feature 2B: SceneBundler — treeShake()', () => {
  it('returns empty array when no entry points', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('a'));
    b.addAsset(makeAsset('b'));
    // no entry points → all unreachable
    const removed = b.treeShake();
    expect(removed.length).toBe(2);
  });

  it('entry point assets are kept', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('main'));
    b.addEntryPoint('main');
    const removed = b.treeShake();
    expect(removed).not.toContain('main');
    expect(b.getAsset('main')).toBeDefined();
  });

  it('unreachable assets are removed', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('main'));
    b.addAsset(makeAsset('orphan'));
    b.addEntryPoint('main');
    const removed = b.treeShake();
    expect(removed).toContain('orphan');
    expect(b.getAsset('orphan')).toBeUndefined();
  });

  it('transitively referenced assets are kept', () => {
    const b = new SceneBundler();
    b.addAsset(makeAsset('main', 'script', ['dep']));
    b.addAsset(makeAsset('dep', 'mesh', []));
    b.addEntryPoint('main');
    const removed = b.treeShake();
    expect(removed).not.toContain('dep');
    expect(b.getAsset('dep')).toBeDefined();
  });

  it('tree shaking disabled by config returns empty array', () => {
    const b = new SceneBundler({ enableTreeShaking: false });
    b.addAsset(makeAsset('orphan'));
    expect(b.treeShake()).toHaveLength(0);
  });
});

// =============================================================================
// Feature 2C: SceneBundler — bundle() manifest shape
// =============================================================================

describe('Feature 2C: SceneBundler — bundle()', () => {
  let manifest: BundleManifest;

  beforeEach(() => {
    const b = new SceneBundler({ entryPoints: ['main'] });
    b.addAsset(makeAsset('main', 'script', ['mesh1']));
    b.addAsset(makeAsset('mesh1', 'mesh'));
    manifest = b.bundle();
  });

  it('has version string', () => {
    expect(typeof manifest.version).toBe('string');
  });

  it('has buildId string', () => {
    expect(typeof manifest.buildId).toBe('string');
    expect(manifest.buildId.startsWith('build_')).toBe(true);
  });

  it('has chunks array', () => {
    expect(Array.isArray(manifest.chunks)).toBe(true);
  });

  it('has totalAssets number', () => {
    expect(typeof manifest.totalAssets).toBe('number');
  });

  it('has totalSize number', () => {
    expect(typeof manifest.totalSize).toBe('number');
    expect(manifest.totalSize).toBeGreaterThan(0);
  });

  it('has treeShakenCount number', () => {
    expect(typeof manifest.treeShakenCount).toBe('number');
  });

  it('has createdAt timestamp', () => {
    expect(typeof manifest.createdAt).toBe('number');
    expect(manifest.createdAt).toBeGreaterThan(0);
  });

  it('has entryChunk string', () => {
    expect(typeof manifest.entryChunk).toBe('string');
  });

  it('critical chunk contains entry point asset', () => {
    const critical = manifest.chunks.find((c) => c.priority === 'critical');
    expect(critical).toBeDefined();
    expect(critical?.assets).toContain('main');
  });
});

// =============================================================================
// Feature 3A: PlatformExporter — getSupportedTargets
// =============================================================================

describe('Feature 3A: PlatformExporter — getSupportedTargets', () => {
  const exporter = new PlatformExporter();

  it('getSupportedTargets returns an array', () => {
    expect(Array.isArray(exporter.getSupportedTargets())).toBe(true);
  });

  it('has 6 supported targets', () => {
    expect(exporter.getSupportedTargets()).toHaveLength(6);
  });

  it('includes web target', () => {
    expect(exporter.getSupportedTargets()).toContain('web');
  });

  it('includes vr-quest target', () => {
    expect(exporter.getSupportedTargets()).toContain('vr-quest');
  });

  it('includes vr-pcvr target', () => {
    expect(exporter.getSupportedTargets()).toContain('vr-pcvr');
  });

  it('includes desktop-win target', () => {
    expect(exporter.getSupportedTargets()).toContain('desktop-win');
  });
});

// =============================================================================
// Feature 3B: PlatformExporter — configure + getConfig
// =============================================================================

describe('Feature 3B: PlatformExporter — configure()', () => {
  let exporter: PlatformExporter;

  beforeEach(() => { exporter = new PlatformExporter(); });

  it('getConfiguredCount() starts at 0', () => {
    expect(exporter.getConfiguredCount()).toBe(0);
  });

  it('configure() returns a PlatformConfig', () => {
    const cfg = exporter.configure('web');
    expect(cfg).toBeDefined();
    expect(cfg.target).toBe('web');
  });

  it('configure() increments configured count', () => {
    exporter.configure('web');
    expect(exporter.getConfiguredCount()).toBe(1);
  });

  it('getConfig() returns config after configure', () => {
    exporter.configure('vr-quest');
    expect(exporter.getConfig('vr-quest')).toBeDefined();
  });

  it('getConfig() returns undefined for unconfigured target', () => {
    expect(exporter.getConfig('vr-quest')).toBeUndefined();
  });

  it('web config has webxr-polyfill polyfill', () => {
    const cfg = exporter.configure('web');
    expect(cfg.polyfills).toContain('webxr-polyfill');
  });

  it('vr-quest config has hand-tracking feature', () => {
    const cfg = exporter.configure('vr-quest');
    expect(cfg.features).toContain('hand-tracking');
  });

  it('vr-pcvr config has openxr feature', () => {
    const cfg = exporter.configure('vr-pcvr');
    expect(cfg.features).toContain('openxr');
  });

  it('outputDir defaults to dist/<target>', () => {
    const cfg = exporter.configure('web');
    expect(cfg.outputDir).toBe('dist/web');
  });

  it('outputDir override is respected', () => {
    const cfg = exporter.configure('web', { outputDir: 'build/web' });
    expect(cfg.outputDir).toBe('build/web');
  });
});

// =============================================================================
// Feature 3C: PlatformExporter — export() result shape
// =============================================================================

describe('Feature 3C: PlatformExporter — export()', () => {
  let exporter: PlatformExporter;

  beforeEach(() => {
    exporter = new PlatformExporter();
    exporter.configure('web');
  });

  it('export() returns an ExportResult', () => {
    expect(exporter.export('web')).toBeDefined();
  });

  it('result.target matches requested target', () => {
    expect(exporter.export('web').target).toBe('web');
  });

  it('result.files is an array', () => {
    expect(Array.isArray(exporter.export('web').files)).toBe(true);
  });

  it('result.files is non-empty', () => {
    expect(exporter.export('web').files.length).toBeGreaterThan(0);
  });

  it('result.totalSize is positive', () => {
    expect(exporter.export('web').totalSize).toBeGreaterThan(0);
  });

  it('result.buildTime is non-negative', () => {
    expect(exporter.export('web').buildTime).toBeGreaterThanOrEqual(0);
  });

  it('result.warnings is an array', () => {
    expect(Array.isArray(exporter.export('web').warnings)).toBe(true);
  });

  it('web export includes bundle.js file', () => {
    const files = exporter.export('web').files;
    expect(files.some((f) => f.path.includes('bundle.js'))).toBe(true);
  });

  it('web export includes manifest.json file', () => {
    const files = exporter.export('web').files;
    expect(files.some((f) => f.path.includes('manifest.json'))).toBe(true);
  });

  it('web export with polyfills includes polyfills.js', () => {
    const files = exporter.export('web').files;
    expect(files.some((f) => f.path.includes('polyfills.js'))).toBe(true);
  });

  it('auto-configure if not pre-configured', () => {
    const exp = new PlatformExporter();
    expect(() => exp.export('desktop-mac')).not.toThrow();
  });
});

// =============================================================================
// Feature 3D: PlatformExporter — exportAll()
// =============================================================================

describe('Feature 3D: PlatformExporter — exportAll()', () => {
  it('returns empty array when no targets configured', () => {
    expect(new PlatformExporter().exportAll()).toHaveLength(0);
  });

  it('returns one result per configured target', () => {
    const exp = new PlatformExporter();
    exp.configure('web');
    exp.configure('vr-quest');
    expect(exp.exportAll()).toHaveLength(2);
  });
});

// =============================================================================
// Feature 4A: PostFX — default configs
// =============================================================================

describe('Feature 4A: PostFX — default configs', () => {
  it('DEFAULT_BLOOM_CONFIG.enabled is false', () => {
    expect(DEFAULT_BLOOM_CONFIG.enabled).toBe(false);
  });

  it('DEFAULT_BLOOM_CONFIG.order is 1', () => {
    expect(DEFAULT_BLOOM_CONFIG.order).toBe(1);
  });

  it('DEFAULT_BLOOM_CONFIG.params.intensity is 0.5', () => {
    expect(DEFAULT_BLOOM_CONFIG.params.intensity).toBe(0.5);
  });

  it('DEFAULT_BLOOM_CONFIG.params.threshold is 0.8', () => {
    expect(DEFAULT_BLOOM_CONFIG.params.threshold).toBe(0.8);
  });

  it('DEFAULT_COLOR_GRADING_CONFIG.order is 2', () => {
    expect(DEFAULT_COLOR_GRADING_CONFIG.order).toBe(2);
  });

  it('DEFAULT_COLOR_GRADING_CONFIG.params.saturation is 0', () => {
    expect(DEFAULT_COLOR_GRADING_CONFIG.params.saturation).toBe(0);
  });

  it('DEFAULT_VIGNETTE_CONFIG.order is 3', () => {
    expect(DEFAULT_VIGNETTE_CONFIG.order).toBe(3);
  });

  it('DEFAULT_VIGNETTE_CONFIG.params.intensity is 0.3', () => {
    expect(DEFAULT_VIGNETTE_CONFIG.params.intensity).toBe(0.3);
  });
});

// =============================================================================
// Feature 4B: PostFX — DEFAULT_POSTFX_PIPELINE
// =============================================================================

describe('Feature 4B: PostFX — DEFAULT_POSTFX_PIPELINE', () => {
  it('name is "default"', () => {
    expect(DEFAULT_POSTFX_PIPELINE.name).toBe('default');
  });

  it('enabled is true', () => {
    expect(DEFAULT_POSTFX_PIPELINE.enabled).toBe(true);
  });

  it('has bloom effect', () => {
    expect(DEFAULT_POSTFX_PIPELINE.effects.bloom).toBeDefined();
  });

  it('has colorGrading effect', () => {
    expect(DEFAULT_POSTFX_PIPELINE.effects.colorGrading).toBeDefined();
  });

  it('has vignette effect', () => {
    expect(DEFAULT_POSTFX_PIPELINE.effects.vignette).toBeDefined();
  });
});

// =============================================================================
// Feature 4C: createPostFXPipeline()
// =============================================================================

describe('Feature 4C: createPostFXPipeline()', () => {
  it('returns a PostFXPipeline', () => {
    expect(createPostFXPipeline({})).toBeDefined();
  });

  it('custom name overrides default', () => {
    const p = createPostFXPipeline({ name: 'cinematic' });
    expect(p.name).toBe('cinematic');
  });

  it('default effects preserved when not overridden', () => {
    const p = createPostFXPipeline({ name: 'custom' });
    expect(p.effects.bloom).toBeDefined();
    expect(p.effects.vignette).toBeDefined();
  });

  it('custom effects merged', () => {
    const p = createPostFXPipeline({ effects: { ssao: { enabled: true, order: 5, params: { intensity: 0.8, radius: 0.5, bias: 0.01 } } } });
    expect(p.effects.ssao).toBeDefined();
    expect(p.effects.bloom).toBeDefined(); // still inherited
  });

  it('enabled override works', () => {
    const p = createPostFXPipeline({ enabled: false });
    expect(p.enabled).toBe(false);
  });
});

// =============================================================================
// Feature 4D: mergeEffectConfig()
// =============================================================================

describe('Feature 4D: mergeEffectConfig()', () => {
  it('returns merged config', () => {
    const result = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, { enabled: true });
    expect(result.enabled).toBe(true);
  });

  it('preserves base params when not overridden', () => {
    const result = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, {});
    expect(result.params.intensity).toBe(0.5);
  });

  it('overrides specific param', () => {
    const result = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, {
      params: { intensity: 0.9, threshold: 0.8, radius: 0.4 },
    });
    expect(result.params.intensity).toBe(0.9);
  });

  it('does not mutate the original config', () => {
    mergeEffectConfig(DEFAULT_BLOOM_CONFIG, { enabled: true });
    expect(DEFAULT_BLOOM_CONFIG.enabled).toBe(false);
  });
});
