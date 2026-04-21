# @holoscript/hologram-worker

Node service for **HoloGram Sprint 0c**: depth (optional ONNX Depth Anything V2 Small via `onnxruntime-node`, else luminance), **Playwright** quilt + stereo views, **ffmpeg** stereo MP4 + parallax WebM, then **POST** multipart to Studio `/api/hologram/upload`.

## HTTP

- `GET /health` — liveness
- `POST /render` — JSON body:
  - `sourceUrl` **or** `sourceBase64`
  - `mediaType`: `image` | `gif` | `video`
  - `targets`: optional, default `["quilt","mvhevc","parallax"]`
  - `skipUpload`: optional, if true skips Studio upload (local test)

Response: `{ hash, shareUrl, quiltUrl, mvhevcUrl, targets }`.

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `8790`) |
| `STUDIO_INTERNAL_URL` | Base URL for `POST /api/hologram/upload` |
| `HOLOGRAM_WORKER_TOKEN` | Bearer secret (must match Studio `HOLOGRAM_WORKER_TOKEN`) |
| `HOLOGRAM_SHARE_BASE_URL` | Public base for `shareUrl` / `quiltUrl` (often same as Studio public URL) |
| `HOLOGRAM_ONNX_MODEL_PATH` | Filesystem path to Depth Anything V2 Small `.onnx` (optional; without it, depth uses CPU luminance) |
| `HOLOGRAM_WORKER_DEPTH_BACKEND` | Set to `luminance` to force luminance even if ONNX path is set |
| `HOLOGRAM_DEPTH_MAX_SIDE` | Max width/height after rasterize (default `640`) |
| `HOLOGRAM_WORKER_INGRESS_TOKEN` | Optional; if set, `POST /render` requires `Authorization: Bearer …` |

## ONNX model (supply-chain)

Pin a vetted `.onnx` artifact and set `HOLOGRAM_ONNX_MODEL_PATH`. Preprocess in `src/depth-infer.ts` assumes a **518×518** NCHW float model with ImageNet normalization (adjust if your export differs).

## Railway

- Attach a small volume at `/app/.cache` (or set `HOLOGRAM_CACHE_DIR` if you add model download later).
- Set `STUDIO_INTERNAL_URL`, `HOLOGRAM_WORKER_TOKEN`, and `HOLOGRAM_SHARE_BASE_URL` on **both** worker and Studio.
- Register the deployed service ID under **W.GOLD.034** when the ID is known.

## Local

```bash
pnpm --filter @holoscript/engine build
pnpm --filter @holoscript/hologram-worker build
npx playwright install chromium
HOLOGRAM_WORKER_DEPTH_BACKEND=luminance node packages/hologram-worker/dist/server.js
```
