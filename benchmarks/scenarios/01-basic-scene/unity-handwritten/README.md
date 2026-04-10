# Unity Hand-Written Baseline - Scenario 1

**Purpose**: Performance comparison baseline for HoloScript-generated Unity code.

## Setup Instructions

### 1. Create Unity Project

```bash
# Unity 2021.3 LTS or later
unity-hub --create-project "HoloScript-Benchmark-Unity" \
  --template "3D (URP)" \
  --path ./HoloScript-Benchmark-Unity
```

### 2. Install Dependencies

**Package Manager** (Window → Package Manager):

- XR Interaction Toolkit (2.3.0+)
- XR Plugin Management
- Oculus XR Plugin (Quest support)

### 3. Add Script

1. Copy `BasicSceneSetup.cs` to `Assets/Scripts/`
2. Create empty GameObject in scene
3. Attach `BasicSceneSetup` component
4. Press Play

### 4. Build for Quest 2/3

**Build Settings**:

- Platform: Android
- Texture Compression: ASTC
- Graphics API: Vulkan
- Minimum API Level: Android 10.0 (API 29)
- Scripting Backend: IL2CPP
- Target Architectures: ARM64

**XR Settings**:

- Initialize XR on Startup: ✓
- XR Plugin: Oculus

**Build**:

```bash
# Build APK
unity-hub --buildTarget Android \
  --outputPath ./Builds/BasicScene.apk
```

## Profiling Instructions

### Unity Editor (Desktop)

1. **Open Profiler** (Window → Analysis → Profiler)
2. **Enable VR**: XR Plugin Management → Initialize XR on Startup
3. **Record**: Click "Record" button
4. **Run for 60 seconds**
5. **Collect metrics**:
   - FPS: Profiler → CPU → Main Thread (target: 90 FPS)
   - Memory: Profiler → Memory → Total Reserved (target: <500MB)
   - Draw Calls: Profiler → Rendering → Batches
   - Triangles: Profiler → Rendering → Triangles

### Quest 2/3 (Device)

1. **Deploy APK**:

   ```bash
   adb install -r Builds/BasicScene.apk
   ```

2. **Enable Profiling**:
   - Development Build: ✓
   - Autoconnect Profiler: ✓
   - Deep Profiling: ✗ (too slow)

3. **Connect Profiler**:

   ```bash
   # Unity Editor → Profiler → Target: AndroidPlayer
   # Or use OVR Metrics Tool
   ```

4. **Run for 60 seconds**, collect metrics

### OVR Metrics Tool (Quest-specific)

```bash
# Enable Performance HUD on device
adb shell setprop debug.oculus.perfhud 3

# Metrics:
# - Application FPS (target: 72 FPS Quest 2, 90 FPS Quest 3)
# - CPU/GPU time (target: <13.9ms for 72 FPS)
# - Memory usage
# - Draw calls
```

## Expected Results

### Desktop (RTX 3060)

- **FPS**: 90 FPS (uncapped VR)
- **Frame Time**: 11ms
- **Memory**: 320MB
- **Draw Calls**: 45
- **Triangles**: 5,000

### Quest 2

- **FPS**: 90 FPS (with fixed foveated rendering)
- **Frame Time**: 11ms
- **Memory**: 280MB
- **Draw Calls**: 42
- **Triangles**: 4,800

### Quest 3

- **FPS**: 90 FPS
- **Frame Time**: 11ms
- **Memory**: 290MB
- **Draw Calls**: 43
- **Triangles**: 4,900

## Performance Optimization

Already optimized:

- ✅ Single pass instanced rendering
- ✅ Static batching (ground plane)
- ✅ Occlusion culling
- ✅ Standard shader (PBR)
- ✅ Soft shadows (directional light only)

## Comparison to HoloScript

**This baseline is used to calculate overhead**:

```
Overhead % = (HoloScript_Time - Unity_Baseline) / Unity_Baseline * 100
```

**Target**: <10% overhead

**Example**:

- Unity Baseline: 90 FPS (11ms frame time)
- HoloScript → Unity: 85 FPS (11.76ms frame time)
- Overhead: (11.76 - 11) / 11 \* 100 = 6.9% ✅ PASS

## Files

- `BasicSceneSetup.cs` - Main scene setup script (106 LOC)
- `README.md` - This file

## Notes

- **LOC**: 106 lines of C# (vs. HoloScript 25 lines → ~76% reduction)
- **Build Time**: ~2 minutes (Unity build pipeline)
- **APK Size**: ~42MB (with URP + XR Toolkit)

---

**Last Updated**: February 21, 2026
