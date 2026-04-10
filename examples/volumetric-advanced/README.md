# Advanced Volumetric Rendering Examples

**Cutting-edge volumetric capture and rendering for Film/Entertainment production**

This directory showcases production-grade volumetric rendering techniques with HoloScript, targeting professional film, entertainment, and virtual production workflows.

---

## 📁 Examples

### 1. `gaussian-splat-photogrammetry.holo`

**Photogrammetry to 3D Gaussian Splatting Pipeline**

Complete pipeline from multi-camera capture to real-time 3DGS rendering.

**Demonstrates:**

- 64-camera dome array capture (12MP, HDR, ACES color)
- Structure-from-Motion (SIFT, Bundle Adjustment)
- 3DGS training (30K iterations, SH degree 3)
- Adaptive quality presets (desktop ultra → Quest 3 mobile)
- Distance-based LOD system

**Performance Budgets:**

- Desktop Ultra: 2M splats, SH3, 60 FPS
- Quest 3 High: 1.2M splats, SH2, 90 FPS (11.1ms)
- Mobile Low: 300K splats, SH0, 60 FPS

**Use Cases:**

- VFX actor/prop capture for film integration
- Virtual production set scanning
- On-set previsualization
- Digital archival preservation

**File Size:** 1.5M Gaussians = ~60 MB (SPZ v2.0 compressed)

---

### 2. `nerf-realtime-rendering.holo`

**Real-Time NeRF with Instant-NGP**

Neural Radiance Fields with Instant-NGP acceleration for interactive VR/AR.

**Demonstrates:**

- Multi-resolution hash encoding (16 levels, 524K entries)
- Tiny MLP network (2 layers × 64 neurons)
- Hierarchical sampling (coarse 64 + fine 128 samples/ray)
- Occupancy grid acceleration (30-60% speedup)
- Dynamic resolution scaling (64²-1024²)
- Interactive lighting/tonemapping editing

**Performance Budgets:**

- Ultra: 1024² rays, 128+256 samples, 10 FPS
- High: 512² rays, 64+128 samples, 30 FPS
- Medium: 256² rays, 32+64 samples, 60 FPS
- Low: 128² rays, 16+32 samples, 90 FPS (Quest 3)

**Quality vs Speed Tradeoffs:**

- Resolution: 2× rays = 4× cost (quadratic)
- Samples: 2× samples = 2× cost (linear)
- Fine samples most expensive (neural inference)

**Use Cases:**

- Virtual location scouting
- On-set lighting previsualization
- Dynamic relighting for VFX
- Real-time background replacement

**Training Time:** 5 minutes vs 1-2 days for vanilla NeRF (300× faster)

---

### 3. `volumetric-video-streaming.holo`

**4D Volumetric Video with ABR Streaming**

Production-grade volumetric video playback with adaptive bitrate streaming.

**Demonstrates:**

- 4D-MoDe temporal compression (70-90% reduction)
- DASH-style chunk loading (2-second chunks)
- Adaptive Bitrate (ABR) algorithm (throughput-based)
- Multi-quality ladder (ultra/high/medium/low)
- Client-side buffer management (4-16s buffer)
- Predictive prefetching (4 chunks ahead)

**Compression Stack:**

1. **SPZ v2.0:** 60-80 → 40 bytes/Gaussian (2× reduction)
2. **4D-MoDe:** Keyframe every 2s, motion-aware deltas (70-90% reduction)
3. **Quantization (optional):** 16-bit → 8-bit (2× further reduction)

**File Sizes (30-min concert @ 30 FPS):**

- Raw: 2.4 TB
- SPZ v2: 240 GB (10× reduction)
- SPZ + 4D-MoDe: 30-50 GB (50-80×)
- SPZ + 4D-MoDe + quantization: 15-25 GB (100-160×)

**Bitrate Ladder:**

- Ultra: 2M splats, SH3, 80 Mbps (desktop)
- High: 1.2M splats, SH2, 40 Mbps (Quest 3)
- Medium: 600K splats, SH1, 20 Mbps (Quest 2)
- Low: 300K splats, SH0, 8 Mbps (mobile)

**Use Cases:**

- Immersive concerts/performances
- Sports replay (any-angle viewing)
- Volumetric telepresence
- VR/AR storytelling

---

### 4. `point-cloud-lidar.holo`

**LiDAR Point Cloud with Hierarchical LOD**

High-performance LiDAR rendering with octree spatial indexing.

**Demonstrates:**

- LAS/LAZ LiDAR format parsing (500M points)
- Octree spatial index (128³ grid, 10K points/leaf)
- Distance-based LOD (5 levels, 100% → 5% density)
- ASPRS classification colorization (15 classes)
- Point size attenuation (1/d² falloff)
- Measurement tools (distance, area, volume, cross-section)

**LOD Strategy:**

- LOD0 (0-5m): 100% density, 1.0× point size
- LOD1 (5-10m): 50% density, 1.2× size
- LOD2 (10-25m): 25% density, 1.5× size
- LOD3 (25-50m): 10% density, 2.0× size
- LOD4 (>50m): 5% density, 3.0× size

**Performance (Quest 3 @ 90 FPS):**

- LOD selection: 0.5-1ms (octree traversal)
- Frustum culling: 0.5-1ms
- Point rendering: 7-8ms (1-2M points)
- Total: ~10ms (11.1ms budget)

**Use Cases:**

- Film set scanning for VFX integration
- Virtual production environments
- Location scouting (city-scale)
- Architectural heritage preservation

**File Sizes:**

- Raw LAS: 10-20 GB (500M points)
- LAZ (compressed): 2-4 GB (5-10× reduction)
- Octree index: ~500 MB

---

### 5. `photogrammetry-workflow.holo`

**End-to-End Production Workflow**

Complete capture-to-VR pipeline for film production.

**8-Stage Workflow:**

1. **CAPTURE** (1-5 min): 64-camera dome, 24 FPS, HDR bracketing
2. **PREPROCESS** (5-15 min): HDR merge, color correction, lens correction
3. **SFM** (30-60 min): SIFT features, Bundle Adjustment, sparse reconstruction
4. **MVS** (1-3 hours): PatchMatch stereo, TSDF fusion, dense reconstruction
5. **3DGS TRAINING** (4-8 hours): 30K iterations, 1.5-2M Gaussians, PSNR 28-32 dB
6. **OPTIMIZE** (15-30 min): LOD generation, SPZ compression, quality validation
7. **VR PREVIEW** (real-time): Quest 3 @ 90 FPS, interactive director review
8. **EXPORT** (5-10 min): USD, Alembic, FBX for film pipeline integration

**Total Pipeline Time:** 6-12 hours (capture to VR-ready asset)

**Quality Metrics:**

- PSNR: 28-32 dB (production quality)
- SSIM: 0.90-0.95
- LPIPS: <0.15 (perceptual similarity)

**Export Formats:**

- **USD:** Pixar Universal Scene Description (film standard)
- **Alembic:** Industry-standard VFX interchange
- **FBX:** Compatibility with DCC tools

**Use Cases:**

- On-set actor/prop capture → VFX integration
- Virtual production → LED wall backgrounds
- Location scanning → Previsualization
- Digital preservation → Archival

---

## 🎯 Performance Budgets (Quest 3 @ 90Hz)

All examples target **11.1ms/frame** for Quest 3 @ 90 FPS:

| Component          | Budget    | Notes                  |
| ------------------ | --------- | ---------------------- |
| Gaussian sort      | 1.5-2ms   | GPU radix sort         |
| Gaussian render    | 6-8ms     | 800K-1.2M splats       |
| NeRF ray march     | 7-8ms     | 128²-256² rays         |
| Point cloud render | 7-8ms     | 1-2M points            |
| Overhead           | 1-2ms     | Culling, LOD selection |
| **Total**          | **~11ms** | 90 FPS target          |

---

## 🎬 Quality vs Speed Tradeoffs

### Gaussian Splat (3DGS)

| Setting        | Ultra | High  | Medium | Low   |
| -------------- | ----- | ----- | ------ | ----- |
| Splats         | 2M    | 1.2M  | 600K   | 300K  |
| SH degree      | 3     | 2     | 1      | 0     |
| FPS (desktop)  | 60    | 90    | 120    | 144   |
| FPS (Quest 3)  | 45    | 90    | 90+    | 120   |
| Visual quality | ★★★★★ | ★★★★☆ | ★★★☆☆  | ★★☆☆☆ |

**SH Degree Impact:**

- SH0 → SH1: +30% render cost, 2× visual quality
- SH1 → SH2: +25% render cost, 1.5× visual quality
- SH2 → SH3: +20% render cost, 1.2× visual quality

### NeRF (Instant-NGP)

| Setting        | Ultra   | High   | Medium | Low   |
| -------------- | ------- | ------ | ------ | ----- |
| Resolution     | 1024²   | 512²   | 256²   | 128²  |
| Samples (C+F)  | 128+256 | 64+128 | 32+64  | 16+32 |
| FPS            | 10      | 30     | 60     | 90    |
| Visual quality | ★★★★★   | ★★★★☆  | ★★★☆☆  | ★★☆☆☆ |

**Resolution Impact:** 2× resolution = 4× cost (quadratic)

### Point Cloud (LiDAR)

| LOD  | Distance | Density | Point Size | Visual Quality |
| ---- | -------- | ------- | ---------- | -------------- |
| LOD0 | 0-5m     | 100%    | 1.0×       | ★★★★★          |
| LOD1 | 5-10m    | 50%     | 1.2×       | ★★★★☆          |
| LOD2 | 10-25m   | 25%     | 1.5×       | ★★★☆☆          |
| LOD3 | 25-50m   | 10%     | 2.0×       | ★★☆☆☆          |
| LOD4 | >50m     | 5%      | 3.0×       | ★☆☆☆☆          |

**LOD saves 40-60% rendering cost** at typical viewing distances.

---

## 💾 File Sizes & Compression

### 3D Gaussian Splat (1.5M Gaussians)

| Format                | Size    | Compression | Notes               |
| --------------------- | ------- | ----------- | ------------------- |
| Raw PLY               | ~200 MB | 1×          | Uncompressed        |
| SPZ v2.0              | ~60 MB  | 3.3×        | Quaternion encoding |
| SPZ v2 + quantization | ~30 MB  | 6.7×        | 16-bit → 8-bit      |

### 4D Volumetric Video (30 min @ 30 FPS = 54K frames)

| Format                | Size     | Compression | Notes                  |
| --------------------- | -------- | ----------- | ---------------------- |
| Raw frames            | 2.4 TB   | 1×          | Independent frames     |
| SPZ v2.0              | 240 GB   | 10×         | Per-frame compression  |
| SPZ + 4D-MoDe         | 30-50 GB | 50-80×      | Temporal compression   |
| SPZ + 4D-MoDe + quant | 15-25 GB | 100-160×    | Full compression stack |

### LiDAR Point Cloud (500M points)

| Format       | Size     | Compression | Notes                |
| ------------ | -------- | ----------- | -------------------- |
| Raw LAS      | 10-20 GB | 1×          | Uncompressed         |
| LAZ          | 2-4 GB   | 5-10×       | LAS compressed       |
| Octree index | ~500 MB  | -           | Spatial acceleration |

---

## 🚀 Quick Start

### Prerequisites

```bash
# Install HoloScript CLI
npm install -g holoscript

# Verify installation
holoc --version
```

### Run Examples

**3DGS Photogrammetry:**

```bash
holoc examples/volumetric-advanced/gaussian-splat-photogrammetry.holo --target webgpu
```

**Real-Time NeRF:**

```bash
holoc examples/volumetric-advanced/nerf-realtime-rendering.holo --target webgpu
```

**Volumetric Video Streaming:**

```bash
holoc examples/volumetric-advanced/volumetric-video-streaming.holo --target webgpu
```

**LiDAR Point Cloud:**

```bash
holoc examples/volumetric-advanced/point-cloud-lidar.holo --target webgpu
```

**Full Workflow:**

```bash
holoc examples/volumetric-advanced/photogrammetry-workflow.holo --target webgpu
```

### Export to Film Formats

**Export to USD (Pixar):**

```bash
holoc gaussian-splat-photogrammetry.holo --target usd --output ./export/
```

**Export to Alembic:**

```bash
holoc gaussian-splat-photogrammetry.holo --target alembic --output ./export/
```

**Export to FBX:**

```bash
holoc gaussian-splat-photogrammetry.holo --target fbx --output ./export/
```

---

## 📖 Technical Deep Dives

### 3D Gaussian Splatting (3DGS)

**What it is:**

- Novel view synthesis using millions of 3D Gaussians (oriented ellipsoids)
- Each Gaussian has: position, rotation (quaternion), scale (3D), opacity, color (SH coefficients)
- Real-time rendering via GPU rasterization

**Training:**

- Initialize from SfM sparse cloud or MVS dense cloud
- 30K iterations with adaptive densification (splitting/pruning)
- PSNR 28-32 dB (production quality)
- Training time: 4-8 hours on RTX 4090

**Rendering:**

- Sort Gaussians back-to-front (GPU radix sort ~1.5-2ms)
- Rasterize Gaussians with alpha blending
- Spherical harmonics for view-dependent appearance
- 60-90 FPS real-time

**References:**

- Paper: "3D Gaussian Splatting for Real-Time Radiance Field Rendering" (Kerbl et al., 2023)
- Code: [gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting)

---

### Neural Radiance Fields (NeRF)

**What it is:**

- Neural network encodes a 3D scene as a continuous volumetric function
- Input: 3D position (x,y,z) + viewing direction (θ,φ)
- Output: RGB color + volume density (σ)

**Instant-NGP Acceleration:**

- Multi-resolution hash encoding (16 levels, 524K entries)
- Tiny MLP (2 layers × 64 neurons) instead of large network
- Training: 5 minutes vs 1-2 days for vanilla NeRF (300× faster)
- Inference: 30 FPS vs 0.1 FPS (300× faster)

**Rendering:**

- Ray marching with hierarchical sampling (coarse + fine)
- Occupancy grid skips empty space (30-60% speedup)
- Early termination at 95% opacity

**References:**

- Paper: "Instant Neural Graphics Primitives" (Müller et al., 2022)
- Code: [instant-ngp](https://github.com/NVlabs/instant-ngp)

---

### 4D-MoDe Compression

**What it is:**

- Motion-aware delta encoding for temporal Gaussian splat sequences
- Keyframes every 2 seconds (60 frames @ 30 FPS)
- Delta frames store only position/rotation/scale/opacity changes

**Compression Pipeline:**

1. **Spatial:** SPZ v2.0 (quaternion compression, 2× reduction)
2. **Temporal:** 4D-MoDe (motion-aware deltas, 70-90% reduction)
3. **Quantization:** 16-bit → 8-bit (optional, 2× further reduction)

**Results:**

- 50-200× total compression vs raw frames
- 30-min concert: 2.4 TB → 15-25 GB
- Decode time: 2-4ms/frame (real-time)

**References:**

- Inspired by video codecs (H.264/H.265) but for volumetric data

---

### Octree LOD (LiDAR)

**What it is:**

- Hierarchical spatial index (tree structure)
- Each node subdivides 3D space into 8 octants
- Depth 12 = 4096³ voxels, ~50K nodes

**LOD Selection:**

- Distance-based: closer = higher density
- 100% density @ 0-5m → 5% density @ >50m
- Smooth 1m blend zones between LOD levels
- Point size increases with distance (1/d² attenuation)

**Performance:**

- O(log n) query time
- 2M point budget (Quest 3 @ 90 FPS)
- Frustum culling: 30-70% points culled

**References:**

- Standard technique for large-scale point cloud rendering
- Used in Potree, Entwine, PDAL

---

## 🎓 Learning Resources

### Academic Papers

1. **3D Gaussian Splatting:** Kerbl et al., SIGGRAPH 2023
2. **Instant-NGP:** Müller et al., SIGGRAPH 2022
3. **NeRF:** Mildenhall et al., ECCV 2020
4. **Structure-from-Motion:** Schönberger & Frahm, CVPR 2016 (COLMAP)
5. **Multi-View Stereo:** Schönberger et al., CVPR 2016 (PatchMatch)

### Open-Source Tools

- **COLMAP:** SfM/MVS reconstruction
- **Nerfstudio:** NeRF training framework
- **Instant-NGP:** NVIDIA's real-time NeRF
- **Gaussian Splatting:** Original 3DGS implementation
- **Potree:** LiDAR point cloud viewer

### Industry Standards

- **USD (Universal Scene Description):** Pixar's VFX interchange format
- **Alembic:** Industry-standard geometry cache
- **ASPRS LAS/LAZ:** LiDAR data format
- **ACES:** Academy Color Encoding System (film color)

---

## 🤝 Contributing

We welcome examples demonstrating:

- Advanced volumetric techniques
- Production-optimized workflows
- Film/entertainment integrations
- Performance optimizations

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

---

## 📄 License

HoloScript Examples are MIT licensed. See [LICENSE](../../LICENSE).

---

## 🙏 Acknowledgments

- **3DGS:** INRIA Graphdeco team
- **Instant-NGP:** NVIDIA Research
- **NeRF:** Google Research, UC Berkeley
- **COLMAP:** ETH Zurich
- **Film community:** For production workflows and feedback

---

**HoloScript v4.1** — Write once, deploy everywhere. Film-grade volumetric rendering for VR/AR.
