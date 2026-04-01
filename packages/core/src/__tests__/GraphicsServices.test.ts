/**
 * Graphics Services Tests
 *
 * Tests for HololandGraphicsPipelineService and PlatformPerformanceOptimizer
 */

import { describe, it, expect } from 'vitest';
import { HololandGraphicsPipelineService } from '../services/HololandGraphicsPipelineService';
import { PlatformPerformanceOptimizer } from '../services/PlatformPerformanceOptimizer';
import type { GraphicsConfiguration } from '../HoloScriptPlusParser';

// ============================================================================
// Hololand Graphics Pipeline Service Tests
// ============================================================================

describe('HololandGraphicsPipelineService', () => {
  describe('Initialization', () => {
    it('should create instance with default settings', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      expect(service).toBeDefined();
    });

    it('should initialize for mobile platform', () => {
      const service = new HololandGraphicsPipelineService('mobile');
      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(256); // Mobile budget
    });

    it('should initialize for VR platform', () => {
      const service = new HololandGraphicsPipelineService('vr');
      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(512); // VR budget
    });

    it('should initialize for desktop platform', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(2048); // Desktop budget
    });
  });

  describe('GPU Memory Management', () => {
    it('should estimate GPU memory correctly', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      const estimate = service.getGPUMemoryEstimate();

      expect(estimate.textureMemory).toBeGreaterThanOrEqual(0);
      expect(estimate.geometryMemory).toBeGreaterThanOrEqual(0);
      expect(estimate.estimatedTotal).toBeGreaterThanOrEqual(0);
      expect(estimate.utilization).toBeGreaterThanOrEqual(0);
    });

    it('should track memory utilization', () => {
      const service = new HololandGraphicsPipelineService('mobile');
      const estimate = service.getGPUMemoryEstimate();

      // Should not exceed budget
      expect(estimate.utilization).toBeLessThanOrEqual(100);
    });

    it('should allow setting memory budget', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      service.setMemoryBudget(1024);

      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(1024);
    });
  });

  describe('Platform Optimization', () => {
    it('should optimize for mobile', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      service.optimizePlatform('mobile');

      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(256);
    });

    it('should optimize for VR', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      service.optimizePlatform('vr');

      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(512);
    });

    it('should optimize for desktop', () => {
      const service = new HololandGraphicsPipelineService('mobile');
      service.optimizePlatform('desktop');

      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.budget).toBe(2048);
    });
  });

  describe('Performance Metrics', () => {
    it('should return performance metrics', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      const metrics = service.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.drawCalls).toBeGreaterThanOrEqual(0);
      expect(metrics.fps).toBeGreaterThanOrEqual(0);
      expect(metrics.gpuMemoryUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Graphics Configuration', () => {
    it('should initialize from graphics configuration', () => {
      const service = new HololandGraphicsPipelineService('desktop');
      const config: GraphicsConfiguration = {
        material: { type: 'pbr', pbr: { metallic: 0.5 } },
        lighting: { preset: 'studio' },
        rendering: { quality: 'high' },
      };

      service.initialize(config);

      const estimate = service.getGPUMemoryEstimate();
      expect(estimate.estimatedTotal).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Platform Performance Optimizer Tests
// ============================================================================

describe('PlatformPerformanceOptimizer', () => {
  describe('Device Capabilities Detection', () => {
    it('should detect mobile device capabilities', () => {
      const device = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const profile = optimizer.getProfile();

      expect(profile.qualityLevel).toBe('low');
      expect(profile.fpsTarget).toBe(30);
    });

    it('should detect VR device capabilities', () => {
      const device = {
        platform: 'vr' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 2070',
        gpuMemory: 8192,
        cpuCores: 8,
        ramTotal: 16384,
        screenResolution: { width: 1832, height: 1920 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const profile = optimizer.getProfile();

      expect(profile.fpsTarget).toBe(90);
      expect(profile.qualityLevel).toBe('high');
    });

    it('should detect desktop device capabilities', () => {
      const device = {
        platform: 'desktop' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 3090',
        gpuMemory: 24576,
        cpuCores: 16,
        ramTotal: 32768,
        screenResolution: { width: 3440, height: 1440 },
        refreshRate: 165,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const profile = optimizer.getProfile();

      expect(profile.qualityLevel).toBe('ultra');
      expect(profile.fpsTarget).toBe(165);
    });
  });

  describe('Device Optimization', () => {
    it('should generate mobile optimization settings', () => {
      const device = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const settings = optimizer.optimizeForDevice();

      expect(settings.platform).toBe('mobile');
      expect(settings.quality).toBe('low');
      expect(settings.textureResolution).toBeLessThanOrEqual(512);
    });

    it('should generate VR optimization settings', () => {
      const device = {
        platform: 'vr' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 2070',
        gpuMemory: 8192,
        cpuCores: 8,
        ramTotal: 16384,
        screenResolution: { width: 1832, height: 1920 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const settings = optimizer.optimizeForDevice();

      expect(settings.platform).toBe('vr');
      expect(settings.quality).toBe('high');
    });

    it('should generate desktop optimization settings', () => {
      const device = {
        platform: 'desktop' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 3090',
        gpuMemory: 24576,
        cpuCores: 16,
        ramTotal: 32768,
        screenResolution: { width: 3440, height: 1440 },
        refreshRate: 165,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const settings = optimizer.optimizeForDevice();

      expect(settings.platform).toBe('desktop');
      expect(settings.quality).toBe('ultra');
      expect(settings.textureResolution).toBe(4096);
    });
  });

  describe('Adaptive Quality', () => {
    it('should track frame metrics', () => {
      const device = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);

      // Simulate frame updates
      optimizer.updateFrameMetrics(30, 500, 16.67);
      optimizer.updateFrameMetrics(28, 520, 17.5);
      optimizer.updateFrameMetrics(25, 550, 20);

      // Should track without errors
    });

    it('should provide recommendations for low FPS', () => {
      const device = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);

      // Simulate low FPS frames
      for (let i = 0; i < 10; i++) {
        optimizer.updateFrameMetrics(20, 600, 50);
      }

      const recommendations = optimizer.getRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should provide recommendations for low power mode', () => {
      const device = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
        isLowPowerMode: true,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const recommendations = optimizer.getRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some((r) => r.includes('low power'))).toBe(true);
    });
  });

  describe('Performance Profiling', () => {
    it('should create performance profile for device', () => {
      const device = {
        platform: 'desktop' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 3090',
        gpuMemory: 24576,
        cpuCores: 16,
        ramTotal: 32768,
        screenResolution: { width: 3440, height: 1440 },
        refreshRate: 165,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const profile = optimizer.getProfile();

      expect(profile.device).toEqual(device);
      expect(profile.capabilities).toBeDefined();
      expect(profile.qualityLevel).toBe('ultra');
    });

    it('should have appropriate CPU budget for platform', () => {
      const mobileDevice = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
      };

      const vrDevice = {
        platform: 'vr' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 2070',
        gpuMemory: 8192,
        cpuCores: 8,
        ramTotal: 16384,
        screenResolution: { width: 1832, height: 1920 },
        refreshRate: 90,
      };

      const mobileOptimizer = new PlatformPerformanceOptimizer(mobileDevice);
      const vrOptimizer = new PlatformPerformanceOptimizer(vrDevice);

      const mobileProfile = mobileOptimizer.getProfile();
      const vrProfile = vrOptimizer.getProfile();

      // VR should have tighter budget (90 FPS)
      expect(vrProfile.cpuBudget).toBeLessThan(mobileProfile.cpuBudget);
    });
  });

  describe('Compression Selection', () => {
    it('should select ASTC for mobile', () => {
      const device = {
        platform: 'mobile' as const,
        gpuVendor: 'Qualcomm',
        gpuModel: 'Adreno 640',
        gpuMemory: 1024,
        cpuCores: 4,
        ramTotal: 4096,
        screenResolution: { width: 1080, height: 2220 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const settings = optimizer.optimizeForDevice();

      expect(settings.compression).toMatch(/astc|pvrtc/);
    });

    it('should select Basis for VR', () => {
      const device = {
        platform: 'vr' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 2070',
        gpuMemory: 8192,
        cpuCores: 8,
        ramTotal: 16384,
        screenResolution: { width: 1832, height: 1920 },
        refreshRate: 90,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const settings = optimizer.optimizeForDevice();

      expect(settings.compression).toBe('basis');
    });

    it('should select no compression for desktop', () => {
      const device = {
        platform: 'desktop' as const,
        gpuVendor: 'NVIDIA',
        gpuModel: 'RTX 3090',
        gpuMemory: 24576,
        cpuCores: 16,
        ramTotal: 32768,
        screenResolution: { width: 3440, height: 1440 },
        refreshRate: 165,
      };

      const optimizer = new PlatformPerformanceOptimizer(device);
      const settings = optimizer.optimizeForDevice();

      expect(settings.compression).toBe('none');
    });
  });
});
