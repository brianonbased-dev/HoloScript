# Unreal Hand-Written Baseline - Scenario 1

**Purpose**: Performance comparison baseline for HoloScript-generated Unreal code.

## Setup Instructions

### 1. Create Unreal Project

```bash
# Unreal Engine 5.3 or later
# Use Epic Games Launcher → Create Project → Virtual Reality → Blank
```

**Project Settings**:

- Template: Blank (VR)
- C++ (not Blueprint)
- Desktop & Console (with Mobile/Quest support)
- Starter Content: Yes

### 2. Add C++ Class

1. Copy `BasicSceneSetup.h` to `Source/HoloScriptBenchmark/`
2. Copy `BasicSceneSetup.cpp` to `Source/HoloScriptBenchmark/`
3. Regenerate project files:
   ```bash
   # Right-click .uproject → Generate Visual Studio project files
   ```
4. Build project in Visual Studio
5. Open level, drag `ABasicSceneSetup` actor into scene

### 3. Configure for Quest 2/3

**Project Settings → Platforms → Android**:

- Minimum SDK: 29 (Android 10)
- Target SDK: 32 (Android 12)
- Package for Oculus Mobile: ✓
- Support arm64: ✓

**Project Settings → Engine → Rendering**:

- Forward Rendering: ✓
- Mobile HDR: ✗
- Mobile MSAA: 4x
- Dynamic Shadows: ✓ (use CSM for mobile)

**Plugins**:

- Oculus VR (enabled)
- OpenXR (enabled as fallback)

### 4. Build for Quest 2/3

```bash
# Package for Android (Quest)
# File → Package Project → Android (ASTC)
# Output: Builds/Android/
```

**Build Settings**:

- Configuration: Development (for profiling)
- Distribution Build: ✗
- Full Rebuild: ✓

## Profiling Instructions

### Unreal Editor (Desktop)

1. **Enable VR Preview**:
   - Settings → VR Mode: ✓
   - Use VR Preview (Alt+P)

2. **Session Frontend** (profiling tool):

   ```
   Window → Developer Tools → Session Frontend
   → Profiler Tab → Capture → Start
   ```

3. **Run for 60 seconds**

4. **Collect metrics**:
   - FPS: `stat fps` console command
   - Frame Time: `stat unit` (Game thread, Render thread, GPU)
   - Memory: `stat memory`
   - Draw Calls: `stat rhi` (draw calls, primitives)
   - Triangles: `stat rhi` (triangle count)

### Quest 2/3 (Device)

1. **Deploy APK**:

   ```bash
   adb install -r Builds/Android/HoloScriptBenchmark.apk
   ```

2. **Enable Profiling**:
   - Development Build: ✓ (in Package Settings)
   - Enable Plugin Content: ✓

3. **Unreal Insights** (advanced profiling):

   ```bash
   # On PC, start Unreal Insights:
   Engine/Binaries/Win64/UnrealInsights.exe

   # On device, enable trace:
   # Console command: trace.start default
   ```

4. **OVR Metrics Tool**:

   ```bash
   # Performance HUD overlay
   adb shell setprop debug.oculus.perfhud 3
   ```

5. **Run for 60 seconds**, collect metrics

### Console Commands (In-Game)

```cpp
// FPS and frame time
stat fps

// Detailed timing (Game, Render, GPU threads)
stat unit

// Memory usage
stat memory

// Rendering stats (draw calls, triangles)
stat rhi

// GPU profiling
stat gpu
```

## Expected Results

### Desktop (RTX 3060)

- **FPS**: 88 FPS (VR 90Hz with overhead)
- **Game Thread**: 9ms
- **Render Thread**: 8ms
- **GPU**: 7ms
- **Memory**: 410MB
- **Draw Calls**: 52
- **Triangles**: 6,200

### Quest 2

- **FPS**: 72 FPS (fixed refresh rate)
- **Game Thread**: 11ms
- **Render Thread**: 10ms
- **GPU**: 9ms
- **Memory**: 380MB
- **Draw Calls**: 48
- **Triangles**: 5,800

### Quest 3

- **FPS**: 90 FPS (Quest 3 native refresh)
- **Game Thread**: 9ms
- **Render Thread**: 8ms
- **GPU**: 7ms
- **Memory**: 390MB
- **Draw Calls**: 50
- **Triangles**: 6,000

## Performance Optimization

Already optimized:

- ✅ Forward renderer (mobile-optimized)
- ✅ Static mesh instancing
- ✅ Culling (distance + frustum)
- ✅ LOD system (for complex scenes)
- ✅ Material optimization (mobile shaders)
- ✅ Cascaded shadow maps (mobile CSM)

## Comparison to HoloScript

**This baseline is used to calculate overhead**:

```
Overhead % = (HoloScript_Time - Unreal_Baseline) / Unreal_Baseline * 100
```

**Target**: <10% overhead

**Example**:

- Unreal Baseline: 88 FPS (11.36ms frame time)
- HoloScript → Unreal: 85 FPS (11.76ms frame time)
- Overhead: (11.76 - 11.36) / 11.36 \* 100 = 3.5% ✅ PASS

## Files

- `BasicSceneSetup.h` - Header file (52 LOC)
- `BasicSceneSetup.cpp` - Implementation (164 LOC)
- `README.md` - This file

**Total LOC**: 216 lines of C++ (vs. HoloScript 25 lines → ~89% reduction)

## Notes

- **Build Time**: ~5 minutes (Unreal C++ build pipeline)
- **APK Size**: ~58MB (with Oculus VR plugin)
- **Blueprint Alternative**: Could reduce code to ~80 nodes (visual scripting)

## Debugging

### Common Issues

1. **Black screen on Quest**:
   - Check Mobile Shader Permutation Reduction is disabled
   - Verify Mobile HDR is disabled

2. **Low FPS**:
   - Enable Mobile MSAA (not Full MSAA)
   - Use Forward Renderer (not Deferred)
   - Check `stat unit` for bottlenecks

3. **Crash on device**:
   - Check `adb logcat` for errors
   - Verify arm64 architecture is enabled
   - Ensure minimum SDK version is correct

---

**Last Updated**: February 21, 2026
