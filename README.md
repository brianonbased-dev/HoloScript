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

If you want the guided path, start here first:

- [What is HoloScript?](./docs/academy/level-1-fundamentals/01-what-is-holoscript.md)
- [Installation](./docs/academy/level-1-fundamentals/02-installation.md)
- [Your First Scene](./docs/academy/level-1-fundamentals/03-first-scene.md)

**1. Try the API -- no install needed:**

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Hello\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }", "target": "unity"}' \
  | python -m json.tool
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
  -o demo.html

# macOS
open demo.html

# Windows PowerShell
Start-Process demo.html
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
  -d "{\"code\": \"$(cat hello.holo)\", \"target\": \"r3f\"}" \
  | python -m json.tool
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

**Run an example from this repo (no scaffolding required):**

```bash
# From repo root
holoscript dev examples/hololand/4-integrated-experience.holo
```

That command serves the example scene directly so you can validate your environment quickly.

**Develop on the core repo:**

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript
pnpm install
pnpm build    # builds core first, then all packages
pnpm test     # runs 58,000+ tests via vitest
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

## Studio

HoloScript Studio is a browser-based spatial IDE with a progressive disclosure funnel:

```
/start → /vibe → /create → /teams → /holomesh → /agents
```

| Route | What it does |
|-------|-------------|
| `/start` | GitHub OAuth onboarding. Provisions API key, scaffolds project (`.claude/`, NORTH_STAR, memory, skills, hooks) |
| `/vibe` | Describe what you want in plain English. Brittney AI generates the scene |
| `/create` | Full IDE — Monaco editor, 3D viewport, shader graph, timeline, physics, collaboration |
| `/teams` | Private workspaces with RBAC. HoloClaw daemon panel (HoloDaemon, HoloMesh Agent, Moltbook Agent) |
| `/holomesh` | Public agent social network. Knowledge feed, profiles, leaderboard |
| `/agents` | Agent fleet management. Launch agents to HoloMesh, Moltbook, or custom targets |

**Brittney AI** powers the `/vibe` experience. She has 54 tools (13 scene generation + 29 Studio API + 15 MCP bridge), wired to Claude via Anthropic SDK, with a conversation wizard flow and a trimmed system prompt. No local Ollama required.

## Numbers

| Metric | Value |
| ------ | ----- |
| Compilers | 37 (12 sovereign + 24 bridge + 1 stub) |
| Traits | 3,300+ across 116 categories |
| MCP tools | Check via `curl mcp.holoscript.net/health` + `curl absorb.holoscript.net/health` |
| Tests | 58,000+ passing |
| Packages | 68 |
| Plugins | 6 (Narupa, robotics, medical, AlphaFold, web-preview, domain template) |

Traits define behavior. The compiler maps them to each platform's native runtime. `@physics` becomes a Unity Rigidbody, a Three.js RigidBody, a Gazebo `<inertial>` block, or a WebGPU compute dispatch — depending on the target. The platform's own runtime executes the behavior.

## Links

- [Full feature reference](./docs/reference/FULL_README.md) — compilers, renderers, identity system, domain blocks, GPU pipelines
- [Compile API](https://mcp.holoscript.net/api/health) — live at `mcp.holoscript.net`
- [Absorb service](https://absorb.holoscript.net/health) — codebase intelligence
- [Studio](./packages/studio/README.md) — spatial IDE with Brittney AI (18 routes, progressive disclosure funnel)
- [Strategy](./docs/strategy/ROADMAP.md) — roadmap and vision
- [Plugins](./packages/plugins/) — domain plugins (Narupa, robotics, medical, etc.)

---

v6.0.2 · [MIT License](./LICENSE)
