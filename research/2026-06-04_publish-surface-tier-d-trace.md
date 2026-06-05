# Publish-surface audit — Tier-D privatization dependency trace

**Date:** 2026-06-04
**For board task:** `task_1780626223829_20ko` (team_1777834718247_unr35n)
**Author:** claude (full-surface agent)

## Why
65 `@holoscript/*` packages are published (`private:false`). Only ~20 are the real
external developer surface; ~45 are libs/plumbing. Every public package is a
cold-consume surface that must be kept green — the W.669 publish-chain bug family
(uaal eager-import, mesh devDep⇄dep, core mesh-peer contradiction) scales with this
count. Shrinking the public surface shrinks the bug farm.

## Tier map
- **A — Public spine (CI cold-consume gated):** core · engine · mesh · platform · framework · runtime · cli
- **B — Start/embed/extend (external):** create-holoscript · cdn · preview-component · r3f-renderer · partner-sdk · studio-plugin-sdk · formatter · linter · lsp · wasm · tree-sitter-holoscript · holoscript-vscode
- **C — Standalone domain libs (publishable, niche):** crdt · crdt-spatial · spatial-index · snn-webgpu · holoembed · holo-vm · uaal · std · core-types · mvc-schema · agent-protocol · security-sandbox · ai-validator · llm-provider · animation-presets · holomap · visual
- **D — Internal plumbing/services (public only incidentally):** the 25 below.

## Dependency trace (NECESSARY condition only)
"SAFE" below means **no other PUBLISHED monorepo package depends on it**, so setting
`private:true` will not break the inter-package cold-consume graph. It does **NOT**
mean the package is safe to privatize outright — see the caveat.

### SAFE by graph (17 — no published dependents)
mcp-server · marketplace-api · graphql-api · adapter-postgres · connector-github ·
connector-railway · connector-upstash · connector-vscode · connector-appstore ·
connector-moltbook · hologram-worker · studio-ui-graph · studio-bridge ·
holoscript-agent · aibrittney · benchmark · comparative-benchmarks

### BLOCKED by graph (8 — depended-on by a published package; privatizing breaks it)
- `absorb-service`   ← cli, mcp-server
- `registry`         ← marketplace-api
- `marketplace-agentkit` ← marketplace-api
- `auth`             ← graphql-api, marketplace-api
- `config`           ← absorb-service, holoembed, mcp-server
- `secrets-broker`   ← mcp-server
- `connector-core`   ← connector-{appstore,github,moltbook,railway,upstash,vscode}
- `hololand-platform`← cli, mcp-server

## CRITICAL caveat — graph-safe ≠ product-safe
A "SAFE" package still needs two more checks before flipping `private:true`:
1. **Is it an intended external product?** Some SAFE-by-graph packages are plausibly
   installed directly by outside users: `mcp-server` (`npx @holoscript/mcp-server`),
   `holoscript-agent` (headless agent runtime), `marketplace-api`/`graphql-api`
   (API layers a partner might run). Privatizing these would remove a real product.
2. **Is it consumed by a deploy?** Railway services may `npm i @holoscript/<pkg>` at
   build time even with no monorepo dependent. Privatizing such a package fails the
   next deploy (F.102 deploy-chain risk). Check each service's install manifest.

Existing published versions stay on the registry after `private:true` — privatizing
only stops FUTURE publishes. The break mode is: a public/deployed consumer bumps and
references a dep version that never gets published → cold-consume fails at next bump.

## Recommended execution order (for the task owner)
1. Start with the unambiguous internal-tooling SAFE set — `benchmark`,
   `comparative-benchmarks`, `aibrittney`, `studio-ui-graph`, `studio-bridge`,
   `adapter-postgres` — verify no deploy installs them, then `private:true`.
2. The 6 leaf `connector-*` are Studio-integration-hub internals; privatize together
   with `connector-core` only AFTER confirming no external plugin ecosystem consumes
   them (they form a closed subgraph: leaves ← connector-core).
3. Treat `mcp-server`, `holoscript-agent`, `marketplace-api`, `graphql-api` as
   PRODUCT decisions, not cleanup — leave public unless a product owner says otherwise.
4. The 8 BLOCKED stay public until their dependents are also privatized (or never).
5. Re-run both cold-consume gates after any flip:
   `node scripts/holo-ci/cold-consume-check.mjs packages/core @holoscript/core`
   and `node scripts/cold-consume-check.mjs`.

## Method
`dependencies` (excluding dev/peer) across every `private:false` package.json,
reverse-mapped to published dependents. Peer/optional deps intentionally excluded —
they are not pulled on a cold consumer install (the whole point of the W.669 fixes).
