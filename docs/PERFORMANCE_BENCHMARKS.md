# HoloScript Performance Benchmarks

**Purpose**: Validate that HoloScript-generated code performs comparably to hand-written Unity/Unreal implementations.

---

## Executive Summary

**Claim**: "HoloScript's multi-target compilation doesn't sacrifice platform-specific performance."

**Validation**: Comparative benchmarks across identical VR scenes:

1. HoloScript → compiled to Unity C#
2. HoloScript → compiled to Unreal C++
3. Hand-written Unity C# (baseline)
4. Hand-written Unreal C++ (baseline)
5. HoloScript → ThreeJSRenderer (runtime)

**Metrics**: FPS, memory usage, build time, binary size, load time, draw calls

---

## Benchmark Scenarios

### Scenario 1: Basic VR Scene

**Complexity**: Low
**Purpose**: Validate core compilation overhead

```holo
composition "BasicScene" {
  scene {
    environment {
      skybox: "procedural_sky"
      lighting: "day"
    }

    object "Ground" {
      @physics(type: "static")
      geometry: "plane"
      scale: [100, 1, 100]
    }

    object "Cube" {
      @grabbable
      @physics
      geometry: "box"
      position: [0, 1, 0]
    }
  }
}
```

**Expected Performance**:

- Unity/Unreal: 90 FPS @ Quest 2
- HoloScript → Unity/Unreal: 85-90 FPS (target: <10% overhead)
- ThreeJSRenderer: 60 FPS @ desktop (WebXR baseline)

---

### Scenario 2: High-Complexity Scene

**Complexity**: High
**Purpose**: Stress-test optimization

**Scene**:

- 10,000 dynamic physics objects
- 5 light sources with shadows
- PBR materials on all objects
- Particle systems (3 emitters, 10K particles total)
- Networked state sync (20 players)

**Expected Performance**:

- Unity/Unreal: 72 FPS @ Quest 3
- HoloScript → Unity/Unreal: 65-72 FPS (target: <10% overhead)
- ThreeJSRenderer: 45 FPS @ desktop (acceptable for prototyping)

---

### Scenario 3: Robotics Simulation

**Complexity**: Medium
**Purpose**: Validate URDF/SDF compilation

**Scene**:

- 6-DOF robot arm with 7 joints
- Forward/inverse kinematics
- Real-time physics simulation
- Collision detection

**Expected Performance**:

- Unity + URDF: 60 FPS
- HoloScript → URDF → Gazebo: 55-60 FPS
- HoloScript → Unity: 60 FPS

---

### Scenario 4: Multiplayer VR Social

**Complexity**: High
**Purpose**: Real-world usage pattern

**Scene**:

- 50 networked players (avatars with IK)
- Voice chat (spatial audio)
- 100+ interactable objects
- Dynamic lighting
- CRDT state synchronization

**Expected Performance**:

- Unity/Unreal (native): 72 FPS @ Quest 3
- HoloScript → Unity/Unreal: 65-72 FPS
- ThreeJSRenderer: 50 FPS @ desktop

---

## Metrics to Collect

### 1. Runtime Performance

| Metric                      | Target                           | Measurement Tool                |
| --------------------------- | -------------------------------- | ------------------------------- |
| **FPS** (frames per second) | >60 FPS desktop, >72 FPS Quest 3 | Unity Profiler, Unreal Insights |
| **Frame Time**              | <16ms (60 FPS), <14ms (72 FPS)   | Built-in profilers              |
| **Memory Usage**            | <500MB Quest 2, <1GB Quest 3     | Unity Memory Profiler           |
| **GPU Usage**               | <80% (headroom for spikes)       | GPU profilers                   |
| **CPU Usage**               | <70% (1 core)                    | CPU profilers                   |
| **Draw Calls**              | <100 Quest 2, <200 Quest 3       | Render stats                    |
| **Triangles**               | <750K Quest 2, <1.5M Quest 3     | Render stats                    |

### 2. Build Performance

| Metric           | Target                     | Measurement Tool          |
| ---------------- | -------------------------- | ------------------------- |
| **Compile Time** | <30 seconds (small scene)  | `time holoscript compile` |
| **Binary Size**  | <50MB (Quest APK)          | File size                 |
| **Load Time**    | <5 seconds (scene load)    | Stopwatch                 |
| **Hot Reload**   | <2 seconds (iterative dev) | HotReloader.ts            |

### 3. Code Quality

| Metric                    | Target                          | Measurement Tool |
| ------------------------- | ------------------------------- | ---------------- |
| **Lines of Code**         | HoloScript <50% of hand-written | `cloc` tool      |
| **Cyclomatic Complexity** | <10 (generated code)            | Static analysis  |
| **Code Duplication**      | <5%                             | Static analysis  |

---

## Benchmark Implementation

### Directory Structure

```
benchmarks/
├── scenarios/
│   ├── 01-basic-scene/
│   │   ├── basic-scene.holo
│   │   ├── unity-handwritten/       ← Hand-written Unity C#
│   │   ├── unreal-handwritten/      ← Hand-written Unreal C++
│   │   ├── holoscript-to-unity/     ← Compiled from .holo
│   │   ├── holoscript-to-unreal/    ← Compiled from .holo
│   │   └── holoscript-runtime/      ← ThreeJSRenderer
│   ├── 02-high-complexity/
│   ├── 03-robotics-sim/
│   └── 04-multiplayer-vr/
│
├── tools/
│   ├── profile-unity.sh
│   ├── profile-unreal.sh
│   ├── profile-threejs.sh
│   └── compare-results.ts
│
├── results/
│   ├── 2026-02-21/
│   │   ├── 01-basic-scene.json
│   │   ├── 02-high-complexity.json
│   │   └── summary.md
│   └── historical/
│
└── README.md
```

---

## Automated Benchmark Runner

### Usage

```bash
# Run all benchmarks
npm run benchmarks

# Run specific scenario
npm run benchmarks -- --scenario=01-basic-scene

# Run specific platform
npm run benchmarks -- --platform=unity

# Generate comparison report
npm run benchmarks:compare
```

### Implementation (TypeScript)

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { compileToUnity, compileToUnreal } from '@holoscript/core/compiler';
import { ThreeJSRenderer } from '@holoscript/core/runtime';

interface BenchmarkResult {
  scenario: string;
  platform: 'unity' | 'unreal' | 'threejs' | 'unity-handwritten' | 'unreal-handwritten';
  fps: number;
  frameTimeMs: number;
  memoryMB: number;
  drawCalls: number;
  triangles: number;
  compileTimeMs: number;
  binarySizeMB: number;
  loadTimeMs: number;
}

async function runBenchmark(scenario: string): Promise<BenchmarkResult[]> {
  const holoSource = readFileSync(`scenarios/${scenario}/${scenario}.holo`, 'utf-8');
  const composition = parseHoloScript(holoSource);

  const results: BenchmarkResult[] = [];

  // 1. HoloScript → Unity
  const unityCode = compileToUnity(composition);
  results.push(await profileUnity(unityCode, scenario));

  // 2. HoloScript → Unreal
  const unrealCode = compileToUnreal(composition);
  results.push(await profileUnreal(unrealCode, scenario));

  // 3. HoloScript → ThreeJS Runtime
  results.push(await profileThreeJS(composition, scenario));

  // 4. Hand-written Unity (baseline)
  results.push(await profileUnityHandwritten(scenario));

  // 5. Hand-written Unreal (baseline)
  results.push(await profileUnrealHandwritten(scenario));

  return results;
}

async function profileUnity(code: string, scenario: string): Promise<BenchmarkResult> {
  // Compile Unity project
  const compileStart = Date.now();
  await buildUnityProject(code, scenario);
  const compileTime = Date.now() - compileStart;

  // Deploy to Quest 3 (via adb)
  await deployToQuest(scenario);

  // Run profiler and collect metrics
  const metrics = await runUnityProfiler(scenario, durationSeconds: 60);

  return {
    scenario,
    platform: 'unity',
    fps: metrics.avgFPS,
    frameTimeMs: metrics.avgFrameTime,
    memoryMB: metrics.peakMemory,
    drawCalls: metrics.avgDrawCalls,
    triangles: metrics.avgTriangles,
    compileTimeMs: compileTime,
    binarySizeMB: getAPKSize(scenario),
    loadTimeMs: metrics.loadTime,
  };
}
```

---

## Comparison Reports

### Example Output

```
┌─────────────────────────────────────────────────────────────┐
│         Performance Comparison: 01-basic-scene              │
├─────────────────────────────────────────────────────────────┤
│ Platform                │ FPS  │ Memory │ Draw Calls │ Size │
├─────────────────────────┼──────┼────────┼────────────┼──────┤
│ Unity (hand-written)    │ 90   │ 320MB  │ 45         │ 42MB │
│ HoloScript → Unity      │ 87   │ 335MB  │ 48         │ 45MB │
│ Overhead                │ -3%  │ +5%    │ +7%        │ +7%  │
├─────────────────────────┼──────┼────────┼────────────┼──────┤
│ Unreal (hand-written)   │ 88   │ 410MB  │ 52         │ 58MB │
│ HoloScript → Unreal     │ 85   │ 425MB  │ 55         │ 61MB │
│ Overhead                │ -3%  │ +4%    │ +6%        │ +5%  │
├─────────────────────────┼──────┼────────┼────────────┼──────┤
│ ThreeJSRenderer (runtime)│ 60   │ 180MB  │ 78         │ 8MB  │
│ vs. Unity               │ -33% │ -44%   │ +73%       │ -81% │
└─────────────────────────┴──────┴────────┴────────────┴──────┘

✅ PASS: HoloScript → Unity overhead <10% (target met)
✅ PASS: HoloScript → Unreal overhead <10% (target met)
✅ PASS: ThreeJSRenderer achieves 60 FPS desktop (acceptable for prototyping)
```

---

## Performance Optimization Targets

### Tier 1 Platforms (Priority)

**Target**: <5% overhead vs. hand-written

- **Unity**: Optimize C# code generation (LINQ removal, struct allocation)
- **Unreal**: Optimize C++ code generation (move semantics, blueprint calls)
- **WebXR**: Optimize ThreeJSRenderer (geometry instancing, LOD)

### Tier 2 Platforms

**Target**: <10% overhead

- **Godot**: GDScript optimization
- **Quest**: Platform-specific optimizations (foveated rendering, etc.)
- **ARKit/ARCore**: Mobile-specific optimizations

### Tier 3 Platforms

**Target**: <20% overhead (community-driven)

- **VRChat/Udon**: Udon# optimization
- **Robotics (URDF/SDF)**: Physics simulation overhead
- **IoT (DTDL)**: Edge device constraints

---

## CI/CD Integration

### Automated Benchmarking

```yaml
# .github/workflows/benchmarks.yml
name: Performance Benchmarks

on:
  pull_request:
    branches: [main, development]
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run benchmarks
        run: npm run benchmarks
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: benchmark-results
          path: benchmarks/results/
      - name: Compare to baseline
        run: npm run benchmarks:compare
      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: peter-evans/create-or-update-comment@v1
        with:
          issue-number: ${{ github.event.pull_request.number }}
          body: |
            ## Performance Benchmark Results

            ${{ steps.benchmark.outputs.summary }}
```

### Performance Regression Alerts

**Alert if**:

- FPS drops >10% vs. baseline
- Memory usage increases >15%
- Binary size increases >20%
- Compile time increases >30%

---

## Public Dashboard

### Live Benchmarks

**URL**: [benchmarks.holoscript.net](https://benchmarks.holoscript.net)

**Features**:

- Historical performance trends
- Compare HoloScript versions (v3.4 vs. v3.5)
- Compare platforms (Unity vs. Unreal)
- Download raw data (JSON)

**Example**:

```
┌───────────────────────────────────────────────┐
│  HoloScript Performance Trends (Last 6 Months) │
├───────────────────────────────────────────────┤
│                                                │
│  FPS (Unity)                                  │
│   90 ┤        ╭─╮                              │
│   85 ┤      ╭─╯ ╰─╮      ╭───╮                │
│   80 ┤  ╭───╯     ╰──────╯   ╰─               │
│      └──────────────────────────               │
│      Sep  Oct  Nov  Dec  Jan  Feb             │
│                                                │
│  Target: 85+ FPS                              │
│  Current: 87 FPS ✅                            │
└───────────────────────────────────────────────┘
```

---

## Community Contributions

### Submit Your Benchmarks

Built a platform on HoloScript? Share your performance data:

**Template**:

```json
{
  "platform": "MyVRPlatform",
  "holoscriptVersion": "3.4.0",
  "scenario": "custom-multiplayer",
  "device": "Quest 3",
  "fps": 70,
  "memoryMB": 450,
  "drawCalls": 120,
  "notes": "Optimized for 100-player lobbies"
}
```

**Submit**: [benchmarks@holoscript.net](mailto:benchmarks@holoscript.net)

---

## FAQ

### Why compare to hand-written code?

**Answer**: To validate that HoloScript's abstraction layer doesn't sacrifice performance. If overhead is <10%, developers can confidently use HoloScript without worrying about performance penalties.

### What if HoloScript is slower?

**Answer**: We'll:

1. Identify bottlenecks (profiling)
2. Optimize compiler backends (code generation)
3. Document trade-offs (developer velocity vs. raw performance)
4. Provide escape hatches (mix HoloScript + native code)

### Can I run benchmarks locally?

**Yes!**

```bash
git clone https://github.com/brianonbased-dev/HoloScript
cd HoloScript/benchmarks
npm install
npm run benchmarks
```

### How often are benchmarks updated?

**Weekly** (automated CI/CD) + **on every release** (manual validation).

---

## Roadmap

- [x] **Q1 2026**: Benchmark suite specification (this document)
- [ ] **Q2 2026**: Implement basic benchmarks (Scenarios 1-2)
- [ ] **Q2 2026**: Automate Unity/Unreal profiling
- [ ] **Q3 2026**: Add advanced benchmarks (Scenarios 3-4)
- [ ] **Q3 2026**: Public dashboard (benchmarks.holoscript.net)
- [ ] **Q4 2026**: Community benchmark submissions
- [ ] **2027**: Per-platform optimization sprints (Unity, Unreal, WebXR)

---

## Related Documents

- [HoloScript Roadmap](../ROADMAP.md)
- [Compiler Architecture](../ARCHITECTURE.md)
- [Performance Optimization Guide](./PERFORMANCE_OPTIMIZATION.md) (coming soon)

---

**Last Updated**: February 21, 2026
**Status**: Specification phase (implementation pending)

---

_Performance benchmarks validate HoloScript's core promise: write once, deploy everywhere—without sacrificing speed._

© 2026 HoloScript Foundation
