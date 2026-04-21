# create-holoscript

## 1.4.0

### Minor Changes

- 454a89f: Add `--go` flag for 30-second time-to-wow: scaffolds the `instant` template, starts a stdlib HTTP server on port 3030, and auto-opens the user's default browser — all in one command, no `cd`, no `npm install`.
  - `npx create-holoscript my-world --go` is now the fastest path to a working 3D scene in browser
  - Implies `--yes` and defaults template to `instant` unless `--template` is explicitly passed
  - Adds `--port <n>` override (default 3030, auto-steps on conflict)
  - README updated with time-to-wow comparison table vs A-Frame / Babylon / Three.js / Unity
  - 5 new tests for `--go` / `-g` / explicit `--template` override / `--port` parsing

  Defensive competitive move per `docs/strategy/deep-dive-babylon-mcp.md`: closes the time-to-wow gap against Babylon.js Playground and A-Frame paste-HTML.
