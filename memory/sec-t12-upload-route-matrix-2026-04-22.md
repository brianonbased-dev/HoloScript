# SEC-T12 file-upload route matrix (Studio)

**Board:** `task_1776812245944_djxe`  
**Gates:** (a) extension/content allowlist · (b) UUID-safe storage key · (c) size cap · (d) virus-scan hook point  

| Route | (a) Allowlist | (b) UUID / non-guessable key | (c) Size cap | (d) Scan hook |
|-------|----------------|------------------------------|--------------|---------------|
| `POST /api/assets/process` | `ALLOWED` ext (`packages/studio/src/app/api/assets/process/route.ts`) | S3: `makeAssetKey` → `randomUUID()`; **local disk:** `Date.now()_sanitized` (not UUID — acceptable for dev-only path) | 50 MB | `virusScanHookPoint` after buffer read |
| `POST /api/assets/upload` | `ALLOWED_TYPES` + `makeAssetKey` ext check | `makeAssetKey` | `_MAX_SIZE_MB` **not enforced** on presigned PUT (gap — use bucket policy / conditions) | Hook runs on **process** path; confirm path `POST /api/assets` is JSON-only (no bytes) |
| `POST /api/hologram/upload` | Fixed field names `.bin` / `.png` / `.mp4` / `.webm` | Content-addressed `hash` from store | `MAX_HOLOGRAM_UPLOAD_BYTES` + store | `virusScanHookPoint` before `store.put` |
| `POST /api/snapshots` | MIME from `data:image/*` when uploading to S3 | Key `snapshots/{sceneId}/{timestamp}.{ext}` | **Gap:** no max on base64 payload | **Optional:** hook when buffer built (see route) |
| `POST /api/deploy` | N/A (generated HTML, not arbitrary upload) | `deploys/{userId}/{deploymentId}/index.html` | Bounded by generated output | N/A |

## Follow-ups (not closed in this pass)

1. Presigned **Content-Length** / post-upload scan before marking asset `ready`.
2. **Local** `/api/assets/process` disk path: stronger random suffix if exposed beyond dev.
3. **Snapshots** total payload limit + scan parity with `process`.
