# HoloScript / HoloLand Ownership Classification

> **Audit date**: 2026-05-12
> **Auditor**: claude1
> **Source task**: task_1778615724036_w34d
> **Authority**: `docs/strategy/vision/2026-03-09_holoscript-vs-hololand-strategic-boundary.md`
> **Scope**: Every file in `github.com/brianonbased-dev/HoloScript` whose name contains `hololand`, `HoloLand`, `Hololand`, or `HoloLand`

---

## Executive Summary

| Category | Files | Lines of TS (approx) | Verdict |
|----------|-------|----------------------|---------|
| **HoloLand App** (move to Hololand repo) | 20 | ~8,200 | Business logic, branded clients, roadmap |
| **HoloScript Core** (keep, rename if branded) | 14 | ~1,100 | Generic receipts, traits, renderer, docs |
| **Bridge** (extract to `@holoscript/hololand-bridge`) | 12 | ~7,400 | World schema, streaming protocol, integration client |
| **Build artifacts / data** (no action) | 9 | — | `.d.ts`, `.js`, `.jsonl`, bench logs |
| **Research / audit docs** (keep) | 7 | — | Already in `research/` and `docs/` |
| **Total audited** | 62 | ~16,700 | |

**Pre-condition**: This classification document is the decision artifact. Execution of moves is out of scope for this task and should be filed as follow-up board tasks per F.025.

---

## Classification Framework

Three canonical buckets, aligned with the strategic boundary document:

1. **HoloScript Core (`@holoscript/*`)** — Universal protocol, engine, compiler, trait system, generic infrastructure. Anything not branded "HoloLand" and not coupled to HoloLand business logic.
2. **HoloLand App (`github.com/brianonbased-dev/Hololand`)** — Reference-implementation application. Branded clients, VRR-specific routes, roadmap milestones, extension points for HoloLand platform features.
3. **Bridge (`@holoscript/hololand-bridge`)** — Integration layer between HoloScript core and HoloLand. World-definition schema, streaming protocol, physics bounds registry, cross-validation registry. These are **not** generic enough for core (they describe HoloLand wire formats) but are **reusable** by third-party HoloLand clones. Keeping them in a dedicated bridge package honors the anti-monolith thesis.

---

## 1. HoloLand App — Move to Hololand Repo

These files are application-specific to the HoloLand reference implementation.

### packages/core/src/plugins/ (HoloLand platform extension points)

| File | Rationale |
|------|-----------|
| `HololandExtensionPoint.ts` | Defines VRR sync provider, weather, events, inventory, AI narrative, quest, and payment extension points. These are HoloLand platform business contracts, not HoloScript language primitives. |
| `HololandExtensionRegistry.ts` | Runtime registry for the above extension points. |
| `HololandTypes.ts` | Type definitions consumed only by the extension points. |
| `__tests__/HololandExtensionPoint.prod.test.ts` | Tests for extension points. |
| `__tests__/HololandExtensionRegistry.prod.test.ts` | Tests for extension registry. |

### packages/core/src/services/ (HoloLand-specific services)

| File | Rationale |
|------|-----------|
| `HololandRoadmapService.ts` | Manages HoloLand's internal sprint milestones ("Phase 5 Spatial Governance"). Literal application state. |
| `__tests__/HololandRoadmapService.prod.test.ts` | Tests for roadmap service. |

### packages/marketplace-api/src/

| File | Rationale |
|------|-----------|
| `hololandRoutes.ts` | Express routes for VRR twin creation ($500), quest generation ($50), and StoryWeaver NFT minting ($10). Business logic + x402 pricing specific to HoloLand. |

### packages/vscode-extension/out/ (build artifacts)

| File | Rationale |
|------|-----------|
| `commands/HololandCommands.js` | Compiled VS Code extension commands for HoloLand. Rebuild in Hololand repo if needed. |
| `services/HololandCommands.js` | Compiled service wrappers. |
| `services/HololandServices.js` | Compiled service implementations. |
| `webview/HololandWebviews.js` | Compiled webview code. |

**Note**: `.js` + `.js.map` artifacts in `out/` are generated. Do not hand-migrate; reproduce the source in the Hololand repo and build fresh.

---

## 2. Bridge — Extract to `@holoscript/hololand-bridge`

These modules define reusable integration contracts between HoloScript and HoloLand-like platforms. They are too HoloLand-coupled for `@holoscript/core` but too reusable to bury in the HoloLand app.

### packages/core/src/hololand/ (6,540 LOC integration module)

| File | Rationale |
|------|-----------|
| `index.ts` | Barrel re-exporting the full HoloLand integration surface. Becomes the bridge package entry point. |
| `WorldDefinitionSchema.ts` | World metadata, config, zones, spawn points, LOD, skybox, weather, post-processing. Schema is reusable by any HoloLand clone. |
| `HololandIntegration.ts` | `HololandClient`, connection state machine, runtime services (assets, networking, audio, physics, input, analytics, voice, storage). Client is branded; services are generic. **Action**: split — generic `WorldRuntimeClient` stays in bridge; HoloLand-specific connection URL/auth moves to HoloLand app. |
| `StreamingProtocol.ts` | Entity sync, state delta compression, voice data, chat, asset streaming, player state. Protocol is reusable. |
| `PhysicsBoundsRegistry.ts` | Confabulation-safe physics envelopes with agent risk registry integration. Generic safety primitive. |
| `CrossValidationRegistry.ts` | Multi-agent consensus, peer divergence detection. Generic distributed-system primitive. |
| `ItemManifest.ts` | Items as characters with sovereign traits. Reusable game-system primitive. |
| `__tests__/HololandIntegration.test.ts` | Tests move with the module. |

### packages/core/src/barrel/

| File | Rationale |
|------|-----------|
| `hololand-runtime.ts` | Re-exports core modules as a curated "HoloLand runtime" barrel. This is a bridge convenience layer, not core. Move to bridge package or delete (consumers can import directly). |

### packages/core/src/__tests__/

| File | Rationale |
|------|-----------|
| `hololand.test.ts` | Integration tests for `packages/core/src/hololand/`. Move with the module. |

---

## 3. HoloScript Core — Keep (Rename if Branded)

These files are generic HoloScript infrastructure with misleading HoloLand branding.

### packages/framework/src/board/

| File | Current Name | Proposed Name | Rationale |
|------|-------------|---------------|-----------|
| `hololand-receipts.ts` | `hololand-receipts.ts` | `hardware-receipts.ts` or `validation-receipts.ts` | Defines `HardwareReceipt`, `ReplayInput`, `ReplayOutcome`, `AgentActionReceipt`, `CrossHardwareCompilationReceipt`, `ValidationReceipt`. These are framework-level evidence types for hardware validation and deterministic replay. The only HoloLand coupling is a comment calling them "HoloLand receipts." Rename and keep. |
| `__tests__/hololand-receipts.test.ts` | `hololand-receipts.test.ts` | `hardware-receipts.test.ts` | Tests for the above. Rename with module. |

### packages/platform/renderer/src/

| File | Current Name | Proposed Name | Rationale |
|------|-------------|---------------|-----------|
| `HololandRenderer.ts` | `HololandRenderer.ts` | `VRRenderer.ts` or `AdaptiveRenderer.ts` | Orchestrates `AdaptiveFrameRateManager`, `QualityManager`, `InferencePriorityScheduler`, and `VRPerformanceBudget`. Zero HoloLand-specific logic; entirely generic VR rendering pipeline. |
| `__tests__/HololandRenderer.test.ts` | `HololandRenderer.test.ts` | `VRRenderer.test.ts` | Tests for the above. Rename with module. |

### packages/core/src/services/

| File | Current Name | Proposed Name | Rationale |
|------|-------------|---------------|-----------|
| `HololandGraphicsPipelineService.ts` | `HololandGraphicsPipelineService.ts` | `GraphicsPipelineService.ts` | GPU memory estimation, material asset pipeline, shader management, performance metrics. Generic graphics infrastructure. |

### packages/runtime/src/traits/

| File | Current Name | Proposed Name | Rationale |
|------|-------------|---------------|-----------|
| `HoloLandTraits.ts` | `HoloLandTraits.ts` | `RuntimeTraitBridge.ts` or `CoreTraitAdapters.ts` | Bridges `@stat` / `@luck` / `@encounter` / `@drop_table` core handlers to the runtime `TraitSystem`. The trait family is generic; the runtime bridge is core infrastructure. |
| `__tests__/HoloLandTraits.test.ts` | `HoloLandTraits.test.ts` | `RuntimeTraitBridge.test.ts` | Tests for the above. Rename with module. |

### packages/mcp-server/

| File | Rationale |
|------|-----------|
| `hololand-substrate-v1.jsonl` | Training dataset for Brittney (AI assistant) covering HoloLand scenarios. This is HoloScript MCP server training data; it stays because the MCP server is core infrastructure. The *content* is HoloLand-specific, but the artifact is server-side training material. |

### scripts/training/

| File | Rationale |
|------|-----------|
| `gen-hololand-training.ts` | Generates the above training dataset. Part of the core training pipeline. Keep. |

### docs/integrations/

| File | Rationale |
|------|-----------|
| `hololand.md` | Integration guide telling HoloScript users how to use their code with HoloLand. This is documentation *about* HoloLand from the HoloScript side. Keep. |
| `hololand-audit.md` | Thin pointer to proprietary research. Keep as-is. |

### docs/ops/

| File | Rationale |
|------|-----------|
| `hololand-agent-tooling-receipts.md` | Agent tooling receipts for HoloScript CLI commands. These are HoloScript CLI validation logs, not HoloLand app state. Keep. |

### docs/strategy/vision/

| File | Rationale |
|------|-----------|
| `2026-03-09_holoscript-vs-hololand-strategic-boundary.md` | The authority document for this classification. Keep. |

### research/audit-reports/

| File | Rationale |
|------|-----------|
| `hololand-ts-only-classification-2026-05-07.md` | Prior audit of TS-only packages. Keep. |

### research/

| File | Rationale |
|------|-----------|
| `2026-05-11_hololand-stub-audit.md` | Audit of missing `@hololand/*` packages. Keep. |
| `2026-05-12_hololand-prod-fix-classification.md` | Classification of stale HoloLand worktree. Keep. |
| `hololand-device-lab-2026-05-09T08-35-53-176Z.json` | Device lab data. Keep as research artifact. |
| `2026-05-12_holoscript-hololand-ownership-classification.md` | This document. |

### .holoscript/device-lab/

| File | Rationale |
|------|-----------|
| `hololand-device-lab-*.json` | Device lab telemetry. These are HoloScript device lab artifacts testing HoloLand compatibility. Keep in HoloScript. |

### .bench-logs/format-stress/

| File | Rationale |
|------|-----------|
| `hololand-vv-parse.txt` | Parser bench log. Keep. |
| `hololand-vv-compile-threejs.txt` | Compiler bench log. Keep. |

---

## Recommended Actions

### P1 — Rename in-place (zero risk, immediate)

1. `packages/framework/src/board/hololand-receipts.ts` → `hardware-receipts.ts`
2. `packages/framework/src/__tests__/hololand-receipts.test.ts` → `hardware-receipts.test.ts`
3. `packages/platform/renderer/src/HololandRenderer.ts` → `VRRenderer.ts`
4. `packages/platform/renderer/src/__tests__/HololandRenderer.test.ts` → `VRRenderer.test.ts`
5. `packages/core/src/services/HololandGraphicsPipelineService.ts` → `GraphicsPipelineService.ts`
6. `packages/runtime/src/traits/HoloLandTraits.ts` → `RuntimeTraitBridge.ts`
7. `packages/runtime/src/traits/__tests__/HoloLandTraits.test.ts` → `RuntimeTraitBridge.test.ts`

Update all internal imports in the same commit. These are pure renames with no behavioral change.

### P2 — Extract bridge package (medium risk, requires scaffolding)

1. Create `packages/hololand-bridge/` (or `packages/plugins/hololand-bridge/` per existing plugin convention).
2. Move `packages/core/src/hololand/` → `packages/hololand-bridge/src/`.
3. Move `packages/core/src/barrel/hololand-runtime.ts` → `packages/hololand-bridge/src/runtime.ts`.
4. Move `packages/core/src/__tests__/hololand.test.ts` → `packages/hololand-bridge/src/__tests__/integration.test.ts`.
5. Update `pnpm-workspace.yaml` and root `package.json` workspaces.
6. Update import paths in consumers (search for `from '../hololand'` and `from '@holoscript/core/hololand'`).

### P3 — Move application logic to Hololand repo (higher risk, cross-repo)

1. `packages/core/src/plugins/HololandExtensionPoint.ts` + `HololandExtensionRegistry.ts` + `HololandTypes.ts` + tests → `Hololand/packages/platform-extension-points/src/`
2. `packages/core/src/services/HololandRoadmapService.ts` + tests → `Hololand/packages/governance/src/`
3. `packages/marketplace-api/src/hololandRoutes.ts` → `Hololand/apps/marketplace-api/src/routes/`
4. Delete compiled `packages/vscode-extension/out/...Hololand...` artifacts from HoloScript; recreate source in Hololand repo if needed.

### P4 — Verify no orphan references

After any move, run:

```bash
cd /c/Users/Josep/Documents/GitHub/HoloScript
grep -rn "hololand\|HoloLand\|Hololand" packages/ --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v dist | grep -v ".d.ts"
```

Zero matches (except docs and this audit) is the success criteria.

---

## Verification Commands

```bash
# Reproduce this classification — count all HoloLand-branded files
find /c/Users/Josep/Documents/GitHub/HoloScript \
  -type f \( -iname "*hololand*" -o -iname "*hololand*" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.vitepress/dist/*" \
  -not -path "*/dist/*" | sort

# Count lines of TS source in the core hololand/ module
wc -l /c/Users/Josep/Documents/GitHub/HoloScript/packages/core/src/hololand/*.ts | tail -1

# Count TS-only packages (context from prior audit)
for dir in /c/Users/Josep/Documents/GitHub/HoloScript/packages/*/; do
  has_ts=$(find "$dir" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" | head -1)
  has_holo=$(find "$dir" -maxdepth 3 \( -name "*.holo" -o -name "*.hs" -o -name "*.hsplus" \) | head -1)
  [ -n "$has_ts" ] && [ -z "$has_holo" ] && echo "$(basename "$dir")"
done | wc -l
```

---

*End of classification. Follow-up tasks for P1–P4 should be filed on the HoloMesh board per F.025.*
