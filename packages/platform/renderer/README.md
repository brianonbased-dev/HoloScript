# HoloLand Renderer — Thermal-Adaptive Quality Manager

## Operator Guide

### What this does

The `HololandRenderer` automatically lowers visual quality when the device is under thermal pressure so that frame rate and battery life stay within acceptable bounds. It is designed for VR/AR headsets (Quest 3, Apple Vision Pro, etc.) where sustained high GPU load causes throttling and discomfort.

### Three moving parts

| Component | Role | Operator touch-points |
|-----------|------|------------------------|
| **AdaptiveFrameRateManager** | Reads proxy signals (frame time, dropped frames) and decides whether the system is `cool`, `warm`, `hot`, or `critical`. | Threshold tuning (`warmFrameTimeMs`, `hotFrameTimeMs`, etc.) |
| **QualityManager** | Maps each thermal tier to concrete render settings: LOD bias, Gaussian-splat budget, and disabled features. | Policy overrides (budgets, feature lists) |
| **HololandRenderer** | Wires the two together. Every frame it feeds timing data to the frame-rate manager; when the thermal tier changes, the quality manager is updated automatically. | Inject custom managers via constructor options |

### Default thermal thresholds

| Tier | Frame time (ms) | Dropped frames / window |
|------|----------------|------------------------|
| Cool | < 20 ms | < 1 |
| Warm | >= 20 ms | >= 1 |
| Hot | >= 33.33 ms | >= 3 |
| Critical | >= 50 ms | >= 6 |

The window is the most recent 6 frames. A single spike does **not** trigger a downgrade; sustained pressure does.

### Default quality budget

| Tier | LOD bias | Max LOD level | Gaussian splats | Memory cap | Features disabled |
|------|----------|---------------|------------------|------------|-------------------|
| Cool | 0 | none | 1 000 000 | 512 MB | none |
| Warm | +0.2 | none | 500 000 | 256 MB | reflections, particles, AO |
| Hot | +0.5 | 2 | 100 000 | 128 MB | + shadows, post-processing, AA |
| Critical | +1.0 | 3 | 10 000 | 64 MB | all listed above |

### Quick-start (code)

```ts
import { HololandRenderer } from '@holoscript/platform/renderer';

const renderer = new HololandRenderer();

// Inside your render loop:
renderer.update(deltaTimeMs, droppedFrameCount);

// Read current policy to configure your scene graph:
const lod = renderer.quality.getLODPolicy();
const budget = renderer.quality.getGaussianBudget();
if (renderer.quality.shouldShedFeature('shadows')) {
  disableShadows();
}
```

### Tuning for your title

If your experience is geometry-heavy but uses few Gaussian splats, raise the splat budgets and lower the LOD bias in the `QualityPolicy`. Pass a custom policy to `QualityManager`:

```ts
const quality = new QualityManager({
  hot: {
    biasDelta: 0.3,
    maxLevelOverride: 1,
    disabledFeatures: ['reflections'],
    gaussian: { maxSplats: 50_000, maxMemoryMB: 96 },
  },
});
const renderer = new HololandRenderer({ qualityManager: quality });
```

### Observability

Listen to thermal-state changes for telemetry:

```ts
renderer.adaptive.onStateChange((state, previous) => {
  console.log(`Thermal: ${previous} → ${state}`);
});
```

### Thread safety

All three classes are single-threaded. If you sample frame times from a render thread and apply policy on a logic thread, marshal the `recordFrame` call across the boundary yourself.
