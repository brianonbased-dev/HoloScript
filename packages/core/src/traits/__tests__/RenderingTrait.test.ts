import { describe, it, expect, beforeEach } from 'vitest';
import { RenderingTrait } from '../RenderingTrait';

describe('RenderingTrait', () => {
  let rt: RenderingTrait;

  beforeEach(() => {
    rt = new RenderingTrait();
  });

  it('initializes with default optimization', () => {
    const opt = rt.getOptimization();
    expect(opt).toBeDefined();
    expect(typeof opt.adaptiveQuality).toBe('boolean');
  });

  it('updateOptimization merges values', () => {
    rt.updateOptimization({ adaptiveQuality: true, targetFrameRate: 90 });
    const opt = rt.getOptimization();
    expect(opt.adaptiveQuality).toBe(true);
    expect(opt.targetFrameRate).toBe(90);
  });

  it('setupLODLevels creates levels', () => {
    rt.setupLODLevels('automatic');
    const levels = rt.getLODLevels();
    expect(levels.length).toBeGreaterThan(0);
  });

  it('setCulling updates culling config', () => {
    rt.setCulling({ mode: 'frustum', frustum: true });
    const opt = rt.getOptimization();
    expect(opt.culling?.mode).toBe('frustum');
    expect(opt.culling?.frustum).toBe(true);
  });

  it('setFrustumCulling toggles', () => {
    rt.setFrustumCulling(true);
    expect(rt.getOptimization().culling?.frustum).toBe(true);
    rt.setFrustumCulling(false);
    expect(rt.getOptimization().culling?.frustum).toBe(false);
  });

  it('setOcclusionCulling enables with distance', () => {
    rt.setOcclusionCulling(true, 100);
    const c = rt.getOptimization().culling;
    expect(c?.occlusion).toBe(true);
    expect(c?.occlusionDistance).toBe(100);
  });

  it('setBatching updates config', () => {
    rt.setBatching({ static: true, dynamic: false, maxBatchSize: 200 });
    const b = rt.getOptimization().batching;
    expect(b?.static).toBe(true);
    expect(b?.maxBatchSize).toBe(200);
  });

  it('setInstancing configures instancing', () => {
    rt.setInstancing(true, 500);
    const b = rt.getOptimization().batching;
    expect(b?.instancing).toBe(true);
    expect(b?.maxInstanceCount).toBe(500);
  });

  it('setTextureOptimization updates', () => {
    rt.setTextureOptimization({ mipmaps: true, compression: 'astc' });
    const t = rt.getOptimization().textures;
    expect(t?.mipmaps).toBe(true);
    expect(t?.compression).toBe('astc');
  });

  it('setTextureStreaming enables with budget', () => {
    rt.setTextureStreaming(true, 256);
    const t = rt.getOptimization().textures;
    expect(t?.streaming).toBe(true);
    expect(t?.streamingBudget).toBe(256);
  });

  it('optimizeForVRAR sets high FPS target', () => {
    rt.optimizeForVRAR(90);
    const opt = rt.getOptimization();
    expect(opt.targetFrameRate).toBe(90);
  });

  it('dispose does not throw', () => {
    expect(() => rt.dispose()).not.toThrow();
  });
});
