# HoloMap — documentation hub (post-launch)

Central index for **operators, integrators, and tutorial authors**. Deep technical contracts live in the charter and RFC; MCP implementations live in `packages/mcp-server`.

---

## 1. Start here

| Doc | Who | Purpose |
|-----|-----|---------|
| [CHARTER.md](./CHARTER.md) | Product + eng | Versioning, determinism, package boundaries |
| [RFC-HoloMap.md](../../packages/core/src/reconstruction/RFC-HoloMap.md) | Engineers | Protocol + MCP tool names |
| [STUDIO_RECONSTRUCTION_PANEL.md](./STUDIO_RECONSTRUCTION_PANEL.md) | Studio / UX | How native runs surface next to compatibility ingest |
| [RUNBOOK_PAPER_HARNESSES.md](./RUNBOOK_PAPER_HARNESSES.md) | Research + CI | Paper harness flags, ingest paths, logs |
| [MCP_SURFACE_VALIDATION.md](./MCP_SURFACE_VALIDATION.md) | CI + MCP | Tool list + vitest contract file |
| [weights-cdn-fallback.md](./weights-cdn-fallback.md) | Ops | CDN, content-addressed weights, failover |
| [reconstruction-runtime.md](./reconstruction-runtime.md) | Engineers | Code map + doc delta checklist |

---

## 2. Public MCP API (agents & scripts)

Implemented in `packages/mcp-server/src/holomap-mcp-tools.ts` (names stable for automation):

| Tool | Role |
|------|------|
| `holo_reconstruct_from_video` | Open a session from `videoUrl`; optional ffmpeg frame ingest |
| `holo_reconstruct_step` | Stream a single frame (`frameBase64`) through the session |
| `holo_reconstruct_anchor` | Read anchor / context for the session |
| `holo_reconstruct_export` | Export compiled output for a `target` |

**Environment / limits:** See `HOLOMAP_MCP_*` variables in `packages/mcp-server/src/holo-video-ingest.ts` (max bytes, fetch timeout).

---

## 3. Tutorial outline — video → composition → export

1. **Inputs:** Video URL or file; decide trust tier (see charter) and weight profile.
2. **Session:** Call `holo_reconstruct_from_video` with `config` (e.g. `ingestVideo: true` when ffmpeg is available).
3. **Iterate:** Use `holo_reconstruct_step` for streaming or chunked pipelines.
4. **Anchor:** Call `holo_reconstruct_anchor` before export if downstream needs attestation context.
5. **Export:** `holo_reconstruct_export` with desired compiler target; verify manifest fingerprint in logs.

Adapt steps for **non-developers** by wrapping MCP calls in Studio or a single CLI task — the sequence above is the logical contract.

---

## 4. Acceptance guide (quality bar)

Use before calling a release “HoloMap-ready” for a given profile:

- [ ] **Determinism:** Same model hash + seed + video hash → stable replay fingerprint (see charter tests).
- [ ] **Observability:** `[HoloMap]` structured logs enabled; `HOLOMAP_LOG=0` documented for support.
- [ ] **Trust tier:** Document which weight path / CDN / offline bundle was used for the run.
- [ ] **Fallback:** If CDN weight fetch fails, operator follows [Operator runbook](../ops/RUNBOOK.md) and documented fallback path for weights.
- [ ] **Studio parity:** If UI is in scope, reconstruction panel shows native fingerprint string per [STUDIO_RECONSTRUCTION_PANEL.md](./STUDIO_RECONSTRUCTION_PANEL.md).

---

## 5. Operator notes — weights, CDN, offline

- **Weight distribution** and **CDN** specifics are environment-dependent; keep the canonical URL list with secrets outside this repo or in deployment manifests.
- **Offline:** Ship a pinned weight bundle with the HoloMap build id recorded in the manifest (charter binding block).

---

## Related

- [Operator runbook](../ops/RUNBOOK.md)
- [NUMBERS.md](../NUMBERS.md) — verification commands for ecosystem metrics
- [Team mode ↔ board sync](../strategy/team-mode-board-sync.md) — how `TEAM_MODES` steers work
