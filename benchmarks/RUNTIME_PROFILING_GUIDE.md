# Runtime Profiling Integration Guide

**Status**: Phase 2 implementation guide (not yet fully automated)

This document explains how to integrate runtime profiling (FPS, memory, draw calls) into the HoloScript benchmark suite.

---

## Table of Contents

1. [Overview](#overview)
2. [Unity Profiler Integration](#unity-profiler-integration)
3. [Unreal Insights Integration](#unreal-insights-integration)
4. [Quest 3 Device Profiling](#quest-3-device-profiling)
5. [Automated Data Collection](#automated-data-collection)
6. [Baseline Comparison](#baseline-comparison)

---

## Overview

**Goal**: Automatically collect runtime performance metrics for HoloScript-generated code vs. hand-written baselines.

**Metrics to Collect**:

- **FPS** (frames per second)
- **Frame Time** (ms per frame)
- **Memory Usage** (MB)
- **Draw Calls** (render batches)
- **Triangles** (polygon count)
- **GPU Time** (ms)
- **CPU Time** (ms)

**Platforms**:

1. Unity Editor (desktop - quick iteration)
2. Unity Quest 3 build (target device)
3. Unreal Editor (desktop)
4. Unreal Quest 3 build (target device)

---

## Unity Profiler Integration

### Manual Profiling (Current)

1. **Open Profiler**:

   ```
   Window → Analysis → Profiler
   ```

2. **Enable VR**:
   - Edit → Project Settings → XR Plug-in Management
   - Initialize XR on Startup: ✓

3. **Record for 60 seconds**

4. **Export data**:
   - Profiler → Save → Export CSV
   - Includes CPU, GPU, Memory, Rendering stats

### Automated Profiling (Phase 2)

**Approach**: Use Unity's Profiler API to programmatically collect metrics.

**Implementation**:

```csharp
// Assets/Scripts/ProfilingCollector.cs
using UnityEngine;
using UnityEngine.Profiling;
using System.IO;
using System.Collections.Generic;

public class ProfilingCollector : MonoBehaviour
{
    private List<FrameData> frames = new List<FrameData>();
    private float startTime;
    private int frameCount = 0;
    private const int TARGET_FRAMES = 60 * 60; // 60 seconds @ 60 FPS

    [System.Serializable]
    public struct FrameData
    {
        public float frameTime;      // ms
        public long memoryUsed;      // bytes
        public int drawCalls;
        public int triangles;
        public float gpuTime;        // ms
    }

    void Start()
    {
        startTime = Time.realtimeSinceStartup;

        // Enable deep profiling (careful - performance impact)
        // Profiler.enableBinaryLog = true;
        Profiler.logFile = "profiler.raw";
    }

    void Update()
    {
        if (frameCount++ < TARGET_FRAMES)
        {
            CollectFrameData();
        }
        else if (frameCount == TARGET_FRAMES)
        {
            SaveResults();
            Debug.Log("Profiling complete! Check profiling-results.json");
        }
    }

    void CollectFrameData()
    {
        FrameData frame = new FrameData
        {
            frameTime = Time.deltaTime * 1000f, // Convert to ms
            memoryUsed = Profiler.GetTotalAllocatedMemoryLong(),
            drawCalls = UnityStats.batches,
            triangles = UnityStats.triangles,
            gpuTime = 0 // TODO: Extract from Profiler
        };

        frames.Add(frame);
    }

    void SaveResults()
    {
        var summary = new
        {
            totalFrames = frames.Count,
            avgFPS = 1000f / (frames.Sum(f => f.frameTime) / frames.Count),
            avgFrameTime = frames.Average(f => f.frameTime),
            avgMemoryMB = frames.Average(f => f.memoryUsed) / (1024 * 1024),
            avgDrawCalls = frames.Average(f => f.drawCalls),
            avgTriangles = frames.Average(f => f.triangles)
        };

        string json = JsonUtility.ToJson(summary, prettyPrint: true);
        File.WriteAllText("profiling-results.json", json);
    }
}
```

**CI Integration**:

```yaml
# .github/workflows/unity-profiling.yml
- name: Run Unity profiling
  run: |
    unity-editor -batchmode -nographics \
      -projectPath ./UnityProject \
      -executeMethod ProfilingRunner.RunBenchmark \
      -logFile profiling.log

    cat profiling-results.json
```

---

## Unreal Insights Integration

### Manual Profiling (Current)

1. **Enable Unreal Insights**:

   ```cpp
   // In Project Settings → Plugins → Trace
   // Enable "Trace Utilization Tracking"
   ```

2. **Start tracing**:

   ```
   Console command: trace.start default
   ```

3. **Run for 60 seconds**

4. **Stop tracing**:

   ```
   Console command: trace.stop
   ```

5. **Analyze with Unreal Insights**:
   ```bash
   Engine/Binaries/Win64/UnrealInsights.exe
   ```

### Automated Profiling (Phase 2)

**Approach**: Use Unreal's CSV Profiler for automated metrics collection.

**Implementation**:

```cpp
// Source/ProfilingCollector.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProfilingCollector.generated.h"

USTRUCT()
struct FFrameData
{
    GENERATED_BODY()

    float FrameTimeMs;
    int64 MemoryUsedBytes;
    int32 DrawCalls;
    int32 Triangles;
    float GPUTimeMs;
};

UCLASS()
class AProfilingCollector : public AActor
{
    GENERATED_BODY()

public:
    AProfilingCollector();

protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

private:
    TArray<FFrameData> Frames;
    int32 FrameCount = 0;
    static constexpr int32 TARGET_FRAMES = 60 * 60; // 60s @ 60 FPS

    void CollectFrameData();
    void SaveResults();
};
```

```cpp
// Source/ProfilingCollector.cpp
#include "ProfilingCollector.h"
#include "HAL/PlatformMemory.h"
#include "RHIStats.h"
#include "Engine/Engine.h"

AProfilingCollector::AProfilingCollector()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AProfilingCollector::BeginPlay()
{
    Super::BeginPlay();

    // Start CSV profiling
    GEngine->Exec(GetWorld(), TEXT("csvprofile start"));
}

void AProfilingCollector::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (FrameCount++ < TARGET_FRAMES)
    {
        CollectFrameData();
    }
    else if (FrameCount == TARGET_FRAMES)
    {
        SaveResults();
        GEngine->Exec(GetWorld(), TEXT("csvprofile stop"));
    }
}

void AProfilingCollector::CollectFrameData()
{
    FFrameData Frame;
    Frame.FrameTimeMs = FPlatformTime::ToMilliseconds64(
        GFrameTime
    );
    Frame.MemoryUsedBytes = FPlatformMemory::GetStats().UsedPhysical;
    Frame.DrawCalls = GNumDrawCallsRHI;
    Frame.Triangles = GNumPrimitivesDrawnRHI;
    Frame.GPUTimeMs = 0; // Extract from RHI stats

    Frames.Add(Frame);
}

void AProfilingCollector::SaveResults()
{
    // Calculate averages
    float AvgFrameTime = 0;
    int64 AvgMemory = 0;
    int32 AvgDrawCalls = 0;
    int32 AvgTriangles = 0;

    for (const FFrameData& Frame : Frames)
    {
        AvgFrameTime += Frame.FrameTimeMs;
        AvgMemory += Frame.MemoryUsedBytes;
        AvgDrawCalls += Frame.DrawCalls;
        AvgTriangles += Frame.Triangles;
    }

    int32 Count = Frames.Num();
    AvgFrameTime /= Count;
    AvgMemory /= Count;
    AvgDrawCalls /= Count;
    AvgTriangles /= Count;

    float AvgFPS = 1000.0f / AvgFrameTime;

    // Write JSON
    FString JSON = FString::Printf(
        TEXT("{"
             "\"totalFrames\": %d,"
             "\"avgFPS\": %.2f,"
             "\"avgFrameTime\": %.2f,"
             "\"avgMemoryMB\": %.2f,"
             "\"avgDrawCalls\": %d,"
             "\"avgTriangles\": %d"
             "}"),
        Count, AvgFPS, AvgFrameTime,
        AvgMemory / (1024.0 * 1024.0),
        AvgDrawCalls, AvgTriangles
    );

    FFileHelper::SaveStringToFile(
        JSON,
        TEXT("profiling-results.json")
    );
}
```

---

## Quest 3 Device Profiling

### Prerequisites

1. **Enable Developer Mode** on Quest 3
2. **Install Android Debug Bridge (adb)**:

   ```bash
   # Windows
   choco install adb

   # Mac
   brew install android-platform-tools

   # Linux
   sudo apt-get install adb
   ```

3. **Connect Quest 3 via USB-C**
4. **Authorize computer** on Quest headset

### OVR Metrics Tool

**Best method for Quest-specific profiling.**

**Installation**:

```bash
# Download from Oculus Developer Portal
# https://developer.oculus.com/downloads/package/ovr-metrics-tool/

# Or use adb
adb install -r OVRMetricsTool.apk
```

**Usage**:

```bash
# Enable Performance HUD (overlay on headset)
adb shell setprop debug.oculus.perfhud 3

# Levels:
# 0 = Off
# 1 = Performance Summary
# 2 = Performance Stats
# 3 = Application Render Timing
# 4 = Compositor Render Timing
# 5 = Application + Compositor Timing

# Collect metrics (via adb logcat)
adb logcat | grep "VrApi"
```

**Automated Collection**:

```bash
# benchmarks/tools/quest-profiling.sh
#!/bin/bash

APP_PACKAGE="com.holoscript.benchmark"
DURATION=60 # seconds

echo "🎯 Starting Quest 3 profiling..."

# Deploy app
adb install -r Builds/BasicScene.apk

# Enable performance HUD
adb shell setprop debug.oculus.perfhud 3

# Start app
adb shell am start -n "$APP_PACKAGE/.MainActivity"

# Wait for startup
sleep 5

# Collect metrics for $DURATION seconds
echo "📊 Collecting metrics for ${DURATION}s..."
timeout ${DURATION}s adb logcat -s "VrApi:V" > quest-metrics.log

# Stop app
adb shell am force-stop "$APP_PACKAGE"

# Parse metrics
python parse-quest-metrics.py quest-metrics.log > quest-results.json

echo "✅ Profiling complete! Results: quest-results.json"
```

**Metrics Parser** (`parse-quest-metrics.py`):

```python
import json
import re
import sys

def parse_vrapi_log(log_file):
    """Parse VrApi logs from Quest profiling"""

    fps_values = []
    frame_times = []
    memory_values = []

    with open(log_file, 'r') as f:
        for line in f:
            # Extract FPS
            fps_match = re.search(r'FPS=(\d+\.\d+)', line)
            if fps_match:
                fps_values.append(float(fps_match.group(1)))

            # Extract frame time
            ft_match = re.search(r'FrameTime=(\d+\.\d+)', line)
            if ft_match:
                frame_times.append(float(ft_match.group(1)))

    # Calculate averages
    result = {
        "avgFPS": sum(fps_values) / len(fps_values) if fps_values else 0,
        "avgFrameTime": sum(frame_times) / len(frame_times) if frame_times else 0,
        "minFPS": min(fps_values) if fps_values else 0,
        "maxFPS": max(fps_values) if fps_values else 0,
        "totalFrames": len(fps_values)
    }

    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    parse_vrapi_log(sys.argv[1])
```

---

## Automated Data Collection

### Benchmark Runner Integration

Update `benchmark-runner.ts` to include runtime profiling:

```typescript
// benchmarks/tools/benchmark-runner.ts (additions)

interface RuntimeMetrics {
  avgFPS: number;
  avgFrameTimeMs: number;
  avgMemoryMB: number;
  avgDrawCalls: number;
  avgTriangles: number;
}

async function profileUnityRuntime(scenario: string): Promise<RuntimeMetrics> {
  console.log('   → Profiling Unity runtime...');

  // Build Unity project
  await buildUnityProject(scenario);

  // Run with profiling
  const metrics = await runUnityProfiler(scenario, 60);

  return metrics;
}

async function profileQuestRuntime(scenario: string): Promise<RuntimeMetrics> {
  console.log('   → Profiling on Quest 3...');

  // Deploy to Quest
  await deployToQuest(scenario);

  // Run OVR Metrics Tool
  const metrics = await runQuestProfiler(scenario, 60);

  return metrics;
}
```

---

## Baseline Comparison

### Overhead Calculation

```typescript
// benchmarks/tools/compare-results.ts

interface ComparisonResult {
  metric: string;
  baseline: number;
  holoscript: number;
  overhead: number; // percentage
  status: 'PASS' | 'FAIL';
}

function compareToBaseline(
  holoscriptResults: RuntimeMetrics,
  baselineResults: RuntimeMetrics,
  threshold: number = 10 // 10% overhead allowed
): ComparisonResult[] {
  const comparisons: ComparisonResult[] = [];

  // FPS comparison (inverse - lower is worse)
  const fpsOverhead =
    ((baselineResults.avgFPS - holoscriptResults.avgFPS) / baselineResults.avgFPS) * 100;
  comparisons.push({
    metric: 'FPS',
    baseline: baselineResults.avgFPS,
    holoscript: holoscriptResults.avgFPS,
    overhead: fpsOverhead,
    status: fpsOverhead <= threshold ? 'PASS' : 'FAIL',
  });

  // Frame time comparison
  const frameTimeOverhead =
    ((holoscriptResults.avgFrameTimeMs - baselineResults.avgFrameTimeMs) /
      baselineResults.avgFrameTimeMs) *
    100;
  comparisons.push({
    metric: 'Frame Time',
    baseline: baselineResults.avgFrameTimeMs,
    holoscript: holoscriptResults.avgFrameTimeMs,
    overhead: frameTimeOverhead,
    status: frameTimeOverhead <= threshold ? 'PASS' : 'FAIL',
  });

  // Memory comparison
  const memoryOverhead =
    ((holoscriptResults.avgMemoryMB - baselineResults.avgMemoryMB) / baselineResults.avgMemoryMB) *
    100;
  comparisons.push({
    metric: 'Memory',
    baseline: baselineResults.avgMemoryMB,
    holoscript: holoscriptResults.avgMemoryMB,
    overhead: memoryOverhead,
    status: memoryOverhead <= 15 ? 'PASS' : 'FAIL', // 15% for memory
  });

  return comparisons;
}

function printComparison(comparisons: ComparisonResult[]): void {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│         HoloScript vs. Baseline Comparison          │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│ Metric      │ Baseline │ HoloScript │ Overhead │ ✓ │');
  console.log('├─────────────┼──────────┼────────────┼──────────┼───┤');

  for (const cmp of comparisons) {
    const status = cmp.status === 'PASS' ? '✅' : '❌';
    console.log(
      `│ ${cmp.metric.padEnd(11)} │ ${cmp.baseline.toFixed(1).padStart(8)} │ ${cmp.holoscript.toFixed(1).padStart(10)} │ ${('+' + cmp.overhead.toFixed(1) + '%').padStart(8)} │ ${status} │`
    );
  }

  console.log('└─────────────┴──────────┴────────────┴──────────┴───┘\n');

  const allPassed = comparisons.every((c) => c.status === 'PASS');
  console.log(
    allPassed ? '✅ PASS: Overhead within acceptable range' : '❌ FAIL: Overhead exceeds threshold'
  );
}
```

---

## Next Steps

### Phase 2 Implementation Tasks

- [ ] Implement Unity ProfilingCollector script
- [ ] Implement Unreal ProfilingCollector C++
- [ ] Create Quest 3 profiling automation script
- [ ] Integrate runtime metrics into benchmark-runner.ts
- [ ] Create comparison logic (baseline vs. HoloScript)
- [ ] Add CI/CD integration for automated profiling
- [ ] Create public dashboard for results visualization

### Estimated Time

- Unity profiling integration: 4 hours
- Unreal profiling integration: 6 hours
- Quest automation: 6 hours
- Comparison logic: 2 hours
- CI/CD integration: 3 hours
- **Total**: ~21 hours

---

**Last Updated**: February 21, 2026
**Status**: Implementation guide (Phase 2 ready to start)
