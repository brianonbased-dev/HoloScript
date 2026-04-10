import { describe, it, expect, beforeEach } from 'vitest';
import {
  RenderingTrait,
  createRenderingTrait,
  type RenderingOptimization,
} from '../traits/RenderingTrait';

describe('RenderingTrait', () => {
  let rendering: RenderingTrait;

  beforeEach(() => {
    rendering = new RenderingTrait();
  });

  describe('initialization', () => {
    it('should initialize with default optimization settings', () => {
      const opt = rendering.getOptimization();
      expect(opt.lodStrategy).toBe('automatic');
      expect(opt.targetGPUTier).toBe('high');
      expect(opt.culling?.frustum).toBe(true);
    });

    it('should initialize with custom configuration', () => {
      const config: RenderingOptimization = {
        lodStrategy: 'manual',
        targetGPUTier: 'low',
        adaptiveQuality: false,
      };
      const ren = new RenderingTrait(config);
      const opt = ren.getOptimization();
      expect(opt.lodStrategy).toBe('manual');
      expect(opt.targetGPUTier).toBe('low');
      expect(opt.adaptiveQuality).toBe(false);
    });
  });

  describe('configuration management', () => {
    it('should get optimization configuration', () => {
      const opt = rendering.getOptimization();
      expect(opt).toBeDefined();
      expect(opt.targetGPUTier).toBeDefined();
    });

    it('should update optimization configuration', () => {
      rendering.updateOptimization({
        targetGPUTier: 'medium',
        targetFrameRate: 30,
      });
      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('medium');
      expect(opt.targetFrameRate).toBe(30);
    });
  });

  describe('LOD management', () => {
    it('should setup LOD levels', () => {
      rendering.setupLODLevels('automatic');
      const levels = rendering.getLODLevels();
      expect(levels).toHaveLength(3);
      expect(levels[0].level).toBe(0);
      expect(levels[1].level).toBe(1);
      expect(levels[2].level).toBe(2);
    });

    it('should have screen-relative size thresholds', () => {
      rendering.setupLODLevels();
      const levels = rendering.getLODLevels();
      expect(levels[0].screenRelativeSize).toBe(0.5);
      expect(levels[1].screenRelativeSize).toBe(0.25);
      expect(levels[2].screenRelativeSize).toBe(0.1);
    });

    it('should have polygon reduction ratios', () => {
      rendering.setupLODLevels();
      const levels = rendering.getLODLevels();
      expect(levels[0].polygonReduction).toBe(1.0);
      expect(levels[1].polygonReduction).toBe(0.6);
      expect(levels[2].polygonReduction).toBe(0.3);
    });

    it('should disable features at higher LOD levels', () => {
      rendering.setupLODLevels();
      const levels = rendering.getLODLevels();
      expect(levels[1].disabledFeatures).toContain('specular');
      expect(levels[2].disabledFeatures).toContain('specular');
      expect(levels[2].disabledFeatures).toContain('normals');
    });

    it('should scale textures at higher LOD levels', () => {
      rendering.setupLODLevels();
      const levels = rendering.getLODLevels();
      expect(levels[0].textureScale).toBe(1.0);
      expect(levels[1].textureScale).toBe(0.5);
      expect(levels[2].textureScale).toBe(0.25);
    });
  });

  describe('culling configuration', () => {
    it('should set culling mode', () => {
      rendering.setCulling({ mode: 'front' });
      const opt = rendering.getOptimization();
      expect(opt.culling?.mode).toBe('front');
    });

    it('should enable frustum culling', () => {
      rendering.setFrustumCulling(false);
      const opt = rendering.getOptimization();
      expect(opt.culling?.frustum).toBe(false);
    });

    it('should enable occlusion culling', () => {
      rendering.setOcclusionCulling(true, 50);
      const opt = rendering.getOptimization();
      expect(opt.culling?.occlusion).toBe(true);
      expect(opt.culling?.occlusionDistance).toBe(50);
    });

    it('should configure all culling options', () => {
      rendering.setCulling({
        mode: 'back',
        frustum: true,
        occlusion: true,
        hierarchicalZ: true,
      });
      const opt = rendering.getOptimization();
      expect(opt.culling?.hierarchicalZ).toBe(true);
    });
  });

  describe('batching configuration', () => {
    it('should configure batching', () => {
      rendering.setBatching({
        static: true,
        dynamic: false,
        maxBatchSize: 2048,
      });
      const opt = rendering.getOptimization();
      expect(opt.batching?.static).toBe(true);
      expect(opt.batching?.dynamic).toBe(false);
      expect(opt.batching?.maxBatchSize).toBe(2048);
    });

    it('should enable GPU instancing', () => {
      rendering.setInstancing(true, 2000);
      const opt = rendering.getOptimization();
      expect(opt.batching?.instancing).toBe(true);
      expect(opt.batching?.maxInstanceCount).toBe(2000);
    });

    it('should disable GPU instancing', () => {
      rendering.setInstancing(false);
      const opt = rendering.getOptimization();
      expect(opt.batching?.instancing).toBe(false);
    });
  });

  describe('texture optimization', () => {
    it('should configure texture optimization', () => {
      rendering.setTextureOptimization({
        streaming: true,
        compression: 'basis',
        mipmaps: true,
      });
      const opt = rendering.getOptimization();
      expect(opt.textures?.streaming).toBe(true);
      expect(opt.textures?.compression).toBe('basis');
    });

    it('should enable texture streaming with budget', () => {
      rendering.setTextureStreaming(true, 256);
      const opt = rendering.getOptimization();
      expect(opt.textures?.streaming).toBe(true);
      expect(opt.textures?.streamingBudget).toBe(256);
    });

    it('should set texture compression', () => {
      rendering.setTextureCompression('astc');
      const opt = rendering.getOptimization();
      expect(opt.textures?.compression).toBe('astc');
    });

    it('should set max texture resolution', () => {
      rendering.setMaxTextureResolution(1024);
      const opt = rendering.getOptimization();
      expect(opt.textures?.maxResolution).toBe(1024);
    });
  });

  describe('shader optimization', () => {
    it('should configure shader optimization', () => {
      rendering.setShaderOptimization({
        lodBias: 0.5,
        simplifiedShaders: true,
      });
      const opt = rendering.getOptimization();
      expect(opt.shaders?.lodBias).toBe(0.5);
      expect(opt.shaders?.simplifiedShaders).toBe(true);
    });
  });

  describe('GPU tier targeting', () => {
    it('should set target GPU tier', () => {
      rendering.setTargetGPUTier('ultra');
      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('ultra');
    });
  });

  describe('adaptive quality', () => {
    it('should enable adaptive quality', () => {
      rendering.setAdaptiveQuality(true, 60);
      const opt = rendering.getOptimization();
      expect(opt.adaptiveQuality).toBe(true);
      expect(opt.targetFrameRate).toBe(60);
    });

    it('should disable adaptive quality', () => {
      rendering.setAdaptiveQuality(false);
      const opt = rendering.getOptimization();
      expect(opt.adaptiveQuality).toBe(false);
    });
  });

  describe('VR/AR optimization', () => {
    it('should set fixed timestep for VR', () => {
      rendering.setFixedTimestep(1 / 90);
      const opt = rendering.getOptimization();
      expect(opt.fixedTimestep).toBe(1 / 90);
    });

    it('should optimize for VR/AR', () => {
      rendering.optimizeForVRAR(90);
      const opt = rendering.getOptimization();
      expect(opt.fixedTimestep).toBe(1 / 90);
      expect(opt.targetFrameRate).toBe(90);
      expect(opt.culling?.occlusion).toBe(true);
      expect(opt.batching?.instancing).toBe(true);
    });
  });

  describe('quality presets', () => {
    it('should get low quality preset', () => {
      const preset = rendering.getPresetForQuality('low');
      expect(preset.targetGPUTier).toBe('low');
      expect(preset.textures?.maxResolution).toBe(512);
      expect(preset.targetFrameRate).toBe(30);
    });

    it('should get medium quality preset', () => {
      const preset = rendering.getPresetForQuality('medium');
      expect(preset.targetGPUTier).toBe('medium');
      expect(preset.textures?.maxResolution).toBe(1024);
      expect(preset.targetFrameRate).toBe(60);
    });

    it('should get high quality preset', () => {
      const preset = rendering.getPresetForQuality('high');
      expect(preset.targetGPUTier).toBe('high');
      expect(preset.textures?.maxResolution).toBe(2048);
      expect(preset.targetFrameRate).toBe(60);
    });

    it('should get ultra quality preset', () => {
      const preset = rendering.getPresetForQuality('ultra');
      expect(preset.targetGPUTier).toBe('ultra');
      expect(preset.textures?.maxResolution).toBe(4096);
      expect(preset.targetFrameRate).toBe(120);
    });

    it('should apply quality preset', () => {
      rendering.applyQualityPreset('low');
      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('low');
      expect(opt.targetFrameRate).toBe(30);
    });
  });

  describe('platform optimization', () => {
    it('should optimize for mobile', () => {
      rendering.optimizeForMobile();
      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('low');
      expect(opt.textures?.compression).toBe('astc');
      expect(opt.batching?.maxInstanceCount).toBe(256);
    });

    it('should optimize for desktop', () => {
      rendering.optimizeForDesktop();
      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('ultra');
      expect(opt.textures?.compression).toBe('none');
      expect(opt.batching?.maxInstanceCount).toBe(5000);
    });
  });

  describe('memory estimation', () => {
    it('should estimate GPU memory usage', () => {
      const memory = rendering.estimateGPUMemory();
      // With default 2048 texture res: 2048*2048*4 bytes = 16MB
      expect(memory.textureMemory).toBeGreaterThan(10); // At least 10MB for texture
      expect(memory.vertexBuffers).toBeGreaterThan(0);
      expect(memory.estimatedTotal).toBeGreaterThan(0);
    });

    it('should scale memory estimate with resolution', () => {
      rendering.setMaxTextureResolution(512);
      const low = rendering.estimateGPUMemory();

      rendering.setMaxTextureResolution(4096);
      const high = rendering.estimateGPUMemory();

      expect(high.textureMemory).toBeGreaterThan(low.textureMemory);
    });

    it('should scale memory estimate with instancing', () => {
      rendering.setInstancing(true, 500);
      const low = rendering.estimateGPUMemory();

      rendering.setInstancing(true, 5000);
      const high = rendering.estimateGPUMemory();

      expect(high.vertexBuffers).toBeGreaterThan(low.vertexBuffers);
    });
  });

  describe('info generation', () => {
    it('should generate rendering info string', () => {
      const info = rendering.getInfo();
      expect(info).toContain('Rendering:');
      expect(info).toContain('tier=');
      expect(info).toContain('LOD=');
      expect(info).toContain('memory=');
    });
  });

  describe('factory function', () => {
    it('should create rendering trait via factory', () => {
      const ren = createRenderingTrait();
      expect(ren.getOptimization().lodStrategy).toBe('automatic');
    });

    it('should create with custom config via factory', () => {
      const config: RenderingOptimization = {
        targetGPUTier: 'low',
        targetFrameRate: 30,
      };
      const ren = createRenderingTrait(config);
      const opt = ren.getOptimization();
      expect(opt.targetGPUTier).toBe('low');
      expect(opt.targetFrameRate).toBe(30);
    });
  });

  describe('complex rendering setup', () => {
    it('should setup complete rendering pipeline for outdoor scene', () => {
      rendering.applyQualityPreset('high');
      rendering.setupLODLevels('automatic');
      rendering.setFrustumCulling(true);
      rendering.setOcclusionCulling(true, 100);
      rendering.setInstancing(true, 2000);
      rendering.setTextureStreaming(true, 512);
      rendering.setTextureCompression('dxt');
      rendering.setMaxTextureResolution(2048);

      const info = rendering.getInfo();
      expect(info).toContain('high');
      expect(info).toContain('automatic');

      const memory = rendering.estimateGPUMemory();
      expect(memory.estimatedTotal).toBeGreaterThan(0);
    });

    it('should optimize for mobile AR', () => {
      rendering.optimizeForVRAR(60);
      rendering.optimizeForMobile();

      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('low');
      expect(opt.targetFrameRate).toBe(30); // Mobile preset overrides to 30
      // fixedTimestep should be from previous VR call but gets overridden
    });

    it('should optimize for desktop VR', () => {
      rendering.optimizeForVRAR(90);
      rendering.optimizeForDesktop();

      const opt = rendering.getOptimization();
      expect(opt.targetGPUTier).toBe('ultra');
      // Desktop preset overrides targetFrameRate to 120
      expect(opt.targetFrameRate).toBe(120);
    });
  });

  describe('LOD configuration details', () => {
    it('should have proper LOD texel density', () => {
      rendering.setupLODLevels('manual');
      const levels = rendering.getLODLevels();

      // Each LOD level should have decreasing texture scale
      for (let i = 1; i < levels.length; i++) {
        const prevScale = levels[i - 1].textureScale || 1;
        const currScale = levels[i].textureScale || 1;
        expect(currScale).toBeLessThan(prevScale);
      }
    });

    it('should transition features progressively', () => {
      rendering.setupLODLevels();
      const levels = rendering.getLODLevels();

      expect(levels[0].disabledFeatures?.length || 0).toBe(0);
      expect(levels[1].disabledFeatures?.length || 0).toBeGreaterThan(0);
      expect(levels[2].disabledFeatures?.length || 0).toBeGreaterThan(
        levels[1].disabledFeatures?.length || 0
      );
    });
  });

  describe('disposal', () => {
    it('should dispose and cleanup', () => {
      rendering.dispose();
      // Verify no error after disposal
      expect(() => rendering.getOptimization()).not.toThrow();
    });
  });
});
