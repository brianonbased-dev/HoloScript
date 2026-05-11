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

The live codebase is larger than the main Studio docs historically claimed. Latest local inventory:
`pnpm --filter @holoscript/studio inventory` at 2026-05-10T19:41:52Z.

| Surface          |        Current scan | Docs still claim |
| ---------------- | ------------------: | ---------------: |
| App page routes  |                  68 |         43 / 30+ |
| API routes       |                 172 |              143 |
| Components       | 446 non-test TS/TSX |              316 |
| Hooks            | 112 non-test TS/TSX |              148 |
| Lib modules      | 349 non-test TS/TSX |              121 |
| Panel keys       |                  76 |         unstated |
| Panel components |                  50 |         unstated |

Top route buckets:

- `holomesh`: 13 pages
- `workspace`: 6 pages
- `agents`: 4 pages
- `pipeline`: 3 pages
- `teams`: 3 pages

Top API route buckets:

- `holomesh`: 40 routes
- `absorb`: 8 routes
- `git`: 8 routes
- `connectors`: 6 routes
- `github`: 6 routes
- `studio`: 6 routes
- `daemon`: 5 routes
- `holotwin`: 5 routes

Top component buckets:

- `panels`: 50 components
- `wizard`: 26 components
- `marketplace`: 15 components
- `shader-editor`: 14 components
- `holomesh`: 13 components
- `ai`: 12 components
- `diff`: 12 components
- `camera`: 10 components
- `coordinator-panels`: 10 components
- `synthetic`: 10 components

### Generated Inventory Command

Do not update the counts above by hand. Regenerate the live Studio inventory from the
workspace:

```bash
pnpm --filter @holoscript/studio inventory
node packages/studio/scripts/studio-inventory.mjs --json
pnpm --filter @holoscript/studio inventory:check
node packages/studio/scripts/studio-inventory.mjs --snapshot > packages/studio/docs/STUDIO_INVENTORY_SNAPSHOT.json
```

The script reports App Router page routes, API routes, non-test component/hook/lib
module counts, `panelVisibilityStore` panel keys, panel component count, top route
buckets, and `.next/static/chunks/app` bundle-size signal when a local Studio build
exists. `inventory:check` compares the stable source counts and top buckets against
`docs/STUDIO_INVENTORY_SNAPSHOT.json`; refresh that snapshot only when the route or
module surface intentionally changes.

## Gap Coverage Snapshot

Closed or materially covered since this audit began:

- `ced8f04ff`: repaired `@holoscript/r3f-renderer` generated type drift and restored Studio typecheck.
- `35c91239a`: hardened workspace import clone safety with argv-based `git`, branch/ref validation, token-free clone URLs, and sanitized clone errors.
- `e138ca5ec`: connected GitHub repo import to durable Absorb project state.
- `5215a6336` and `6cbe4bc98`: added and surfaced HoloScript conversion recommendations.
- `761c486e2`: added publish-worthiness detection for hidden paper-program unlocks.
- `a6cf59c7c`: provisioned users as ai-ecosystem-shaped account workspaces.
- `7441751d9` and `7db199fbe`: bootstrapped and backfilled the founder Studio account.
- `30dbdac22`: added the external repo agent workbench.
- `fa406b159`: introduced `WorkbenchShell` and made `/create` a workbench perspective.
- `6390b7e59`: added the generated Studio inventory command used by this section.

Still-open, verified gaps:

- `G-STUDIO-001`: View metadata is still not registry-backed. `panelVisibilityStore.ts`
  currently has 76 `PANEL_KEYS`, while `/create/page.tsx` still selects individual
  booleans such as `chatOpen`; `ViewRegistry` does not exist yet.
- `G-STUDIO-002`: Brittney chat history is still not workspace-scoped:
  `components/ai/BrittneyChatPanel.tsx` calls `useAssistantHistory('default')`.
- `G-STUDIO-003`: the visual-system cleanup remains live: `globals.css` still contains
  mojibake comments and global `html, body { overflow: hidden; }`.
- `G-STUDIO-004`: user provisioning still pushes a repo `.env` containing the provisioned
  `HOLOSCRIPT_API_KEY`; approved repo consent is recorded but not enforced as an
  import/connect authorization gate.
- `G-STUDIO-005`: the `publish-knowledge` step still marks itself done without publishing
  extracted knowledge.
- `G-STUDIO-006`: demo/random simulation values still leak into evidence-shaped surfaces,
  such as `useDispatchTrace` random replay fingerprints and operations pipeline random
  commit hashes. These need deterministic inputs or explicit lab/mock gating.
- `G-STUDIO-007`: production GitHub OAuth for `holoscript.studio` remains open on the
  board, so production account onboarding is not fully covered.
- `G-BUILD-001`: the root local build gate is red before Studio is reached.
  `pnpm --filter @holoscript/core run build` passes, but the downstream recursive
  workspace build fails first in `@holoscript/ai-validator` DTS generation because
  `@holoscript/core` types are not resolved through the current workspace type surface.
  This is tracked as `task_1778408259046_1ydz`.

## What Is Wrong

### 1. The docs are giving agents false confidence

`README.md` and `PAGES_ARCHITECTURE.md` previously described a neat progressive funnel and stale route/component counts. They now point to the generated inventory snapshot and `inventory:check`; keep that guard in place so stale prose does not regain authority. `STUDIO_AUDIT.md` remains historical and superseded by this reboot audit.

This matters because agents read the docs first and then preserve the sprawl instead of challenging it.

### 2. `/create` is a panel warehouse, not an IDE architecture

`src/app/create/page.tsx` is 2,322 lines. It dynamically imports dozens of panels, wires dozens of panel booleans manually, and includes remnants of duplicate component cleanup in comments.

The route now mounts inside `WorkbenchShell`, but the page internals still carry
feature registration, command routing, panel rendering, and product-mode decisions
in one place. A Unity/Unreal/VS Code competitor needs a workbench model:

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

The shell exists; the missing layer is now the registry-driven workbench model inside
the shell.

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

### 6. Agent IDE capability is partially unified, but not finished

Existing fragments:

- GitHub OAuth and repo listing/import routes.
- `/api/workspace/import` for cloning repos.
- `/api/workspace/provision` for account/workspace provisioning.
- `lib/workspace/scaffolder.ts` for agent instruction templates.
- Absorb API routes and HoloMesh board routes.
- Brittney chat and server-side tool execution.
- Git APIs for status, diff, branch, commit, push, and ship.

Covered since the initial audit:

- `/workspace` now exists as an external repo agent workbench with repo explorer,
  branch/diff controls, daemon timeline, patch review, Absorb evidence, HoloMesh
  board tasks, permission review, and branch/PR/direct-ship actions.
- Repo import now persists conversion candidates and durable Absorb project state.

Missing or incomplete synthesis:

- workspace context is not yet shared across all IDE surfaces.
- `/create` still has its own panel internals instead of registry-backed views.
- no project-scoped assistant history for `/create` chat (`BrittneyChatPanel` uses
  `useAssistantHistory('default')`).
- production GitHub OAuth and account onboarding remain open.

### 7. The account workspace path still needs consent and secret hardening

Covered since the initial audit:

- `/api/workspace/import` uses `execFile`, `--` argument separation, strict GitHub URL
  parsing, branch validation, token-free clone URLs, `GIT_CONFIG_*` extraheader auth,
  `randomUUID`, and cross-platform `git ls-files` counting.
- Founder and non-founder workspace ids now route through authenticated workspace
  identity helpers.

Remaining provisioner gaps:

- `approvedRepos` is accepted but not enforced when connecting/importing repos.
- it still seeds `.env` with `HOLOSCRIPT_API_KEY` into the target GitHub repo when
  scaffold approval is granted.
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
The current route and panel classification is registry-backed in
[`STUDIO_SURFACE_CLASSIFICATION.md`](STUDIO_SURFACE_CLASSIFICATION.md).

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
- DONE: add a generated inventory script for routes, APIs, components, panels, and
  bundle-size signal.
- DONE: fix typecheck before further UI expansion.
- DONE: wire the inventory command into docs/package drift checks so stale counts fail loud.
- DONE: classify Studio routes and panels, then gate lab/public navigation behind
  `NEXT_PUBLIC_STUDIO_SHOW_LABS`.

### Phase 1: Workbench spine

- DONE: introduce `WorkbenchShell`.
- DONE: make `/create` one workbench perspective, not the entire IDE chrome.
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

Closed board tasks:

- `task_1778382733640_b4iz`: `[studio/P0] Repair Studio typecheck and R3F renderer export drift` -> `ced8f04ff`
- `task_1778382733640_dlg3`: `[studio/P1] Rebuild Studio around a real workbench shell` -> `fa406b159`
- `task_1778382733640_mvdm`: `[studio/P1] Implement agent workbench for external repo improvement` -> `30dbdac22`
- `task_1778405476332_8ov2`: `[studio/P1] Add generated Studio inventory audit script` -> `6390b7e59`

Open board tasks:

- `task_1778380087874_p1c2`: `[studio/P0] Configure production GitHub OAuth for holoscript.studio`
- `task_1778382733640_4v0v`: `[studio/P1] Replace panel warehouse with typed view and command registries`
- `task_1778382733640_f8fq`: `[studio/P2] Normalize Studio navigation and professional visual system`
- `task_1778382733640_fgou`: `[studio/P2] Scope Brittney and agent context to workspace/project/repo`
- `task_1778382733640_t9ck`: `[studio/P2] Archive or lab-flag non-core IDE routes and panels`
- `task_1778383136213_o5i2`: `[studio/P2] Remove dynamic dependency warnings from production build`
- `task_1778381292115_gnha`: `[studio/P2] Surface paper unlock as opt-in research packet in the account workspace`
- `task_1778381830230_7jmv`: `[studio/P2] Add founder account sync command for local ai-ecosystem`

New gap tasks filed from this pass:

- `task_1778406354608_m1dj`: `[studio/P1] Enforce approved repo consent across provisioning and import`
- `task_1778406354608_0d89`: `[studio/P1] Stop committing provisioned API keys into user repos`
- `task_1778406354608_3g1q`: `[studio/P2] Make publish-knowledge provisioning step publish for real`
- `task_1778406354608_ugtj`: `[studio/P2] Gate demo/random evidence surfaces or make them deterministic`
- `task_1778406354608_f6go`: `[studio/P2] Wire Studio inventory drift check into docs or CI`
- `task_1778408259046_1ydz`: `[build/P0] Restore root pnpm build after workspace type-surface drift`

Closed adjacent board tasks:

- `[studio/P1] Harden workspace import clone safety and token handling` -> `35c91239a`
- `[studio/P1] Connect GitHub repo import to durable Absorb project state` -> `e138ca5ec`
- `[studio/P1] Add HoloScript conversion opportunity advisor to repo import` -> `5215a6336`
- `[studio/P1] Surface conversion recommendations in Project DNA and workspace UI` -> `6cbe4bc98`
- `[studio/P1] Provision Studio users as ai-ecosystem-shaped account workspaces` -> `a6cf59c7c`
- `[studio/P1] Bootstrap founder Studio account from existing ai-ecosystem repo` -> `7441751d9`
