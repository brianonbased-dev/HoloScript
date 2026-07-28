# A-011 Feature Flag Audit — 2026-06-08

Auditor: claudecode-claude-x402  
Scope: `C:\Users\Josep\Documents\GitHub\HoloScript` + `C:\Users\Josep\.ai-ecosystem`  
Method: grep-based inventory from actual code paths -> classify -> narrow safe edits + board tasks for the rest

---

## 1. Flag Inventory

### 1.1 Runtime Boolean Gate Flags (HoloScript packages)

| Flag                               | File                                                                                                         | Default                                 | Notes                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `HOLOMESH_V2_ENABLED`              | `packages/core/src/cli/holoscript-runner.ts:2631`                                                            | false (opt-in)                          | Gates P2P DID + CRDT snapshot + peer store; V3 wallet independent                                               |
| `HOLOMESH_WALLET_ENABLED`          | same + `mcp-server/src/holomesh/holomesh-tools.ts:1372`                                                      | false                                   | V3 wallet feature; safe opt-in                                                                                  |
| `HOLOMESH_WALLET_TESTNET`          | same                                                                                                         | false                                   | Testnet mode when wallet enabled                                                                                |
| `HOLOMESH_VAULT_LEASE_ENFORCE`     | `mcp-server/src/holomesh/holomesh-tools.ts:60`, `absorb-provenance-tools.ts:181`, `hologram-mcp-tools.ts:24` | false (passthrough)                     | Migration flag: when set, secrets gated by active task lease. Currently unset = no enforcement. Phase 3 target. |
| `BYPASS_DETECTION_ENABLED`         | `mcp-server/src/security/bypass-detection.ts:24`                                                             | true (enabled unless explicitly =false) | Security gate — inverted default (disable requires explicit =false)                                             |
| `OAUTH_MIGRATION_MODE`             | `mcp-server/src/auth/oauth2-provider.ts:73`, `http-server.ts:216,220,3621`, `security/oauth21.ts:50`         | permissive                              | 4 call sites. Legacy API key still accepted when permissive. No production override observed. Migration debt.   |
| `OAUTH_REQUIRE_DPOP`               | `mcp-server/src/auth/oauth2-provider.ts:76`, `security/oauth21.ts:53`                                        | false                                   | DPoP (RFC 9449) not enforced in production                                                                      |
| `ALLOW_MOCK_X402`                  | `mcp-server/src/trait-tools.ts:148`                                                                          | false                                   | x402 mock for dev; clearly labeled mock_payment in response                                                     |
| `HOLOSCRIPT_SOVEREIGN_MOCK`        | `packages/core/src/world/WorldGeneratorService.ts:106`, `mcp-server/src/generators.ts:816`                   | false                                   | Mock sovereign LLM output; dev-only                                                                             |
| `MCP_AUTOSCALE_ENABLED`            | `mcp-server/src/ops/railway-autoscale-loop.ts:65`                                                            | false (opt-in)                          | Railway autoscale loop                                                                                          |
| `MCP_ENABLE_SSE`                   | `mcp-server/src/http-server.ts:149`                                                                          | true when not on Railway                | SSE transport; disabled on Railway CDN                                                                          |
| `MCP_KEEP_ALIVE_ENABLED`           | `mcp-server/src/ops/keep-alive.ts:71`                                                                        | false (opt-in)                          | Self-ping keep-alive loop                                                                                       |
| `MCP_PREDICTIVE_LB_ENABLED`        | `mcp-server/src/ops/predictive-cloudflare-lb.ts:156`                                                         | false                                   | Cloudflare predictive LB                                                                                        |
| `MCP_PREDICTIVE_LB_DRY_RUN`        | `mcp-server/src/ops/predictive-cloudflare-lb.ts:172`                                                         | false                                   | Dry-run mode for predictive LB                                                                                  |
| `GIST_MANIFEST_REQUIRE_X402`       | `packages/studio/src/app/api/publication/gist-manifest/route.ts:73`                                          | false                                   | Legacy x402 enforcement; superseded by GIST_MANIFEST_X402_TIER                                                  |
| `STUDIO_SCAN_SESSION_PUBLIC_POST`  | `packages/studio/src/app/api/reconstruction/session/route.ts:51`                                             | false                                   | Disables auth on scan session creation when =1                                                                  |
| `STUDIO_SCAN_SESSION_REQUIRE_AUTH` | same:53                                                                                                      | auto in production                      | Explicit auth override                                                                                          |
| `REQUIRE_AUTH`                     | `packages/auth/src/index.ts:251`, `packages/graphql-api/src/server.ts:109`                                   | false                                   | Global auth gate (not set in .env)                                                                              |
| `REQUIRE_2FA`                      | `mcp-server/src/holomesh/routes/custodial-wallet-routes.ts:54` + identity-export                             | not set                                 | 2FA enforcement                                                                                                 |
| `VQE_ALLOW_STUB`                   | `packages/core/src/traits/VQERunnerTrait.ts:324`                                                             | false                                   | Stub VQE result; ratchet: fails honestly without it                                                             |
| `PHYSICS_FORCE_MOCK`               | `packages/engine/src/physics/__tests__/gpu-setup.ts:19`                                                      | false                                   | Test-only physics mock                                                                                          |
| `SNN_FORCE_MOCK`                   | `packages/snn-webgpu/src/__tests__/setup.ts:22`                                                              | false                                   | Test-only SNN WebGPU mock                                                                                       |
| `HOLOSCRIPT_AGENT_AUDIT_ENABLED`   | `packages/holoscript-agent/src/index.ts:486`                                                                 | 1 (on)                                  | Audit log; default-on is correct                                                                                |
| `HOLOSCRIPT_EDGE`                  | `packages/cli/src/edge.ts:260`                                                                               | (set by cli at runtime)                 | Set programmatically by CLI, not a manual toggle                                                                |
| `HOLO_STRICT`                      | `packages/studio/scripts/compile-holo-pages.ts`, `compile-view-registry.ts`                                  | false                                   | Strict mode for compile scripts                                                                                 |
| `NEXT_PUBLIC_REQUIRE_2FA`          | `packages/studio/src/app/settings/security/self-custody/page.tsx:67`                                         | not set                                 | Client-side 2FA bypass in dev                                                                                   |

### 1.2 Compiler Experimental Flags

| Flag                                                              | Location                                                         | Default       | Notes                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| `experimental: true` on `nextjs-api` dialect                      | `registerBuiltinDialects.ts:437`                                 | true          | Exposed in DialectInfo; NOT enforced — no gate blocks use in production |
| `experimental: true` on `node-service` dialect                    | `registerBuiltinDialects.ts:461` + `NodeServiceCompiler.ts:1258` | true          | Same — metadata only, no production warning/block                       |
| `CircuitBreakerDeployment.featureFlags.enableExperimentalTargets` | `CircuitBreakerDeployment.ts:1032`                               | !isProduction | Correct — off in production                                             |
| `CircuitBreakerDeployment.featureFlags.enableDetailedTracing`     | same                                                             | !isProduction | Correct                                                                 |
| `CircuitBreakerDeployment.featureFlags.enableProfilingEndpoint`   | same                                                             | !isProduction | Correct                                                                 |
| `CircuitBreakerDeployment.featureFlags.enableDebugDashboard`      | same                                                             | !isProduction | Correct                                                                 |
| `CircuitBreakerDeployment.featureFlags.enableMetricsEndpoint`     | same                                                             | true always   | Correct — metrics always on                                             |

### 1.3 Tenant Feature Flags (tier-gated, code-only)

`TenantFeatureFlags` in `packages/core/src/traits/TenantConfigSchema.ts` — 10 boolean flags gated by tenant tier (free/starter/professional/enterprise/unlimited). These are data-driven and correct; no cleanup needed.

### 1.4 BrowserRuntime config.features defaults

`packages/runtime/src/browser/BrowserRuntime.ts:875-878`:

- `monaco: true` — editor always on by default
- `brittney: false` — AI chat off by default (correct per F.112)
- `networking: false` — off by default
- `xr: true` — VR always on by default

All are caller-overridable; these are just defaults. No cleanup needed.

### 1.5 Studio Production Env Flags (.env.production) — DEAD

`packages/studio/.env.production` sets 11 NEXT*PUBLIC_ENABLE*\_ and ENABLE\_\_ flags, none of which are consumed anywhere in the codebase:

```
NEXT_PUBLIC_ENABLE_COLLABORATION=true
NEXT_PUBLIC_ENABLE_MARKETPLACE=true
NEXT_PUBLIC_ENABLE_CLOUD_DEPLOY=true
NEXT_PUBLIC_ENABLE_PLUGINS=true
NEXT_PUBLIC_ENABLE_VERSION_CONTROL=true
NEXT_PUBLIC_ENABLE_DEBUG_PANEL=false
NEXT_PUBLIC_ENABLE_PERFORMANCE_METRICS=false
ENABLE_SECURITY_HEADERS=true
ENABLE_CSP=true
ENABLE_COMPRESSION=true
ENABLE_REQUEST_LOGGING=true
```

Zero grep hits across `packages/studio/src/` for any of these keys. They were probably intended for a feature-flag library that was never wired. Dead variables — candidates for cleanup.

### 1.6 ai-ecosystem Boolean Flags

| Flag                               | File                                                      | Default | Notes                                                 |
| ---------------------------------- | --------------------------------------------------------- | ------- | ----------------------------------------------------- |
| `HOLOMESH_DISABLE_REQUEST_SIGNING` | `scripts/watch-substrate.mjs:566`                         | false   | Disables signing in watch-substrate; dev escape hatch |
| `SESSION_GIT_FETCH_DISABLE`        | `hooks/sessionstart/init-session.ts:35`                   | false   | Skips git fetch at session start                      |
| `A009_INGEST_DISABLE`              | `hooks/sessionstart/_archive/ingest-a009-gaps.mjs:36`     | false   | In \_archive — dead path                              |
| `GAP_INGEST_DISABLE`               | `hooks/sessionstart/_parked/ingest-gap-seeds.mjs:26`      | false   | In \_parked — dead path                               |
| `S_TST_REFRESH_DISABLE`            | `hooks/sessionstart/_parked/s-tst-refresh.mjs:18`         | false   | In \_parked — dead path                               |
| `GROK_DISABLE_SYCOPHANCY_PROBE`    | `hooks/lib/sycophancy-audit.mjs:67`                       | false   | Skips sycophancy probe; live hook                     |
| `HOLOMESH_DREAM_REPORT_DISABLE`    | `hooks/stop/session-report.mjs:575,578`                   | false   | Disables dream report in session handoff; live hook   |
| `AUDIT_FIX_PRESENCE_DISABLE`       | `services/fleet-trust-auditor/fleet-trust-auditor.mjs:22` | false   | Disables presence fix in fleet trust auditor          |

---

## 2. Findings

### F1 DEAD — studio .env.production has 11 unused flags (LOW RISK, cleanup)

`packages/studio/.env.production` declares 11 feature flags that are never read. Confusing and suggest missing wiring.  
Recommendation: Remove all 11 dead entries OR wire them to actual gate checks. Board task filed.

### F2 MIGRATION DEBT — OAUTH_MIGRATION_MODE defaults permissive at 4 call sites (MEDIUM RISK)

`OAUTH_MIGRATION_MODE` is permissive by default at all 4 call sites. Legacy API key auth accepted indefinitely unless explicitly set to strict. No production override set in any observed env file.  
Action: Board task to audit when migration can be promoted to strict default (requires verifying no active clients using legacy keys).

### F3 MIGRATION DEBT — HOLOMESH_VAULT_LEASE_ENFORCE unset (LOW RISK, note for Phase 3)

`HOLOMESH_VAULT_LEASE_ENFORCE` gates Phase 3 secret-lease enforcement. Currently unset = passthrough mode in production. This is intentional per migration design; the flag comment explicitly acknowledges the window.  
Action: No immediate change. Note as pending Phase 3 activation.

### F4 EXPERIMENTAL compilers have no production gate (LOW RISK)

`nextjs-api` and `node-service` dialects are registered with `experimental: true` but experimental is metadata-only in DialectRegistry — nothing prevents these from being dispatched in production without a warning.  
Recommendation: Add a log warning when an experimental dialect is compiled outside development. Board task filed.

### F5 GIST_MANIFEST_REQUIRE_X402 is superseded (LOW RISK, cleanup)

Documented as "Legacy" in code comment; `GIST_MANIFEST_X402_TIER` is the preferred replacement. Old flag still works.  
Recommendation: Deprecate with a runtime warning on use. Low priority. Board task filed.

### F6 DEAD — \_archive/\_parked hook flags (TRIVIAL)

`A009_INGEST_DISABLE`, `GAP_INGEST_DISABLE`, `S_TST_REFRESH_DISABLE` are in archived/parked hooks and not executed. No action needed.

### F7 UNSAFE DEFAULT — STUDIO_SCAN_SESSION_PUBLIC_POST (MEDIUM RISK — audit confirm)

`STUDIO_SCAN_SESSION_PUBLIC_POST=1` disables auth on the scan session creation endpoint. Default is safe (flag not set). Confirm it is not set in Railway production env vars for the studio service.

---

## 3. Safe Narrow Edits Made This Session

None — all findings require coordination or are noted for Phase 3 activation. The dead flags in `.env.production` warrant a board task so the studio owner confirms intent before deletion.

---

## 4. Verdict

- 26 runtime boolean flags inventoried across HoloScript
- 8 boolean flags inventoried in ai-ecosystem
- 2 flag systems (TenantFeatureFlags, CircuitBreaker) verified correct
- 11 dead flags in studio `.env.production` (never consumed)
- 1 migration flag at 4 call sites still defaulting permissive (OAUTH_MIGRATION_MODE)
- 2 experimental compilers with no enforcement gate
- 1 legacy superseded flag (GIST_MANIFEST_REQUIRE_X402)
- 3 board tasks filed for findings F1, F2/F4, F5
