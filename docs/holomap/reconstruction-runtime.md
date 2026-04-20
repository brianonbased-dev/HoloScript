# HoloMap reconstruction runtime — code map and doc deltas

**Purpose:** Help engineers find **runtime entry points** and keep **docs in sync** when reconstruction code moves. Supports board hygiene *reconstruction runtime + doc deltas*.

## Code map

| Area | Location | Notes |
|------|----------|--------|
| Core reconstruction engine | `packages/core/src/reconstruction/` | WGSL, runtime, manifests |
| RFC / protocol | `packages/core/src/reconstruction/RFC-HoloMap.md` | Tool names, manifest version |
| HoloMap package (profiles, UX helpers) | `packages/holomap/` | Non-core surfaces per [CHARTER.md](./CHARTER.md) |
| MCP tool surface | `packages/mcp-server/src/holomap-mcp-tools.ts` | Public agent API |
| Session orchestration | `packages/mcp-server/src/holo-reconstruct-sessions.ts` | Bridges MCP ↔ runtime |
| Video fetch / limits | `packages/mcp-server/src/holo-video-ingest.ts` | `HOLOMAP_MCP_*` env |

## When you change runtime behavior

Update in the **same PR** (or immediately after):

1. **RFC-HoloMap.md** — if manifest fields, tool contracts, or determinism claims change.
2. **docs/holomap/README.md** — if MCP tool table or tutorial steps change.
3. **CHARTER.md** — if versioning or SimulationContract binding rules change.
4. **MCP tests** — `packages/mcp-server/src/__tests__/holomap-mcp-tools.test.ts` for new tools or required args.

## Paper / harness docs

Harness flags and ingest modes: [RUNBOOK_PAPER_HARNESSES.md](./RUNBOOK_PAPER_HARNESSES.md).

## Related

- [MCP surface validation](./MCP_SURFACE_VALIDATION.md)
- [Weights + CDN](./weights-cdn-fallback.md)
