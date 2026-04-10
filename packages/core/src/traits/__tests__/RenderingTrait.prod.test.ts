/**
 * RenderingTrait — Production Test Suite
 *
 * RenderingTrait is a CLASS (not a handler) with a rich API:
 * - constructor defaults (lodStrategy, culling, batching, textures, shaders, etc.)
 * - getOptimization() — deep clone
 * - updateOptimization() — partial merge
 * - setupLODLevels() — fills 3 LOD levels
 * - getLODLevels() — returns copy
 * - setCulling() / setFrustumCulling() / setOcclusionCulling()
 * - setBatching() / setInstancing()
 * - setTextureOptimization() / setTextureStreaming() / setTextureCompression() / setMaxTextureResolution()
 * - setShaderOptimization()
 * - setTargetGPUTier() / setAdaptiveQuality() / setFixedTimestep()
 * - getPresetForQuality() — 4 presets
 * - applyQualityPreset()
 * - estimateGPUMemory()
 * - getInfo()
 * - optimizeForVRAR() / optimizeForMobile() / optimizeForDesktop()
 * - createRenderingTrait() factory
 */
import { describe, it, expect } from 'vitest';
import { RenderingTrait, createRenderingTrait } from '../RenderingTrait';
import type { RenderingOptimization } from '../RenderingTrait';

// ─── constructor defaults ────────────────────────────────────────────────────

describe('RenderingTrait — constructor defaults', () => {
  it('lodStrategy=automatic', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().lodStrategy).toBe('automatic');
  });

  it('culling.mode=back', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().culling?.mode).toBe('back');
  });

  it('culling.frustum=true', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().culling?.frustum).toBe(true);
  });

  it('culling.occlusion=true', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().culling?.occlusion).toBe(true);
  });

  it('batching.static=true', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().batching?.static).toBe(true);
  });

  it('batching.instancing=true', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().batching?.instancing).toBe(true);
  });

  it('batching.maxInstanceCount=1000', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().batching?.maxInstanceCount).toBe(1000);
  });

  it('textures.compression=auto', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().textures?.compression).toBe('auto');
  });

  it('textures.maxResolution=2048', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().textures?.maxResolution).toBe(2048);
  });

  it('targetGPUTier=high', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().targetGPUTier).toBe('high');
  });

  it('adaptiveQuality=true', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().adaptiveQuality).toBe(true);
  });

  it('targetFrameRate=60', () => {
    const t = new RenderingTrait();
    expect(t.getOptimization().targetFrameRate).toBe(60);
  });

  it('custom config overrides defaults', () => {
    const t = new RenderingTrait({ targetFrameRate: 120, targetGPUTier: 'ultra' });
    const opt = t.getOptimization();
    expect(opt.targetFrameRate).toBe(120);
    expect(opt.targetGPUTier).toBe('ultra');
  });
});

// ─── getOptimization ─────────────────────────────────────────────────────────

describe('RenderingTrait.getOptimization', () => {
  it('returns a deep copy (mutation does not affect internal state)', () => {
    const t = new RenderingTrait();
    const opt = t.getOptimization();
    opt.targetFrameRate = 999;
    expect(t.getOptimization().targetFrameRate).toBe(60);
  });
});

// ─── updateOptimization ───────────────────────────────────────────────────────

describe('RenderingTrait.updateOptimization', () => {
  it('merges partial updates', () => {
    const t = new RenderingTrait();
    t.updateOptimization({ targetFrameRate: 90, targetGPUTier: 'medium' });
    const opt = t.getOptimization();
    expect(opt.targetFrameRate).toBe(90);
    expect(opt.targetGPUTier).toBe('medium');
  });

  it('preserves existing fields not in update', () => {
    const t = new RenderingTrait();
    t.updateOptimization({ targetFrameRate: 30 });
    expect(t.getOptimization().lodStrategy).toBe('automatic');
  });
});

// ─── setupLODLevels / getLODLevels ───────────────────────────────────────────

describe('RenderingTrait.setupLODLevels', () => {
  it('creates 3 LOD levels', () => {
    const t = new RenderingTrait();
    t.setupLODLevels();
    expect(t.getLODLevels()).toHaveLength(3);
  });

  it('LOD 0 has polygonReduction=1.0 and textureScale=1.0', () => {
    const t = new RenderingTrait();
    t.setupLODLevels();
    const lod0 = t.getLODLevels()[0];
    expect(lod0.polygonReduction).toBe(1.0);
    expect(lod0.textureScale).toBe(1.0);
  });

  it('LOD 1 disables specular', () => {
    const t = new RenderingTrait();
    t.setupLODLevels();
    expect(t.getLODLevels()[1].disabledFeatures).toContain('specular');
  });

  it('LOD 2 disables specular and normals', () => {
    const t = new RenderingTrait();
    t.setupLODLevels();
    const lod2 = t.getLODLevels()[2];
    expect(lod2.disabledFeatures).toContain('specular');
    expect(lod2.disabledFeatures).toContain('normals');
  });

  it('accepts custom strategy', () => {
    const t = new RenderingTrait();
    t.setupLODLevels('manual');
    expect(t.getOptimization().lodStrategy).toBe('manual');
  });

  it('getLODLevels returns copy (mutation safe)', () => {
    const t = new RenderingTrait();
    t.setupLODLevels();
    const levels = t.getLODLevels();
    levels.pop();
    expect(t.getLODLevels()).toHaveLength(3);
  });
});

// ─── setCulling / setFrustumCulling / setOcclusionCulling ─────────────────────

describe('RenderingTrait.setCulling', () => {
  it('sets culling mode', () => {
    const t = new RenderingTrait();
    t.setCulling({ mode: 'none' });
    expect(t.getOptimization().culling?.mode).toBe('none');
  });

  it('merges with existing culling config', () => {
    const t = new RenderingTrait();
    t.setCulling({ hierarchicalZ: true });
    expect(t.getOptimization().culling?.mode).toBe('back'); // preserved
    expect(t.getOptimization().culling?.hierarchicalZ).toBe(true);
  });
});

describe('RenderingTrait.setFrustumCulling', () => {
  it('disables frustum culling', () => {
    const t = new RenderingTrait();
    t.setFrustumCulling(false);
    expect(t.getOptimization().culling?.frustum).toBe(false);
  });
});

describe('RenderingTrait.setOcclusionCulling', () => {
  it('enables occlusion culling with distance', () => {
    const t = new RenderingTrait();
    t.setOcclusionCulling(true, 100);
    expect(t.getOptimization().culling?.occlusion).toBe(true);
    expect(t.getOptimization().culling?.occlusionDistance).toBe(100);
  });

  it('sets without distance — distance unchanged', () => {
    const t = new RenderingTrait();
    t.setOcclusionCulling(false);
    expect(t.getOptimization().culling?.occlusion).toBe(false);
    expect(t.getOptimization().culling?.occlusionDistance).toBeUndefined();
  });
});

// ─── setBatching / setInstancing ──────────────────────────────────────────────

describe('RenderingTrait.setBatching', () => {
  it('merges batching config', () => {
    const t = new RenderingTrait();
    t.setBatching({ maxBatchSize: 65536, dynamic: false });
    expect(t.getOptimization().batching?.maxBatchSize).toBe(65536);
    expect(t.getOptimization().batching?.dynamic).toBe(false);
  });
});

describe('RenderingTrait.setInstancing', () => {
  it('enables instancing with maxInstances', () => {
    const t = new RenderingTrait();
    t.setInstancing(true, 2500);
    expect(t.getOptimization().batching?.instancing).toBe(true);
    expect(t.getOptimization().batching?.maxInstanceCount).toBe(2500);
  });

  it('disables instancing', () => {
    const t = new RenderingTrait();
    t.setInstancing(false);
    expect(t.getOptimization().batching?.instancing).toBe(false);
  });
});

// ─── texture optimization ──────────────────────────────────────────────────────

describe('RenderingTrait — texture optimization', () => {
  it('setTextureOptimization merges config', () => {
    const t = new RenderingTrait();
    t.setTextureOptimization({ virtualTexturing: true, streamingBudget: 512 });
    expect(t.getOptimization().textures?.virtualTexturing).toBe(true);
    expect(t.getOptimization().textures?.streamingBudget).toBe(512);
  });

  it('setTextureStreaming enables with budget', () => {
    const t = new RenderingTrait();
    t.setTextureStreaming(true, 256);
    expect(t.getOptimization().textures?.streaming).toBe(true);
    expect(t.getOptimization().textures?.streamingBudget).toBe(256);
  });

  it('setTextureCompression sets compression', () => {
    const t = new RenderingTrait();
    t.setTextureCompression('astc');
    expect(t.getOptimization().textures?.compression).toBe('astc');
  });

  it('setMaxTextureResolution sets resolution', () => {
    const t = new RenderingTrait();
    t.setMaxTextureResolution(512);
    expect(t.getOptimization().textures?.maxResolution).toBe(512);
  });
});

// ─── shader, GPU tier, adaptive quality ───────────────────────────────────────

describe('RenderingTrait — shader / GPU / quality', () => {
  it('setShaderOptimization merges config', () => {
    const t = new RenderingTrait();
    t.setShaderOptimization({ lodBias: 2, simplifiedShaders: false });
    expect(t.getOptimization().shaders?.lodBias).toBe(2);
    expect(t.getOptimization().shaders?.simplifiedShaders).toBe(false);
  });

  it('setTargetGPUTier sets tier', () => {
    const t = new RenderingTrait();
    t.setTargetGPUTier('low');
    expect(t.getOptimization().targetGPUTier).toBe('low');
  });

  it('setAdaptiveQuality sets quality and targetFrameRate', () => {
    const t = new RenderingTrait();
    t.setAdaptiveQuality(true, 90);
    expect(t.getOptimization().adaptiveQuality).toBe(true);
    expect(t.getOptimization().targetFrameRate).toBe(90);
  });

  it('setFixedTimestep sets timestep', () => {
    const t = new RenderingTrait();
    t.setFixedTimestep(1 / 90);
    expect(t.getOptimization().fixedTimestep).toBeCloseTo(1 / 90, 10);
  });
});

// ─── quality presets ──────────────────────────────────────────────────────────

describe('RenderingTrait.getPresetForQuality', () => {
  it('low preset: targetGPUTier=low, targetFrameRate=30', () => {
    const t = new RenderingTrait();
    const p = t.getPresetForQuality('low');
    expect(p.targetGPUTier).toBe('low');
    expect(p.targetFrameRate).toBe(30);
  });

  it('medium preset: maxResolution=1024', () => {
    const t = new RenderingTrait();
    const p = t.getPresetForQuality('medium');
    expect(p.textures?.maxResolution).toBe(1024);
  });

  it('high preset: adaptiveQuality=false', () => {
    const t = new RenderingTrait();
    const p = t.getPresetForQuality('high');
    expect(p.adaptiveQuality).toBe(false);
  });

  it('ultra preset: targetGPUTier=ultra, targetFrameRate=120', () => {
    const t = new RenderingTrait();
    const p = t.getPresetForQuality('ultra');
    expect(p.targetGPUTier).toBe('ultra');
    expect(p.targetFrameRate).toBe(120);
  });

  it('ultra preset: hierarchicalZ=true', () => {
    const t = new RenderingTrait();
    const p = t.getPresetForQuality('ultra');
    expect(p.culling?.hierarchicalZ).toBe(true);
  });
});

describe('RenderingTrait.applyQualityPreset', () => {
  it('applies preset to internal state', () => {
    const t = new RenderingTrait();
    t.applyQualityPreset('low');
    expect(t.getOptimization().targetGPUTier).toBe('low');
    expect(t.getOptimization().targetFrameRate).toBe(30);
  });
});

// ─── estimateGPUMemory ────────────────────────────────────────────────────────

describe('RenderingTrait.estimateGPUMemory', () => {
  it('returns textureMemory, vertexBuffers, estimatedTotal', () => {
    const t = new RenderingTrait();
    const mem = t.estimateGPUMemory();
    expect(mem).toHaveProperty('textureMemory');
    expect(mem).toHaveProperty('vertexBuffers');
    expect(mem).toHaveProperty('estimatedTotal');
  });

  it('textureMemory for 2048 = 16MB (2048*2048*4/1024/1024 = 16)', () => {
    const t = new RenderingTrait();
    const { textureMemory } = t.estimateGPUMemory();
    expect(textureMemory).toBe(16);
  });

  it('lower resolution reduces textureMemory', () => {
    const t = new RenderingTrait();
    t.setMaxTextureResolution(512);
    const { textureMemory } = t.estimateGPUMemory();
    expect(textureMemory).toBe(1); // 512*512*4/1024/1024 = 1MB
  });

  it('estimatedTotal >= textureMemory + 1', () => {
    const t = new RenderingTrait();
    const { textureMemory, estimatedTotal } = t.estimateGPUMemory();
    expect(estimatedTotal).toBeGreaterThanOrEqual(textureMemory + 1);
  });
});

// ─── getInfo ──────────────────────────────────────────────────────────────────

describe('RenderingTrait.getInfo', () => {
  it('returns string containing tier, LOD, culling', () => {
    const t = new RenderingTrait();
    const info = t.getInfo();
    expect(info).toContain('tier=high');
    expect(info).toContain('LOD=automatic');
    expect(info).toContain('culling=back');
  });

  it('reflects changes after setTargetGPUTier', () => {
    const t = new RenderingTrait();
    t.setTargetGPUTier('ultra');
    expect(t.getInfo()).toContain('tier=ultra');
  });
});

// ─── optimizeFor* ──────────────────────────────────────────────────────────────

describe('RenderingTrait.optimizeForVRAR', () => {
  it('sets fixedTimestep=1/90 and targetFrameRate=90', () => {
    const t = new RenderingTrait();
    t.optimizeForVRAR(90);
    expect(t.getOptimization().fixedTimestep).toBeCloseTo(1 / 90, 10);
    expect(t.getOptimization().targetFrameRate).toBe(90);
  });

  it('enables instancing to 5000', () => {
    const t = new RenderingTrait();
    t.optimizeForVRAR();
    expect(t.getOptimization().batching?.maxInstanceCount).toBe(5000);
  });
});

describe('RenderingTrait.optimizeForMobile', () => {
  it('applies low preset (targetGPUTier=low)', () => {
    const t = new RenderingTrait();
    t.optimizeForMobile();
    expect(t.getOptimization().targetGPUTier).toBe('low');
  });

  it('sets texture compression to astc', () => {
    const t = new RenderingTrait();
    t.optimizeForMobile();
    expect(t.getOptimization().textures?.compression).toBe('astc');
  });
});

describe('RenderingTrait.optimizeForDesktop', () => {
  it('applies ultra preset (targetGPUTier=ultra)', () => {
    const t = new RenderingTrait();
    t.optimizeForDesktop();
    expect(t.getOptimization().targetGPUTier).toBe('ultra');
  });
});

// ─── createRenderingTrait factory ────────────────────────────────────────────

describe('createRenderingTrait', () => {
  it('returns a RenderingTrait instance', () => {
    const t = createRenderingTrait();
    expect(t).toBeInstanceOf(RenderingTrait);
  });

  it('passes config overrides', () => {
    const t = createRenderingTrait({ targetGPUTier: 'medium' });
    expect(t.getOptimization().targetGPUTier).toBe('medium');
  });
});
