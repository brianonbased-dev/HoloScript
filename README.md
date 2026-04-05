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

## Quick Start (30 seconds)

**1. Try the API -- no install needed:**

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Hello\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }", "target": "unity"}'
```

Returns JSON with platform-ready source code:

```json
{
  "success": true,
  "target": "unity",
  "output": "using UnityEngine;\n\nnamespace HoloScene {\n    public class GeneratedScene : MonoBehaviour {\n        private void Awake() {\n            var CubeGO = GameObject.CreatePrimitive(PrimitiveType.Cube);\n            CubeGO.transform.localPosition = new Vector3(0f, 1f, 0f);\n            var CubeRB = CubeGO.AddComponent<Rigidbody>();\n        }\n    }\n}"
}
```

Change `"target"` to get different platforms from the same input:

| Target | Output |
|--------|--------|
| `unity` | C# MonoBehaviour |
| `r3f` | React Three Fiber scene graph (JSON) |
| `urdf` | ROS 2 / Gazebo robot XML |
| `godot` | GDScript scene |
| `visionos` | RealityKit Swift |
| `native-2d` | Standalone HTML page |
| `node-service` | Express.js skeleton |

All [37 targets](./docs/reference/FULL_README.md#compilation-targets) work the same way. Same `.holo` input, different output.

**2. See it in a browser -- one command:**

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Store\" { object \"Product\" { @label(text: \"Demo\") @gauge(value: 99, unit: \"%\") geometry: \"box\" } }", "target": "native-2d"}' \
  -o demo.html && open demo.html
```

**3. Write your first `.holo` file:**

Create `hello.holo`:

```holo
composition "MyWorld" {
  object "Cube" {
    @physics(mass: 2)
    @grabbable
    geometry: "box"
    position: [0, 1, 0]
  }
}
```

Compile it against any target:

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"$(cat hello.holo)\", \"target\": \"r3f\"}"
```

## Run locally

**Scaffold a new project (recommended):**

```bash
npx create-holoscript-app my-world
cd my-world
npm install
npm run dev
```

This creates a project with a sample scene and opens a live preview.

**Develop on the core repo:**

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript
pnpm install
pnpm build    # builds core first, then all packages
pnpm test     # runs 57,000+ tests via vitest
```

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
