# @holoscript/hologram-worker

Node service for **HoloGram Sprint 0c**: depth (optional ONNX Depth Anything V2 Small via `onnxruntime-node`, else luminance), **Playwright** quilt + stereo views, **ffmpeg** stereo MP4 + parallax WebM, then **POST** multipart to Studio `/api/hologram/upload`.

## Installation

```bash
pnpm add @holoscript/hologram-worker
```

## HTTP

- `GET /health` — liveness
- `POST /render` — JSON body:
  - `sourceUrl` **or** `sourceBase64`
  - `mediaType`: `image` | `gif` | `video`
  - `targets`: optional, default `["quilt","mvhevc","parallax"]`
  - `skipUpload`: optional, if true skips Studio upload (local test)

Response: `{ hash, shareUrl, quiltUrl, mvhevcUrl, targets }`.

Provider endpoints used by `@holoscript/engine` `createNodeProviders()`:

- `POST /providers/depth` — `sourceUrl` or `sourceBase64`, `mediaType`; returns `depthMapBase64`, dimensions, backend, and model ID.
- `POST /providers/quilt` — source fields plus `depthMapBase64`, `width`, `height`; returns `{ bytesBase64 }` for PNG bytes.
- `POST /providers/mvhevc` — source fields plus `depthMapBase64`, `width`, `height`; returns `{ bytesBase64 }` for MP4 bytes.
- `POST /providers/parallax` — source fields plus `depthMapBase64`, `width`, `height`; returns `{ bytesBase64 }` for WebM bytes.

## Environment

| Variable                        | Purpose                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`                          | Listen port (default `8790`)                                                                        |
| `STUDIO_INTERNAL_URL`           | Base URL for `POST /api/hologram/upload`                                                            |
| `HOLOGRAM_WORKER_TOKEN`         | Bearer secret (must match Studio `HOLOGRAM_WORKER_TOKEN`)                                           |
| `HOLOGRAM_SHARE_BASE_URL`       | Public base for `shareUrl` / `quiltUrl` (often same as Studio public URL)                           |
| `HOLOGRAM_ONNX_MODEL_PATH`      | Filesystem path to Depth Anything V2 Small `.onnx` (optional; without it, depth uses CPU luminance) |
| `HOLOGRAM_WORKER_DEPTH_BACKEND` | Set to `luminance` to force luminance even if ONNX path is set                                      |
| `HOLOGRAM_DEPTH_MAX_SIDE`       | Max width/height after rasterize (default `640`)                                                    |
| `HOLOGRAM_WORKER_INGRESS_TOKEN` | Optional; if set, `POST /render` and `/providers/*` require `Authorization: Bearer …`               |

## ONNX model (supply-chain)

Pin a vetted `.onnx` artifact and set `HOLOGRAM_ONNX_MODEL_PATH`. Preprocess in `src/depth-infer.ts` assumes a **518×518** NCHW float model with ImageNet normalization (adjust if your export differs).

## Railway

- Attach a small volume at `/app/.cache` (or set `HOLOGRAM_CACHE_DIR` if you add model download later).
- Set `STUDIO_INTERNAL_URL`, `HOLOGRAM_WORKER_TOKEN`, and `HOLOGRAM_SHARE_BASE_URL` on **both** worker and Studio.
- Record the deployed service ID in your operator-owned service registry.

## Local

```bash
pnpm --filter @holoscript/engine build
pnpm --filter @holoscript/hologram-worker build
npx playwright install chromium
HOLOGRAM_WORKER_DEPTH_BACKEND=luminance node packages/hologram-worker/dist/server.js
```

## Neural depth (Depth-Anything-V2)

`src/depth-infer.ts` runs **real Depth-Anything-V2 ONNX** (`runOnnxDepth`,
`onnxruntime-node`) when a model is available, and falls back to a luminance
heuristic otherwise. Provision the model once so the neural path engages
automatically (no env needed — `resolveDepthModelPath()` finds the default cache):

```bash
node packages/hologram-worker/scripts/provision-depth-model.mjs        # ~99MB → .models/ (gitignored)
node packages/hologram-worker/scripts/verify-neural-depth.mjs          # falsifiable proof: neural ≠ luminance
```

- Override the path with `HOLOGRAM_ONNX_MODEL_PATH=/abs/model.onnx` or the cache
  dir with `HOLOGRAM_MODELS_DIR`.
- Force the luminance fallback (deterministic, no model) with
  `HOLOGRAM_WORKER_DEPTH_BACKEND=luminance`.
- The verifier asserts the neural depth materially diverges from luminance
  (MAE + correlation) — a relabeled-luminance "neural" map would fail it.
  Measured 2026-05-24: MAE 0.357, Pearson −0.47 (real monocular depth is
  anti-correlated with the naive brightness proxy).

## Validation gate

Before deploying or publishing, run the worker build and tests, then exercise
the deterministic luminance lane without a private model or Studio upload:

```bash
pnpm --filter @holoscript/hologram-worker build
pnpm --filter @holoscript/hologram-worker test
HOLOGRAM_WORKER_DEPTH_BACKEND=luminance node packages/hologram-worker/dist/server.js
curl --fail http://127.0.0.1:8790/health
```

The health response is a liveness receipt only. Validate `/render` separately
with `skipUpload: true` before enabling an operator-owned Studio URL and bearer
credential.

## Package boundary and release posture

This public package targets external operators running a dedicated render
worker. Callers bring their own Studio endpoint, credentials, cache, model
artifact, Playwright browser, and ffmpeg runtime; no founder-local adapter or
private workspace default ships in the package.

Release posture: v0-preview. Known limitations include the luminance fallback's
lower depth quality, platform-specific native dependencies in ONNX and Sharp,
and the separate browser/ffmpeg provisioning steps. Pin the worker version and
retain the deterministic luminance lane as the rollback path when a neural model
or native media dependency is unsupported on the deployment host.
