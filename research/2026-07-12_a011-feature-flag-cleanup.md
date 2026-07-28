# A-011 Feature Flag Cleanup — 2026-07-12

Board task: `task_1783478611742_zm92`

Scope:

- `C:\Users\Josep\Documents\GitHub\HoloScript`
- `C:\Users\josep\.ai-ecosystem`

## Method

Inventory was defined from actual code paths first, then compared against
operator-facing templates and prior A-011 reports.

Read-only commands used:

```powershell
rg -n "process\.env|import\.meta\.env" -g "!node_modules/**" -g "!dist/**" -g "!coverage/**" -g "!.next/**" -g "!.scratch/**" -g "!research/benchmark-raw/**" -g "!*.log" -S
rg -n "FEATURE|EXPERIMENTAL|ENABLE_|DISABLE_|ALLOW_|FORCE_" -g "!node_modules/**" -g "!dist/**" -g "!coverage/**" -g "!.next/**" -g "!.scratch/**" -g "!research/benchmark-raw/**" -g "!*.log" -S
```

Prior context consumed:

- `research/2026-06-08_a011-feature-flag-audit.md`
- `research/2026-06-21_a011-feature-flag-cleanup.md`
- `research/2026-07-03_a011-feature-flag-cleanup.md`

## Fresh Findings

### F1 — `packages/studio/.env.example` still advertises template-only feature flags

The old `.env.production` dead-flag issue reported on 2026-06-08 is resolved,
but the Studio template still advertises several feature/dev/optimization flags
with no live runtime readers in source:

| Flag                                     | Evidence                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ENABLE_COLLABORATION`       | only `packages/studio/.env.example`, archived deployment docs, and prior audit report |
| `NEXT_PUBLIC_ENABLE_MARKETPLACE`         | only `packages/studio/.env.example`, archived deployment docs, and prior audit report |
| `NEXT_PUBLIC_ENABLE_CLOUD_DEPLOY`        | only `packages/studio/.env.example`, archived deployment docs, and prior audit report |
| `NEXT_PUBLIC_ENABLE_PLUGINS`             | only `packages/studio/.env.example`, archived deployment docs, and prior audit report |
| `NEXT_PUBLIC_ENABLE_VERSION_CONTROL`     | only `packages/studio/.env.example` and prior audit report                            |
| `NEXT_PUBLIC_ENABLE_DEBUG_PANEL`         | only `packages/studio/.env.example` and prior audit report                            |
| `NEXT_PUBLIC_ENABLE_PERFORMANCE_METRICS` | only `packages/studio/.env.example` and prior audit report                            |
| `ENABLE_SECURITY_HEADERS`                | only `packages/studio/.env.example` and prior audit report                            |
| `ENABLE_CSP`                             | only `packages/studio/.env.example` and prior audit report                            |
| `ENABLE_COMPRESSION`                     | only `packages/studio/.env.example` and prior audit report                            |
| `ENABLE_REQUEST_LOGGING`                 | only `packages/studio/.env.example` and prior audit report                            |
| `NEXT_PUBLIC_HMR`                        | only `packages/studio/.env.example`                                                   |
| `NEXT_PUBLIC_SHOW_DEV_TOOLS`             | only `packages/studio/.env.example`                                                   |
| `MOCK_MARKETPLACE_API`                   | only `packages/studio/.env.example`                                                   |
| `MOCK_CLOUD_API`                         | only `packages/studio/.env.example`                                                   |
| `MOCK_COLLABORATION_WS`                  | only `packages/studio/.env.example`                                                   |
| `NEXT_PUBLIC_OPTIMIZE_IMAGES`            | only `packages/studio/.env.example`                                                   |
| `LOG_FORMAT`                             | only `packages/studio/.env.example`                                                   |
| `STATIC_ASSET_MAX_AGE`                   | only `packages/studio/.env.example`                                                   |

These are not safe for automation to delete unilaterally because `.env.example`
is operator-facing documentation and some names may be placeholders for planned
Studio wiring. They are, however, real cleanup debt: a developer can set them and
believe they affect runtime behavior when they do not.

### F2 — live security/custody toggles remain intentional

Rechecked the meaningful live flags called out by prior A-011 passes:

- `STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK` / `ALLOW_SERVER_GITHUB_TOKEN_FALLBACK`
- `BRITTNEY_ALLOW_FRONTIER_FALLBACK`
- `ALLOW_MOCK_X402`
- `MCP_ENABLE_SSE`
- `HOLOCI_ALLOW_MISSING_WORKLOAD`
- `HOLOMESH_TEST_DISABLE_*` persistence switches

The live flags either have safe defaults, tests, explicit development/mock
semantics, or migration context. No narrow code deletion was safe in this pass.

## Action Taken

Filed one dedupable board follow-up:

- Clean or wire template-only Studio `.env.example` flags

No source cleanup was landed because the only fresh issue is a documentation /
operator-template mismatch that needs Studio owner choice: remove the dead
template keys, wire them to code, or annotate them as placeholders.

## Validation

```powershell
git diff --check -- research/2026-07-12_a011-feature-flag-cleanup.md
```

Result: pass.
