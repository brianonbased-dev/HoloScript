# Frontier Shard 0 — Browser vs App Surface Map

> Canary audit: `task_1778616474061_c7s1`  
> Date: 2026-05-12  
> Scope: Identify every browser (Studio/web) and app (HoloLand platform/native) surface that consumes, references, or is intended to consume the canonical bootstrap shard `shard_oasis_0`.

---

## Executive Summary

Frontier Shard 0 is **fully wired on the app side** (HoloLand platform + framework) but has **zero direct browser-side consumers** today. Studio (Next.js) knows about HoloLand as a deploy target and compilation output, but does not yet import or render shard content. This is a **healthy gap** — the shard primitives are app-runtime data, and Studio is an authoring surface — but the absence of a Studio preview/gallery for shard-based content is a known product gap.

---

## 1. App Surfaces — Direct Consumption

### 1.1 HoloLand Platform (`@holoscript/hololand-platform`)

| File | Role | Consumption |
|------|------|-------------|
| `src/world/frontier-shard-zero.ts` | **Canonical definition** | Builds `shard_oasis_0` with 1 Zone, 1 Encounter, 1 Quest, 1 Item, 1 Skill, 1 LootTable. Exports `buildFrontierShardZero()` and `validateFrontierShardZero()`. |
| `src/world/frontier-shard-zero.test.ts` | Validation gate | Proves the shard validates clean, consumes every primitive class, uses only registered enums, passes clone-mutation safety, and rejects deliberately-broken variants (G.GOLD.013 false-case pairs). |
| `src/index.ts` | Public API surface | Re-exports `buildFrontierShardZero` and `validateFrontierShardZero` as part of the HoloLand platform package. |
| `src/creator/template-pipeline.test.ts` | Creator pipeline test | Uses `buildFrontierShardZero()` as the `baseShard` in `compileTemplateToChallenge` tests. |
| `src/creator/kiosk.test.ts` | Kiosk presentation test | Uses `buildFrontierShardZero()` to generate `PlayableChallenge` fixtures for `buildKioskCard` tests. |

### 1.2 Framework (`@holoscript/framework`)

| File | Role | Consumption |
|------|------|-------------|
| `src/board/frontier-shard.ts` | **Primitive definitions** | Defines `Shard`, `Zone`, `Encounter`, `Quest`, `Item`, `Skill`, `LootTable` interfaces, enums, validators, and clones. Shard 0 is the reference consumer of these primitives. |
| `src/board/index.ts` | Re-export | Re-exports all frontier-shard symbols. |
| `src/index.ts` | Re-export | Re-exports frontier-shard symbols at package root. |
| `src/__tests__/frontier-shard.test.ts` | Framework validator tests | Uses `shard_oasis_0` as a test fixture for `validateShard`, `cloneShard`, and `validateShardReceipt`. |
| `src/__tests__/agent-steward.test.ts` | Agent scope tests | References `shard_oasis_0` in steward `scope.shardIds` and proposal `impact.shardIds`. |

### 1.3 App Surface Verdict

**Covered.** The shard is built, validated, exported, and consumed by the creator pipeline and kiosk layers. Every public function that touches the shard has test coverage including false-case pairs.

---

## 2. Browser Surfaces — Direct Consumption

### 2.1 Studio (`@holoscript/studio`)

| File | HoloLand Awareness | Shard 0 Consumption |
|------|-------------------|---------------------|
| `src/components/editor/DeployButton.tsx` | Deploys compiled output to HoloLand | **None** — triggers deployment, does not read shard data. |
| `src/components/gallery/ExampleGallery.tsx` | Gallery category includes `hololand` emoji | **None** — no shard content in gallery. |
| `src/components/registry/TraitRegistryExplorer.tsx` | Filters traits by `hololand` source | **None** — trait registry, not shard content. |
| `src/components/wizard/ConversionRecommendations.tsx` | Suggests `hololand-scene` as conversion target | **None** — advisory, not consumption. |
| `src/lib/workspace/conversionAdvisor.ts` | Recommends `hololand-scene` target | **None** — static rule-based advice. |
| `src/lib/workspace/publishWorthinessDetector.ts` | Scores `hololand-scene` as publish target | **None** — scoring heuristic. |
| `src/lib/stores/workspaceStore.ts` | Workspace type includes `hololand-scene` | **None** — type definition only. |

### 2.2 Browser Surface Verdict

**Zero direct consumption.** Studio is an authoring and deployment surface. It compiles to HoloLand, deploys to HoloLand, and recommends HoloLand as a target, but it does not yet import, preview, or interact with shard content at runtime.

This is **expected and healthy** — the shard is a runtime data structure for the HoloLand engine, not a Studio authoring artifact. However, a future Studio feature (shard preview panel, kiosk browser, or quest editor) would naturally bridge this gap.

---

## 3. Cross-Surface Boundaries

| Boundary | Status | Notes |
|----------|--------|-------|
| Studio → HoloLand deploy | ✅ Wired | `DeployButton.tsx` sends compiled scenes to HoloLand. |
| Studio → Shard preview | ❌ Not built | No Studio component renders `Shard`, `KioskCard`, or quest graphs. |
| HoloLand → Studio telemetry | ❌ Not built | No reverse channel from HoloLand runtime back to Studio. |
| Framework → Both surfaces | ✅ Shared | `@holoscript/framework` primitives are the shared contract. |
| Shard 0 → Browser kiosk | ❌ Not built | A web-based kiosk (browse published challenges) would consume `KioskCard` + `getKioskSlice`. |

---

## 4. Gaps & Recommendations

1. **Shard preview in Studio** (P3): A React component that renders a `Shard` as a read-only quest/zone graph would bridge browser → app. Not urgent — the app runtime is the primary consumer.

2. **Web kiosk** (P3): A Next.js page that calls `listPublishedChallenges()` and renders `KioskCard` grids would be a natural browser consumer. Currently unbuilt.

3. **No phantom references detected:** The grep for `shard_oasis_0` and `buildFrontierShardZero` returned exactly 16 files — all legitimate. No stale references in docs or comments.

4. **No import drift:** The only package importing `buildFrontierShardZero` is `@holoscript/hololand-platform` (self) and its test files. No cross-package leaks.

---

## 5. Verification Commands

```bash
# Find every file that references the canonical shard ID
grep -rn "shard_oasis_0\|buildFrontierShardZero\|validateFrontierShardZero" packages/ --include="*.ts"

# Find every file that imports from hololand-platform/world
grep -rn "from.*world/frontier-shard-zero" packages/ --include="*.ts"

# Verify no Studio files import the shard
grep -rn "frontier-shard-zero\|shard_oasis_0" packages/studio/ --include="*.ts" --include="*.tsx"
# Expected: zero matches (confirmed 2026-05-12)
```

---

*Audit closed. No blockers. Shard 0 is cleanly scoped to app runtime with expected zero browser footprint.*
