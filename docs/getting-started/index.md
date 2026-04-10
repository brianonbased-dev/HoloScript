# Getting Started with HoloScript

Write `.holo`, compile to Unity, Unreal, WebXR, React, VisionOS, ROS 2, and other registered targets.

## Quickstart (recommended)

```bash
npx create-holoscript-app my-world
cd my-world
npm install
npm run dev
```

This scaffolds a project with a sample `.holo` scene and opens a live preview in your browser.

## Manual install

```bash
npm install @holoscript/core
```

Create `hello.holo`:

```holo
composition "Hello" {
  object "Cube" {
    @physics
    @grabbable
    geometry: "box"
    position: [0, 1, 0]
  }
}
```

Compile it:

```bash
npx holoscript compile hello.holo --target r3f
```

## Compile via API (no install)

```bash
curl -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Hello\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }", "target": "r3f"}'
```

Change `target` to `unity`, `godot`, `unreal`, `visionos`, `urdf`, `native-2d`, or any registered target key from `ExportTarget` in `packages/core/src/compiler/CircuitBreaker.ts`.

## MCP integration

Add HoloScript tools to any MCP-compatible editor:

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

## Core concepts

- **Compositions** define a scene (`composition "Name" { ... }`)
- **Objects** are 3D entities with geometry and position
- **Traits** (`@physics`, `@grabbable`, `@label`) add behavior -- the compiler maps each trait to the target platform's native API
- **Compilers** turn one `.holo` file into platform-specific code

## Run an example

```bash
git clone https://github.com/holoscript/holoscript
cd holoscript/examples
cat hello-world.holo
```

Browse the `examples/` directory covering VR training, AR furniture, digital twins, robotics, and more.

## Utility Surface (not only rendering)

HoloScript also supports:

- `.hs` data/service pipelines (source → transform → sink)
- schema mapping and codebase intelligence via Absorb
- observability/telemetry flows for agent/runtime operations
- knowledge-market and team workflows (HoloMesh + orchestrator)

## Next steps

- [Full feature reference](../reference/FULL_README.md) -- compilers, renderers, identity, GPU pipelines
- [Compile API](https://mcp.holoscript.net/api/health) -- live at `mcp.holoscript.net`
- [Absorb service](https://absorb.holoscript.net/health) -- codebase intelligence
- [Studio](../../packages/studio/README.md) -- visual editor
- [Plugins](../../packages/plugins/) -- domain plugins (robotics, medical, Narupa, etc.)

---

v6.0.2 · [MIT License](../../LICENSE)
