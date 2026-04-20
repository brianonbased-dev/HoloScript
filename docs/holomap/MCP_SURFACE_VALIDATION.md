# HoloMap MCP surface — validation stubs

**Purpose:** Map **which HoloMap tools exist** and **what CI asserts** without running GPU/WebGPU. Aligns with board work *MCP surface validation stubs*.

## Tool registry

Source of truth: `packages/mcp-server/src/holomap-mcp-tools.ts` — `holoMapToolDefinitions`.

| Tool | Role |
|------|------|
| `holo_reconstruct_from_video` | Session open + optional ffmpeg ingest |
| `holo_reconstruct_step` | Stream one frame (requires `frameIndex`, dimensions) |
| `holo_reconstruct_anchor` | Anchor context |
| `holo_reconstruct_export` | Manifest + export target |
| `holo_map_paper_ingest_probe` | Paper harness ingest comparison |

## Automated tests (stubs / contracts)

**File:** `packages/mcp-server/src/__tests__/holomap-mcp-tools.test.ts`

- Enumerates expected tool names (including `holo_map_paper_ingest_probe`).
- **`isHoloMapToolName`** positive/negative cases.
- **Validation errors** for missing `videoUrl`, bad `holo_reconstruct_step` args (`frameIndex` required), missing `sessionId` on anchor/export.
- **Happy path stub:** `holo_reconstruct_from_video` returns `SESSION_OPEN` when mocks are wired (session layer mocked via `vi.mock('../holo-reconstruct-sessions')`).

Session/reconstruction internals are **mocked** so CI stays fast and deterministic; integration tests belong in reconstruction/MCP integration jobs.

## Running locally

```bash
pnpm --filter @holoscript/mcp-server exec vitest run src/__tests__/holomap-mcp-tools.test.ts
```

## Related

- [HoloMap README hub](./README.md)
- [RFC — HoloMap](../../packages/core/src/reconstruction/RFC-HoloMap.md)
