# Sovereign origination stack

Short map of how **Studio (visual graph)**, **publication manifests (dual digests)**, and **headless MCP transport** fit together for sovereign-origination workflows. This doc stays factual about what is **implemented** versus what remains **research / formalization**.

---

## 1. Node Graph → `previewHoloScript` → WebXR overlay

**Intent:** Run a logic graph in the editor, emit preview HoloScript, and inspect it in **WebXR** without leaving the node-graph surface.

**Flow:**

1. **`NodeGraphPanel`** (`packages/studio/src/components/node-graph/NodeGraphPanel.tsx`) runs the graph via `executeStudioGraph` / `nodeGraphExecutionBridge`.
2. Execution results can include **`previewHoloScript`** — source string suitable for the embed viewer.
3. **Run XR** toggles an overlay that mounts **`WebXRViewer`** (dynamic import, `ssr: false`) with `code={execResult.previewHoloScript}` when both XR mode and preview text are available.

**Scope:** This is **instant spatial feedback** for the author. It does not by itself prove IP or replace publication manifests; it connects the **visual compiler** to **physical preview**.

**Related:** `packages/core/docs/NODEGRAPH_EXECUTION_SPRINT.md`, `packages/core/src/editor/nodeGraphPlayPreview.ts` (preview emission from graph execution).

---

## 2. Dual digest semantics (`GistPublicationManifest`)

**Module:** `packages/core/src/export/GistPublicationManifest.ts`  
**Builder:** `buildGistPublicationManifest`

Two concepts coexist on purpose:

| Field | Role |
|--------|------|
| **`provenance_semiring_digest`** | **v0 canonical binding:** scheme `sha256_canonical_v0` — SHA-256 over sorted-key JSON of `room`, `loro_doc_version`, and optional `xr_metrics`. Stable for tooling and disclosure; **not** tropical matrix math. Controlled by `includeSemiringDigest` (default on). |
| **`tropical_semiring_digest`** | **Optional 3×3 numeric matrix** (`TropicalSemiringDigest`), supplied via `tropicalSemiringDigest` in build params when callers have computed it (e.g. from a Loro doc). |

**Honest boundary (semiring vs merge semantics):**

- The optional matrix is a **structured fingerprint** derived from Loro state (see `computeTropicalSemiringDigest` in `packages/crdt-spatial/src/legalDocumentCrdt.ts`). It is **not** a claim that every CRDT merge operation has been mapped into a full **min-plus / max-plus semiring** over the operation stream with audited homomorphism to your legal audit trail.
- **External language:** Present **v0 SHA + optional matrix** as **evidentiary layers**; reserve phrases like “irrefutable algebraic proof of state intersection” for a future spec where merge hooks, operation algebras, and tests are explicitly defined.

**Publication API:** `packages/studio/docs/walkthrough.md` — `POST /api/publication/gist-manifest`, optional **x402** tier (`GIST_MANIFEST_REQUIRE_X402`), **`xr_metrics`** for Film3D-style device evidence.

---

## 3. Headless MCP: stdio proxy and environment policy

**Location:** `mcp-orchestrator` repository — `src/stdio-proxy.ts` (lives outside the HoloScript monorepo; use the orchestrator tree you deploy for MCP stdio bridging).

**Behavior (summary):**

- Spawns stdio MCP child processes with **`stdio: ['pipe','pipe','pipe']`** and serializes **stdin** writes (`flushStdinPayload` / `queueStdinWrite`) so backpressure is handled and pipe errors surface cleanly.
- **Environment:** Host env is filtered through an explicit **`safeEnvKeys`** allowlist before merge with caller-supplied `env`, reducing accidental **credential leakage** into child processes during multi-tenant or local swarm use.

**Scope:** Transport hardening and isolation — orthogonal to manifest digests but part of the **same operational story** for headless agents talking to MCP servers.

---

## Related docs

- [`walkthrough.md`](./walkthrough.md) — gist manifest API, x402 policy, Film3D / WebXR worker
- `.ai-ecosystem` — futurist / COMPRESS narratives (`FUTURIST_SovereignAgent_NativeOrigination_*.md`, `COMPRESS_SovereignOrigination_WPG_*.md`)
