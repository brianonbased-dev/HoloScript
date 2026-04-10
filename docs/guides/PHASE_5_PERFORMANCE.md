# Phase 5: Platform Performance Optimization

Adaptive quality system with real-time device optimization, performance profiling, and cross-platform tuning.

## Overview

Phase 5 implements `PlatformPerformanceOptimizer`, a sophisticated performance management system that:

- Detects device capabilities (GPU, CPU, memory, screen resolution)
- Generates device-specific optimization profiles
- Monitors real-time performance metrics (FPS, GPU memory, GPU time)
- Automatically adjusts quality settings based on frame rate
- Provides performance diagnostics and recommendations
- Benchmarks performance across different configurations

## Architecture

### PlatformPerformanceOptimizer

Located at `packages/core/src/services/PlatformPerformanceOptimizer.ts` (850+ LOC), this service provides:

**Device Profiling:**

- GPU capability detection
- CPU core counting
- Memory availability analysis
- Screen resolution and DPI detection

**Adaptive Quality:**

- Real-time FPS monitoring
- GPU memory tracking
- Automatic quality degradation/improvement
- Frame metric history

**Performance Analysis:**

- Bottleneck identification
- Recommendation generation
- Compression format selection
- Platform-specific optimization

## Core Components

### DeviceInfo Interface

```typescript
interface DeviceInfo {
  platform: 'mobile' | 'tablet' | 'desktop' | 'vr';
  gpu: string; // GPU model name
  gpuMemory: number; // In MB
  cpuCores: number;
  screenWidth: number;
  screenHeight: number;
  screenDPI: number;
  maxTextureSize: number;
  webglVersion: number; // 1 or 2
}
```

### PerformanceProfile

```typescript
interface PerformanceProfile {
  deviceInfo: DeviceInfo;
  targetFPS: number; // 30-144
  gpuMemoryBudget: number; // In MB
  textureMemoryBudget: number; // In MB
  maxLights: number;
  maxTextureResolution: number;
  compressionFormat: CompressionFormat;
  lodEnabled: boolean;
  shadowsEnabled: boolean;
  postProcessingEnabled: boolean;
  particleSystemEnabled: boolean;
}
```

### AdaptiveQualitySettings

```typescript
interface AdaptiveQualitySettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  textureResolution: number;
  enableCompression: boolean;
  compressionFormat: CompressionFormat;
  maxLights: number;
  shadowQuality: 'none' | 'low' | 'medium' | 'high';
  enableLOD: boolean;
  enableParticles: boolean;
  targetFPS: number;
}
```

### Performance Metrics

```typescript
interface PerformanceMetrics {
  fps: number;
  gpuMemoryUsed: number; // In MB
  gpuTimePerFrame: number; // In milliseconds
  drawCalls: number;
  verticesRendered: number;
  timestamp: number;
}
```

## Key Methods

### Device Detection

```typescript
// Detect device capabilities
detectCapabilities(device: DeviceInfo): DeviceCapabilities

// Get device information
getDeviceInfo(): DeviceInfo

// Create optimization profile for device
createProfile(): PerformanceProfile
```

### Device Optimization

```typescript
// Generate optimization settings for device
optimizeForDevice(): AdaptiveQualitySettings

// Optimize for specific platform
optimizeForPlatform(platform: 'mobile' | 'vr' | 'desktop'): AdaptiveQualitySettings

// Select compression format
selectCompressionFormat(): CompressionFormat
```

### Performance Monitoring

```typescript
// Update frame metrics
updateFrameMetrics(fps: number, gpuMemory: number, gpuTime?: number): void

// Check and adapt to current performance
checkAndAdapt(fps: number, gpuMemory: number): void

// Get frame metric history
getMetricHistory(): PerformanceMetrics[]

// Get current metrics
getCurrentMetrics(): PerformanceMetrics
```

### Performance Analysis

```typescript
// Run performance benchmark
runBenchmark(
  name: string,
  renderFunc: (quality: AdaptiveQualitySettings) => Promise<void>
): Promise<BenchmarkResult>

// Get performance recommendations
getRecommendations(): PerformanceRecommendation[]

// Analyze performance bottlenecks
analyzeBottlenecks(): string[]
```

## Usage Examples

### Basic Device Optimization

```typescript
import { PlatformPerformanceOptimizer } from '@holoscript/core';

// Detect device
const deviceInfo = {
  platform: 'desktop',
  gpu: 'NVIDIA RTX 3080',
  gpuMemory: 10240,
  cpuCores: 8,
  screenWidth: 1920,
  screenHeight: 1080,
  screenDPI: 96,
};

// Create optimizer
const optimizer = new PlatformPerformanceOptimizer(deviceInfo);

// Get optimized settings
const settings = optimizer.optimizeForDevice();

console.log(`Quality: ${settings.quality}`);
console.log(`Target FPS: ${settings.targetFPS}`);
console.log(`Max Lights: ${settings.maxLights}`);
console.log(`Compression: ${settings.compressionFormat}`);
```

### Real-Time Adaptive Quality

```typescript
// Monitor performance each frame
function animationLoop() {
  // Render frame
  renderFrame(currentSettings);

  // Get performance metrics
  const metrics = getFrameMetrics(); // fps, gpuMemory, gpuTime

  // Update optimizer
  optimizer.updateFrameMetrics(metrics.fps, metrics.gpuMemory, metrics.gpuTime);

  // Check if adjustment needed
  optimizer.checkAndAdapt(metrics.fps, metrics.gpuMemory);

  // Apply any changes recommended
  if (optimizer.shouldDegrade()) {
    currentSettings = optimizer.optimizeForDevice();
    recompileShaders(currentSettings);
  }
}
```

### Platform-Specific Optimization

```typescript
// Optimize for mobile device
const mobileSettings = optimizer.optimizeForPlatform('mobile');
// Results in:
// - Low quality preset
// - ASTC texture compression
// - Max 2 lights
// - 512x512 texture resolution max

// Optimize for VR headset
const vrSettings = optimizer.optimizeForPlatform('vr');
// Results in:
// - Medium quality preset
// - Basis texture compression
// - 90 FPS target
// - Max 4 lights

// Optimize for desktop
const desktopSettings = optimizer.optimizeForPlatform('desktop');
// Results in:
// - High/Ultra quality preset
// - Optional compression
// - Max 8-16 lights
// - 4K texture support
```

### Performance Benchmarking

```typescript
// Run benchmark across quality levels
const benchmark = await optimizer.runBenchmark('scene-complexity-test', async (settings) => {
  // Render test scene with settings
  for (let i = 0; i < 300; i++) {
    renderTestScene(settings);
  }
});

console.log(`Low Quality: ${benchmark.results.low.avgFPS} FPS`);
console.log(`Medium Quality: ${benchmark.results.medium.avgFPS} FPS`);
console.log(`High Quality: ${benchmark.results.high.avgFPS} FPS`);
console.log(`Ultra Quality: ${benchmark.results.ultra.avgFPS} FPS`);
console.log(`Recommended: ${benchmark.recommended}`);
```

### Performance Diagnostics

```typescript
// Get detailed recommendations
const recommendations = optimizer.getRecommendations();

for (const recommendation of recommendations) {
  console.log(`${recommendation.severity}: ${recommendation.message}`);
  console.log(`  Fix: ${recommendation.suggestion}`);
}

// Analyze bottlenecks
const bottlenecks = optimizer.analyzeBottlenecks();
console.log('Performance Bottlenecks:');
bottlenecks.forEach((b) => console.log(`  - ${b}`));

// Example output:
// - FPS below target: 45 FPS vs 60 FPS target
// - GPU memory high: 420 MB vs 512 MB budget
// - Draw calls increasing: 450 calls detected
// Recommendations:
// - Reduce texture quality from High to Medium
// - Enable texture compression (Basis)
// - Reduce shadow quality from High to Medium
```

## Device Capability Detection

### GPU Capabilities

The optimizer detects:

- Maximum texture size support
- Floating point texture support
- Shadow map capabilities
- Instancing support
- Compute shader support (WebGL 2+)

```typescript
const capabilities = optimizer.detectCapabilities();

console.log(`Max Texture: ${capabilities.maxTextureSize}x${capabilities.maxTextureSize}`);
console.log(`Supports floating point: ${capabilities.floatingPointTextures}`);
console.log(`Supports instancing: ${capabilities.instancing}`);
```

### Compression Format Selection

Selects optimal compression based on device:

- **Mobile**: ASTC (0.67 bytes/pixel, best compression)
- **VR**: Basis (1 byte/pixel, good balance)
- **Desktop**: None/WebP (4 bytes/pixel, best quality)

```typescript
const format = optimizer.selectCompressionFormat();
// Returns: 'astc' for mobile, 'basis' for VR, 'none' for desktop
```

## Adaptive Quality Algorithm

The optimizer monitors frame metrics and automatically adjusts:

### Quality Degradation

```
Trigger: FPS < target - threshold (e.g., 60 - 5 = 55 FPS)
Action:
  1. Reduce texture resolution (4K → 2K → 1K)
  2. Enable compression if not already
  3. Reduce max lights (8 → 4 → 2)
  4. Enable LOD if not already
  5. Disable advanced shadows
  6. Lower quality preset (Ultra → High → Medium → Low)
```

### Quality Improvement

```
Trigger: FPS > target + threshold (e.g., 60 + 10 = 70 FPS)
  AND GPU memory utilization < 50%
  AND sustained for 5+ frames
Action:
  1. Increase texture resolution up to device max
  2. Disable compression if feasible
  3. Increase max lights
  4. Disable aggressive LOD
  5. Enable advanced shadows
  6. Raise quality preset (Low → Medium → High → Ultra)
```

## Performance Recommendations

### FPS Issues

```
Issue: FPS < target
Recommendations:
  - Reduce texture quality
  - Enable compression
  - Reduce lights
  - Disable advanced effects
Severity: HIGH
```

### Memory Issues

```
Issue: GPU memory > 85% budget
Recommendations:
  - Prune texture cache
  - Reduce texture resolution
  - Enable compression
Severity: MEDIUM
```

### Power Efficiency

```
Issue: Mobile device battery drain
Recommendations:
  - Enable LOD
  - Reduce max lights
  - Decrease refresh rate to 30 FPS
Severity: MEDIUM
```

## Integration with Phase 3-4

**From Phase 3 (DSL Traits):**

- Receives initial quality/platform settings from annotations

**From Phase 4 (Graphics Pipeline):**

- Gets real-time GPU memory and performance metrics
- Applies quality recommendations to graphics service

Example integration:

```typescript
// Phase 3: Get initial config from traits
const traits = parser.extractTraitAnnotations(code);
const initialConfig = parser.buildGraphicsConfig(traits);

// Phase 4: Setup graphics
const graphicsService = new HololandGraphicsPipelineService('desktop');
await graphicsService.initialize(initialConfig);

// Phase 5: Monitor and optimize
const optimizer = new PlatformPerformanceOptimizer(deviceInfo);

// Each frame
function render() {
  graphicsService.render();

  // Get metrics from Phase 4
  const metrics = graphicsService.getPerformanceMetrics();

  // Update Phase 5 optimizer
  optimizer.updateFrameMetrics(metrics.fps, metrics.gpuMemory, metrics.gpuTimeMs);

  // Get recommendations
  const recommendations = optimizer.getRecommendations();

  // If quality should change, update Phase 4
  if (recommendations.some((r) => r.message.includes('reduce'))) {
    const newSettings = optimizer.optimizeForDevice();
    graphicsService.applyQualityPreset(newSettings.quality);
  }
}
```

## Performance Targets by Platform

### Mobile

- **FPS Target**: 60 FPS (30 FPS acceptable)
- **GPU Memory Budget**: 256 MB
- **Texture Resolution**: 512x512 max
- **Lights**: 2 max
- **Compression**: ASTC required

### VR

- **FPS Target**: 90 FPS (72 FPS minimum)
- **GPU Memory Budget**: 512 MB
- **Texture Resolution**: 1024x1024 max
- **Lights**: 4 max
- **Compression**: Basis preferred
- **Notes**: Latency is critical for VR

### Desktop

- **FPS Target**: 60 FPS (144 FPS for high-end)
- **GPU Memory Budget**: 2 GB
- **Texture Resolution**: 4096x4096
- **Lights**: 8-16
- **Compression**: Optional

## Testing

Phase 5 includes 20+ test cases covering:

**Device Detection:**

- Mobile/tablet/desktop/VR identification
- GPU capability detection
- Memory and CPU analysis

**Quality Settings:**

- Platform-specific presets
- Device optimization
- Compression selection

**Adaptive Quality:**

- FPS monitoring
- Memory tracking
- Quality degradation/improvement
- Recommendation generation

**Benchmarking:**

- Performance profiling
- Quality vs FPS tradeoff
- Recommended settings

Run tests with:

```bash
pnpm test -- GraphicsServices.test.ts
```

## Future Enhancements

- Machine learning-based performance prediction
- Historical performance data tracking
- Scene complexity analysis
- Network-aware optimization (for cloud rendering)
- Power consumption monitoring
- Thermal throttling detection
- Multi-GPU support
- VR frame timing analysis

## See Also

- [Phase 3: DSL Trait Annotations](./PHASE_3_DSL_TRAITS.md)
- [Phase 4: Hololand Graphics Pipeline](./PHASE_4_GRAPHICS_PIPELINE.md)
- [Graphics Traits Overview](./GRAPHICS_TRAITS.md)
