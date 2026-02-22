# HoloScript Performance Benchmarks

Validates that HoloScript-generated code performs comparably to hand-written Unity/Unreal implementations.

## Quick Start

```bash
# Run basic benchmark (Scenario 1)
npm run benchmark

# Run specific scenario
npm run benchmark 02-high-complexity

# View latest results
cat results/$(date +%Y-%m-%d)/01-basic-scene.json
```

## Current Status

**Implemented**: ✅ Scenario 1 - Basic VR Scene (compilation benchmarks)

**Pending**:
- [ ] Runtime performance profiling (FPS, memory, draw calls)
- [ ] Unity/Unreal hand-written baselines
- [ ] Automated Quest 3 deployment and profiling
- [ ] Scenario 2: High-Complexity Scene
- [ ] Scenario 3: Robotics Simulation
- [ ] Scenario 4: Multiplayer VR Social

## Scenarios

### Scenario 1: Basic VR Scene ✅

**Status**: Implemented (compile-time benchmarks only)

**What it tests**: Core compilation overhead across 5 targets
- Unity C#
- Unreal C++
- Godot GDScript
- Three.js/WebXR
- VRChat Udon#

**Metrics collected**:
- ✅ Compilation time (ms)
- ✅ Lines of code generated
- ✅ Output file size (bytes)
- ⏳ Runtime FPS (pending Unity/Unreal profiler integration)
- ⏳ Memory usage (pending)
- ⏳ Draw calls (pending)

**Target**: <30 seconds compile time for small scenes

### Scenario 2: High-Complexity Scene ⏳

**Status**: Not yet implemented

**Planned features**:
- 10,000 dynamic physics objects
- 5 light sources with shadows
- PBR materials
- Particle systems

### Scenario 3: Robotics Simulation ⏳

**Status**: Not yet implemented

**Planned features**:
- 6-DOF robot arm (URDF export)
- Forward/inverse kinematics
- Real-time physics

### Scenario 4: Multiplayer VR Social ⏳

**Status**: Not yet implemented

**Planned features**:
- 50 networked players
- Voice chat
- CRDT state synchronization

## Directory Structure

```
benchmarks/
├── scenarios/
│   └── 01-basic-scene/
│       └── basic-scene.holo          ← Scene definition
├── tools/
│   └── benchmark-runner.ts           ← Benchmark orchestrator
├── results/
│   └── YYYY-MM-DD/
│       └── 01-basic-scene.json       ← Results
└── README.md                          ← This file
```

## Benchmark Results Format

```json
{
  "timestamp": "2026-02-21T12:34:56.789Z",
  "scenario": "01-basic-scene",
  "results": [
    {
      "platform": "Unity C#",
      "compileTimeMs": 45,
      "linesOfCode": 234,
      "outputSizeBytes": 8192,
      "success": true
    }
  ],
  "summary": {
    "totalTargets": 5,
    "successfulCompilations": 5,
    "avgCompileTimeMs": 52,
    "fastestTarget": "Unity C#",
    "slowestTarget": "VRChat Udon#"
  }
}
```

## Adding New Scenarios

1. Create scenario directory: `scenarios/XX-scenario-name/`
2. Write HoloScript file: `XX-scenario-name.holo`
3. Run benchmark: `npm run benchmark XX-scenario-name`
4. Optionally add hand-written baselines:
   - `unity-handwritten/` (C# scripts)
   - `unreal-handwritten/` (C++ blueprints)

## Next Steps

### Phase 1: Compilation Benchmarks ✅
- [x] Directory structure
- [x] Scenario 1: Basic Scene
- [x] Benchmark runner (compile-time metrics)
- [x] Results reporting

### Phase 2: Runtime Benchmarks ⏳
- [ ] Unity profiler integration
- [ ] Unreal profiler integration
- [ ] ThreeJS performance.now() metrics
- [ ] Quest 3 deployment automation

### Phase 3: Baselines ⏳
- [ ] Hand-written Unity version (Scenario 1)
- [ ] Hand-written Unreal version (Scenario 1)
- [ ] Overhead calculation (<10% target)

### Phase 4: Advanced Scenarios ⏳
- [ ] Scenario 2: High-Complexity
- [ ] Scenario 3: Robotics
- [ ] Scenario 4: Multiplayer

### Phase 5: Public Dashboard ⏳
- [ ] benchmarks.holoscript.dev
- [ ] Historical trends
- [ ] Community submissions

## Contributing

See [PERFORMANCE_BENCHMARKS.md](../docs/PERFORMANCE_BENCHMARKS.md) for full specification.

**Questions?** Open an issue or email [benchmarks@holoscript.dev](mailto:benchmarks@holoscript.dev)

---

**Last Updated**: February 21, 2026
**Status**: Phase 1 Complete (compilation benchmarks)
