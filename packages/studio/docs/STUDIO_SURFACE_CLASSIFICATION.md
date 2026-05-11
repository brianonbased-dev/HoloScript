# Studio Surface Classification

Current as of 2026-05-11. The code source of truth is
`src/lib/studio/surfaceClassification.ts` for page routes and
`src/lib/studio/viewRegistry.ts` for registered panels.

## Policy

- Primary navigation is only the account/workbench spine: `/start`, `/workspace`,
  `/create`, `/projects`, plus `/settings` in the footer.
- Lab navigation is hidden by default. Set `NEXT_PUBLIC_STUDIO_SHOW_LABS=1` to expose
  lab navigation for local/staging review.
- Direct URL routes remain reachable unless the route itself redirects. This task
  removes non-core surfaces from default chrome; it does not delete code.
- HoloMesh public, lab, archive, and deprecated surfaces must not be added to
  primary navigation without changing the registry and tests.

## Route Classes

### Core Workbench

- `/start`
- `/create`

### Account Workspace

- `/auth/signin`
- `/agents/me`
- `/integrations`
- `/projects`
- `/settings`
- `/settings/security/self-custody`
- `/workspace`
- `/workspace/agents/new`
- `/workspace/knowledge`
- `/workspace/plugins/new`
- `/workspace/templates/new`
- `/workspace/traits/new`

### HoloMesh Public

- `/agents`
- `/agents/[id]`
- `/agents/[id]/storefront`
- `/g/[hash]`
- `/holomesh`
- `/holomesh/agent/[id]`
- `/holomesh/contribute`
- `/holomesh/dashboard`
- `/holomesh/entry/[id]`
- `/holomesh/leaderboard`
- `/holomesh/marketplace`
- `/holomesh/onboard`
- `/holomesh/profile`
- `/holomesh/team/[id]`
- `/holomesh/team/[id]/board`
- `/holomesh/teams`
- `/holomesh/transactions`
- `/shared/[id]`
- `/store`
- `/teams`
- `/teams/[id]`
- `/teams/[id]/board`
- `/u/[username]`
- `/view/[id]`

### Lab

- `/absorb`
- `/absorb/admin`
- `/admin`
- `/avatar`
- `/build`
- `/character`
- `/coordinator`
- `/dev/ui-graph`
- `/pipeline`
- `/pipeline/chaining`
- `/pipeline/choreography`
- `/playground`
- `/playground/locomotion`
- `/registry`
- `/remote/[token]`
- `/scan-room`
- `/scan-room/mobile/[token]`
- `/training-data/new`
- `/vibe`

### Archive

- `/`
- `/[vertical]`
- `/creator`
- `/demo/emergent-spacetime`
- `/examples/no-app-webxr`
- `/learn`
- `/quest-probe`

### Deprecated Redirects

- `/gram/[hash]`
- `/holoclaw`
- `/holodaemon`
- `/templates`

## Panel Classes

Panel classification lives on `STUDIO_VIEW_REGISTRY[].surfaceClass`. The test suite
checks every registered panel has this metadata.

### Core Workbench Panels

- `palette`
- `chat`
- `history`
- `shaderEditor`
- `timeline`
- `templatePicker`
- `aiMaterial`
- `share`
- `critique`
- `assetPack`
- `versions`
- `export`
- `generator`
- `assetLib`
- `templateGallery`
- `minimap`
- `audio`
- `exportV2`
- `nodeGraph`
- `keyframes`
- `sceneSearch`
- `particles`
- `lod`
- `undoHistory`
- `outliner`
- `material`
- `physics`
- `simulation`
- `snapshotDiff`
- `multiTransform`
- `environment`
- `inspector`
- `hotkey`
- `texturePaint`
- `publish`
- `hotkeyOverlay`
- `prompts`
- `blame`
- `calibration`
- `holoDiff`
- `sliderInspector`
- `traitMatrix`
- `assetImport`
- `cinematicCamera`

### Account Workspace Panels

- `plugins`
- `sandboxedPlugins`
- `mcpConfig`
- `pluginManager`
- `cloudDeploy`
- `operationsHub`

### HoloMesh Public Panels

- `marketplace`
- `foundationDao`

### Lab Panels

- `profiler`
- `repl`
- `registry`
- `remote`
- `multiplayer`
- `debugger`
- `snapshots`
- `console`
- `audioVisualizer`
- `splatWizard`
- `agentMonitor`
- `agentWorkflow`
- `behaviorTree`
- `agentEnsemble`
- `eventMonitor`
- `toolCallGraph`
- `examples`
- `tutorial`
- `dag`
- `dragonPreview`
- `syntheticData`
- `compilationPipeline`
- `confidenceXR`
- `runtimeTier`
