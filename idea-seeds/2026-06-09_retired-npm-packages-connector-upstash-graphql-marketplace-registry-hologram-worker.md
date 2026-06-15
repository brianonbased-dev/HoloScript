# Retired npm packages — connector-upstash, connector-vscode, graphql-api, hologram-worker, holoscript-agent, marketplace-api, registry

**Date:** 2026-06-09
**Class:** retired-component
**Status:** seed
**Repository:** HoloScript
**Source context:** holo-ci/publish-surface SURFACE-SHRANK, workload ci-875511b2-mq78b1y3, sha 875511b2

## What Might Be Valuable

Seven `@holoscript/*` packages are in the publish-surface allowlist but no longer published to npm. Each represents a product surface that was built, published, and then retired:

- **@holoscript/connector-upstash** — Upstash Redis/vector connector. Relevant again if HoloMesh or knowledge-store needs a managed KV/vector backend without running Postgres.
- **@holoscript/connector-vscode** — VS Code connector. Relevant if HoloScript wants first-party VS Code API integration beyond the extension (e.g. language server protocol bridging).
- **@holoscript/graphql-api** — GraphQL API layer. Relevant if a public HoloScript API ever needs a GraphQL schema (vs REST+MCP today).
- **@holoscript/hologram-worker** — Background hologram processing worker. Relevant when hologram pipeline (I.002, HoloGram product line) needs off-thread rendering or encoding.
- **@holoscript/holoscript-agent** — Headless agent runtime daemon. Relevant as a distribution vehicle for the daimōn substrate (P.007) or a standalone agent binary.
- **@holoscript/marketplace-api** — Marketplace API package. Relevant when the marketplace economics layer (D.057, protocol revenue) needs a typed client.
- **@holoscript/registry** — Package/trait registry. Relevant if the plugin registry (packages/plugins/) ever needs a separate published client package.

## Why Not Now

All seven were removed from npm intentionally. The code may still exist in the monorepo as source packages; the publish-surface gate just requires the allowlist to be updated to reflect reality. No immediate product need for these specific published packages.

## Smallest Next Experiment

For each: `npm info @holoscript/<pkg>` to confirm it is truly unpublished (not just version-unlisted). Check if the source package still exists in the monorepo. If it does, understand why it was unpublished — deliberate deprecation or accident. The connector-upstash and holoscript-agent seeds are the most likely candidates for future value.

## Reopen Trigger

- **connector-upstash**: when HoloMesh knowledge-store or daimōn vector search needs a managed Redis/Upstash backend.
- **holoscript-agent**: when daimōn (P.007) or the serving autoscaler (P.008) needs a distributable standalone agent binary.
- **hologram-worker**: when the hologram encoding pipeline (I.002) needs off-thread processing at scale.
- Others: revisit if a specific product need names them.

## Do Not Preserve

The exact published package versions — they are stale. Revive as a fresh package from current monorepo source only.

## Links

- CI gate: holo-ci/publish-surface, workload ci-875511b2-mq78b1y3, sha 875511b2
- Fix action: run publish-surface-check.mjs --update to reconcile the allowlist
- Related board task: [holo-ci/publish-surface] gate failure board task (filed 2026-06-09)
