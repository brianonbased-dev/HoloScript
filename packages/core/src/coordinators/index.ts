/**
 * @holoscript/core/coordinators — consumer-bus infrastructure
 *
 * Per /stub-audit Phase 3.5 (commit 657e00d44) findings: Pattern E
 * (emit-without-listener) is systemic across the trait surface — 25/25
 * highest-emit traits have zero downstream consumers. The 4 cluster
 * groupings collapse into 4 shared consumer-bus infrastructures, each
 * one closing Pattern E for 3-6 traits at once via shared event vocabulary.
 *
 * **Buses planned** (per task_1777281302813_eezs):
 *   - AssetLoadCoordinator       — GLTF + USD + FBX (35 void events / 69 refs)
 *   - SecurityEventBus           — RBAC + SSO + Quota + Tenant + AuditLog + ForgetPolicy (75 / 19) [TODO]
 *   - GenerativeJobMonitor       — AiInpainting + AiTextureGen + ControlNet + DiffusionRealtime [TODO]
 *   - SessionPresenceCoordinator — SharePlay + SpatialVoice + WorldHeartbeat + Messaging [TODO]
 *
 * **Why core, not runtime**: this module is consumed by engine (which
 * provides TraitContextFactory as the canonical EventSource), runtime
 * (which may construct its own EventSource for browser scenarios), and
 * studio (which subscribes to coordinator state for loading-screen UI
 * + asset cache + scene-progress overlays). All three depend on core,
 * so core is the lowest-common-denominator location.
 *
 * **Pattern**: each coordinator is constructed with a duck-typed
 * `EventSource` (`{ on(event, handler) }`), subscribes once to a
 * domain-specific event vocabulary at construction, tracks per-key state,
 * and exposes `subscribe()` / `getState()` / `getStats()` / `reset()`
 * for downstream consumers. Bus discipline: a thrown listener never
 * crashes other listeners (mirrors StudioBus pattern).
 *
 * See AssetLoadCoordinator for the canonical template — its docstring
 * details the architectural rationale + replication notes for the
 * remaining 3 buses.
 */

export * from './AssetLoadCoordinator';
