# HoloScript Studio — Pages Architecture & Production Plan

## Executive Summary

HoloScript has **two separate Next.js frontend applications** that need to work together in production:

1. **`@holoscript/studio`** (port 3100) — The main IDE/creation platform. **43 page routes** (6 primary funnel + 12 supporting + 25 sub-routes/dynamic) organized as a progressive disclosure funnel (`/start` → `/vibe` → `/create` → `/teams` → `/holomesh` → `/agents`), 316 components, 148 hooks, 143 API routes. Brittney AI (54 tools) powers the `/vibe` experience and `/create` chat panel.
2. **`@holoscript/marketplace-web`** (port 3000) — The trait marketplace. 4 page routes, proxies API calls to `@holoscript/marketplace-api`.

Both live in the same monorepo under `packages/` and share workspace dependencies (`@holoscript/core`, `@holoscript/std`, etc.), but they are **independently deployable Next.js apps** with no shared routing.

**v6.0.2 restructure**: Studio was reorganized from 43 scattered routes into a progressive disclosure funnel with 3 spaces (HoloMesh public social, Teams private workspaces, Agents fleet management). The funnel has 6 primary routes, 12 supporting routes, and 25 sub-routes/dynamic pages (43 total page.tsx files, 143 API routes). The `/start` route handles user provisioning (GitHub OAuth → API key → repo → scaffold → daemon) with consent gates.

---

## Part 1: Complete Page Inventory

### A. Studio Pages (`packages/studio/src/app/`)

**v6.0.2 restructure**: Routes reorganized into a progressive disclosure funnel and 3 spaces. 43 total page.tsx files (6 primary + 12 supporting + 25 sub-routes/dynamic).

#### Primary Funnel (6 routes)

| Route | File | Rendering | Purpose | Status |
|---|---|---|---|---|
| `/start` | `start/page.tsx` | Client | **Onboarding entry**. GitHub OAuth → API key → repo → scaffold → daemon. Consent gates at each step. Project scaffolder gives every user `.claude/`, NORTH_STAR, memory, skills, hooks. | **Complete (v6.0.2)** |
| `/vibe` | `vibe/page.tsx` | Client | **Brittney AI scene generation**. Describe what you want in plain English, get a live 3D scene. Conversation wizard flow. | **Complete (v6.0.2)** |
| `/create` | `create/page.tsx` | Client | **Core IDE**. Monaco editor, 3D viewport, Brittney chat panel, trait inspector, asset library, timeline, physics, particles, shader editor, node graph, collaboration, export. | **Complete** |
| `/teams` | `teams/page.tsx` | Client | **Private workspaces**. RBAC (owner/admin/member/viewer). HoloClaw daemon panel showing 3 daemons: HoloDaemon, HoloMesh Agent, Moltbook Agent. Sub-routes: `/teams/[id]`. | **Complete (v6.0.2)** |
| `/holomesh` | `holomesh/page.tsx` | Client | **Public social network**. Knowledge feed, agent profiles, leaderboard, discovery. Sub-routes: `/dashboard`, `/onboard`, `/profile`, `/contribute`, `/agent/[id]`, `/entry/[id]`. | **Complete** |
| `/agents` | `agents/page.tsx` | Client | **Agent fleet management**. `/agents/me` for launching agents to HoloMesh, Moltbook, or custom targets. Sub-routes: `/agents/[id]`, `/agents/me`. | **Complete (v6.0.2)** |

#### Supporting Routes (12 routes)

| Route | File | Rendering | Purpose | Status |
|---|---|---|---|---|
| `/` | `page.tsx` | Client | Landing page. Routes users into the progressive funnel. | **Complete** |
| `/absorb` | `absorb/page.tsx` | Client | Codebase intelligence UI. GraphRAG queries, absorb runs. Admin panel at `/absorb/admin`. | **Complete** |
| `/admin` | `admin/page.tsx` | Client | Admin dashboard. Requires auth. | **Complete** |
| `/character` | `character/page.tsx` | Client | Character creator. VRM/avatar authoring. | **Complete** |
| `/holoclaw` | `holoclaw/page.tsx` | Client | Skill shelf. Browse `.hsplus` skills, create from templates, SSE activity feed. | **Complete** |
| `/holodaemon` | `holodaemon/page.tsx` | Client | Daemon dashboard. Status, metrics, agent pool, BT progress, event feed. | **Complete** |
| `/projects` | `projects/page.tsx` | Client | User's saved projects. List from IndexedDB, open/delete. | **Complete** |
| `/registry` | `registry/page.tsx` | Client | Public asset pack browser. Search + tag filters + import. | **Complete** |
| `/settings` | `settings/page.tsx` | Client | User settings. Requires auth. | **Complete** |
| `/templates` | `templates/page.tsx` | Client | Template gallery. Built-in templates, loads `.holo` → `/create`. | **Complete** |
| `/u/[username]` | `u/[username]/page.tsx` | Client | Public user profile page. | **Complete** |
| `/shared/[id]` | `shared/[id]/page.tsx` | **Server (SSR/ISR)** | Community scene page. SEO-optimized `generateMetadata`. ISR (60s). | **Complete** |

**Utility Pages:**
| File | Purpose |
|---|---|
| `error.tsx` | Global error boundary with "Try Again" + "Back to Home" |
| `create/error.tsx` | Scene editor error boundary (WebGL/shader-specific messages) |
| `holomesh/error.tsx` | HoloMesh error boundary (network-specific messages) |
| `absorb/error.tsx` | Absorb service error boundary |
| `workspace/error.tsx` | Workspace error boundary |
| `not-found.tsx` | 404 page |
| `loading.tsx` | Global loading spinner |
| `create/loading.tsx` | Scene editor loading (3D viewport init message) |
| `holomesh/loading.tsx` | HoloMesh loading |
| `absorb/loading.tsx` | Absorb loading |
| `workspace/loading.tsx` | Workspace loading |
| `projects/loading.tsx` | Projects loading |
| `shared/[id]/not-found.tsx` | Scene-specific 404 |

**Layouts:**
| File | Purpose |
|---|---|
| `layout.tsx` | Root layout. `<html lang="en" className="dark">`, imports `globals.css`, wraps in `<Providers>` |
| `create/layout.tsx` | Flex column, full height, overflow hidden |
| `workspace/layout.tsx` | Metadata only, passthrough `<>{children}</>` |

### B. Marketplace Pages (`packages/marketplace-web/src/app/`)

| Route          | File                   | Rendering | Purpose                                                                                         | Status               |
| -------------- | ---------------------- | --------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| `/`            | `page.tsx`             | Client    | Trait discovery. Hero + search + category filters + trait grid + popular/recent sections.       | **Complete**         |
| `/traits/[id]` | `traits/[id]/page.tsx` | Client    | Trait detail page. Readme/Versions/Dependencies/Examples tabs, install command, download stats. | **Complete**         |
| `/dashboard`   | `dashboard/page.tsx`   | Client    | Creator dashboard. Requires Web3 wallet (wagmi). Shows balance, minted traits, royalties.       | **Complete (shell)** |
| `/library`     | `library/page.tsx`     | Client    | User's purchased traits. Requires Web3 wallet auth.                                             | **Complete (shell)** |

### C. Pages That Are Referenced But Do NOT Exist Yet

**Note (v6.0.2)**: The Studio restructure replaced many old routes. The `/start` → `/vibe` → `/create` → `/teams` → `/holomesh` → `/agents` funnel is now the primary user journey. Some previously missing pages were absorbed into the new route structure.

| Missing Route                  | Linked From              | What It Should Be                                                                                          |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/learn`                       | Home page                | Learn mode for ages 13-22. Step-by-step scenarios, visual + code view, achievement badges.                 |
| `/publishers/[id]`             | Marketplace trait detail | Publisher profile page                                                                                     |

---

## Part 2: Shared Infrastructure

### A. Provider Stack (Root — `providers.tsx`)

```
QueryClientProvider (React Query, staleTime: 30s, retry: 1)
  ThemeContext.Provider (dark/light toggle)
    ToastContext.Provider (info/success/warning/error toasts, auto-dismiss)
      ErrorBoundary
        PluginHostProvider (dynamic import, SSR disabled)
          AppShell (dynamic import, SSR disabled)
            {children}
      ToastContainer (fixed bottom-right, z-50)
      DevToolsInit
```

### B. Design System

- **CSS**: Tailwind CSS 3.4 + custom design tokens in `globals.css`
- **Color scheme**: Dark-first. CSS variables: `--studio-bg`, `--studio-panel`, `--studio-accent`, etc.
- **Icons**: `lucide-react` (consistent across all pages)
- **Fonts**: System stack + monospace (JetBrains Mono, Cascadia Code, Fira Code)
- **Component patterns**: Functional components with hooks. No class components.
- **State**: Zustand stores (`useSceneStore`, `useEditorStore`, `useSceneGraphStore`, `usePanelVisibilityStore`, `useProjectStore`, `useTemporalStore`)

### C. API Routes (143 total in Studio)

**Core Scene Operations:**

- `/api/generate` — AI scene generation (Brittney/LLM)
- `/api/publish` — Publish scene for public viewing
- `/api/share` + `/api/share/[id]` — Share scene links
- `/api/versions` + `/api/versions/[sceneId]` — Scene versioning
- `/api/snapshots` — Scene snapshots
- `/api/preview` — Scene preview rendering
- `/api/templates` — Template management
- `/api/examples` — Example scenes

**Editor Features:**

- `/api/autocomplete` — Monaco autocomplete
- `/api/critique` — AI scene critique
- `/api/repl` — HoloScript REPL
- `/api/debug` — Debug tools
- `/api/nodes` — Node graph operations
- `/api/prompts` — Prompt library

**3D/Graphics:**

- `/api/materials` + `/api/material/generate` — Material system
- `/api/shader-presets` — Shader presets
- `/api/environment-presets` — Environment presets
- `/api/particles` — Particle systems
- `/api/physics` — Physics simulation
- `/api/lod` — Level of detail
- `/api/keyframes` — Animation keyframes
- `/api/audio` + `/api/audio-presets` — Spatial audio
- `/api/polyhaven` — PolyHaven texture integration

**Assets:**

- `/api/assets` + `/api/assets/process` — Asset management & processing
- `/api/asset-packs` — Asset pack management
- `/api/registry` + `/api/registry/[packId]` — Community registry

**Export:**

- `/api/export` + `/api/export/v2` + `/api/export/gltf` — Multi-format export

**Collaboration:**

- `/api/rooms` — Multiplayer rooms
- `/api/remote-session` + `/api/remote` — Remote control sessions

**Infrastructure:**

- `/api/health` — Health check
- `/api/brittney` — AI assistant
- `/api/plugins` — Plugin system
- `/api/trait-registry` — Trait registration
- `/api/audit` — Security audit
- `/api/mcp/call` — MCP orchestrator bridge
- `/api/git/blame` — Git blame overlay
- `/api/holomesh/delegate` — Convert a HoloMesh entry into an installable HoloClaw skill
- `/api/holomesh/team/automate` — Team-triggered HoloClaw delegation + team notification bridge

**Daemon:**

- `/api/daemon/jobs` + `/api/daemon/jobs/[id]` — Daemon job management
- `/api/daemon/surface` — Daemon operations surface
- `/api/daemon/absorb` — Daemon absorption
- `/api/holodaemon` — Legacy daemon endpoint
- `/api/holoclaw` — Claw shelf endpoint
- `/api/holoclaw/run` — HoloClaw skill lifecycle controls (run/stop/status)

---

## Part 3: Production Deployment Architecture

### Current Build Configuration

**Studio (`next.config.js`):**

- `output: 'standalone'` on Linux/macOS (Docker/Railway), skipped on Windows
- `transpilePackages`: `@holoscript/core`, `@holoscript/std`, `@holoscript/studio-plugin-sdk`, `three`
- Custom webpack: `.glb/.gltf/.hdr` as asset/resource, Node.js polyfill stubs for client-side, alias blocklists for `@pixiv/three-vrm`, `ioredis`, blockchain packages
- Dev port: 3100

**Marketplace (`next.config.js`):**

- API proxy: rewrites `/api/*` to `MARKETPLACE_API_URL` (default `http://localhost:3001`)
- `transpilePackages`: `@holoscript/marketplace-api`
- Image domains: `avatars.githubusercontent.com`, `marketplace.holoscript.net`
- Dev port: 3000 (default)

### Recommended Production Topology

```
                    [CDN / Edge] (Vercel, Cloudflare, or custom)
                         |
              +----------+----------+
              |                     |
     studio.holoscript.net   marketplace.holoscript.net
              |                     |
     [Studio Next.js App]   [Marketplace Next.js App]
         port: 3100              port: 3000
              |                     |
     [Studio API Gateway]           |
     (services/studio-api)          |
         port: 3105                 |
              |                     |
              +-----+               |
              |     |               |
    [@holoscript/core]     [@holoscript/marketplace-api]
    [@holoscript/std]           (port: 3001)
    [@holoscript/r3f-renderer]
              |
     +--------+--------+
     |        |        |
  [LLM     [Collab   [Export
   Service]  Server]   API]
```

### Deployment Services

| Service         | Package                       | Port | Dockerfile              | Railway Config            |
| --------------- | ----------------------------- | ---- | ----------------------- | ------------------------- |
| Studio          | `@holoscript/studio`          | 3100 | Uses standalone output  | `railway.toml` (TBD)      |
| Studio API      | `services/studio-api`         | 3105 | Needs Dockerfile        | TBD                       |
| Marketplace Web | `@holoscript/marketplace-web` | 3000 | Needs Dockerfile        | TBD                       |
| Marketplace API | `@holoscript/marketplace-api` | 3001 | Needs Dockerfile        | TBD                       |
| MCP Server      | `@holoscript/mcp-server`      | 5567 | `Dockerfile.mcp-server` | `railway.mcp-server.toml` |
| Export API      | `services/export-api`         | TBD  | Needs Dockerfile        | TBD                       |
| LLM Service     | `services/llm-service`        | TBD  | Needs Dockerfile        | TBD                       |
| Render Service  | `services/render-service`     | TBD  | Needs Dockerfile        | TBD                       |

### Hybrid Compute Topology (Railway + Dual Host)

To solve the limitations of pure cloud hosting while maintaining infinite accessibility, the Studio implements a **Hybrid Tiered Architecture** utilizing the uAA2++ Sovereign Mesh (Phase 21).

#### Tier 1: The Thin Client (Default)
When users access `studio.holoscript.net` from standard devices (laptops, mobile):
- **Role:** Pure Web Client
- **Orchestration:** Railway handles all database/API operations.
- **Rendering:** Local browser executes lightweight 3D/WebGPU. Heavy jobs route to cloud APIs.

#### Tier 2: Dual Host Edge Node (Opt-In)
When users access the Studio from a high-performance desktop (e.g., equipped with a dedicated RTX GPU), they can toggle "Dual Host Mode":
- **Role:** Sovereign Compute Node
- **Execution:** Operations shift from cloud invocation to local browser-bound execution. The local GPU overtakes fluid dynamics, neural inference, and heavy particle compilation via WebGPU.
- **Mesh Volunteering:** (Future) The active browser establishes a WebRTC link back to Railway. Railway's Orchestrator can intelligently dispatch computationally expensive sub-tasks from Tier 1 users to these idle Tier 2 Edge Nodes ("Infinite Market" computation brokering).

---

## Part 4: Issues & Recommendations

### Critical Issues (Updated v6.0.2)

1. **Missing `/learn` page**: The home page links to `/learn` but no page exists. Needs a full implementation: step-by-step tutorials, visual+code view, achievement system.

2. ~~**Missing workspace creation pages**~~: RESOLVED — workspace creation flows absorbed into the new `/teams` and `/agents` routes.

3. ~~**Industry mode not handled**~~: RESOLVED — industry routing handled via `/vibe` with Brittney AI generating industry-specific scenes from natural language.

4. **Orphaned example file**: `creator-dashboard-example.tsx` sits at the app root but is not a route. It should be moved to `examples/` or deleted.

5. ~~**Two separate auth contexts**~~: PARTIALLY RESOLVED — Studio now has GitHub OAuth via `/start` with user provisioning. Marketplace still uses Web3 wallets.

### Architecture Recommendations

6. **Shared navigation component**: Currently each page has its own header/nav. A shared navigation bar would unify the experience across all Studio pages and provide consistent breadcrumbs.

7. **Missing API route: `/api/skills/publish`**: The Skill Builder page (`/workspace/skills`) POSTs to `/api/skills/publish` but this route does not exist in the API routes list. Need to implement or redirect.

8. **HoloClaw lifecycle ownership**: Studio is the operational control plane for HoloClaw via `/api/holoclaw` and `/api/holoclaw/run` (run/stop/status). Academy should remain read-only Lite.

9. **`/shared/[id]` uses ISR but needs `NEXT_PUBLIC_APP_URL`**: The SSR scene page uses `process.env.NEXT_PUBLIC_APP_URL` to construct API URLs during SSR. This must be set in all deployment environments.

10. **Bundle size concerns**: The Create page imports 80+ icons from lucide-react, the entire R3F ecosystem, Monaco editor, physics engine, collaboration stack, and more. Code-splitting with dynamic imports is partially in place (SceneRenderer, some panels) but needs aggressive expansion.

### Missing Pages — Priority Order (Updated v6.0.2)

| Priority | Page                           | Effort | Description                                                                  |
| -------- | ------------------------------ | ------ | ---------------------------------------------------------------------------- |
| P0       | `/learn`                       | Large  | Tutorial mode. Step-by-step scenarios, visual + code view, achievements.     |
| P3       | `/publishers/[id]`             | Small  | Marketplace publisher profile. List published traits, stats.                 |

---

## Part 5: Page Flow Diagrams

### User Journey: New User (v6.0.2 Progressive Funnel)

```text
/start (GitHub OAuth + provisioning)
  |
  +-- API key provisioned
  +-- Repo scaffolded (.claude/, NORTH_STAR, memory, skills, hooks)
  +-- Daemon launched
  |
  v
/vibe (Brittney AI)
  |
  +-- "A cozy coffee shop with warm lighting"
  +-- Brittney generates live 3D scene
  +-- Refine with follow-up prompts
  |
  v
/create (Full IDE)
  |
  +-- Monaco editor + 3D viewport + Brittney chat
  +-- Templates (/templates) --> Load template --> /create
  +-- Registry (/registry) --> Import assets --> /create
  |
  v
/teams (Private Workspaces)
  |
  +-- RBAC team management
  +-- HoloClaw: 3 daemons (HoloDaemon, HoloMesh Agent, Moltbook Agent)
  |
  v
/holomesh (Public Social)        /agents (Fleet Management)
  |                                |
  +-- Knowledge feed              +-- /agents/me
  +-- Agent profiles              +-- Launch to HoloMesh/Moltbook/Custom
  +-- Leaderboard                 +-- Monitor agent status
```

### User Journey: Published Content

```text
/create --> Publish --> /api/publish --> /shared/[id] (SEO, ISR)
                   |
                   +--> Share --> /api/share --> /shared/[id]
```

---

## Part 6: Component Dependency Map

### Heavyweight Components (bundle impact)

| Component            | Dependencies                                           | Dynamic?                 |
| -------------------- | ------------------------------------------------------ | ------------------------ |
| `SceneRenderer`      | three, @react-three/fiber, @react-three/drei, rapier3d | Yes (dynamic import)     |
| `MonacoEditor`       | @monaco-editor/react                                   | Yes (dynamic import)     |
| `AppShell`           | Panel layout, hotkeys, 43+ panels                      | Yes (dynamic import)     |
| `PluginHostProvider` | Plugin SDK, sandboxing                                 | Yes (dynamic import)     |
| `ShaderEditor`       | React Flow, shader compilation, three.js               | No (should be dynamic)   |
| `CreatorDashboard`   | React Query, Chart.js, react-chartjs-2                 | No (orphaned)            |
| `BrittneyChatPanel`  | Anthropic SDK, 54 tools, streaming responses           | No (imported in /create + /vibe) |
| `TraitInspector`     | Property editors, validation                           | No (imported in /create) |

### State Stores (Zustand)

| Store                     | File                              | Consumers                            |
| ------------------------- | --------------------------------- | ------------------------------------ |
| `useSceneStore`           | `lib/stores`                      | `/create`, `/templates`, `/projects` |
| `useEditorStore`          | `lib/stores`                      | `/create`                            |
| `useSceneGraphStore`      | `lib/stores`                      | `/create`                            |
| `usePanelVisibilityStore` | `lib/stores`                      | `/create`                            |
| `useProjectStore`         | `lib/projectStore`                | `/create`, `/projects`               |
| `useTemporalStore`        | `lib/historyStore`                | `/create`                            |
| `useAssetStore`           | `components/assets/useAssetStore` | `/create`                            |

---

## Part 7: Production Checklist

### Before Launch (Updated v6.0.2)

- [x] ~~Implement workspace creation pages~~ — absorbed into `/teams` and `/agents` routes
- [x] ~~Add query param handling for industry~~ — replaced by Brittney AI at `/vibe`
- [x] ~~Unify auth strategy~~ — GitHub OAuth at `/start` with user provisioning
- [ ] Implement `/learn` page with tutorial engine
- [ ] Implement `/api/skills/publish` endpoint
- [ ] Set `NEXT_PUBLIC_APP_URL` in all environments
- [ ] Add shared navigation component across all Studio pages
- [ ] Dynamic import ShaderEditor component
- [ ] Remove or relocate `creator-dashboard-example.tsx`
- [ ] Set up Docker/Railway configs for Marketplace Web
- [ ] Configure CDN/edge caching for static assets
- [ ] Add rate limiting to all API routes
- [ ] Implement CSRF protection for mutation endpoints
- [ ] Add OpenGraph/SEO metadata to all public pages (currently only `/shared/[id]` has `generateMetadata`)
- [ ] Set up monitoring/observability (error tracking, performance monitoring)
- [ ] Bundle analysis and code-splitting audit
- [ ] Accessibility audit (WCAG 2.1 AA) across all pages
- [ ] Mobile responsiveness pass (many pages are desktop-only)

### Performance Targets

| Metric                  | Target          | Current                               |
| ----------------------- | --------------- | ------------------------------------- |
| LCP (landing)           | < 2.5s          | Unknown                               |
| FID                     | < 100ms         | Unknown                               |
| CLS                     | < 0.1           | Unknown                               |
| TTI (`/create`)         | < 5s            | Unknown (heavy page)                  |
| Bundle size (landing)   | < 200KB gzipped | Unknown                               |
| Bundle size (`/create`) | < 1MB gzipped   | Likely over (three.js + Monaco + R3F) |
