# HoloScript Studio

> **The AI-native spatial IDE for the web.** Build interactive 3D worlds with natural language — no installation, no coding required.

[![Tests](https://img.shields.io/badge/tests-244%20passing-4ade80?style=flat-square)](./src/__tests__)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Three.js](https://img.shields.io/badge/Three.js-r3f-black?style=flat-square&logo=three.js)](https://docs.pmnd.rs/react-three-fiber)
[![Beta](https://img.shields.io/badge/status-beta-fbbf24?style=flat-square)](./docs/GETTING_STARTED.md)

---

## What is it?

HoloScript Studio is a browser-based creative environment where **AI generates 3D worlds from natural language**, and experts can refine them with a full suite of visual tools.

```
"A cozy coffee shop with warm lighting and jazz music"
  → Brittney AI generates → Live 3D scene in seconds
```

It's **five tools in one**, each progressively unlocking more power:

| Mode             | Who it's for | Superpower                              |
| ---------------- | ------------ | --------------------------------------- |
| 🎨 **Creator**   | Anyone       | Describe a scene in plain English       |
| 🖌️ **Artist**    | Designers    | Visual node-based shader graph editor   |
| 🎬 **Filmmaker** | Storytellers | Cinematic camera paths + timeline       |
| ⚙️ **Expert**    | Developers   | Full HoloScript DSL + perf tools        |
| 🦴 **Character** | Animators    | GLB import, skeleton FK, clip recording |

---

## Features

- 🤖 **Brittney AI** — spatial scene generation from natural language via Ollama
- 🕸️ **Shader Graph Editor** — visual GLSL shader builder with live preview
- 🎬 **Cinematic Timeline** — keyframe camera & object animation
- 🦴 **Character Rig Studio** — GLB import, bone selection, FK pose & record
- ⚡ **Performance Benchmark** — FPS profiler, 60fps @ 1000 objects target
- 👥 **Multiplayer Editing** — CRDT real-time collaboration
- 🥽 **WebXR VR Mode** — Meta Quest 3 & Apple Vision Pro support
- 📦 **One-click Publish** — shareable world URLs, no install required

---

## Quick Start

```bash
# In the HoloScript monorepo root:
pnpm install
pnpm --filter @holoscript/studio dev
# → Open http://localhost:3100/create
```

Full 5-minute guide: [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)

---

## Architecture

```
src/
├── app/                  # Next.js App Router pages + API routes
│   ├── create/           # Main Studio page
│   └── api/              # AI generation, material, HoloScript compile
├── components/
│   ├── shader-editor/    # Visual node graph + live GLSL preview
│   ├── character/        # GLB viewer, skeleton panel, clip library
│   ├── paint/            # Texture paint toolbar
│   ├── sketch/           # 2D sketch overlay
│   ├── perf/             # FPS overlay + benchmark scene
│   └── collaboration/    # CRDT collab bar
├── features/
│   └── shader-editor/    # ShaderEditorService, LivePreviewService
├── hooks/                # useShaderGraph, useNodeSelection, useCharacter…
├── lib/                  # Zustand stores, validation, utils
└── __tests__/            # Full vitest suite (244 tests)
```

---

## The HoloScript Language

Expert mode exposes the full HoloScript DSL — a declarative spatial computing language:

```holoscript
world "Dungeon Crawl" {
  @setting("dungeon")
  @lighting("torchlight")

  object "Hero" {
    @position(0, 0, 0)
    @physics type:"dynamic"
    @game_logic
  }

  npc "Goblin" {
    @position(10, 0, 5)
    @role("Enemy")
    @patrol radius:8
  }

  game_logic {
    @win_condition("reach_exit")
    @timer
  }
}
```

---

## Development

```bash
pnpm test          # vitest (244 tests, ~2.5s)
pnpm build         # production Next.js build
pnpm lint          # ESLint + TypeScript check
```

**Tech stack**: Next.js 15 · React 18 · Three.js / R3F · Zustand · Tailwind CSS · Vitest · Playwright

---

## Roadmap

- [ ] Cloud AI mode (no local Ollama required)
- [ ] Published world hosting infrastructure
- [ ] HoloScript compiler in-browser (WASM)
- [ ] Mobile / tablet support
- [ ] Plugin SDK for custom node types

---

_HoloScript Studio — AI-native spatial IDE for the web_  
_v0.1.0 — Beta Launch 2026_
