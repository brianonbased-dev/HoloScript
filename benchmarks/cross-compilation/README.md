# HoloScript Cross-Compilation Benchmark Suite

Comprehensive benchmark testing HoloScript's ability to compile representative compositions from 15 industry verticals to all applicable platform targets.

## Overview

This benchmark suite validates:

- **Compilation Success Rate**: Does the composition compile without errors?
- **Compilation Performance**: How long does compilation take?
- **Output Size**: How large is the generated code/data?
- **Feature Parity**: What percentage of HoloScript features are preserved in the target platform?

## Verticals Tested

1. **Healthcare** - Patient monitoring, AR anatomy, surgical guidance
2. **Education** - Interactive learning, 3D visualization, virtual classrooms
3. **Retail** - AR product preview, virtual try-on, showrooms
4. **Gaming** - VR/AR games, multiplayer experiences, physics simulation
5. **Architecture** - BIM visualization, walkthroughs, spatial design
6. **Manufacturing** - Digital twins, assembly lines, IoT integration
7. **Entertainment** - Concerts, events, social VR experiences
8. **Real Estate** - Virtual property tours, AR staging, measurements
9. **Fitness** - VR workouts, body tracking, performance monitoring
10. **Social** - Multiplayer spaces, voice chat, shared environments
11. **Art** - Virtual galleries, 3D art visualization, Gaussian splats
12. **Automotive** - Vehicle configurators, AR showrooms, exploded views
13. **Aerospace** - Satellite digital twins, zero-G simulation, telemetry
14. **Tourism** - AR historical sites, virtual tours, audio guides
15. **Robotics** - Robot simulation, ROS 2 integration, URDF/SDF export

## Compilation Targets

30+ platform targets tested (per vertical applicability):

**Game Engines:**

- Unity (C#)
- Unreal Engine 5 (C++)
- Godot 4 (GDScript)

**Web Platforms:**

- WebXR (via R3F)
- Babylon.js (TypeScript/JavaScript)
- React Three Fiber (R3F)
- PlayCanvas (JavaScript)
- A-Frame (HTML/JavaScript)

**Mobile AR:**

- iOS / ARKit (Swift)
- Android / ARCore (Kotlin)
- AR (Generic AR SDK)

**XR Platforms:**

- OpenXR (C/C++)
- VisionOS (Swift/SwiftUI)
- Android XR (Kotlin)
- VRChat (UdonSharp/C#)

**Compute:**

- WebGPU (WGSL)
- WASM (WebAssembly)

**Robotics/IoT:**

- URDF (Robot Description Format)
- SDF (Simulation Description Format)
- DTDL (Digital Twins Definition Language)

## Directory Structure

```
benchmarks/cross-compilation/
├── README.md                    # This file
├── run-benchmark.ts             # Main benchmark harness
├── package.json                 # NPM scripts and dependencies
├── target-mapping.json          # Vertical → Target applicability mapping
├── compositions/                # Test compositions (15 .holo files)
│   ├── 01-healthcare.holo
│   ├── 02-education.holo
│   ├── ... (13 more)
│   └── 15-robotics.holo
└── results/                     # Generated benchmark outputs
    ├── benchmark-results.json   # Raw JSON results
    └── BENCHMARK_REPORT.md      # Human-readable report (auto-generated)
```

## Running the Benchmark

### Full Benchmark Suite

```bash
cd benchmarks/cross-compilation
npm run bench
```

This will:

1. Parse all 15 compositions
2. Compile each to all applicable targets (~100+ compilations)
3. Measure compilation time, output size, feature parity
4. Generate `BENCHMARK_REPORT.md` with tables and charts

**Estimated Time:** 5-15 minutes (depending on system performance)

### Single Vertical

```bash
npm run bench:healthcare   # Test only healthcare vertical
npm run bench:robotics     # Test only robotics vertical
```

### Custom Filtering

```bash
ts-node run-benchmark.ts --vertical gaming    # Single vertical
ts-node run-benchmark.ts --target unity       # Single target (all verticals)
```

## Output

### Raw Results

`results/benchmark-results.json` contains structured data:

```json
{
  "vertical": "healthcare",
  "composition": "01-healthcare.holo",
  "target": "unity",
  "success": true,
  "compilationTimeMs": 45.2,
  "outputSizeBytes": 12456,
  "featureParity": {
    "totalFeatures": 15,
    "supportedFeatures": 14,
    "percentage": 93.3,
    "missingFeatures": ["body_tracking"]
  }
}
```

### Benchmark Report

`BENCHMARK_REPORT.md` includes:

1. **Executive Summary** - Overall success rate, average metrics
2. **Results by Vertical** - Per-vertical compilation matrix
3. **Results by Target** - Per-target performance statistics
4. **Performance Rankings** - Fastest compilations, smallest outputs, highest parity
5. **Failure Analysis** - Compilation errors and missing features
6. **Methodology** - How metrics are calculated

## Metrics Explained

### Compilation Time

Measured from AST input to code generation output using `performance.now()`. Does **not** include:

- File I/O
- Source parsing (measured separately)
- Post-compilation validation

### Output Size

Total byte count of generated code/data:

- For text output (C#, C++, JavaScript): UTF-8 byte length
- For JSON output (URDF, DTDL): Serialized JSON byte length
- For binary output (WASM): Binary size

### Feature Parity Score

Percentage of HoloScript features present in compiled output:

1. Extract features from AST (traits, environment settings, state, audio, lights, etc.)
2. Search for feature references in compiled output
3. Calculate: `(matched features / total features) × 100`

**Example:**

- Composition uses: `@grabbable`, `@physics`, `environment.skybox`, `audio`, `state`
- Unity output contains: `@grabbable` (as Rigidbody), `@physics` (as Rigidbody), `environment.skybox` (as Skybox material), `audio` (as AudioSource)
- Missing: `state` (not yet implemented in Unity compiler)
- **Parity Score:** 80% (4/5 features)

**Note:** This is a conservative heuristic. False negatives occur when features are compiled but named differently.

## Adding New Verticals

1. Create composition: `compositions/XX-vertical-name.holo`
2. Add target mapping: `target-mapping.json`
3. Run benchmark: `npm run bench`

## Adding New Targets

1. Import compiler: `run-benchmark.ts` → `COMPILERS` registry
2. Update vertical applicability: `target-mapping.json`
3. Run benchmark: `npm run bench`

## Troubleshooting

### Compilation Failures

Check `results/BENCHMARK_REPORT.md` → **Failure Analysis** section for:

- Missing compiler features
- Unsupported traits
- Parser errors
- RBAC issues (use `test-benchmark-token` in harness)

### Performance Issues

- Reduce test set: Comment out verticals in `compositionFiles` loop
- Increase timeout: Add `--timeout` flag (if implemented)
- Profile specific compiler: Use `console.time()` around `compiler.compile()`

## CI/CD Integration

To add to CI pipeline:

```yaml
- name: Run Cross-Compilation Benchmark
  run: |
    cd benchmarks/cross-compilation
    npm install
    npm run bench

- name: Upload Benchmark Report
  uses: actions/upload-artifact@v3
  with:
    name: benchmark-report
    path: benchmarks/cross-compilation/BENCHMARK_REPORT.md
```

## Known Limitations

1. **Feature Parity Heuristic** - String matching may miss semantically equivalent but syntactically different implementations
2. **No Runtime Validation** - Benchmarks test compilation, not runtime correctness
3. **Synthetic Compositions** - Test compositions are representative but simplified
4. **RBAC Bypass** - Uses mock agent token; production RBAC not tested

## Future Enhancements

- [ ] Runtime performance benchmarks (FPS, memory, load time)
- [ ] Visual diff reports (screenshot comparisons)
- [ ] Incremental compilation benchmarks
- [ ] Multi-threaded compilation testing
- [ ] Bundle size analysis (minified/gzipped)
- [ ] AST complexity metrics
- [ ] Regression testing (compare against previous runs)

## References

- [HoloScript Compiler Architecture](../../docs/ARCHITECTURE.md)
- [Supported Compilation Targets](../../packages/core/README.md)
- [Vertical Use Cases](../../docs/USE_CASE_RESEARCH_COMPREHENSIVE.md)
- [Trait System Reference](../../docs/traits/index.md)
