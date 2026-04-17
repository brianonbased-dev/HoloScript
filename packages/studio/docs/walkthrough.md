# Studio walkthrough — publication manifest, XR metrics, and policy

This note ties together the **Gist publication manifest** API, optional **x402** enforcement, and **Film3D / WebXR** telemetry used for sovereign-origination workflows.

## Gist manifest API

- **Route:** `POST /api/publication/gist-manifest`
- **Core types:** `@holoscript/core` — `buildGistPublicationManifest`, `serializeGistPublicationManifest`, `computeProvenanceSemiringDigestV0`

### Request body (JSON)

| Field | Required | Notes |
|--------|-----------|--------|
| `room` | yes | Non-empty string; drives `provenance_receipt.document_id` |
| `loroDocVersion` | yes | Object — Loro / CRDT snapshot for Door 1 |
| `x402Receipt` | tier-dependent | Optional payment anchor (Door 3) |
| `title` | no | Human label |
| `primaryAssetSha256` | no | Content address for primary gist asset |
| `xrMetrics` | no | Plain object — e.g. Film3D `hitTestCount`, `depthSensingActive`, … |
| `includeSemiringDigest` | no | Default true; set `false` to omit `provenance_semiring_digest` |

### Response

JSON with `ok`, `manifest`, `suggestedPath` (`.holoscript/gist-publication.manifest.json`), and pretty-printed `json`.

### Canonical fields

- **`holoscript_publication_manifest_version`:** `"0.1.0"` — not `manifest_version`.
- **`provenance_semiring_digest`:** v0 uses scheme `sha256_canonical_v0` (SHA-256 over sorted-key JSON of `room`, `loro_doc_version`, and optional `xr_metrics`). A future **v1** may replace this with a tropical-semiring fingerprint once merge math is wired.
- **`xr_metrics`:** optional on-device evidence (hit-test counts, depth session flags, etc.).

## x402 policy (deployment tier)

When the server sets **`GIST_MANIFEST_REQUIRE_X402=1`** or **`true`**, the route returns **HTTP 402** unless `x402Receipt` is a non-empty object. Use this for environments where an economic receipt is mandatory before emitting a manifest.

## Film3D / WebXR in the embed viewer

`WebXRViewer` can collect throttled samples via `film3dVerificationEnabled` and `onFilm3dXrMetrics`. Hit-test accumulation uses `useXRHitTest` from `@react-three/xr`; samples are forwarded through a small **Web Worker** (`film3dXrMetrics.worker.ts`) when supported, with a main-thread throttle fallback so tests and SSR stay safe.

## Related docs

- [`SOVEREIGN_ORIGINATION_STACK.md`](./SOVEREIGN_ORIGINATION_STACK.md) — Node Graph → `previewHoloScript` → WebXR, dual digest semantics, stdio-proxy pointer
- `.ai-ecosystem` — `FUTURIST_SovereignAgent_NativeOrigination_2026-04-16.md`, `COMPRESS_SovereignOrigination_WPG_2026-04-16.md`
- `packages/studio/docs/orchestration/README.md` — broader orchestration surface
