# HoloScript GPU / WASM Benchmark Report

**Generated:** 2026-05-14T10:38:19.705Z

**HoloScript Version:** v7.0.0

**Scenarios:** 8

**Success Rate:** 100.0%

---

## WEBGPU Results

**Success:** 4/4

| Scenario | Compile (ms) | Size | Validation |
|----------|-------------|------|------------|
| WebGPU — Minimal Composition | ✅ 0.86 | 5.6 KB | ✓ |
| WebGPU — 1M GPU Particles | ✅ 0.45 | 7.2 KB | ✓ |
| WebGPU — 10K Rigid Bodies | ✅ 0.26 | 7.4 KB | ✓ |
| WebGPU — Generic Compute Shader | ✅ 0.08 | 7.4 KB | ✓ |

## WASM Results

**Success:** 2/2

| Scenario | Compile (ms) | Size | Validation |
|----------|-------------|------|------------|
| WASM — Minimal Composition | ✅ 0.97 | 2.1 KB | ✓ |
| WASM — Composition with State | ✅ 0.14 | 2.6 KB | ✓ |

## UNITY Results

**Success:** 1/1

| Scenario | Compile (ms) | Size | Validation |
|----------|-------------|------|------------|
| Unity — Minimal Composition | ✅ 0.43 | 329 B | ✓ |

## BABYLONJS Results

**Success:** 1/1

| Scenario | Compile (ms) | Size | Validation |
|----------|-------------|------|------------|
| Babylon.js — Minimal Composition | ✅ 0.38 | 1.4 KB | ✓ |

---

## Validation Criteria

### WebGPU
- `navigator.gpu` reference present
- `requestDevice` call present
- Vertex/fragment or compute shaders emitted
- Compute shaders include `@workgroup_size`

### WASM
- `(module)` declaration present
- `(memory)` declaration present
- `(export)` present (warning if missing)
- `(func)` present (warning if missing)

### Unity
- `using UnityEngine;` namespace present
- `class` or `MonoBehaviour` declaration present
- Method declarations present (warning if missing)

### Babylon.js
- `BABYLON.` namespace reference present
- `Engine` instantiation present
- `Scene` creation present (warning if missing)
