# WGSL screen-space bindings contract (Studio shader graph)

**Board:** `task_1776739751086_5ptb`  
**Code:** `packages/studio/src/core/rendering/WGSLTranslator.ts` (`addUniformBindings`)

## Bindings (`@group(0)`)

| Order | Binding | Resource | When |
|-------|---------|---------|------|
| 0 | `var<uniform> uniforms` | `Uniforms` | `TimeInput` **or** any node needing frame matrices (`ScreenSpaceAO`) |
| 1…2N | `texture_2d<f32>` + `sampler` | Per-material names `uTexture_<nodeId>` | `Texture2D` nodes |
| 2N+1 | `u_screen_depth` | `texture_2d<f32>` | `ScreenSpaceAO` |
| 2N+2 | `u_screen_depth_sampler` | `sampler` | `ScreenSpaceAO` |

## `Uniforms` layouts

**Time only** (no `ScreenSpaceAO`):

```wgsl
struct Uniforms { time: f32; }
```

**Time + view/projection** (any graph with `ScreenSpaceAO`):

```wgsl
struct Uniforms {
  time: f32;
  _pad0: f32; _pad1: f32; _pad2: f32;
  view_matrix: mat4x4;
  projection_matrix: mat4x4;
}
```

The pipeline must fill row-major `mat4x4` as consumed by WGSL. `projection_matrix` is reserved for unprojection expansions; `ScreenSpaceAO` currently uses `view_matrix` for a light tie-in term.

## Pipeline responsibilities

1. Create bind group layout matching emitted indices (uniform buffer size depends on struct variant).
2. Bind prepass **linear depth** to `u_screen_depth` (R32FLOAT or packed in `.x`).
3. Provide a comparison **sampler** for `u_screen_depth_sampler`.

## What remains after this contract

- Studio preview / runtime must allocate the bind group and upload matrices + depth (not part of the translator-only milestone).
- Optional: merge with engine `PostProcessShaders` SSAO instead of duplicating logic inside the node body.
