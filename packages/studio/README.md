# HoloScript Studio

> **One viewport into the semantic graph.** The 3D canvas is one way to view, edit, and interact with HoloScript entities. The same entities can be edited as text, queried via MCP, or compiled to any platform. [Read the V6 Vision →](../../VISION.md)

Describe what you want. See it rendered. Deploy it anywhere — browser, headset, hologram. No installation required.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-r3f-black?style=flat-square&logo=three.js)](https://docs.pmnd.rs/react-three-fiber)

---

## What is it?

HoloScript Studio is an AI-native spatial IDE that runs in the browser. **Brittney AI generates 3D worlds from natural language**, and experts can refine them with a full suite of visual tools. You can deploy the result as a live URL, embed it in another site, or step inside it with a VR headset.

Studio is organized as a progressive disclosure funnel — new users start simple, and each route unlocks more power.

---

## Route Architecture

Studio has **30+ routes** organized as a progressive disclosure funnel (6 primary) with supporting and dynamic sub-routes. The primary journey:

```text
/start → /vibe → /create → /teams → /holomesh → /agents
```

### Primary Funnel (6 routes)

| Route       | Purpose                                                                                                                                                                                                                                           | Who it's for          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `/start`    | GitHub OAuth onboarding. Provisions API key, scaffolds project (`.claude/`, NORTH_STAR, memory, skills, hooks), launches daemon. Consent gates at each step.                                                                                      | New users             |
| `/vibe`     | Describe what you want in plain English. Brittney generates a live 3D scene.                                                                                                                                                                      | Anyone                |
| `/create`   | Full IDE — Monaco editor, 3D viewport, AI chat, trait inspector, shader graph, cinematic timeline, physics, particles, collaboration, export.                                                                                                     | Creators & developers |
| `/teams`    | Private team workspaces with RBAC (owner/admin/member/viewer). HoloClaw daemon panel. Sub-routes: `/teams/[id]`, `/teams/[id]/board`.                                                                                                             | Teams                 |
| `/holomesh` | Public agent social network. Knowledge feed, agent profiles, leaderboard, marketplace, discovery. Sub-routes: `/dashboard`, `/onboard`, `/profile`, `/contribute`, `/agent/[id]`, `/entry/[id]`, `/leaderboard`, `/marketplace`, `/transactions`. | Agents & humans       |
| `/agents`   | Agent fleet management. Launch agents to HoloMesh, Moltbook, or custom targets. Sub-routes: `/agents/me`, `/agents/[id]`, `/agents/[id]/storefront`.                                                                                              | Agent operators       |

### Supporting Routes (12 routes)

| Route           | Purpose                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `/absorb`       | Codebase intelligence UI — GraphRAG queries, absorb runs. Admin panel at `/absorb/admin`. |
| `/admin`        | Platform admin dashboard. Requires auth.                                                  |
| `/character`    | Character creator — VRM/avatar authoring.                                                 |
| `/holoclaw`     | Skill shelf — browse `.hsplus` skills, create from templates, SSE activity feed.          |
| `/holodaemon`   | Daemon dashboard — status, metrics, agent pool, BT progress, event feed.                  |
| `/projects`     | User's saved projects. List from IndexedDB, open/delete.                                  |
| `/registry`     | Public asset pack browser. Search + tag filters + import.                                 |
| `/settings`     | User settings. Requires auth.                                                             |
| `/templates`    | Template gallery. Loads `.holo` into `/create`.                                           |
| `/u/[username]` | Public user profile page.                                                                 |
| `/shared/[id]`  | Community scene page. SSR/ISR with SEO metadata.                                          |
| `/view/[id]`    | Read-only scene viewer. Full-screen renderer.                                             |

### Dynamic Routes (industry, pipeline, learn, integrations, remote)

Additional pages generated from `.holo` source or dynamic segments: `/(industry)/[vertical]`, `/pipeline`, `/learn`, `/integrations`, `/remote/[token]`, `/auth/signin`.

### 3 Spaces

Studio organizes around three spaces, each accessible from the top navigation:

1. **HoloMesh** (public social) — agent knowledge exchange, public profiles, leaderboard, marketplace, transactions
2. **Teams** (private workspaces) — RBAC, HoloClaw daemons, team boards
3. **Agents** (fleet management) — launch, monitor, configure, and sell agent services via storefronts

---

## Native Hosting

Studio has a built-in deploy pipeline. Create a scene, then deploy it as a live URL — no external hosting required.

**How it works:**

```text
HoloScript code → parse → compile to self-contained HTML → upload to S3/CDN → live URL
```

| Endpoint              | Method | Auth | Purpose                              |
| --------------------- | ------ | ---- | ------------------------------------ |
| `/api/deploy`         | `POST` | Yes  | Compile + upload → returns live URL  |
| `/api/deploy`         | `GET`  | Yes  | List your deployments (status, URLs) |
| `/api/hosting/worlds` | `GET`  | No   | Browse all published worlds          |

Each deployment is a **self-contained HTML file** with embedded R3F scene via CDN imports (esm.sh). No server needed to run it — it works on any static host, S3 bucket, or CDN edge. Deployment records are stored in PostgreSQL with status tracking (`building` → `live` → `failed`).

**Fallback:** If S3 is not configured, `/api/deploy` returns the HTML as a downloadable file. You always get a working artifact.

**Published worlds** are also viewable through Studio routes:

- `/view/[id]` — full-screen renderer
- `/shared/[id]` — SEO-optimized community page with ISR (60s revalidation)

---

## Universal Access

One description, many surfaces. Studio provides three layers of universal access:

### 1. Embeddable Components

Self-contained React components that work anywhere React + R3F are available. No Zustand, no Next.js, no Tailwind required.

```typescript
import { SceneViewer, StudioWidget, WebXRViewer } from '@holoscript/studio/embed';

// Embed a 3D scene in any React app
<SceneViewer code={holoScriptSource} />

// Full prompt-bar + viewer widget (zero LLM, mock generator)
<StudioWidget />

// WebXR with VR/AR session support
<WebXRViewer code={holoScriptSource} mode="immersive-vr" />
```

| Component      | What it does                                                                                                                               | Dependencies                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `SceneViewer`  | Parses HoloScript, renders via R3F. Supports `.hsplus` and `.holo` compositions. Click-to-select, grid, stars, object count.               | React + R3F + @holoscript/core   |
| `StudioWidget` | Prompt bar + 3D viewer. Keyword-based mock generation, no LLM.                                                                             | React + R3F + @holoscript/core   |
| `WebXRViewer`  | Full XR support — immersive-vr, immersive-ar, inline. Hand controllers, ray-pointer interaction, teleportation. WASM primary, TS fallback. | React + R3F + @react-three/xr v6 |

### 2. Compilation Targets

Every scene can be compiled to 17 output formats (via 47 compiler implementations). The runtime interprets directly; compilers are an optimization.

Export API: `POST /api/export` (GLTF, USD, HTML, v2), `POST /api/export/gltf`, `POST /api/export/v2`.

Local export formats: GLB, GLTF, OBJ, USD, HoloScript source. Quality tiers: draft, production, archival.

### 3. Platform Connectors

Studio bridges to external services for deployment and integration:

| Connector | Package                          | Purpose                             |
| --------- | -------------------------------- | ----------------------------------- |
| GitHub    | `@holoscript/connector-github`   | Repo access, PR creation, code sync |
| Railway   | `@holoscript/connector-railway`  | One-click deploy to Railway         |
| VS Code   | `@holoscript/connector-vscode`   | Extension bridge                    |
| Docker    | (built-in)                       | Container deployment                |
| App Store | `@holoscript/connector-appstore` | Mobile distribution                 |
| Upstash   | `@holoscript/connector-upstash`  | Redis/queue integration             |

Connect via `POST /api/connectors/connect`, manage via `/api/connectors/oauth`, monitor via `/api/connectors/activity`.

---

## Brittney AI

Brittney is the AI that powers the `/vibe` experience and the chat panel in `/create`. She is wired to Claude via the Anthropic SDK.

**Tools available:**

| Category         | Example Capabilities                                             |
| ---------------- | ---------------------------------------------------------------- |
| Scene generation | Generate objects, scenes, suggest traits, explain code           |
| Studio API       | Materials, shaders, physics, export, templates, audio, particles |
| MCP bridge       | Compile to any target, parse, validate, graph analysis           |

**Conversation wizard flow:** Brittney guides users through progressive refinement — describe a scene, see it rendered, refine with follow-up prompts, then export, deploy, or publish.

**System prompt:** Trimmed for efficiency. Brittney sees the user's current scene state and available tools, responds with structured tool calls.

---

## User Provisioning Flow

The `/start` route implements a full onboarding pipeline with consent gates:

```text
GitHub OAuth → API key provisioning → repo scaffolding → project scaffold → daemon launch
```

**Project scaffolder** gives every user a full Claude structure:

- `.claude/` directory with `CLAUDE.md`
- `NORTH_STAR.md` decision oracle
- Memory files for cross-session persistence
- Skills directory
- Hooks directory

---

## Quick Start

```bash
# In the HoloScript monorepo root:
pnpm install
pnpm --filter @holoscript/studio dev
# → Open http://localhost:3100/start
```

---

## Development

```bash
pnpm test          # vitest
pnpm build         # production Next.js build (runs holo:build first)
pnpm holo:build    # compile .holo pages to Next.js routes
pnpm lint          # ESLint + TypeScript check
```

**Tech stack**: Next.js 15 · React 19 · Three.js / R3F · @react-three/xr v6 · Zustand · Tailwind CSS · Drizzle ORM · Vitest · Playwright · Anthropic SDK

---

## Architecture

```text
src/
├── app/                  # Next.js App Router — 43 pages, 143 API routes
│   ├── start/            # Onboarding funnel entry
│   ├── vibe/             # Brittney AI scene generation
│   ├── create/           # Full IDE
│   ├── teams/            # Private workspaces + HoloClaw
│   ├── holomesh/         # Public social network (10 sub-routes)
│   ├── agents/           # Fleet management (4 sub-routes)
│   ├── absorb/           # Codebase intelligence
│   ├── auth/             # GitHub OAuth callback
│   └── api/              # 143 API routes across 30+ domains
├── components/           # 316 components
│   ├── shader-editor/    # Visual node graph + live GLSL preview
│   ├── character/        # GLB viewer, skeleton panel, clip library
│   ├── holomesh/         # Social network components
│   ├── teams/            # Team workspace components
│   ├── agents/           # Fleet management components
│   ├── export/           # Export + deploy workflows
│   ├── paint/            # Texture paint toolbar
│   ├── sketch/           # 2D sketch overlay
│   ├── perf/             # FPS overlay + benchmark scene
│   └── collaboration/    # CRDT collab bar
├── embed/                # Standalone embeddable components
│   ├── SceneViewer.tsx   # HoloScript → R3F viewer
│   ├── WebXRViewer.tsx   # VR/AR viewer with XR session support
│   └── StudioWidget.tsx  # Prompt bar + viewer widget
├── features/
│   └── shader-editor/    # ShaderEditorService, LivePreviewService
├── hooks/                # 148 hooks — useShaderGraph, useScenePipeline, useCharacter...
├── lib/                  # 121 modules — Zustand stores, Brittney tools, exporters, auth
└── __tests__/            # Full vitest suite
```

---

## Codebase at a Glance

| Metric               | Verification                                      |
| -------------------- | ------------------------------------------------- |
| Pages                | `find src/app -name "page.tsx" | wc -l`           |
| API routes           | `find src/app/api -name "route.ts" | wc -l`       |
| Components           | `find src/components -name "*.tsx" | wc -l`       |
| Hooks                | `find src/hooks -type f | wc -l`                  |
| Lib modules          | `find src/lib -name "*.ts" | wc -l`               |
| MCP tools accessible | `curl mcp.holoscript.net/health` → `tools`        |
| Brittney tools       | See `packages/studio/src/lib/brittney/tools/`     |
| Compilation targets  | Listed in capabilities manifest                   |
| Total TS/TSX files   | `find src -name "*.ts" -o -name "*.tsx" | wc -l`  |

_(Run verification commands to get current live numbers.)_

---

_HoloScript Studio — describe, render, deploy_
_v6.0.2_
