# @holoscript/net-service

## 1.0.4

### Patch Changes

- **Routing:** explicit `GET /live-evidence.json` so a missing build artifact returns JSON 404 instead of the SPA `index.html` (which broke `fetch()` on the evidence strip). Tries `dist/client` then VitePress `docs/.vitepress/dist`; short cache headers.

## 1.0.3

### Patch Changes

- **Live evidence strip** on the root landing page (`LiveEvidenceStrip`): three tiles (fleet 24h / last Base anchor / last commit) from `/live-evidence.json`, refreshed every 30s. Manifest copied from `docs/public` at build time when present (same source as VitePress strip).

## 1.0.2

### Patch Changes

- Updated dependencies
  - @holoscript/core@7.0.0
  - @holoscript/mcp-server@7.0.0
  - @holoscript/r3f-renderer@6.0.4
  - @holoscript/runtime@7.0.0

## 1.0.1

### Patch Changes

- Updated dependencies [c330bbf]
  - @holoscript/mcp-server@6.0.3
  - @holoscript/core@6.0.3
  - @holoscript/r3f-renderer@6.0.3
  - @holoscript/runtime@6.0.3
