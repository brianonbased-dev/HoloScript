# Shader Preview wgpu Benchmark Results

## Test Environment

- Date: 2026-02-28
- Platform: Windows (x86_64)
- GPU: System GPU (DirectX 12 / Vulkan backend via wgpu)
- Build: Release profile (opt-level=z, LTO enabled)

## 720p @ 30fps Target — PASS

```
Resolution: 1280x720 @ 30 fps target
Frames: 90 in 1165.2ms (77.2 effective fps)

--- Frame Time ---
  avg=12.76ms  min=10.22ms  max=39.69ms
  p50=12.38ms  p95=14.61ms  p99=23.58ms

--- Breakdown ---
  render=0.20ms  readback=1.58ms  encode=10.87ms

Budget: 89/90 frames (98.9%)
VERDICT: PASS - Meets 720p@30fps target
```

## Performance Analysis

| Phase      | Time (ms) | % of Budget (33.3ms) |
| ---------- | --------- | -------------------- |
| Render     | 0.20      | 0.6%                 |
| Readback   | 1.58      | 4.7%                 |
| PNG Encode | 10.87     | 32.6%                |
| **Total**  | **12.76** | **38.3%**            |
| Headroom   | 20.54     | 61.7%                |

## Key Findings

1. **GPU render is negligible** (0.20ms) — fullscreen triangle with simple shader
2. **Buffer readback is fast** (1.58ms) — staging buffer with MAP_READ works well
3. **PNG encoding dominates** (10.87ms) — flate2 Fast compression at 720p
4. **61.7% headroom** — plenty of room for complex shaders
5. **Debug vs Release**: 10x speedup (108ms -> 10.87ms encode, due to flate2 optimization)

## Optimization Opportunities

1. **Raw pixel transfer**: Skip PNG entirely, send base64 RGBA directly (~3ms encode)
2. **Downscale preview**: 640x360 preview while editing, 720p for final
3. **Double-buffered readback**: Overlap render N+1 with readback N
4. **GPU-side encoding**: Use compute shader for fast image encoding
