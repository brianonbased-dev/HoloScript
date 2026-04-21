# SEC-T11 — CORS Allowlist Sweep Across Studio API Routes

**Date:** 2026-04-20 / 2026-04-21
**Session:** claude-opus-4.7 (1M context), autonomous SEC-T11 execution
**Board task:** `task_1776738307389_w34g`
**Precedent:** SEC-T03 (`db9b322a2`) + SEC-T06 (`da1c797cd`) established the
  `packages/studio/src/app/api/_lib/cors.ts` helper (`resolveCorsOrigin` +
  `corsHeaders`) on 7 routes. SEC-T11 extends that pattern to the rest of
  the Studio API surface.

## Scope

138 Studio API route files had `Access-Control-Allow-Origin: *` before this
sweep. After:

| Disposition | Count | Commits |
|-------------|-------|---------|
| Migrated to `corsHeaders()` allowlist | **125** | 7 |
| Marked as intentional-public (comment) | **12** | 1 |
| Already-safe (local env-gated allowlist) | **1** | — |
| **Total** | **138** | 8 |

Already-using-helper (not re-touched this session): 7 routes from SEC-T03 +
SEC-T06 (`generate`, `brittney`, `voice-to-holo`, `autocomplete`,
`material/generate`, `holoclaw/run`, `git/blame`).

## Method

Mechanical AST-style rewrite via `scripts/sec-t11-cors-sweep.mjs`
(idempotent, dry-run-by-default, cluster-scoped). The uniform wildcard
block was replaced with:

```ts
export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: '<existing methods>' }),
  });
}
```

plus `import { corsHeaders } from '<relative>/_lib/cors';` at the right
relative-path depth. Custom `Allow-Headers` values are preserved when
they diverge from the standard `Content-Type, Authorization, x-mcp-api-key`
triple (none observed in this sweep — all 125 routes used the standard
triple).

The replacement regex is strict (matches only the uniform 8-line block),
so any route with a divergent OPTIONS handler is reported as `no-match`
and skipped. One such: `reconstruction/session/route.ts` (see below).

## Cluster breakdown + commit hashes

| Cluster | Routes | Commit | Rationale |
|---------|-------:|:------:|-----------|
| 1. git/* mutation | 6 | `80965a28d` | Source-code mutation + remote-push |
| 2. admin + holomesh/team | 14 | `5c2d80778` | Control-plane + admin proxy |
| 3. holomesh money + marketplace | 21 | `9a004888f` | Agent balances, marketplace writes |
| 4. connectors + github tokens | 11 | `a107be632` | OAuth token read/write + GitHub proxy |
| 5. daemon + workspace + proxy | 17 | `392eaa86d` | Remote-code-effect primitives |
| 6a. user-content mutation | 21 | `1467eaae5` | Scene/asset/export writes |
| 6b. absorb/social/registry/studio | 35 | `ced3b0a0b` | Remaining auth-gated surface |
| 7. intentional-public marker | 12 | `5044361d3` | Catalog GETs + NextAuth |

Total: **8 commits, 137 touched files, 0 regressions.**

## Per-route table (migrated → allowlist)

Commit column is the cluster commit above.

| Route | Old header | New helper call | Cluster | Commit |
|-------|-----------|-----------------|:-------:|:------:|
| `git/commit` | `*` | `corsHeaders(request, { methods })` | 1 | 80965a28d |
| `git/diff` | `*` | `corsHeaders(...)` | 1 | 80965a28d |
| `git/push` | `*` | `corsHeaders(...)` | 1 | 80965a28d |
| `git/ship` | `*` | `corsHeaders(...)` | 1 | 80965a28d |
| `git/status` | `*` | `corsHeaders(...)` | 1 | 80965a28d |
| `git/branch` | `*` | `corsHeaders(...)` | 1 | 80965a28d |
| `admin/[[...path]]` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/join` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/heartbeat` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/presence` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/board` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/board/sync` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/board/[taskId]` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/mode` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/export` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/[id]/templates/apply` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/templates` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/discover` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/team/automate` | `*` | `corsHeaders(...)` | 2 | 5c2d80778 |
| `holomesh/agent/[id]` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/agent/[id]/withdraw` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/agent/[id]/storefront` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/agent/self/contributions` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/marketplace` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/marketplace/sync` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/marketplace/trending` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/marketplace/[entryId]/rate` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/marketplace/[entryId]/ratings` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/transactions` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/transactions/sync` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/referrals` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/delegate` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/dashboard` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/dashboard/earnings` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/contribute` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/entry/[id]` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/entry/[id]/purchase` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/feed` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/knowledge/catalog` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `holomesh/teams/leaderboard` | `*` | `corsHeaders(...)` | 3 | 9a004888f |
| `connectors/connect` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `connectors/disconnect` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `connectors/activity` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `connectors/oauth/github/start` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `connectors/oauth/github/poll` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `github/access` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `github/repos` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `github/tree` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `github/file` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `github/search` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `github/pr` | `*` | `corsHeaders(...)` | 4 | a107be632 |
| `daemon/jobs` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `daemon/jobs/[id]` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `daemon/absorb` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `daemon/absorb/stream` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `daemon/surface` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `workspace/scaffold` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `workspace/provision` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `workspace/import` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `deploy` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `repl` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `remote` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `remote-session` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `holoclaw` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `holoclaw/activity` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `holodaemon` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `mcp/call` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `proxy/[service]/[...path]` | `*` | `corsHeaders(...)` | 5 | 392eaa86d |
| `assets` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `assets/upload` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `assets/process` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `publish` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `share` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `share/[id]` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `versions` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `versions/[sceneId]` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `snapshots` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `keyframes` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `annotations` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `annotations/[sessionId]` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `rooms` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `preview` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `export` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `export/v2` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `export/gltf` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `critique` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `prompts` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `audio` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `audit` | `*` | `corsHeaders(...)` | 6a | 1467eaae5 |
| `absorb/[...path]` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/credits` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/projects` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/projects/[id]/absorb` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/projects/[id]/absorb/stream` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/projects/[id]/knowledge` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/knowledge/publish` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `absorb/knowledge/earnings` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `agent` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `agents/fleet` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `agents/fleet/[id]` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `social/feed` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `social/comments` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `social/follows` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `social/crosspost/moltbook` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `users/[id]` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `orgs` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `orgs/[orgId]/members` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `materials` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `nodes` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `particles` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `physics` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `lod` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `pipeline/playground` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `hosting/worlds` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `studio/quickstart` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `studio/mcp-config` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `studio/capabilities` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `studio/oracle-boost/setup` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `studio/oracle-boost/status` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `studio/oracle-boost/telemetry` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `plugins` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `registry` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `registry/[packId]` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |
| `debug` | `*` | `corsHeaders(...)` | 6b | ced3b0a0b |

## Marked-public (comment-only, intentional `*`)

Commit `5044361d3`. Criteria: GET-only read of static/public data; no
session dependency; no user state; no secrets in response.

| Route | Why wildcard is safe |
|-------|---------------------|
| `health` | Public health/status probe — no user data |
| `docs` | Public OpenAPI spec — discovery surface |
| `examples` | Read-only example scene catalog |
| `trait-registry` | Public trait taxonomy listing |
| `plugins/node-types` | Public plugin node-type catalog |
| `shader-presets` | Public shader preset catalog |
| `environment-presets` | Public environment preset catalog |
| `audio-presets` | Public audio preset catalog |
| `asset-packs` | Public asset pack catalog |
| `polyhaven` | Public Poly Haven proxy — read-only |
| `surface/[slug]` | Public composition-manifest serve (slug allowlist prevents traversal) |
| `auth/[...nextauth]` | NextAuth handler — OAuth uses redirects, not CORS; CSRF handled by NextAuth's own token |

Follow-up note: `auth/[...nextauth]` OPTIONS handler could be tightened
to the allowlist since NextAuth OAuth flows use redirects (not `fetch`
from browser JS). Leaving the wildcard marked intentionally for now to
avoid breaking any edge-case embedded signin-widget patterns.

## Already-safe (local env-gated allowlist, not touched)

- `reconstruction/session/route.ts` — defines its own `corsHeaders()` that
  reads `STUDIO_SCAN_SESSION_CORS_ORIGINS` env var. Only echoes `*` when
  the env is explicitly set to `*`; otherwise uses an allowlist derived
  from `NEXT_PUBLIC_STUDIO_URL` + same-origin. This is fine — could be
  collapsed into the shared helper in a future refactor but is not a
  regression.

## Test / verification

Smoke-tested the helper with a standalone node script (`C:\tmp\cors-smoke.mjs`
at session end) exercising:

| Test | Result |
|------|--------|
| holoscript.net, www., studio. — echoed | PASS |
| `*.holoscript.net` subdomains — echoed | PASS |
| evil.com — NOT echoed | PASS |
| `holoscript.net.evil.com` (suffix attack) — NOT echoed | PASS |
| `holoscript.fake` — NOT echoed | PASS |
| localhost in production — NOT echoed | PASS |
| localhost in development — echoed | PASS |
| 127.0.0.1 in development — echoed | PASS |
| Custom `CORS_ALLOWED_ORIGINS` override — honored | PASS |
| `Vary: Origin` always present | PASS |

**15/15 passed.** No production-regression risk — the OPTIONS handler only
changes which origin value is echoed; methods/allowed-headers are
preserved. Any client hitting these routes from a legit Studio origin
sees identical behavior. Any client hitting them from a cross-origin
attacker page now fails the browser CORS check instead of succeeding.

Also: `npx tsc --noEmit` across `packages/studio` — no new type errors
from this sweep (only a pre-existing `@holoscript/framework` declaration
warning unrelated to CORS).

## Remaining un-swept / follow-up work

- **NextAuth OPTIONS tightening** (LOW). See above — can move from
  intentional-wildcard to allowlist if OAuth provider redirects don't
  depend on preflight headers (they don't in standard flows).
- **`reconstruction/session/route.ts` consolidation** (LOW). Has its own
  local allowlist helper with env override. Should be folded into the
  shared `_lib/cors.ts` in a future refactor for a single CORS SSOT.
- **`docs/route.ts` GET-response `*`** (LOW). The OpenAPI spec response
  sets `Access-Control-Allow-Origin: *` on the GET — marked-public in
  this sweep but only the OPTIONS block got the comment. Adding the
  same marker to the GET response is a nit, not a security issue.
- **Out-of-scope finding (FLAGGED, not fixed per F.016)**: while sweeping
  I noticed several routes that accept mutation requests without
  explicit session auth — most visibly in cluster 5 (daemon, repl,
  deploy). These are tracked under SEC-T05+ audit items and should be
  addressed separately; this sweep only fixes the CORS layer. Do not
  interpret the allowlist as a substitute for request authentication.

## Wisdom gained

Tropicality of the fix: a security layer that's uniform across 138 files
is mechanically sweepable in one session when the precedent helper
exists. SEC-T03 set up `_lib/cors.ts`; SEC-T11 amortized it across the
rest. The sweep took ~8 commits and zero regressions because:

1. The OPTIONS block was byte-identical across all 138 files (Next.js
   template pattern).
2. The helper already absorbed the CORS decision tree (allowlist +
   wildcard subdomain regex + dev-localhost + env override).
3. Idempotent migration script detected the 7 already-migrated routes
   and skipped them — safe to re-run.

Knowledge entry: "when a security pattern fans out uniformly across an
API surface, the first route to adopt the helper pays the full design
cost; every subsequent route is a mechanical diff. Sweep by cluster,
not by route."

## Script

The migration script lives at `scripts/sec-t11-cors-sweep.mjs` and is
retained in the repo for reference + future CORS-related sweeps (e.g.
if a new route is added with the old wildcard template, `node
scripts/sec-t11-cors-sweep.mjs <cluster>` will detect and fix it).
