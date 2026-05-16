---
doc_tier: research
research_phase: autonomize
status: active
last_verified: 2026-05-16
canonical_for: studio-integration-hub-vision
supersedes: ''
extends: packages/studio/INTEGRATION_HUB.md
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** This is a replacement for the missing Studio Integration Hub vision artifact referenced by `packages/studio/INTEGRATION_HUB.md`. Git history did not contain a deleted `studio-integration-hub-vision` file. The current shipped surface is a Studio `/integrations` panel for five service connectors, seven in-tree `@holoscript/connector-*` packages, connect/disconnect/activity API routes, GitHub device OAuth routes, and a Railway deploy route that still returns generated URLs rather than calling Railway.

- **W -** The Integration Hub is not a settings page. It is the boundary where external service actions become agent-readable receipts.
- **P -** Treat each integration as four coupled layers: connector package, Studio UI/store, API route, and credential/capability boundary.
- **G -** A connector package existing in `packages/` does not mean it is surfaced in Studio, wired to real production credentials, or safe to advertise as a completed workflow.

**Evidence:** `rg --files -g "INTEGRATION_HUB.md" -g "*studio*integration*hub*" -g "*integration-hub*"`; `git log --all --full-history --oneline -- research/2026-03-21_studio-integration-hub-vision-AUTONOMIZE.md research/2026-03-21_studio-integration-hub-vision-EVOLVED.md`; `Get-ChildItem -LiteralPath packages -Directory -Filter "connector-*"`; `Get-ChildItem -LiteralPath packages/studio/src/app/api/connectors -Recurse -File`; direct reads of `ServiceConnectorPanel.tsx`, `connectorStore.ts`, connector API routes, and `GitHubOAuthModal.tsx`.

---

# Studio Integration Hub Vision

## Recovery Result

`packages/studio/INTEGRATION_HUB.md` referenced this file, but the referenced artifact was missing from disk. The recovery probe checked git history for both the `AUTONOMIZE` and `EVOLVED` filenames and returned no deleted-file match. This document is therefore a grounded replacement, not a restored original.

The replacement keeps the old filename so existing links can resolve, but its facts are verified against the current checkout on 2026-05-16.

## Product Shape

The Integration Hub is the Studio surface for external services that affect build, deploy, source, storage, publishing, and agent collaboration workflows. Its job is not just to collect tokens. Its job is to make service state visible enough that an agent can answer:

1. Which external service is connected?
2. Which credential or capability boundary was used?
3. Which action happened?
4. What receipt proves the action?
5. Which follow-up is blocked because the receipt is missing?

## Current Shipped Surface

| Layer | Verified state | Source |
| --- | --- | --- |
| Studio route | `/integrations` renders the Integration Hub panel. | `packages/studio/src/app/integrations/page.tsx` |
| UI panel | Five user-facing tabs: GitHub, Railway, VSCode, App Store, Upstash. `pipeline` exists in local metadata but is filtered out of the connector tab list. | `packages/studio/src/components/integrations/ServiceConnectorPanel.tsx` |
| Store | `connectorStore` tracks connection status, config, activity, and SSE state for the five Studio services. Persisted state drops credentials and resets status to `disconnected`. | `packages/studio/src/lib/stores/connectorStore.ts` |
| API routes | Connect, disconnect, activity SSE, GitHub OAuth start, GitHub OAuth poll, and Railway deploy routes exist under `packages/studio/src/app/api/connectors/`. | `Get-ChildItem packages/studio/src/app/api/connectors -Recurse -File` |
| GitHub OAuth | Device-flow UI and start/poll endpoints exist. Poll success stores the GitHub token and a capability token in encrypted cookies when auth secrets are configured. | `GitHubOAuthModal.tsx`; `oauth/github/start/route.ts`; `oauth/github/poll/route.ts` |
| Railway deploy | Route requires GitHub authorization but currently generates a mock Railway URL and IDs instead of calling the Railway API. | `packages/studio/src/app/api/connectors/railway/deploy/route.ts` |

## Connector Package Inventory

| Package | Studio tab | Current role |
| --- | --- | --- |
| `@holoscript/connector-core` | No | Base `ServiceConnector`, MCP registrar, credential vault, and deployment interfaces. |
| `@holoscript/connector-github` | Yes | Repository, PR, issue, Actions, content, and gist operations. |
| `@holoscript/connector-railway` | Yes | Railway GraphQL connector package; Studio deploy route is not yet using it for real deploys. |
| `@holoscript/connector-vscode` | Yes | VSCode extension bridge for bidirectional sync and live preview. |
| `@holoscript/connector-appstore` | Yes | Apple App Store Connect and Google Play publishing surface. |
| `@holoscript/connector-upstash` | Yes | Redis, Vector, and QStash connector subsystems. |
| `@holoscript/connector-moltbook` | No | Agent social connector package for Moltbook posts, comments, DMs, search, karma, and notifications. |

## Vision Contract

The hub should be judged by receipts, not by connector count. A connector reaches product-grade status only when all four layers are true:

| Layer | Done means |
| --- | --- |
| Connector package | The service connector exposes typed tools, health checks, and failure modes that do not require UI context to understand. |
| Studio UI/store | The connector has visible status, action history, error copy, and a config form that does not persist secrets into browser storage. |
| API route | Studio actions cross the server boundary through a route that validates input, scopes credentials, and returns a useful error when the service refuses the action. |
| Receipt boundary | Successful actions emit enough metadata for an agent to prove what happened without re-running the side effect. |

## Current Gaps

| Gap | Why it matters | Current evidence |
| --- | --- | --- |
| Real Railway deploy | The route returns plausible URLs but does not create a Railway project, connect GitHub, set env vars, trigger deployment, or wait for completion. | `railway/deploy/route.ts` comments and generated `proj_` / `dep_` values. |
| Production credential vault | `connectorStore` correctly avoids persisted credentials, but server-side connector credentials still rely on request-time env mutation and encrypted cookies for GitHub device tokens. | `connect/route.ts`; `connectorStore.ts`; `github-device-session` usage in OAuth poll. |
| Connector type debt | Several route branches use `@ts-ignore` or dynamic imports to work around stale connector type surfaces. | `connect/route.ts`; `disconnect/route.ts`. |
| Moltbook Studio placement | `connector-moltbook` exists and has 21 MCP tools, but it is not a Studio tab or `connectorStore` service. | `packages/connector-moltbook/README.md`; `ServiceConnectorPanel.tsx`; `connectorStore.ts`. |
| Receipt model | Activity SSE provides action/status events, but connector side effects do not yet share one cross-service receipt schema. | `activity/route.ts`; connector route responses. |

## Next Build Moves

1. Replace `/api/connectors/railway/deploy` mock behavior with `@holoscript/connector-railway` calls and return a deployment receipt containing project, service, deployment, domain, and source commit.
2. Introduce a production `CredentialVault` implementation for connector server routes, then remove request-time process env mutation.
3. Remove `@ts-ignore` from connector API routes by aligning connector package exports and route-local interfaces.
4. Decide whether `connector-moltbook` belongs in Studio, HoloMesh agent ops, or a separate community surface. Do not add it to the panel only because the package exists.
5. Promote activity events into durable connector receipts so agents can inspect deploy, repo, publish, and cache actions after the SSE connection is gone.

## Agent Routing

- Use this document when deciding whether Integration Hub work is product surface, connector package work, credential infrastructure, or receipt infrastructure.
- Use `packages/studio/INTEGRATION_HUB.md` for implementation details and UI/API paths.
- Before updating counts or status, re-run the evidence commands above. Existing docs are inputs, not proof.
