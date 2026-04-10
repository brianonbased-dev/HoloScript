# AI Generation Traits

HoloScript's AI generation traits connect spatial objects to generative AI pipelines — text-to-texture, inpainting, real-time diffusion, neural style transfer, and AI-driven upscaling — all as declarative annotations on scene objects.

---

## Trait Reference

### `@stable_diffusion`

Connects an object's surface to a Stable Diffusion model. The prompt is derived from the object's `prompt` property or computed at runtime from scene context.

```hsplus
object "Canvas" @stable_diffusion {
  geometry: "plane"
  scale: [2, 2, 1]

  sd: {
    model: "stabilityai/stable-diffusion-xl-base-1.0"
    steps: 30
    cfg_scale: 7.5
    scheduler: "dpm++"
  }

  prompt: "a misty forest at dawn, cinematic lighting"

  onGrab: {
    this.sd.generate()      // regenerates with same prompt
  }

  onHoverEnter: {
    this.sd.preview()       // low-steps preview on hover
  }
}
```

### `@ai_inpainting`

Enables real-time inpainting — the user can "erase" part of a texture and AI fills it in based on scene context.

```hsplus
object "WorldMap" @ai_inpainting {
  geometry: "plane"
  texture: "textures/world_map.png"

  inpainting: {
    model: "stabilityai/stable-diffusion-2-inpainting"
    brush_size: 0.1
    fill_prompt: "continue the landscape style"
  }

  onGrab: {
    inpainting.activateBrush(user)   // user can paint mask
  }

  onRelease: {
    inpainting.fill()                // AI fills the masked region
  }
}
```

### `@ai_texture_gen`

Generates PBR texture sets (albedo, normal, roughness, metalness) from a text description. Handles seamless tiling.

```hsplus
object "DungeonWall" @ai_texture_gen {
  geometry: "plane"
  scale: [4, 4, 1]

  texture_gen: {
    prompt: "ancient stone wall, worn, mossy, detailed"
    resolution: 1024
    pbr: true         // generate full PBR set
    tiling: true      // seamless tile
    engine: "texture-diffusion-v3"
  }
}
```

### `@neural_forge`

Generates complete 3D **mesh geometry** from a text description using neural shape synthesis. Outputs glTF or USD-compatible meshes.

```hsplus
object "ProceduralCreature" @neural_forge {
  neural_forge: {
    prompt: "a six-legged insect with crystalline wings"
    lod_levels: 3
    rig: true          // generate animation rig
    output_format: "gltf"
    poly_budget: 50000
  }
}
```

### `@diffusion_realtime`

Runs a diffusion model in real-time as a post-processing effect — each video frame is stylised. Uses optimised SDXL-Turbo or LCM-LoRA for low-latency generation.

```hsplus
object "DreamPortal" @diffusion_realtime @collidable {
  geometry: "torus"
  color: "purple"

  diffusion_realtime: {
    model: "sdxl-turbo"
    strength: 0.4           // 0 = no effect, 1 = full generation
    prompt: "neon cyberpunk city at night"
    latency_ms: 50          // target frame latency
  }

  onTriggerEnter: {
    this.diffusion_realtime.enable()
  }

  onTriggerExit: {
    this.diffusion_realtime.disable()
  }
}
```

### `@ai_upscaling`

Real-time AI super-resolution for textures and render output. Supports Real-ESRGAN, DLSS-style upscaling, and frame interpolation.

```hsplus
composition "HighResScene" @ai_upscaling {
  upscaling: {
    model: "real-esrgan-x4"
    factor: 4
    mode: "quality"             // "quality" | "performance" | "ultra"
    apply_to: ["textures", "shadows"]
  }
}
```

---

## Generation Pipeline

```
User Prompt / Scene Context
         │
         ▼
   @stable_diffusion / @neural_forge / @ai_texture_gen
         │
         ▼
   HoloScript AI Generation API
         │
    ┌────┴─────────────────┐
    ▼                      ▼
Local Inference         Cloud API
(Ollama / llama.cpp)   (OpenAI / Stability)
    │                      │
    └────────┬─────────────┘
             ▼
      Generated Asset
         │
         ▼
   Injected into Scene
```

---

## CLI Generation

```bash
# Generate a texture and apply to a scene object
holo generate texture --prompt "mossy stone wall" --object DungeonWall --out assets/

# Generate mesh geometry
holo generate mesh --prompt "crystalline cave formation" --lod 3 --out assets/

# Run inpainting on an existing texture
holo generate inpaint --texture assets/map.png --mask assets/mask.png --prompt "fill with ocean"
```

---

## Related

- [AI Behavior Traits](./ai-behavior)
- [AI Autonomous Traits](./ai-autonomous)
- [Neuromorphic Compiler](../compilers/neuromorphic)
- [WASM Compiler](../compilers/wasm)
