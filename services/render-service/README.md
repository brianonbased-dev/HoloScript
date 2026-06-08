# @holoscript/render-service

Lightweight Express service for sharing and embedding HoloScript scenes. Parses incoming `.holo` source, stores scenes in memory, and serves shareable links, embeds, QR codes, and raw parsed AST previews.

## What it does

| Route | Description |
| --- | --- |
| `GET  /health` | Liveness check — returns service info and scene count |
| `POST /share` | Accept `.holo` source → return share/embed/QR/raw URLs |
| `GET  /scene/:id` | Retrieve stored scene metadata |
| `GET  /scene/:id/parsed` | Return parsed AST for a stored scene |
| `GET  /embed/:id` | HTML embed shell for a scene |
| `GET  /preview/:id` | Pretty-printed JSON AST preview |
| `GET  /qr/:id` | PNG QR code linking to the playground URL |

## Local dev

```bash
pnpm dev   # node --watch src/index.js, default PORT=3000
```

## Deploy

Deployed on Railway. See `railway.toml` for service config.

## Relationship to native compilers

`render-service` accepts raw HoloScript source and delegates parsing to `src/parseScene.js`. For sovereign render targets (native-2d, canvas2d-game, webgpu), the compiled artifact is served directly by `@holoscript/mcp-server` — see the `/api/compile/<target>` routes there.

For more on the sovereign/bridge compiler split, see [`packages/core/src/compiler/sovereign-targets.ts`](../../packages/core/src/compiler/sovereign-targets.ts) and [`docs/native-engine-registry.md`](../../docs/native-engine-registry.md).
