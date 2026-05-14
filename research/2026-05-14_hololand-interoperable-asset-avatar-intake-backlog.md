# HoloLand Interoperable Asset & Avatar Intake — Scoped Backlog

> **Canary**: `task_1778732219586_folh`  
> **Date**: 2026-05-14  
> **Status**: Scoped — ready for board task derivation  
> **Authority**: `docs/processes/hololand-to-holoscript-substrate-requests.md` (upstream vs keep-local decision tree)  

---

## 1. Source Seed Status

The task description references two source seeds:
- `archive_hololand-ecosystem-building-the-future-today`
- `archive_hololand-growth-strategy-achieving-high-level-traction`

**Finding**: Neither seed file exists in `idea-seeds/` (archive-farm, research-farm, or root). They do not appear in `idea-seeds/TRIAGE.md` (generated 2026-05-12). This backlog was scoped by direct substrate reconciliation instead of seed promotion.

**Action**: If these seeds were intended to be generated from an external source (e.g., TrainingMonkey, Moltbook harvest, or HoloLand repo), a follow-up task should verify their origin and backfill them to `idea-seeds/archive-farm/`.

---

## 2. Substrate Reconciliation Summary

| Backlog Slice | Current Substrate | Gap | Upstream Verdict |
|---|---|---|---|
| GLTF/FBX ingest | `AssetManifest` / `SmartAssetLoader` support `.glb` only (`inferAssetType('glb')` → `model/gltf-binary`). No `.gltf` (JSON+bin), no `.fbx`. | No multi-format ingest pipeline; no validation for GLTF separate geometry/texture layouts; no FBX-to-runtime conversion. | **UPSTREAM** to `@holoscript/core` asset system + compiler target |
| Avatar portability | NPCs have `modelUrl: string` + generic `traits: string[]`. No avatar schema (skeleton, retargeting, VRM). | No avatar-specific data model; no interoperability with ReadyPlayerMe / VRM / Meta avatars; no animation retargeting trait. | **UPSTREAM** to `@holoscript/core` traits (`@avatar`, `@vrm`, `@retarget`) |
| Input abstraction | `InputManager` exists in `@holoscript/engine` (re-exported via `hololand-runtime.ts`). No HoloLand MCP tool or config API. | No runtime-agnostic input mapping schema; no hand/eye/gamepad/keyboard abstraction layer exposed through MCP or world config. | **UPSTREAM** to `@holoscript/runtime` input subsystem + MCP tool |
| Webhooks / API data bridges | `marketplace-api` VRR twin stub accepts `inventory_api` string. No webhook registration, event subscription, or generic bridge. | No `@connector` trait; no webhook ingress/egress substrate; no event fanout. | **UPSTREAM** as `@webhook` / `@connector` trait or runtime service |
| Real-world POS / inventory / IoT bridges | Same `inventory_api` stub. No POS connector, no IoT sensor ingestion, no real-world data bridge. | Domain-specific but generalizable as `@iot_bridge` / `@pos_connector`. Needs schema for SKU, telemetry, geofence trigger. | **UPSTREAM** generalized bridge trait; **KEEP** vendor-specific adapters in HoloLand |

---

## 3. Buildable Backlog Slices

### Slice A: GLTF / FBX Ingest Pipeline

**What exists today**
- `AssetManifest.addAsset({ id, path, name })` — path can be any string, but loader logic only exercises `.glb`.
- `inferAssetType('glb')` → `'model'`; `getMimeType('glb')` → `'model/gltf-binary'`.
- Compiler targets: R3F, Three.js, Unity, Unreal, Babylon. All can consume GLTF/FBX if converted correctly.

**What's missing**
- `inferAssetType('gltf')` and `inferAssetType('fbx')` with correct MIME types.
- `AssetValidator` rules for GLTF separate-file layout (`.gltf` + `.bin` + textures).
- FBX-to-GLB or FBX-to-native-mesh conversion step in the compiler pipeline.
- `SmartAssetLoader` batch loading for multi-file GLTF assets.

**Buildable tasks**
1. **A-1**: Extend `inferAssetType` / `getMimeType` to cover `.gltf`, `.glb`, `.fbx`, `.obj`, `.stl` (verify via `packages/core/src/types.ts` asset type union).
2. **A-2**: Add `AssetValidator.gltf()` — check JSON schema conformance, buffer existence, texture resolution limits.
3. **A-3**: Add compiler FBX ingestion stub — either native Three.js `FBXLoader` integration or conversion to `.glb` via `fbx2gltf` WASM. Start with Three.js target since HoloLand uses it.
4. **A-4**: `SmartAssetLoader.loadBatch` support for multi-file GLTF (parallel `.bin` + texture fetch).

**Upstream target**: `@holoscript/core` (`AssetManifest`, `AssetValidator`, `SmartAssetLoader`, compiler pipeline).
**HoloLand keep-local**: HoloLand-branded asset store UI, HoloLand-specific CDN caching policy.

---

### Slice B: Avatar Portability

**What exists today**
- NPC record: `{ modelUrl?: string, traits: string[], role: string, behavior: string }`.
- `packages/core/src/barrel/hololand-runtime.ts` re-exports `AnimationSystem` (implied via `@animated` trait availability).

**What's missing**
- No avatar schema: skeleton definition, bone mapping, animation clips, retargeting rules.
- No VRM support (VRM is the de-facto standard for portable VR avatars).
- No interoperability path: ReadyPlayerMe → VRM → HoloScript avatar.
- No avatar config in `createWorldDefinition` or `createWorldConfig`.

**Buildable tasks**
1. **B-1**: Define `AvatarSchema` in `@holoscript/core` — skeleton, boneMap, animationClips, retargetRules, LOD variants.
2. **B-2**: `@vrm` trait — loads `.vrm` via `@pixiv/three-vrm` or equivalent, exposes expression/morph targets.
3. **B-3**: `@retarget` trait — animation retargeting from source skeleton to avatar skeleton (useful for Mixamo → custom avatar).
4. **B-4**: NPC `modelUrl` upgrade — accept `.vrm`, auto-detect avatar type, apply `@vrm` + `@retarget` if needed.
5. **B-5**: World config `avatarPool` — list of approved avatar assets per world, with default fallback.

**Upstream target**: `@holoscript/core` traits + `@holoscript/engine` avatar subsystem.
**HoloLand keep-local**: HoloLand avatar marketplace, HoloLand-branded default avatars, social-graph avatar unlocking.

---

### Slice C: Input Abstraction

**What exists today**
- `InputManager` from `@holoscript/engine` is re-exported in `hololand-runtime.ts`.
- No configuration surface in `createWorldConfig` or MCP tools.

**What's missing**
- No schema for input mappings (keyboard → action, gamepad button → action, hand gesture → action, eye-gaze → selection).
- No runtime-agnostic input abstraction — world authors write to `InputManager` directly, which couples them to the engine.
- No MCP tool to query or update input mappings for a running world.

**Buildable tasks**
1. **C-1**: `InputMappingSchema` in `@holoscript/core` — action → { source, binding, modifiers, deadzone, hapticFeedback }.
2. **C-2**: `@input_map` trait — attaches to world or zone, defines default + override mappings.
3. **C-3**: `InputManager` bridge — consume `@input_map` trait at runtime, dispatch to engine-native listeners.
4. **C-4**: MCP tool `update_input_mapping(worldId, action, binding)` — live rebind without redeploy.

**Upstream target**: `@holoscript/core` trait + `@holoscript/engine` input subsystem + `@holoscript/mcp-server` tool.
**HoloLand keep-local**: HoloLand default control schemes (Quest-specific gesture set), accessibility remapping UI.

---

### Slice D: Webhooks / API Data Bridges

**What exists today**
- `marketplace-api` `POST /create-vrr-twin` accepts `{ inventory_api: string }` — a URL string with no protocol.
- `BindingManager` / `createBinding` exist for reactive data connections inside the world.
- No external data ingress/egress substrate.

**What's missing**
- No `@webhook` or `@connector` trait.
- No event schema for external systems → HoloScript world (webhook payload → entity update).
- No egress schema for world events → external API (player entered zone → POST to CRM).
- No authentication/secret management for bridge credentials (should use `secrets-broker`).

**Buildable tasks**
1. **D-1**: `@webhook_ingress` trait — define endpoint URL, event filter, payload transformer, target entity property.
2. **D-2**: `@api_egress` trait — define trigger condition, HTTP method, URL template, auth secret ref, retry policy.
3. **D-3**: Secrets-broker integration — bridge credentials stored via `@holoscript/secrets-broker`, never hardcoded in world definitions.
4. **D-4**: Runtime bridge executor — a headless Node service or edge function that receives webhooks, validates HMAC, and calls `StreamProtocol` to inject state.
5. **D-5**: MCP tools: `create_webhook_bridge`, `create_api_egress`, `list_bridges`, `delete_bridge`.

**Upstream target**: `@holoscript/core` traits + `@holoscript/mcp-server` tools + `@holoscript/secrets-broker` integration.
**HoloLand keep-local**: HoloLand-specific partner integrations (Shopify, Stripe, Square) that use the generic bridge substrate.

---

### Slice E: Real-World POS / Inventory / IoT Bridges

**What exists today**
- Same `inventory_api` stub as Slice D.
- `Location Quest` system (GPS radius, check-in, streak, timegate) — proves geospatial trigger substrate exists.
- `Place` system (lat/lng/alt/radius) — proves real-world venue binding exists.

**What's missing**
- No SKU/inventory schema bridge between external POS and HoloScript `Item` / `LootTable`.
- No IoT telemetry ingestion (temperature, occupancy, motion) → world state.
- No POS transaction → world reward mapping ("buy coffee → get in-world item").

**Buildable tasks**
1. **E-1**: `@pos_connector` trait — maps external SKU to `Item` ID, syncs stock count, price, currency. Supports generic REST + webhook.
2. **E-2**: `@iot_sensor` trait — binds sensor ID (MQTT topic or HTTP endpoint) to world property (zone temperature, crowd density). Uses `@api_egress`/`@webhook_ingress` as transport.
3. **E-3**: `@reward_gate` trait — ties external transaction receipt (POS, blockchain, API) to `Quest` completion or `Item` grant.
4. **E-4**: Reference implementation: Shopify/Square adapter in HoloLand repo (consumes generic `@pos_connector` trait, implements vendor-specific auth + webhook parsing).

**Upstream target**: `@holoscript/core` traits (`@pos_connector`, `@iot_sensor`, `@reward_gate`).
**HoloLand keep-local**: Vendor-specific adapters (Shopify, Square, Toast, custom IoT gateway), branded loyalty program logic.

---

## 4. Implementation Priority

| Priority | Slice | Task | Rationale |
|---|---|---|---|
| P1 | A | A-1, A-2 | Asset type inference is a one-line change; validator is additive and low-risk. Unblocks A-3/A-4. |
| P1 | C | C-1, C-2 | Input abstraction blocks accessibility compliance and multi-platform world shipping. Schema-first, no runtime risk. |
| P2 | B | B-1, B-2 | Avatar schema is foundational for B-3/B-4/B-5. VRM support is high user-visible value. |
| P2 | D | D-1, D-3 | Webhook ingress + secrets-broker integration unlocks all external data use cases. D-3 is security-critical. |
| P3 | A | A-3, A-4 | FBX conversion and multi-file GLTF batch loading are larger compiler/runtime changes. Depend on A-1/A-2. |
| P3 | D | D-2, D-4, D-5 | API egress + bridge executor + MCP tools are medium size. Depend on D-1/D-3. |
| P3 | E | E-1, E-2, E-3 | POS/IoT traits are thin wrappers around D's bridge substrate. Build after D is solid. |
| P4 | B | B-3, B-4, B-5 | Retargeting and NPC upgrade are refinements. Build after B-1/B-2. |
| P4 | E | E-4 | Reference adapter is HoloLand-only. Build after upstream traits land. |

---

## 5. Substrate Request Compliance

Per `docs/processes/hololand-to-holoscript-substrate-requests.md`, every slice above passes the decision tree:
- **Generalizes?** Yes — a hospital twin, museum, arena, or retail space would reuse asset ingest, avatar portability, input abstraction, and data bridges.
- **HoloLand-specific glue?** Vendor adapters (Shopify, Square), branded UI, CDN caching policy, social-graph avatar unlocking.
- **Prior art?** `AssetManifest`, `InputManager`, `BindingManager`, `Location Quest`, `Place` — all exist and can be extended.
- **Acceptance criteria?** Each task above lists a substrate-level acceptance criterion (trait lands in correct package, tests cover generalized behavior, no HoloLand-branded strings).

---

## 6. Recommended Next Actions

1. **File board tasks** for P1/P2 slices (A-1, A-2, C-1, C-2, B-1, B-2, D-1, D-3) on HoloScript Core team board.
2. **Backfill source seeds** — investigate whether the two missing archive seeds exist in TrainingMonkey, Moltbook, or HoloLand repo; if found, migrate to `idea-seeds/archive-farm/` and re-run triage.
3. **Claim and execute A-1** — it is the smallest scoped task (extend `inferAssetType` / `getMimeType`) and unblocks the rest of Slice A.

---

*Scoped by Claude (claude-code) as claim on `task_1778732219586_folh`.*
