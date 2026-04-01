# HoloScript Studio — Full Audit (2026-04-01)

302 components, 203 lib files, 60 industry files, 74 API routes, 34 pages audited.

---

## CRITICAL (fix before next deploy)

### SEC-01: No Security Headers / CSP
- **No `middleware.ts` exists** — XSS, clickjacking, MIME sniffing all unguarded
- `.env.example` documents `ENABLE_SECURITY_HEADERS` and `ENABLE_CSP` but **neither is implemented**
- **Fix:** Create `src/middleware.ts` with X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP

### SEC-02: API Keys in localStorage
- `character/aiCharacterGeneration.ts:44` — Meshy & Rodin keys stored in `localStorage`
- `character/sketchfabIntegration.ts:61` — Sketchfab key in `localStorage`
- **Risk:** Any XSS → attacker steals 3D generation quotas
- **Fix:** Server-side proxy via `/api/ai-generation`, accept OAuth token, never expose keys to browser

### BUILD-01: ESLint + TypeScript Errors Suppressed
- `next.config.js:7` — `eslint.ignoreDuringBuilds: true`
- `next.config.js:10` — `typescript.ignoreBuildErrors: true`
- **Risk:** Silent failures, regressions ship to production
- **Fix:** Fix underlying lint/TS errors, re-enable checks

---

## HIGH (fix this sprint)

### PERF-01: 24 Components Over 300 Lines (need splitting)
| Component | Lines | Priority |
|-----------|-------|----------|
| StudioHeader.tsx | 1,322 | Split into NavBar, Toolbar, SearchBar, UserMenu |
| SliderMaterialInspector.tsx | 1,075 | Extract per-material-type panels |
| StudioOperationsHub.tsx | 1,021 | Extract metric cards, job list, daemon panel |
| ImportRepoWizard.tsx | 915 | Step components |
| TraitSupportMatrixDashboard.tsx | 891 | Extract table, filters, detail panel |
| CinematicCameraPanel.tsx | 887 | Extract keyframe editor, path preview |
| HoloScriptEditor.tsx | 826 | Extract toolbar, minimap, status bar |
| StudioSetupWizard.tsx | 810 | Step components |
| SyntheticDataDashboard.tsx | 788 | Extract config panel, preview, stats |
| HoloDiffPanel.tsx | 775 | Extract diff viewer, controls, timeline |

### MEM-01: Memory Leaks in Hooks
- **usePresence.ts:71** — `setInterval` can stack if `enabled` toggles rapidly
- **useYjsCollaboration.ts:47** — callbacks stack on reconnect
- **useLivePreview.ts:55** — EventSource recreates if `onRemoteCode` not memoized
- **useMultiplayerRoom.ts:88** — chat buffer race condition under burst

### TYPE-01: 87+ `as any` Assertions
**Worst offenders:**
- StudioHeader.tsx — 11 instances
- BehaviorTreeVisualEditor.tsx — 8 instances
- CreatorLayout.tsx — 8 instances
- SceneRenderer.tsx — 6 instances
- DevToolsInit.tsx — 7 instances
- HoloScriptEditor.tsx — 4 instances

### ERR-01: 16 Swallowed Errors (`.catch(() => {})`)
Found in: AudioTraitPanel, AudioVisualizerPanel, EnvironmentPanel, Guestbook, MusicPlayer, LodPanel, MaterialPanel, NodeGraphPanel, ParticlePanel, PhysicsPanel, PluginPanelContainer, RegistryPanel, useShaderPreview, StudioHeader, TemplateGallery

### TEST-01: Industry Verticals Have 0% Test Coverage
- 26 scenario panels — zero tests
- 28 character files — zero tests
- Marketplace client (621 LOC) — zero tests
- Orchestration store (721 LOC) — zero tests

---

## MEDIUM (fix this month)

### PERF-02: Bundle Size Opportunities
- `wizardTemplates.ts` — 4,388 LOC inlined strings, should lazy-load or JSON
- `sceneTemplates.ts` — 1,184 LOC inlined compositions
- `chart.js` — only used in admin dashboard, should be dynamic import
- `public/wasm/` — duplicate files: `holoscript.core.wasm` (456KB) + `holoscript.wasm` (459KB)

### PERF-03: Missing React.memo on Scenario Cards
- 26 `ScenarioCard` instances re-render on parent filter changes
- Gallery count mismatch: 23 listed in registry vs 26 actual panels

### LOG-01: 26+ Console Statements in Production Code
**Remove or replace with logger abstraction:**
- DevToolsInit.tsx — 5 console.log/error
- CreatorLayout.tsx:556 — `console.log` character created
- BehaviorTreeVisualEditor.tsx:299 — template loaded debug
- AgentOrchestrationGraphEditor.tsx:404 — template loaded debug
- MarketplacePanel.tsx:90 — downloaded content debug
- DiagnosticsPanel.tsx:256 — apply fix debug
- TemplateBrowserPanel.tsx:88 — export not implemented
- StudioHeader.tsx:450 — scene import error
- ServiceConnectorPanel.tsx — 3 console.error
- PluginManagerPanel.tsx — 2 console.error
- PluginPanelContainer.tsx:141 — console.warn
- PluginMarketplacePanel.tsx:130 — console.warn
- ShaderEditorToolbar.tsx:72 — load graph error

### TODO-01: 9 Open TODOs in Components
| File | TODO |
|------|------|
| CinematicCameraPanel.tsx:5 | TODO-058 |
| AssetImportDropZone.tsx:5 | TODO-057 |
| MarketplacePanel.tsx:91 | Handle different content types |
| TemplateBrowserPanel.tsx:87 | Implement custom template export |
| DiagnosticsPanel.tsx:255 | Wire to editor store to apply fix |
| CompilationPipelineVisualizer.tsx:5 | TODO-062 |
| SceneRenderer.tsx:330 | Wire from LODManager |
| SyntheticDataDashboard.tsx:5 | TODO-060 |
| ConfidenceAwareXRUI.tsx:5 | TODO-063 |

### STORE-01: Unbounded State Growth
- `pipelineStore.ts:245` — feedback buffer per layer grows without limit
- `playModeStore.ts:205` — inventory object grows without max items check
- `useScriptConsole.ts:20` — entry counter never resets

### UNUSED-01: 6 Hooks Never Imported
- `useXRSession.ts`
- `useMonacoAutocomplete.ts`
- `useSceneProfiler.ts`
- `useHoloDebugger.ts`
- `useSceneOutliner.ts`
- `useScriptConsole.ts`

### A11Y-01: Error Boundary Coverage
- Only 1 ErrorBoundary exists, used once at root
- Missing from: all R3F canvases, editor panels, marketplace, orchestration
- SceneRenderer.tsx has event handlers on non-semantic elements

### CONFIG-01: Unused TypeScript Path Alias
- `tsconfig.json:19` — `@holoscript/absorb-service/*` alias never used

### CONFIG-02: No Image Optimization
- `next.config.js` — no `images.domains` or `images.formats` configured

---

## LOW (backlog)

### DX-01: Inconsistent Error Messages
- Some user-friendly ("Generation failed: {reason}")
- Some technical ("HTTP 404: Not Found")
- Create `error.ts` utility for normalization

### DX-02: Magic Numbers Without Constants
- Animation durations (2000ms, 500ms) hardcoded across files
- Pool sizes, cache limits, timeouts scattered

### DX-03: No i18n Framework
- All UI strings hardcoded in English
- Constants pattern used (SCENE_TEMPLATES, WORKFLOW_TEMPLATES) — good foundation

### DX-04: Collab Types Weak
- `collaboration/client.ts:31` — `awareness: any` (should be `Y.Awareness`)
- Multiple `Y.Map<any>` usages

### TEST-02: Conservative Coverage Thresholds
- `vitest.config.ts` — 40% lines/functions, 35% branches
- Should increase as coverage improves

---

## PAGE STATUS INVENTORY

### COMPLETE (25+)
`/`, `/auth/signin`, `/workspace`, `/workspace/skills`, `/admin`, `/projects`, `/templates`, `/registry`, `/integrations`, `/operations`, `/pipeline`, `/holomesh`, `/holomesh/agent/[id]`, `/holomesh/dashboard`, `/holomesh/contribute`, `/holomesh/onboard`, `/holoclaw`, `/scenarios`, `/character`, `/settings`, `/shared/[id]`, `/view/[id]`, `/u/[username]`, `/remote/[token]`, `/absorb/admin`

### PARTIAL (4)
`/create` (26K tokens, needs deep review), `/absorb` (31K tokens, needs deep review), `/holomesh/entry/[id]`, `/holomesh/profile`

### STUB (6)
`/workspace/agents/new`, `/workspace/plugins/new`, `/workspace/traits/new`, `/workspace/templates/new`, `/workspace/training-data/new`, `/holodaemon` (redirects to /absorb), `/learn` (redirects to Academy)

---

## SCORES

| Dimension | Score | Notes |
|-----------|-------|-------|
| Feature Completeness | 8/10 | 25+ complete pages, 26 scenario panels, character pipeline |
| Code Quality | 7/10 | Clean architecture, but 87 `any` types and 16 swallowed errors |
| Test Coverage | 3/10 | 16 test files for 302 components, 0% on industry |
| Security | 4/10 | No CSP, API keys in localStorage, build checks disabled |
| Performance | 8/10 | Good lazy loading, WASM in worker, bundle budgets defined |
| Accessibility | 6/10 | 39+ files with ARIA, but single ErrorBoundary, some non-semantic handlers |
| Maintainability | 7/10 | Modular, good docs, but oversized components need splitting |
| Infrastructure | 7/10 | PWA, standalone build, Drizzle ORM, but missing security middleware |

**Overall: 6.25/10 — Production-capable but needs security hardening and test coverage before scale.**
