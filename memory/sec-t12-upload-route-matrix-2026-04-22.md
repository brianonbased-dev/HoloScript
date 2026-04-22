# SEC-T12 file-upload route matrix (Studio)

**Board:** `task_1776812245944_djxe`  
**Gates:** (a) extension/content allowlist · (b) UUID-safe storage key · (c) size cap · (d) virus-scan hook point  

| Route | (a) Allowlist | (b) UUID / non-guessable key | (c) Size cap | (d) Scan hook |
|-------|----------------|------------------------------|--------------|---------------|
| `POST /api/assets/process` | `ALLOWED` ext (`packages/studio/src/app/api/assets/process/route.ts`) | S3: `makeAssetKey` → `randomUUID()`; **local disk:** `randomUUID()_sanitized` | 50 MB | `virusScanHookPoint` after buffer read |
| `POST /api/assets/upload` | `ALLOWED_TYPES` + `makeAssetKey` ext check | `makeAssetKey` | **`fileSizeBytes` required** when S3 presigned; URL signed with exact **`Content-Length`** (50 MiB max) | Scan on **process** path; presigned bytes scanned only if client later uses `/api/assets/process` or external pipeline |
| `POST /api/hologram/upload` | Fixed field names `.bin` / `.png` / `.mp4` / `.webm` | Content-addressed `hash` from store | `MAX_HOLOGRAM_UPLOAD_BYTES` + store | `virusScanHookPoint` before `store.put` |
| `POST /api/snapshots` | **Allowlist** `data:image/(png\|jpeg\|jpg\|webp\|gif)` only (SVG etc. rejected) | Key `snapshots/{sceneId}/{timestamp}.{ext}` | **36 MiB** POST `Content-Length` guard; **25 MiB** decoded image; **2 MiB** `code` field | `virusScanHookPoint` before S3 `put` and on dev inline path |
| `POST /api/deploy` | N/A (generated HTML, not arbitrary upload) | `deploys/{userId}/{deploymentId}/index.html` | Bounded by generated output | N/A |

## Closed in Wave-E SecTail (2026-04-22)

1. Presigned PUT bound to declared **`fileSizeBytes`** → signed **`Content-Length`**.
2. Local **`/api/assets/process`** filenames prefixed with **`randomUUID()`**.
3. **Snapshots:** body / image / code caps + image MIME allowlist + **`virusScanHookPoint`**; S3 upload failure no longer falls back to huge inline base64.

## Remaining follow-ups

- Post-upload AV scan before `POST /api/assets` marks presigned objects `ready` (requires fetching object bytes or bucket-side scanning).
