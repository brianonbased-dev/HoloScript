/**
 * Sprint 25 Acceptance Tests â€” Rendering + PostFX + Build (v3.34.0)
 *
 * Features:
 *   1A/B  PostFX Config     â€” createPostFXPipeline, mergeEffectConfig
 *   2Aâ€“C  PostProcess Types â€” getDefaultParams, mergeParams, validateParams, constants
 *   3A/B  PostProcessPipeline â€” construction, createPreset
 *   4A/B  ShaderGraph        â€” node lifecycle, connections
 *   5A/B  ShaderGraphTypes   â€” type compatibility, templates
 *   6A    PlatformExporter   â€” configure, export, targets
 *   7A    SceneBundler       â€” addAsset, treeShake, splitChunks, bundle
 */

import { describe, it, expect, beforeEach } from 'vitest';

// PostFX config (no GPU)
import {
  createPostFXPipeline,
  mergeEffectConfig,
  DEFAULT_BLOOM_CONFIG,
  DEFAULT_COLOR_GRADING_CONFIG,
  DEFAULT_VIGNETTE_CONFIG,
  DEFAULT_POSTFX_PIPELINE,
} from '@holoscript/engine/postfx';
import type { BloomConfig, VignetteConfig } from '@holoscript/engine/postfx';

// PostProcess types (no GPU)
import {
  getDefaultParams,
  mergeParams,
  validateParams,
  DEFAULT_PARAMS,
  UNIFORM_SIZES,
} from '../rendering/postprocess/PostProcessTypes.js';
import type {
  PostProcessEffectType,
  IBloomParams,
  IToneMapParams,
} from '../rendering/postprocess/PostProcessTypes.js';

// PostProcessPipeline (construction-only, no device needed)
import {
  PostProcessPipeline,
  DEFAULT_PIPELINE_CONFIG,
} from '../rendering/postprocess/PostProcessPipeline.js';

// ShaderGraph
import { ShaderGraph } from '@holoscript/engine/shader';

// ShaderGraphTypes utilities
import {
  areTypesCompatible,
  getTypeConversion,
  getNodeTemplate,
  TYPE_SIZES,
  ALL_NODE_TEMPLATES,
} from '@holoscript/engine/shader';

// Build modules
import { PlatformExporter } from '../build/PlatformExporter.js';
import { SceneBundler } from '../build/SceneBundler.js';
import type { BundleAsset } from '../build/SceneBundler.js';

// =============================================================================
// Feature 1A: PostFX Config â€” createPostFXPipeline
// =============================================================================

describe('Feature 1A: PostFX Config â€” createPostFXPipeline', () => {
  it('returns pipeline with default name', () => {
    const p = createPostFXPipeline({});
    expect(p.name).toBe('default');
  });

  it('override name is applied', () => {
    const p = createPostFXPipeline({ name: 'cinematic' });
    expect(p.name).toBe('cinematic');
  });

  it('enabled is true by default', () => {
    const p = createPostFXPipeline({});
    expect(p.enabled).toBe(true);
  });

  it('override enabled=false is applied', () => {
    const p = createPostFXPipeline({ enabled: false });
    expect(p.enabled).toBe(false);
  });

  it('default effects include bloom', () => {
    const p = createPostFXPipeline({});
    expect(p.effects.bloom).toBeDefined();
  });

  it('default effects include colorGrading', () => {
    const p = createPostFXPipeline({});
    expect(p.effects.colorGrading).toBeDefined();
  });

  it('default effects include vignette', () => {
    const p = createPostFXPipeline({});
    expect(p.effects.vignette).toBeDefined();
  });

  it('effect override merges with defaults', () => {
    const p = createPostFXPipeline({
      effects: { bloom: { ...DEFAULT_BLOOM_CONFIG, enabled: true } },
    });
    expect(p.effects.bloom?.enabled).toBe(true);
  });

  it('DEFAULT_POSTFX_PIPELINE has exactly 3 effects', () => {
    const keys = Object.keys(DEFAULT_POSTFX_PIPELINE.effects);
    expect(keys).toHaveLength(3);
  });
});

// =============================================================================
// Feature 1B: PostFX Config â€” mergeEffectConfig
// =============================================================================

describe('Feature 1B: PostFX Config â€” mergeEffectConfig', () => {
  it('merges top-level fields', () => {
    const result = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, { enabled: true });
    expect(result.enabled).toBe(true);
  });

  it('deep-merges params', () => {
    const result = mergeEffectConfig<BloomConfig>(DEFAULT_BLOOM_CONFIG, {
      params: { intensity: 0.9, threshold: 0.8, radius: 0.4 },
    });
    expect(result.params.intensity).toBe(0.9);
    expect(result.params.threshold).toBe(0.8);
  });

  it('preserves unmentioned params', () => {
    const result = mergeEffectConfig<BloomConfig>(DEFAULT_BLOOM_CONFIG, {
      params: { intensity: 0.1, threshold: 0.8, radius: 0.4 },
    });
    expect(result.params.radius).toBe(0.4);
  });

  it('base fields preserved when not overridden', () => {
    const result = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, {});
    expect(result.order).toBe(DEFAULT_BLOOM_CONFIG.order);
  });

  it('DEFAULT_VIGNETTE_CONFIG has smoothness param', () => {
    expect((DEFAULT_VIGNETTE_CONFIG as VignetteConfig).params.smoothness).toBeDefined();
  });
});

// =============================================================================
// Feature 2A: PostProcess Types â€” getDefaultParams / mergeParams
// =============================================================================

describe('Feature 2A: PostProcess Types â€” getDefaultParams / mergeParams', () => {
  it('getDefaultParams bloom has intensity 1.0', () => {
    const p = getDefaultParams<IBloomParams>('bloom');
    expect(p.intensity).toBe(1.0);
  });

  it('getDefaultParams returns a copy not the original', () => {
    const p = getDefaultParams<IBloomParams>('bloom');
    p.intensity = 99;
    expect(getDefaultParams<IBloomParams>('bloom').intensity).toBe(1.0);
  });

  it('getDefaultParams tonemap has operator aces', () => {
    const p = getDefaultParams<IToneMapParams>('tonemap');
    expect(p.operator).toBe('aces');
  });

  it('mergeParams overrides specific field', () => {
    const p = mergeParams<IBloomParams>('bloom', { intensity: 0.3 });
    expect(p.intensity).toBe(0.3);
  });

  it('mergeParams preserves other fields', () => {
    const p = mergeParams<IBloomParams>('bloom', { intensity: 0.3 });
    expect(p.threshold).toBe(DEFAULT_PARAMS.bloom.threshold as number);
  });

  it('getDefaultParams vignette has enabled=false', () => {
    const p = getDefaultParams('vignette');
    expect(p.enabled).toBe(false);
  });

  it('DEFAULT_PARAMS has entry for all 16 effect types', () => {
    const types: PostProcessEffectType[] = [
      'bloom',
      'tonemap',
      'dof',
      'motionBlur',
      'ssao',
      'fxaa',
      'sharpen',
      'vignette',
      'colorGrade',
      'filmGrain',
      'chromaticAberration',
      'fog',
      'caustics',
      'ssr',
      'ssgi',
      'custom',
    ];
    for (const t of types) {
      expect(DEFAULT_PARAMS[t]).toBeDefined();
    }
  });
});

// =============================================================================
// Feature 2B: PostProcess Types â€” validateParams
// =============================================================================

describe('Feature 2B: PostProcess Types â€” validateParams', () => {
  it('valid bloom params pass validation', () => {
    const { valid } = validateParams('bloom', getDefaultParams('bloom'));
    expect(valid).toBe(true);
  });

  it('null params return valid=false', () => {
    const { valid } = validateParams('bloom', null as any);
    expect(valid).toBe(false);
  });

  it('bloom with negative threshold fails', () => {
    const p = { ...getDefaultParams<IBloomParams>('bloom'), threshold: -1 };
    const { valid, errors } = validateParams('bloom', p);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('bloom with iterations > 16 fails', () => {
    const p = { ...getDefaultParams<IBloomParams>('bloom'), iterations: 20 };
    const { valid } = validateParams('bloom', p);
    expect(valid).toBe(false);
  });

  it('tonemap with exposure <= 0 fails', () => {
    const p = { ...getDefaultParams<IToneMapParams>('tonemap'), exposure: 0 };
    const { valid } = validateParams('tonemap', p);
    expect(valid).toBe(false);
  });

  it('valid tonemap params pass', () => {
    const { valid } = validateParams('tonemap', getDefaultParams('tonemap'));
    expect(valid).toBe(true);
  });
});

// =============================================================================
// Feature 2C: PostProcess Types â€” UNIFORM_SIZES
// =============================================================================

describe('Feature 2C: PostProcess Types â€” UNIFORM_SIZES', () => {
  it('UNIFORM_SIZES has bloom entry', () => {
    expect(UNIFORM_SIZES.bloom).toBeGreaterThan(0);
  });

  it('UNIFORM_SIZES custom has large buffer (256)', () => {
    expect(UNIFORM_SIZES.custom).toBe(256);
  });

  it('UNIFORM_SIZES has entry for all 16 effect types', () => {
    const types: PostProcessEffectType[] = [
      'bloom',
      'tonemap',
      'dof',
      'motionBlur',
      'ssao',
      'fxaa',
      'sharpen',
      'vignette',
      'colorGrade',
      'filmGrain',
      'chromaticAberration',
      'fog',
      'caustics',
      'ssr',
      'ssgi',
      'custom',
    ];
    for (const t of types) {
      expect(UNIFORM_SIZES[t]).toBeDefined();
    }
  });
});

// =============================================================================
// Feature 3A: PostProcessPipeline â€” construction
// =============================================================================

describe('Feature 3A: PostProcessPipeline â€” construction', () => {
  it('new pipeline is not initialized', () => {
    const p = new PostProcessPipeline();
    expect(p.initialized).toBe(false);
  });

  it('getConfig returns hdrEnabled=true by default', () => {
    const p = new PostProcessPipeline();
    expect(p.getConfig().hdrEnabled).toBe(true);
  });

  it('getConfig returns copy not the same reference', () => {
    const p = new PostProcessPipeline();
    const c1 = p.getConfig();
    const c2 = p.getConfig();
    expect(c1).not.toBe(c2);
  });

  it('getEffects returns empty array initially', () => {
    const p = new PostProcessPipeline();
    expect(p.getEffects()).toEqual([]);
  });

  it('getEffect returns undefined for unknown name', () => {
    const p = new PostProcessPipeline();
    expect(p.getEffect('unknown')).toBeUndefined();
  });

  it('constructor config override applied', () => {
    const p = new PostProcessPipeline({ hdrEnabled: false });
    expect(p.getConfig().hdrEnabled).toBe(false);
  });

  it('DEFAULT_PIPELINE_CONFIG has effects array', () => {
    expect(Array.isArray(DEFAULT_PIPELINE_CONFIG.effects)).toBe(true);
  });
});

// =============================================================================
// Feature 3B: PostProcessPipeline â€” createPreset
// =============================================================================

describe('Feature 3B: PostProcessPipeline â€” createPreset', () => {
  it('createPreset minimal returns config', () => {
    const cfg = PostProcessPipeline.createPreset('minimal');
    expect(cfg).toBeDefined();
  });

  it('createPreset cinematic returns config', () => {
    const cfg = PostProcessPipeline.createPreset('cinematic');
    expect(cfg).toBeDefined();
  });

  it('createPreset performance returns config', () => {
    const cfg = PostProcessPipeline.createPreset('performance');
    expect(cfg).toBeDefined();
  });

  it('createPreset standard returns config', () => {
    const cfg = PostProcessPipeline.createPreset('standard');
    expect(cfg).toBeDefined();
  });
});

// =============================================================================
// Feature 4A: ShaderGraph â€” node lifecycle
// =============================================================================

describe('Feature 4A: ShaderGraph â€” node lifecycle', () => {
  let graph: ShaderGraph;

  beforeEach(() => {
    graph = new ShaderGraph('TestShader');
  });

  it('constructor sets name', () => {
    expect(graph.name).toBe('TestShader');
  });

  it('constructor generates id', () => {
    expect(graph.id).toBeTruthy();
  });

  it('nodes map is empty initially', () => {
    expect(graph.nodes.size).toBe(0);
  });

  it('createNode with valid type returns node', () => {
    const node = graph.createNode('math_add');
    expect(node).not.toBeNull();
  });

  it('createNode adds node to map', () => {
    graph.createNode('math_add');
    expect(graph.nodes.size).toBe(1);
  });

  it('createNode with unknown type returns null', () => {
    const node = graph.createNode('nonexistent_type_xyz');
    expect(node).toBeNull();
  });

  it('getNode returns node by id', () => {
    const node = graph.createNode('math_multiply');
    expect(graph.getNode(node!.id)).toBe(node);
  });

  it('removeNode removes node and returns true', () => {
    const node = graph.createNode('math_add');
    const removed = graph.removeNode(node!.id);
    expect(removed).toBe(true);
    expect(graph.nodes.size).toBe(0);
  });

  it('removeNode returns false for unknown id', () => {
    expect(graph.removeNode('absentNodeId')).toBe(false);
  });

  it('setNodePosition updates node position', () => {
    const node = graph.createNode('math_add');
    graph.setNodePosition(node!.id, 100, 200);
    expect(graph.getNode(node!.id)?.position).toEqual({ x: 100, y: 200 });
  });

  it('setNodeProperty stores custom property', () => {
    const node = graph.createNode('constant_float');
    graph.setNodeProperty(node!.id, 'value', 3.14);
    expect(graph.getNodeProperty(node!.id, 'value')).toBe(3.14);
  });
});

// =============================================================================
// Feature 4B: ShaderGraph â€” connections
// =============================================================================

describe('Feature 4B: ShaderGraph â€” connections', () => {
  let graph: ShaderGraph;

  beforeEach(() => {
    graph = new ShaderGraph('ConnTest');
  });

  it('connections array is empty initially', () => {
    expect(graph.connections).toHaveLength(0);
  });

  it('connect floatâ†’float creates connection', () => {
    // constant_float outputs 'value' (float), math_add inputs 'a' (float)
    const src = graph.createNode('constant_float')!;
    const dst = graph.createNode('math_add')!;
    const conn = graph.connect(src.id, 'value', dst.id, 'a');
    expect(conn).not.toBeNull();
    expect(graph.connections).toHaveLength(1);
  });

  it('connection has correct fromNode/toNode', () => {
    const src = graph.createNode('constant_float')!;
    const dst = graph.createNode('math_add')!;
    const conn = graph.connect(src.id, 'value', dst.id, 'b');
    expect(conn!.fromNode).toBe(src.id);
    expect(conn!.toNode).toBe(dst.id);
  });

  it('connect with invalid node id returns null', () => {
    const dst = graph.createNode('math_add')!;
    const conn = graph.connect('bad_id', 'value', dst.id, 'a');
    expect(conn).toBeNull();
  });

  it('removeNode also removes its connections', () => {
    const src = graph.createNode('constant_float')!;
    const dst = graph.createNode('math_add')!;
    graph.connect(src.id, 'value', dst.id, 'a');
    graph.removeNode(src.id);
    expect(graph.connections).toHaveLength(0);
  });
});

// =============================================================================
// Feature 5A: ShaderGraphTypes â€” type compatibility
// =============================================================================

describe('Feature 5A: ShaderGraphTypes â€” type compatibility', () => {
  it('same type is compatible', () => {
    expect(areTypesCompatible('float', 'float')).toBe(true);
  });

  it('float â†’ vec2 is compatible (promotion)', () => {
    expect(areTypesCompatible('float', 'vec2')).toBe(true);
  });

  it('float â†’ vec3 is compatible', () => {
    expect(areTypesCompatible('float', 'vec3')).toBe(true);
  });

  it('float â†’ vec4 is compatible', () => {
    expect(areTypesCompatible('float', 'vec4')).toBe(true);
  });

  it('vec3 â†’ vec4 is compatible (alpha=1)', () => {
    expect(areTypesCompatible('vec3', 'vec4')).toBe(true);
  });

  it('vec4 â†’ vec3 is compatible (drops alpha)', () => {
    expect(areTypesCompatible('vec4', 'vec3')).toBe(true);
  });

  it('sampler2D â†’ float is incompatible', () => {
    expect(areTypesCompatible('sampler2D', 'float')).toBe(false);
  });

  it('float â†’ sampler2D is incompatible', () => {
    expect(areTypesCompatible('float', 'sampler2D')).toBe(false);
  });

  it('vec2 â†’ vec4 is incompatible', () => {
    expect(areTypesCompatible('vec2', 'vec4')).toBe(false);
  });

  it('TYPE_SIZES float = 1', () => {
    expect(TYPE_SIZES.float).toBe(1);
  });

  it('TYPE_SIZES vec3 = 3', () => {
    expect(TYPE_SIZES.vec3).toBe(3);
  });

  it('TYPE_SIZES mat4 = 16', () => {
    expect(TYPE_SIZES.mat4).toBe(16);
  });
});

// =============================================================================
// Feature 5B: ShaderGraphTypes â€” getTypeConversion / templates
// =============================================================================

describe('Feature 5B: ShaderGraphTypes â€” type conversion / templates', () => {
  it('same type returns expression unchanged', () => {
    expect(getTypeConversion('float', 'float', 'x')).toBe('x');
  });

  it('floatâ†’vec3 wraps in vec3<f32>', () => {
    const result = getTypeConversion('float', 'vec3', 'brightness');
    expect(result).toContain('vec3<f32>');
    expect(result).toContain('brightness');
  });

  it('vec3â†’vec4 appends 1.0', () => {
    const result = getTypeConversion('vec3', 'vec4', 'color');
    expect(result).toContain('1.0');
  });

  it('vec4â†’vec3 takes .xyz', () => {
    const result = getTypeConversion('vec4', 'vec3', 'rgba');
    expect(result).toContain('.xyz');
  });

  it('intâ†’float wraps in f32()', () => {
    const result = getTypeConversion('int', 'float', 'n');
    expect(result).toContain('f32');
  });

  it('getNodeTemplate finds math_add', () => {
    const tmpl = getNodeTemplate('math_add');
    expect(tmpl).toBeDefined();
    expect(tmpl?.name).toBe('Add');
  });

  it('getNodeTemplate returns undefined for unknown', () => {
    expect(getNodeTemplate('not_a_real_node')).toBeUndefined();
  });

  it('ALL_NODE_TEMPLATES has many entries', () => {
    expect(ALL_NODE_TEMPLATES.length).toBeGreaterThan(20);
  });

  it('ALL_NODE_TEMPLATES includes output_surface', () => {
    const found = ALL_NODE_TEMPLATES.find((t) => t.type === 'output_surface');
    expect(found).toBeDefined();
  });

  it('ALL_NODE_TEMPLATES includes trig_sin', () => {
    const found = ALL_NODE_TEMPLATES.find((t) => t.type === 'trig_sin');
    expect(found).toBeDefined();
  });
});

// =============================================================================
// Feature 6A: PlatformExporter â€” configure / export / targets
// =============================================================================

describe('Feature 6A: PlatformExporter', () => {
  let exp: PlatformExporter;

  beforeEach(() => {
    exp = new PlatformExporter();
  });

  it('getSupportedTargets returns 6 platforms', () => {
    expect(exp.getSupportedTargets()).toHaveLength(6);
  });

  it('getSupportedTargets includes web', () => {
    expect(exp.getSupportedTargets()).toContain('web');
  });

  it('getConfiguredCount is 0 before configure', () => {
    expect(exp.getConfiguredCount()).toBe(0);
  });

  it('configure returns PlatformConfig with correct target', () => {
    const cfg = exp.configure('web');
    expect(cfg.target).toBe('web');
  });

  it('configure increases getConfiguredCount', () => {
    exp.configure('web');
    exp.configure('vr-quest');
    expect(exp.getConfiguredCount()).toBe(2);
  });

  it('getConfig returns config after configure', () => {
    exp.configure('desktop-win');
    const cfg = exp.getConfig('desktop-win');
    expect(cfg).toBeDefined();
    expect(cfg?.target).toBe('desktop-win');
  });

  it('getConfig returns undefined for unconfigured target', () => {
    expect(exp.getConfig('vr-pcvr')).toBeUndefined();
  });

  it('export generates files array', () => {
    exp.configure('web');
    const result = exp.export('web');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('export result has totalSize > 0', () => {
    exp.configure('web');
    const result = exp.export('web');
    expect(result.totalSize).toBeGreaterThan(0);
  });

  it('export auto-configures if not pre-configured', () => {
    const result = exp.export('vr-quest');
    expect(result.target).toBe('vr-quest');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('exportAll exports all configured targets', () => {
    exp.configure('web');
    exp.configure('desktop-mac');
    const results = exp.exportAll();
    expect(results).toHaveLength(2);
  });

  it('web export includes pwa service worker', () => {
    exp.configure('web');
    const result = exp.export('web');
    const swFile = result.files.find((f) => f.path.includes('sw.js'));
    expect(swFile).toBeDefined();
  });
});

// =============================================================================
// Feature 7A: SceneBundler â€” addAsset, treeShake, splitChunks, bundle
// =============================================================================

describe('Feature 7A: SceneBundler', () => {
  let bundler: SceneBundler;

  function makeAsset(id: string, refs: string[] = [], size = 1024): BundleAsset {
    return { id, type: 'mesh', path: `assets/${id}`, sizeBytes: size, references: refs };
  }

  beforeEach(() => {
    bundler = new SceneBundler({ enableTreeShaking: true });
  });

  it('getAssetCount is 0 initially', () => {
    expect(bundler.getAssetCount()).toBe(0);
  });

  it('addAsset increases getAssetCount', () => {
    bundler.addAsset(makeAsset('a1'));
    expect(bundler.getAssetCount()).toBe(1);
  });

  it('getAsset returns added asset', () => {
    bundler.addAsset(makeAsset('a1'));
    expect(bundler.getAsset('a1')).toBeDefined();
  });

  it('getAsset returns undefined for unknown id', () => {
    expect(bundler.getAsset('nope')).toBeUndefined();
  });

  it('treeShake removes unreachable assets', () => {
    bundler.addAsset(makeAsset('root'));
    bundler.addAsset(makeAsset('orphan'));
    bundler.addEntryPoint('root');
    const removed = bundler.treeShake();
    expect(removed).toContain('orphan');
    expect(bundler.getAsset('orphan')).toBeUndefined();
  });

  it('treeShake keeps reachable assets via reference chain', () => {
    bundler.addAsset(makeAsset('root', ['dep']));
    bundler.addAsset(makeAsset('dep', []));
    bundler.addAsset(makeAsset('orphan'));
    bundler.addEntryPoint('root');
    bundler.treeShake();
    expect(bundler.getAsset('root')).toBeDefined();
    expect(bundler.getAsset('dep')).toBeDefined();
  });

  it('treeShake disabled returns empty array', () => {
    const b2 = new SceneBundler({ enableTreeShaking: false });
    b2.addAsset(makeAsset('a'));
    expect(b2.treeShake()).toEqual([]);
  });

  it('splitChunks creates critical chunk for entry points', () => {
    bundler.addAsset(makeAsset('entry1'));
    bundler.addEntryPoint('entry1');
    const chunks = bundler.splitChunks();
    const critical = chunks.find((c) => c.priority === 'critical');
    expect(critical).toBeDefined();
    expect(critical?.assets).toContain('entry1');
  });

  it('bundle returns manifest with correct totalAssets', () => {
    bundler.addAsset(makeAsset('a', ['b'])); // 'a' references 'b' â†’ both reachable
    bundler.addAsset(makeAsset('b'));
    bundler.addEntryPoint('a');
    const manifest = bundler.bundle();
    expect(manifest.totalAssets).toBe(2);
  });

  it('bundle manifest has non-zero totalSize', () => {
    bundler.addAsset(makeAsset('a', [], 2048));
    bundler.addEntryPoint('a');
    const manifest = bundler.bundle();
    expect(manifest.totalSize).toBe(2048);
  });

  it('bundle manifest treeShakenCount reflects removed assets', () => {
    bundler.addAsset(makeAsset('entry'));
    bundler.addAsset(makeAsset('unused'));
    bundler.addEntryPoint('entry');
    const manifest = bundler.bundle();
    expect(manifest.treeShakenCount).toBe(1);
  });

  it('bundle manifest has valid buildId string', () => {
    const manifest = bundler.bundle();
    expect(manifest.buildId).toContain('build_');
  });
});
