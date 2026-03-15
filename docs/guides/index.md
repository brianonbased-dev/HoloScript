# Introduction to HoloScript

HoloScript is a **full programming language** for VR, AR, robotics, IoT, and digital twins. It compiles to **25+ targets** including Unity, Unreal, Godot, visionOS, Android XR, WebGPU, URDF (ROS 2), SDF (Gazebo), DTDL (Azure Digital Twins), W3C WoT, and OpenUSD — from a single source file.

## 🚀 Start with Studio (Recommended)

**No coding required!** [HoloScript Studio](https://studio.holoscript.net) is a web-based IDE powered by **Brittney AI** that lets you build VR scenes using natural language.

### New User? Start Here

1. **[Your First AI Scene](/guides/first-ai-scene)** (15 min) - Build a complete VR scene with Brittney AI
2. **[Building Your First AI NPC](/guides/first-ai-npc)** (30 min) - Create intelligent characters
3. **[Studio IDE Reference](/guides/studio-reference)** - Complete interface guide

### Studio Features

- 🎨 **Creator Mode** - AI-driven scene building (no code)
- 🖌️ **Artist Mode** - Visual shader graph editor
- 🎬 **Filmmaker Mode** - Cinematic camera paths
- 🦴 **Character Mode** - Import & animate characters
- ⚙️ **Expert Mode** - Full code editor for advanced users
- 🤝 **Real-time Collaboration** - Multi-user editing with CRDT
- 📤 **One-click Publish** - Share scenes with a URL

**[Launch Studio →](https://studio.holoscript.net)**

---

## Why HoloScript?

### For Humans

- **No syntax errors** - Visual/declarative approach eliminates brackets and semicolons
- **Universal input** - Voice, gesture, gaze, or traditional keyboard
- **See the data flow** - Watch computation happen in 3D space

### For AI

- **Visual understanding** - AI "sees" program structure
- **Native manipulation** - AI can place and connect objects naturally
- **Any output target** - Generate code for any platform

### For Computing

- **One source → 25+ targets** - Unity, Unreal, Godot, VRChat, Babylon.js, WebGPU, visionOS, Android XR, URDF, SDF, DTDL, WoT, OpenUSD, Three.js, GLTF, OpenXR, iOS, WASM
- **50,000 → 500 lines** - Declarative syntax eliminates boilerplate
- **Cross-domain** - VR, AR, robotics, IoT, and digital twins from one source
- **Dual parser** - TypeScript + Rust/WASM with full LSP, linter, and formatter

## File Formats

HoloScript uses three file formats:

| Extension | Purpose            | Best For                         |
| --------- | ------------------ | -------------------------------- |
| `.hs`     | Classic HoloScript | Simple prototypes, learning      |
| `.hsplus` | HoloScript Plus    | VR traits, networking, physics   |
| `.holo`   | Composition        | AI-generated scenes, full worlds |

## Quick Start

Install the VS Code extension:

```bash
ext install holoscript.holoscript-vscode
```

Create your first scene:

```holo
composition "Hello World" {
  environment {
    skybox: "gradient"
    ambient_light: 0.5
  }

  object "Cube" {
    @collidable
    position: [0, 1, -3]
    color: "#00ffff"
  }
}
```

## Next Steps

- [Quick Start Guide](./quick-start) - Build your first HoloScript app
- [File Formats](./file-formats) - Deep dive into .hs, .hsplus, and .holo
- [Traits Reference](./traits) - 2,000+ traits across 101+ categories
- [Working Tree Triage](./working-tree-triage) - Keep large local change sets cleanly scoped
- [Release Slice v5.0.1](./release-slice-v5-0-1) - Current patch-train scope and ship criteria
- [MCP Mesh Operations](./mcp-mesh-operations) - Health checks and first-response recovery
