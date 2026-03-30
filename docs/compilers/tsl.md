# Trait Shader Language (TSL) Compiler

Compiles HoloScript visual traits directly to [WGSL](https://www.w3.org/TR/WGSL/) (WebGPU Shader Language) — letting artists describe materials and effects with traits while the GPU executes native shaders.

## Overview

The TSL compiler (`--target tsl`) implements **Trait Shader Language**: HoloScript's visual trait declarations become compiled WGSL vertex and fragment shaders. You never write a shader; you write traits.

```bash
holoscript compile material.holo --target tsl --output ./shaders/
```

This is HoloScript's bridge between the declarative spatial layer and the raw GPU pipeline.

## Output Structure

```
shaders/
  [ObjectName].vert.wgsl     # Vertex shader per object
  [ObjectName].frag.wgsl     # Fragment shader per object
  [ObjectName].compute.wgsl  # Compute shader (if needed)
  materials.json             # Bind group layouts
```

## Trait → Shader Mapping

| HoloScript Trait  | Generated Shader Feature               |
| ----------------- | -------------------------------------- |
| `@glowing`        | Fresnel rim + HDR emissive output      |
| `@emissive`       | Emissive PBR term in fragment shader   |
| `@reflective`     | Specular GGX BRDF                      |
| `@transparent`    | Alpha blending / OIT                   |
| `@animated`       | Vertex displacement animation          |
| `@particle`       | Compute-based particle system          |
| `@gaussian_splat` | Gaussian splatting splat render        |
| `@volumetric`     | Raymarched volume shader               |
| `@nerf`           | NeRF sample + accumulate shader        |
| `@water`          | FFT ocean surface shader               |
| `@holographic`    | Scanline + chromatic aberration        |
| `@xray`           | Depth-based transparency               |
| `ai_texture_gen`  | Passes UV to Stable Diffusion pipeline |

## Example

```holo
composition "MaterialDemo" {
  object "Crystal" {
    geometry: "sphere"
    @glowing
    @reflective
    @transparent

    color: "#00ffff"
    opacity: 0.75
    emission_intensity: 2.5
  }
}
```

Compiles to a WGSL fragment shader combining Fresnel rim glow, GGX reflectance, and alpha-blended transparency — without writing a single line of WGSL.

**Generated fragment shader (excerpt):**

```wgsl
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // @glowing — Fresnel rim
  let rim = pow(1.0 - abs(dot(in.normal, view_dir)), 3.0);
  // @reflective — GGX specular
  let spec = GGX_brdf(in.normal, view_dir, light_dir, 0.1);
  // @transparent — alpha blend
  let alpha = mix(0.2, 1.0, rim) * uniforms.opacity;
  return vec4(base_color + rim * emission + spec, alpha);
}
```

## Compiler Options

| Option               | Default | Description                                 |
| -------------------- | ------- | ------------------------------------------- |
| `--tsl-optimize`     | true    | Run Naga optimizer over generated WGSL      |
| `--tsl-compute`      | false   | Emit separate compute shaders for @particle |
| `--tsl-compat-webgl` | false   | Emit GLSL fallback alongside WGSL           |
| `--tsl-sourcemap`    | false   | WGSL source-map back to .holo trait lines   |

## Pipeline Integration

The TSL output is consumed by:

1. **`@holoscript/runtime`** — loads WGSL directly into WebGPU pipeline
2. **WebGPU Compiler** — bundles shaders with the WebGPU scene
3. **NIRToWGSL Compiler** — uses the same WGSL output format for neuromorphic compute shaders

## See Also

- [WebGPU Compiler](/compilers/webgpu) — Full WebGPU scene output
- [Neuromorphic Compiler](/compilers/neuromorphic) — NIRToWGSL, uses same pipeline
- [Visual Traits](/traits/visual) — All visual trait definitions
