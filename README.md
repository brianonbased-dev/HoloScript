# HoloScript

One language. Every platform. Write `.holo`, compile to Unity, Unreal, VisionOS, React, ROS 2, Node.js, or 30 other targets.

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.holoscript.net/mcp"]
    }
  }
}
```

## Try it

```bash
curl -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Hello\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }", "target": "r3f"}'
```

Change `target` to `unity`, `urdf`, `godot`, `node-service`, `native-2d`, `visionos`, or any of the [37 targets](./docs/reference/FULL_README.md#compilation-targets). Same input, different output.

## Install

```bash
npm install @holoscript/core
```

## What it does

```holo
composition "Store" {
  object "Product" {
    @physics(mass: 2)
    @grabbable
    @info_popup
    @label(text: "Blue Dream")
    @gauge(value: 21.5, unit: "%")
    geometry: "box"
  }
}
```

This compiles to:
- **Unity** → C# MonoBehaviour with Rigidbody + XRGrabInteractable
- **URDF** → Robot description XML for ROS 2 / Gazebo
- **React Three Fiber** → JSX component with physics and 3D rendering
- **Native 2D** → HTML/CSS product card for mobile
- **Node.js** → Express service skeleton
- **VisionOS** → RealityKit Swift for Apple headsets

The compiler maps each trait (`@physics`, `@grabbable`, `@info_popup`) to the correct platform API. You describe what something IS. The compiler handles what it BECOMES.

## Absorb — point it at your data

```bash
# Scan a GitHub repo into a knowledge graph
absorb_run_absorb({ repo: "https://github.com/your/repo" })

# Ask questions about it
holo_ask_codebase({ query: "how does auth work?" })

# Map a CSV to spatial traits
holoscript_map_csv({ headers: ["name","price","image_url","category"] })
```

Works with codebases (TypeScript, Python, Rust, Go), CSVs, JSON schemas, and plain language descriptions. [Absorb docs →](./packages/absorb-service/README.md)

## Numbers

| Metric | Value |
| ------ | ----- |
| Compilers | 37 (12 sovereign + 24 bridge + 1 stub) |
| Traits | 3,300+ across 116 categories |
| MCP tools | 143 (115 holoscript + 28 absorb) |
| Tests | 57,356+ passing |
| Packages | 61 |
| Plugins | 6 (Narupa, robotics, medical, AlphaFold, web-preview, domain template) |

Traits define behavior. The compiler maps them to each platform's native runtime. `@physics` becomes a Unity Rigidbody, a Three.js RigidBody, a Gazebo `<inertial>` block, or a WebGPU compute dispatch — depending on the target. The platform's own runtime executes the behavior.

## Links

- [Full feature reference](./docs/reference/FULL_README.md) — compilers, renderers, identity system, domain blocks, GPU pipelines
- [Compile API](https://mcp.holoscript.net/api/health) — live at `mcp.holoscript.net`
- [Absorb service](https://absorb.holoscript.net/health) — codebase intelligence
- [Studio](./packages/studio/README.md) — visual editor (34 pages, 43 panels)
- [Strategy](./docs/strategy/ROADMAP.md) — roadmap and vision
- [Plugins](./packages/plugins/) — domain plugins (Narupa, robotics, medical, etc.)

---

v6.0.1 · [MIT License](./LICENSE)
