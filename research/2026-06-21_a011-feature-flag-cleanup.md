# A-011 Feature Flag Cleanup

Date: 2026-06-21
Room task: `task_1781201603384_ikve`
Scope: weekly HoloShell automation audit across `C:\Users\Josep\Documents\GitHub\HoloScript` and `C:\Users\josep\.ai-ecosystem`.

## Method

Inventory came from live code paths first, not docs:

- scanned `process.env.*`, `process.env["KEY"]`, `import.meta.env.*`, and `Deno.env.get("KEY")`
- included live source directories: `packages`, `scripts`, `services`, `apps`, `src`, `hooks`, `automations`
- excluded generated/build/doc/example output: `node_modules`, `.git`, `.next`, `dist`, `build`, `.scratch`, `coverage`, `public`, `research`, `docs`, `examples`

Fresh extractor totals:

- `.ai-ecosystem`: 435 env keys, with 24 flag-like/security-gate keys in live code.
- `HoloScript`: 863 env keys, with 72 flag-like/security-gate keys in live code.

## Delta From Prior A-011 Audits

Resolved since `research/2026-06-08_a011-feature-flag-audit.md`:

- `packages/studio/.env.production` no longer carries the 11 dead `NEXT_PUBLIC_ENABLE_*` / `ENABLE_*` flags reported on 2026-06-08.
- `abtest` and `rollout` are no longer dead trait names; `ABTestTrait` and `RolloutTrait` now exist with tests.
- `GIST_MANIFEST_REQUIRE_X402` already has the recommended deprecation behavior: `GIST_MANIFEST_X402_TIER` wins, legacy maps to `required`, and production use logs a warning.

Reviewed higher-risk current toggles:

| Flag | Location | Current behavior | Verdict |
| --- | --- | --- | --- |
| `HOLOMESH_HTTP_ALLOW_UNSIGNED_FALLBACK` | `.ai-ecosystem/hooks/lib/holomesh-http.mjs` | explicit opt-in only after signing/body transform throws; default refuses unsigned mutating requests | safe default |
| `ALLOW_MISSING_FOUNDER_CHECKPOINT` | `.ai-ecosystem/scripts/provision-*.mjs` | explicit opt-in bypass for execute-mode provisioning checkpoint | risky if set, but not default-on; keep founder-custody workflow |
| `STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK` / `ALLOW_SERVER_GITHUB_TOKEN_FALLBACK` | `packages/studio/src/app/api/github/_shared.ts` | production default blocks ambient server token fallback unless explicitly enabled | safe default; alias is compatibility debt only |
| `FLEET_EXECUTOR_ENABLED` | `packages/studio/src/app/api/agents/fleet/dispatch/route.ts` | default false; non-dry-run still founder/session or fleet-service-token gated | safe default |
| `BRITTNEY_ALLOW_FRONTIER_FALLBACK` | `packages/studio/src/lib/brittney/provider.ts` | default false; restores paid frontier fallback only when explicitly set | safe default |
| `ALLOW_REGISTRATION` | `services/llm-service/src/server.ts` | registration remains disabled in production even if flag is set | safe default |

## Cleanup Landed

Narrow stale-flag cleanup:

- `packages/studio/docs/walkthrough.md`: primary x402 policy now documents `GIST_MANIFEST_X402_TIER=off|required|strict`; legacy flag kept only as compatibility note.
- `packages/studio/docs/SOVEREIGN_ORIGINATION_STACK.md`: publication API pointer now names the tiered flag.
- `packages/studio/docs/qa_smoke_run_xr.md`: QA setup now uses `GIST_MANIFEST_X402_TIER=off`; rejection test uses `required` or `strict`.
- `packages/studio/src/components/node-graph/NodeGraphPanel.tsx`: 402 CTA now says `GIST_MANIFEST_X402_TIER` instead of deprecated `GIST_MANIFEST_REQUIRE_X402`.

## Follow-Up

No new board task filed from this run. The remaining meaningful gates are intentional migration or safety toggles with safe defaults; deleting them would require owner coordination rather than an automation cleanup.
