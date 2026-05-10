# HoloScript Studio IDE Reboot Audit

Date: 2026-05-10

## Executive Status

Studio is not just visually rough. It is structurally overloaded.

The product vision is now larger than the current implementation: Studio should be a Unity/Unreal-class spatial IDE and an agent workbench that can improve external repositories like VS Code. The current app still behaves like an accumulated AI-built feature showcase: many routes, many panels, several navigation systems, a fragile `/create` surface, and an account/workspace path that is powerful but not yet safe enough to be the foundation.

Initial local verification found a hard gate failure:

- `pnpm --filter @holoscript/studio typecheck` failed with six `TS2305` errors because the generated `@holoscript/r3f-renderer` type declarations did not declare `WebSurfaceRenderer` or `resolveWebSurfaceConfig`.
- Local `http://localhost:3101/create` did not return within 15 seconds.
- Existing `studio-dev.log` shows Next failures reading missing `packages/core/dist/chunk-*.js` files.
- Last recorded successful build log shows `/create` at `991 kB` route size and `1.65 MB` first-load JS.

Follow-up applied in this audit pass:

- Patched `packages/r3f-renderer/scripts/generate-types.mjs` so the generated `dist/index.d.ts` declares `WebSurfaceRenderer`, `WebSurfaceRendererProps`, and `resolveWebSurfaceConfig`.
- Patched `packages/studio/vitest.config.ts` so Studio tests resolve `@holoscript/core/traits/simulation-solver-factory` to the source file used by the R3F renderer.
- Added `packages/studio/src/embed/__tests__/r3f-renderer-contract.test.tsx` to keep `SceneViewer`, `R3FNodeRenderer`, and `WebXRViewer` aligned with the `@holoscript/r3f-renderer` web-surface exports.
- `pnpm --filter @holoscript/r3f-renderer build`: passed.
- `pnpm --filter @holoscript/studio typecheck`: passed.
- `pnpm --filter @holoscript/studio test -- src/embed/__tests__/r3f-renderer-contract.test.tsx src/embed/__tests__/WebXRViewer.test.tsx`: passed.
- `pnpm --filter @holoscript/studio build`: passed with webpack critical-dependency warnings in `src/lib/plugins/pluginManager.ts` and `../core/dist/traits/index.js`.

## Verified Shape

The live codebase is larger than the main Studio docs claim.

| Surface         |        Current scan | Docs still claim |
| --------------- | ------------------: | ---------------: |
| App page routes |                  67 |         43 / 30+ |
| API routes      |                 166 |              143 |
| Components      | 454 non-test TS/TSX |              316 |
| Hooks           | 115 non-test TS/TSX |              148 |
| Lib modules     | 352 non-test TS/TSX |              121 |

Top route buckets:

- `holomesh`: 13 pages
- `workspace`: 5 pages
- `agents`: 4 pages
- `pipeline`: 3 pages
- `teams`: 3 pages

Top component buckets:

- `panels`: 49 components
- `wizard`: 25 components
- `marketplace`: 15 components
- `shader-editor`: 14 components
- `holomesh`: 13 components
- `ai`: 12 components

### Generated Inventory Command

Do not update the counts above by hand. Regenerate the live Studio inventory from the
workspace:

```bash
pnpm --filter @holoscript/studio inventory
node packages/studio/scripts/studio-inventory.mjs --json
```

The script reports App Router page routes, API routes, non-test component/hook/lib
module counts, `panelVisibilityStore` panel keys, panel component count, top route
buckets, and `.next/static/chunks/app` bundle-size signal when a local Studio build
exists.

## What Is Wrong

### 1. The docs are giving agents false confidence

`README.md` and `PAGES_ARCHITECTURE.md` still describe a neat progressive funnel and stale route/component counts. `STUDIO_AUDIT.md` is worse: it claims "Overall: 8.5/10" and says maintainability is 9/10, while the current `/create` implementation and typecheck state contradict that.

This matters because agents read the docs first and then preserve the sprawl instead of challenging it.

### 2. `/create` is a panel warehouse, not an IDE architecture

`src/app/create/page.tsx` is 2,322 lines. It dynamically imports dozens of panels, wires dozens of panel booleans manually, and includes remnants of duplicate component cleanup in comments.

The page is carrying layout, feature registration, workbench state, command routing, panel rendering, and product-mode decisions in one place. A Unity/Unreal/VS Code competitor needs a workbench model:

- activity bar
- primary side bar
- editor groups
- scene viewport
- inspector
- bottom panel
- status bar
- command palette
- extension/view registry
- workspace-scoped persistence

The current architecture has panels, but not a workbench.

### 3. Panel state is unbounded feature accumulation

`panelVisibilityStore.ts` defines a long `PanelKey` union with around seventy panel keys: chat, history, profiler, shader editor, timeline, templates, registry, remote, export, generator, multiplayer, debugger, snapshots, particle systems, LOD, console, plugins, cloud deploy, publish, DAG, calibration, synthetic data, operations hub, foundation DAO, and more.

That is a symptom of "every feature gets a button." It should become a typed view/command registry where panels declare:

- id
- title
- icon
- category
- default placement
- activation command
- availability gate
- workspace/project scope
- required capability/provider

### 4. Navigation is inconsistent

There are at least three shells:

- `AppShell.tsx`: emoji sidebar and route list.
- `GlobalNavigation.tsx`: lucide-based navigation with a different route list and style.
- `/create` `NavBar` + `Toolbar`: custom top IDE chrome that bypasses the main shell.

The result is not a coherent professional tool. It reads as several apps stitched together.

### 5. Visual system still looks AI-assembled

Evidence:

- `globals.css` contains mojibake comments such as `â•` and `â€”`.
- `globals.css` sets `html, body { overflow: hidden; }`, forcing route-specific workarounds instead of making only the workbench shell own overflow.
- The landing/global CSS still carries decorative mesh/gradient/orb-era patterns.
- AppShell uses emoji icons while other navigation uses lucide.
- Toolbar exposes too many top-level buttons at once.

The target should be a quiet professional tool surface, closer to dense creative software than a marketing demo.

### 6. Agent IDE capability exists in fragments but is not unified

Existing fragments:

- GitHub OAuth and repo listing/import routes.
- `/api/workspace/import` for cloning repos.
- `/api/workspace/provision` for account/workspace provisioning.
- `lib/workspace/scaffolder.ts` for agent instruction templates.
- Absorb API routes and HoloMesh board routes.
- Brittney chat and server-side tool execution.
- Git APIs for status, diff, branch, commit, push, and ship.

Missing workbench synthesis:

- no first-class workspace model visible across IDE UI
- no durable project/repo explorer as the primary left rail
- no terminal/process pane
- no agent session timeline tied to repo state
- no permissioned tool runner UI
- no branch/PR review loop as a standard workflow
- no HoloScript conversion opportunity lane integrated into repo import
- no project-scoped assistant history for `/create` chat (`BrittneyChatPanel` uses `useAssistantHistory('default')`)

### 7. The external workspace path needs hardening before innovation

The repo importer is risky:

- `/api/workspace/import` builds a shell command string for `git clone`.
- `branch` is interpolated into that command.
- OAuth token is embedded into the clone URL.
- workspace IDs use `Math.random`.
- file counting uses `git ls-files | wc -l`, which is not Windows-native.

The provisioner is also not aligned with the founder/account vision:

- workspace id is `ws_${username}`, not an authenticated account/workspace entity.
- `approvedRepos` is accepted but not enforced when connecting/importing repos.
- it seeds `.env` with `HOLOSCRIPT_API_KEY` into the target GitHub repo.
- it scaffolds `.claude/*`, but does not provision an ai-ecosystem-shaped workspace.
- publish-knowledge is marked done without actual publication.

This should be treated as product-critical, not cleanup polish.

## Keep, Archive, Rebuild

### Keep and bolster

- HoloScript compiler/rendering pipeline.
- Brittney tool execution and CAEL/simulation-contract grounding.
- Absorb/codebase intelligence.
- GitHub OAuth/repo import, after hardening.
- HoloMesh team board and agent presence.
- ProjectDNA/scaffolder templates, after turning them into account workspace provisioning.
- Git status/diff/branch/commit/PR APIs, after they are wrapped by a human-reviewable agent workflow.

### Archive or hide behind lab flags

- duplicate panel paths and redundant right-rail entries.
- marketplace/social surfaces inside the core IDE chrome.
- industry/demo/quest/probe/dev routes that are not part of the first workbench journey.
- standalone onboarding experiments not wired to account workspaces.
- stale audit docs that claim resolved quality without current verification.

Archive means remove from primary navigation and docs, not necessarily delete code immediately.

### Rebuild as core

- `WorkbenchShell`
- `ViewRegistry`
- `CommandRegistry`
- `WorkspaceExplorer`
- `AgentSessionPanel`
- `RepoStatusPanel`
- `ConversionAdvisorPanel`
- `ToolRunTimeline`
- `PermissionReviewPanel`
- `StudioDesignSystem`

## Target Product Model

Studio should have four product lanes:

1. Account workspace: GitHub login, repo inventory, ai-ecosystem-shaped workspace, paper unlock when publish-worthy.
2. Spatial IDE: Unity/Unreal-like scene/workbench authoring powered by HoloScript.
3. Agent workbench: VS Code-like external repo improvement surface for agents and humans.
4. HoloMesh/public network: discovery, knowledge, marketplace, and social surfaces outside the default IDE chrome.

The mistake to avoid: putting all four lanes into one toolbar.

## Reboot Plan

### Phase 0: Stop the sprawl

- Make this audit the current Studio truth until a new architecture doc replaces it.
- Replace stale counts in `README.md` and `PAGES_ARCHITECTURE.md`.
- Add a generated inventory script for routes, APIs, components, panels, and bundle sizes.
- Fix typecheck before further UI expansion.

### Phase 1: Workbench spine

- Introduce `WorkbenchShell` and route `/workspace` or `/ide` through it.
- Make `/create` one workbench perspective, not the entire IDE.
- Move all panel metadata into `ViewRegistry`.
- Move all action buttons into `CommandRegistry` and command palette.
- Collapse toolbar to the small set of scene/run/save/publish/status commands.

### Phase 2: Professional visual pass

- Remove emoji navigation.
- Replace mojibake comments and route-global overflow hacks.
- Establish one tokenized design system for density, panels, typography, icons, focus, menu, command palette, tabs, splitters, and status bars.
- Validate with desktop and mobile screenshots.

### Phase 3: Agent IDE lane

- Make repo import create a durable `Workspace` record.
- Show repo explorer, branch state, diffs, terminal/jobs, Absorb graph, board tasks, and agent sessions in one workbench.
- Make all agent changes reviewable as branch/PR artifacts.
- Add HoloScript conversion advisor as a first-class lane after import.

### Phase 4: Account workspace and founder migration

- Provision users as ai-ecosystem-shaped workspaces.
- Port the local founder `.ai-ecosystem` into the founder Studio account through a manifest-driven importer.
- Backfill repo links, knowledge, board state, paper unlock state, and founder privileges.

## Board Task Pack

Filed board tasks:

- `task_1778382733640_b4iz`: `[studio/P0] Repair Studio typecheck and R3F renderer export drift` (initial fix applied locally; close after commit)
- `task_1778382733640_dlg3`: `[studio/P1] Rebuild Studio around a real workbench shell`
- `task_1778382733640_4v0v`: `[studio/P1] Replace panel warehouse with typed view and command registries`
- `task_1778382733640_mvdm`: `[studio/P1] Implement agent workbench for external repo improvement`
- `task_1778382733640_f8fq`: `[studio/P2] Normalize Studio navigation and professional visual system`
- `task_1778382733640_fgou`: `[studio/P2] Scope Brittney and agent context to workspace/project/repo`
- `task_1778382733640_t9ck`: `[studio/P2] Archive or lab-flag non-core IDE routes and panels`
- `task_1778383136213_o5i2`: `[studio/P2] Remove dynamic dependency warnings from production build`

Existing adjacent board tasks:

- `[studio/P0] Configure production GitHub OAuth for holoscript.studio`
- `[studio/P1] Harden workspace import clone safety and token handling`
- `[studio/P1] Connect GitHub repo import to durable Absorb project state`
- `[studio/P1] Add HoloScript conversion opportunity advisor to repo import`
- `[studio/P1] Provision Studio users as ai-ecosystem-shaped account workspaces`
- `[studio/P1] Bootstrap founder Studio account from existing ai-ecosystem repo`
