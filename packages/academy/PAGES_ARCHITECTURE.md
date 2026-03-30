# HoloScript Studio — Pages Architecture & Production Plan

## Executive Summary

HoloScript has **two separate Next.js frontend applications** that need to work together in production:

1. **`@holoscript/studio`** (port 3100) — The main IDE/creation platform. 14 page routes, 51 API routes, 100+ components, 110+ hooks.
2. **`@holoscript/marketplace-web`** (port 3000) — The trait marketplace. 4 page routes, proxies API calls to `@holoscript/marketplace-api`.

Both live in the same monorepo under `packages/` and share workspace dependencies (`@holoscript/core`, `@holoscript/std`, etc.), but they are **independently deployable Next.js apps** with no shared routing.

---

## Part 1: Complete Page Inventory

### A. Studio Pages (`packages/studio/src/app/`)

| Route               | File                        | Rendering            | Purpose                                                                                                                                                                                                                            | Status                             |
| ------------------- | --------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `/`                 | `page.tsx`                  | Client               | Landing page. 4 mode cards (Play/Learn/Create/Industry) + 9 industry portals                                                                                                                                                       | **Complete**                       |
| `/create`           | `create/page.tsx`           | Client               | **Core IDE**. 43-panel editor: Monaco code editor, 3D SceneRenderer, AI chat (Brittney), trait inspector, asset library, timeline, physics, particles, shader editor, node graph, collaboration, export. This is the main product. | **Complete (large, ~800+ lines)**  |
| `/play`             | `play/page.tsx`             | Client               | Kid-friendly 3D builder. Drag-and-drop shapes with R3F Canvas, animations, particles, physics simulation, Proof-of-Play gamification. Ages 5-12.                                                                                   | **Complete (large, ~1000+ lines)** |
| `/playground`       | `playground/page.tsx`       | Client               | Embeddable HoloScript sandbox. Monaco editor left, parse tree right. URL-shareable via `?code=<base64>`. No auth required.                                                                                                         | **Complete**                       |
| `/workspace`        | `workspace/page.tsx`        | Client               | Creator hub. 7 content types (scenes, traits, skills, agents, plugins, training data, templates) with stats, search, quick actions.                                                                                                | **Complete**                       |
| `/workspace/skills` | `workspace/skills/page.tsx` | Client               | Skill Builder IDE. SKILL.md editor with YAML frontmatter, file tree, test harness, metadata panel, publish-to-marketplace flow.                                                                                                    | **Complete**                       |
| `/holodaemon`       | `holodaemon/page.tsx`       | Client               | Daemon dashboard. Status, metrics (quality/type-errors/jobs/cost), agent pool, BT phase progress, event feed, HoloScript source preview.                                                                                           | **Complete (large)**               |
| `/holoclaw`         | `holoclaw/page.tsx`         | Client               | Skill shelf. Browse installed `.hsplus` skills, create from templates, SSE-streaming activity feed. 3 tabs: Shelf/Create/Activity.                                                                                                 | **Complete**                       |
| `/registry`         | `registry/page.tsx`         | Client               | Public asset pack browser. Search + tag filters + import flow.                                                                                                                                                                     | **Complete**                       |
| `/shader-editor`    | `shader-editor/page.tsx`    | Client               | Visual shader editor. Delegates to `<ShaderEditor />` component.                                                                                                                                                                   | **Complete (wrapper)**             |
| `/templates`        | `templates/page.tsx`        | Client               | Template gallery. 5 built-in templates (forest, space station, art gallery, zen garden, neon city). Loads `.holo` file and navigates to `/create`.                                                                                 | **Complete**                       |
| `/projects`         | `projects/page.tsx`         | Client               | User's saved projects. List from IndexedDB, open/delete.                                                                                                                                                                           | **Complete**                       |
| `/view/[id]`        | `view/[id]/page.tsx`        | Client               | Read-only scene viewer. Full-screen SceneRenderer, no editor UI. Fetches from `/api/publish`.                                                                                                                                      | **Complete**                       |
| `/shared/[id]`      | `shared/[id]/page.tsx`      | **Server (SSR/ISR)** | Community scene page. SEO-optimized with `generateMetadata`. ISR (60s revalidate). Shows scene info + code viewer + "Open in Studio" CTA.                                                                                          | **Complete**                       |
| `/remote/[token]`   | `remote/[token]/page.tsx`   | Client               | Mobile touch controller. Virtual joystick + zoom/pan/select. Sends PUT to `/api/remote`. Opened via QR code.                                                                                                                       | **Complete**                       |

**Utility Pages:**
| File | Purpose |
|---|---|
| `error.tsx` | Global error boundary with "Try Again" + "Back to Home" |
| `not-found.tsx` | 404 page |
| `loading.tsx` | Global loading spinner |
| `shared/[id]/not-found.tsx` | Scene-specific 404 |
| `creator-dashboard-example.tsx` | Example/demo file (NOT a route, orphaned component) |

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

These routes are linked to from existing pages but have no corresponding `page.tsx`:

| Missing Route                  | Linked From              | What It Should Be                                                                                          |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/learn`                       | Home page mode card      | Learn mode for ages 13-22. Step-by-step scenarios, visual + code view, achievement badges.                 |
| `/create?mode=industry`        | Home page mode card      | Query-param variant of `/create` for industry-specific templates/workflows. Need to handle in Create page. |
| `/create?industry=<id>`        | Home page industry chips | Query-param filtering in Create page. 9 industries defined but no handler yet.                             |
| `/workspace/traits/new`        | Workspace page           | Trait creation wizard                                                                                      |
| `/workspace/agents/new`        | Workspace page           | Agent creation wizard                                                                                      |
| `/workspace/plugins/new`       | Workspace page           | Plugin creation wizard                                                                                     |
| `/workspace/training-data/new` | Workspace page           | Training data creation wizard (DataForge)                                                                  |
| `/workspace/templates/new`     | Workspace page           | Template creation wizard                                                                                   |
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

### C. API Routes (51 total in Studio)

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

**Daemon:**

- `/api/daemon/jobs` + `/api/daemon/jobs/[id]` — Daemon job management
- `/api/daemon/surface` — Daemon operations surface
- `/api/daemon/absorb` — Daemon absorption
- `/api/holodaemon` — Legacy daemon endpoint
- `/api/holoclaw` — Claw shelf endpoint

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
| Marketplace Web | `@holoscript/marketplace-web` | 3000 | Needs Dockerfile        | TBD                       |
| Marketplace API | `@holoscript/marketplace-api` | 3001 | Needs Dockerfile        | TBD                       |
| MCP Server      | `@holoscript/mcp-server`      | 5567 | `Dockerfile.mcp-server` | `railway.mcp-server.toml` |
| Export API      | `services/export-api`         | TBD  | Needs Dockerfile        | TBD                       |
| LLM Service     | `services/llm-service`        | TBD  | Needs Dockerfile        | TBD                       |
| Render Service  | `services/render-service`     | TBD  | Needs Dockerfile        | TBD                       |

---

## Part 4: Issues & Recommendations

### Critical Issues

1. **Missing `/learn` page**: The home page links to `/learn` but no page exists. This is one of the 4 primary modes. Needs a full implementation: step-by-step tutorials, visual+code view, achievement system.

2. **Missing workspace creation pages**: The Workspace page links to 5 `new` pages (`/workspace/traits/new`, `/workspace/agents/new`, `/workspace/plugins/new`, `/workspace/training-data/new`, `/workspace/templates/new`) that do not exist. Users will hit 404s.

3. **Industry mode not handled in `/create`**: The home page sends `?mode=industry` and `?industry=<id>` query params to `/create`, but the Create page needs to parse and respond to these params (filter templates, adjust UI panels, etc.).

4. **Orphaned example file**: `creator-dashboard-example.tsx` sits at the app root but is not a route. It should be moved to `examples/` or deleted.

5. **Two separate deployments = two separate auth contexts**: Studio and Marketplace are separate apps. There is no shared auth system. The Marketplace uses Web3 wallets (wagmi/RainbowKit); Studio has no auth at all. Need a unified auth strategy for the cross-app "Open in Studio" flows.

### Architecture Recommendations

6. **Shared navigation component**: Currently each page has its own header/nav. A shared navigation bar would unify the experience across all Studio pages and provide consistent breadcrumbs.

7. **Missing API route: `/api/skills/publish`**: The Skill Builder page (`/workspace/skills`) POSTs to `/api/skills/publish` but this route does not exist in the API routes list. Need to implement or redirect.

8. **HoloClaw activity SSE endpoint**: `/api/holoclaw/activity?stream=true` is expected by the HoloClaw page but is not confirmed to exist as a separate route file.

9. **`/shared/[id]` uses ISR but needs `NEXT_PUBLIC_APP_URL`**: The SSR scene page uses `process.env.NEXT_PUBLIC_APP_URL` to construct API URLs during SSR. This must be set in all deployment environments.

10. **Bundle size concerns**: The Create page imports 80+ icons from lucide-react, the entire R3F ecosystem, Monaco editor, physics engine, collaboration stack, and more. Code-splitting with dynamic imports is partially in place (SceneRenderer, some panels) but needs aggressive expansion.

### Missing Pages — Priority Order

| Priority | Page                           | Effort | Description                                                                  |
| -------- | ------------------------------ | ------ | ---------------------------------------------------------------------------- |
| P0       | `/learn`                       | Large  | Core mode. Tutorial engine + progress tracking + achievements.               |
| P1       | `/workspace/traits/new`        | Medium | Trait authoring wizard. Define trait properties, behaviors, test in sandbox. |
| P1       | `/workspace/agents/new`        | Medium | Agent training wizard. Upload training data, configure model, deploy.        |
| P2       | `/workspace/plugins/new`       | Medium | Plugin authoring. Scaffold, test, publish.                                   |
| P2       | `/workspace/training-data/new` | Medium | DataForge integration. Upload, clean, format, validate datasets.             |
| P2       | `/workspace/templates/new`     | Small  | Template creator. Save current scene as template.                            |
| P3       | `/publishers/[id]`             | Small  | Marketplace publisher profile. List published traits, stats.                 |

---

## Part 5: Page Flow Diagrams

### User Journey: New User

```
Landing (/)
  |
  +-- Play (/play) ----------> Kid-friendly 3D builder
  |
  +-- Learn (/learn) ---------> [MISSING] Tutorial mode
  |
  +-- Create (/create) -------> Full IDE
  |     |
  |     +-- Templates (/templates) --> Load template --> /create
  |     +-- Playground (/playground) --> Open in Studio --> /create
  |     +-- Import from Registry (/registry) --> Import --> /create
  |
  +-- Industry (/create?mode=industry) --> Industry-specific IDE
```

### User Journey: Creator

```
Workspace (/workspace)
  |
  +-- Scenes --> /create (new scene)
  +-- Traits --> /workspace/traits/new [MISSING]
  +-- Skills --> /workspace/skills (Skill Builder)
  +-- Agents --> /workspace/agents/new [MISSING]
  +-- Plugins --> /workspace/plugins/new [MISSING]
  +-- Training Data --> /workspace/training-data/new [MISSING]
  +-- Templates --> /workspace/templates/new [MISSING]
  |
  +-- Quick Actions:
      +-- HoloDaemon (/holodaemon)
      +-- HoloClaw (/holoclaw)
      +-- Marketplace (/registry)
```

### User Journey: Published Content

```
/create --> Publish --> /api/publish --> /view/[id] (read-only viewer)
                   |
                   +--> Share --> /api/share --> /shared/[id] (SEO, ISR)
                   |
                   +--> Remote --> /api/remote-session --> QR code --> /remote/[token] (phone controller)
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
| `BrittneyChatPanel`  | AI service, streaming responses                        | No (imported in /create) |
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

### Before Launch

- [ ] Implement `/learn` page with tutorial engine
- [ ] Implement workspace creation pages (`traits/new`, `agents/new`, `plugins/new`, `training-data/new`, `templates/new`)
- [ ] Add query param handling in `/create` for `mode` and `industry` params
- [ ] Implement `/api/skills/publish` endpoint
- [ ] Set `NEXT_PUBLIC_APP_URL` in all environments
- [ ] Unify auth strategy between Studio and Marketplace
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
