# Introduction to HoloScript

HoloScript helps you describe interfaces, workflows, robots, and spatial scenes in files that can run, compile, and be inspected by agents. Start with intent, keep the source readable, and target the platform that needs the result.

## 🚀 Start with Studio (Recommended)

[HoloScript Studio](https://studio.holoscript.net) is a web-based IDE that helps you generate a first draft from natural language, preview it, and keep the underlying HoloScript files editable.

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

- **Readable intent** - Files describe what should exist and how it behaves
- **Flexible input** - Start from prompt, voice, gesture, gaze, or keyboard
- **Visible structure** - Scenes, workflows, traits, and data flows stay inspectable

### For AI

- **Visual understanding** - AI "sees" program structure
- **Native manipulation** - AI can place and connect objects naturally
- **Any output target** - Generate code for any platform

### For Computing

- **One source → many targets** - verify current target keys in `ExportTarget` (`packages/core/src/compiler/CircuitBreaker.ts`)
- **Less boilerplate** - Declarative syntax keeps intent visible
- **Cross-domain** - VR, AR, robotics, IoT, and digital twins from one source
- **Dual parser** - TypeScript + Rust/WASM with full LSP, linter, and formatter

## File Formats

HoloScript uses three file formats:

| Extension | Purpose        | Best For                         |
| --------- | -------------- | -------------------------------- |
| `.hs`     | Process files  | Pipelines, sync jobs, monitoring |
| `.hsplus` | Behavior files | Traits, agents, state, events    |
| `.holo`   | World files    | Scenes, systems, target metadata |

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

- [Publishing & platform terms](./publishing-platform-terms) - VRChat, Unity, Unreal, Godot, web, mobile: official terms links before you ship
- [Quick Start Guide](./quick-start) - Build your first HoloScript app
- [File Formats](./file-formats) - Choose .hs, .hsplus, or .holo by the story you are building
- [Traits Reference](./traits) - trait categories and usage patterns (inventory changes over time)
- [Working Tree Triage](./working-tree-triage) - Keep large local change sets cleanly scoped
- [Release Versioning](./release-versioning) - Version policy and current release info
- [MCP Mesh Operations](./mcp-mesh-operations) - Health checks and first-response recovery
- [Metrics SSOT](./metrics-ssot) - Canonical commands for targets/tools/traits/package counts
