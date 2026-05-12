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

## Coordination

| Surface | Status | Role | Verification command |
| --- | --- | --- | --- |
| HoloMesh public space API | `live` | Public HoloMesh domains and activity feed. | `curl -fsS https://mcp.holoscript.net/api/holomesh/space` |
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
