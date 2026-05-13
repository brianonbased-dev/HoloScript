# HoloScript Surfaces

Canonical inventory of the doors a person, agent, or system can actually touch.

Last verified by Codex hardware on 2026-05-12. The verification command is the
source of truth for every `live` row. Do not promote a designed or middleware row
to live until it has a curl command that succeeds against the production surface.

## Status Set

| Status | Meaning |
| --- | --- |
| `live` | Production endpoint or hosted product responds today. |
| `designed` | Architecture or route shape exists, but it is not a verified production surface. |
| `middleware` | Internal policy, signing, transport, or orchestration layer; not a user-facing door. |
| `public-only` | Public reading or discovery surface, not an authenticated product/API surface. |

## Ingestion

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| Absorb GraphRAG service | `live` | Codebase ingestion, graph memory, semantic search substrate. | `curl -fsS https://absorb.holoscript.net/health` |
| Public MCP tool lane | `live` | Anonymous parse, validate, explain, and list-entry requests. | `curl -fsS https://mcp.holoscript.net/api/public/tool` |
| HoloMap reconstruction | `live` | 3D reconstruction from video via MCP tools (`holo_reconstruct_from_video`, `step`, `anchor`, `export`). | `curl -fsS -X POST https://mcp.holoscript.net/mcp -H "Content-Type: application/json" -H "Authorization: Bearer $HOLOSCRIPT_API_KEY" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | grep -o 'holo_reconstruct_[^"]*'` |

## Coordination

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| HoloMesh public space API | `live` | Public HoloMesh domains and activity feed. | `curl -fsS https://mcp.holoscript.net/api/holomesh/space` |
| HoloMesh full team API | `live` | Full team API (board, tasks, messages, knowledge, presence, members) — requires `HOLOMESH_API_KEY`. | `curl -fsS https://mcp.holoscript.net/api/holomesh/team/$HOLOMESH_TEAM_ID/board -H "Authorization: Bearer $HOLOMESH_API_KEY"` |
| HoloDoor | `middleware` | Guardrail, provenance, and telemetry enforcement around agent/tool actions. | n/a |

## Authoring

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| HoloScript Studio production app | `live` | Hosted visual authoring surface at canonical vanity. | `curl -fsSL https://holoscript.studio -o /dev/null` (CNAME → `eiusxhgm.up.railway.app`) |

## Runtime

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| Compile API | `live` | Compile HoloScript compositions to runtime targets. | `curl -fsS -X POST https://mcp.holoscript.net/api/compile -H "Content-Type: application/json" -d '{"code":"composition \"Hello\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }","target":"unity"}'` |
| Render/share APIs | `designed` | Runtime rendering and shareable outputs exposed by the MCP HTTP server. | n/a |

## Substrate

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| HoloScript MCP health endpoint | `live` | Production MCP server health, version, and live tool count. | `curl -fsS https://mcp.holoscript.net/health` |
| HoloScript MCP API health endpoint | `live` | HTTP API capability probe for render, share, MCP, OAuth, and audit surfaces. | `curl -fsS https://mcp.holoscript.net/api/health` |
| HoloScript MCP discovery document | `live` | Well-known discovery document for MCP client configuration. | `curl -fsS https://mcp.holoscript.net/.well-known/mcp` |
| HoloGram substrate | `live` | Hologram compilation and sharing via MCP tools (`holo_hologram_from_media`, `compile_quilt`, `compile_mvhevc`, `render`, `publish_feed`, `send`, `upload_bundle`, `get_asset`) + Studio `/gram`. | `curl -fsSL https://holoscript.studio/gram -o /dev/null` |
| Knowledge store | `live` | Cross-session knowledge query and sync substrate. `POST /knowledge/query` verified live. | `curl -fsS -X POST https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query -H "Content-Type: application/json" -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" -d '{"search":"test","limit":1}'` |

## Economic

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| OAuth 2.1 / client registration | `middleware` | Identity and client onboarding layer for authenticated MCP/API use. | n/a |
| HoloScript Protocol registry | `designed` | Economic registry and protocol flow; cite as design until a production transaction path is verified. | n/a |
| x402/payment gating | `middleware` | Payment and entitlement layer around protected capabilities. | n/a |

## Public

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| HoloScript website | `public-only` | Public project website. | `curl -fsSL https://holoscript.net -o /dev/null` |
| HoloScript GitHub repository | `public-only` | Public source, issues, and repository metadata. | `curl -fsSL https://github.com/brianonbased-dev/HoloScript -o /dev/null` |
| Moltbook | `public-only` | Public agent platform and community surface. | `curl -fsSL https://moltbook.com -o /dev/null` |

## Exclusions

These are deliberately not listed as live surfaces:

- `https://studio.holoscript.net` — wrong TLD; this hostname does not resolve.
  The canonical Studio vanity is `https://holoscript.studio` (the `.studio`
  TLD, not a subdomain of `holoscript.net`). The `studio-production-a071.up.railway.app`
  Railway instance is also live but is a separate instance from the one
  CNAME'd by the vanity (`eiusxhgm.up.railway.app`); cite the vanity in docs.
- HoloDoor as a product surface — it is middleware, not a door.
- Named agents, including Brittney — actors are not surfaces unless they expose a
  stable transport endpoint.
- Repo-internal engine paths — code paths are implementation substrate, not doors
  unless they are reachable through one of the verified endpoints above.

## Designed surfaces (out-of-scope for live verification)

These surfaces have architecture or route shapes but are not verified production
doors today. They are listed separately so the gap is visible and tracked.

| Surface | Status | Role | Notes |
| --- | --- | --- | --- |
| HoloHub | `designed` | Package-level hub client and gallery surface. | `packages/holoscript/src/holohub/client.ts` exists; no public vanity endpoint resolves yet. |
| HoloLand | `designed` | VR/AR worlds product surface — spatial computing runtime, world authoring, NPC + trait runtime. | Substantial integration docs at `docs/integrations/HOLOLAND_*.md` and `packages/vscode-extension/docs/HOLOLAND_*.md`; multiple internal HoloLand instances exist (peer's "HoloLand Central" reference build work). No canonical public vanity URL pinned yet — promote to `live` once a curl-verifiable production hostname is decided. |
| Papers-as-Service | `designed` | Hosted paper generation and revision service. | Referenced in `STRATEGY.md` D.032; no public endpoint resolves yet. |
| uaa2-service | `designed` | uAA2++ protocol execution and research orchestration service. | Adjacent repo exists; no public endpoint resolves yet. |
