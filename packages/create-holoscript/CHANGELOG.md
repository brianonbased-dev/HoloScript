# create-holoscript

## 1.5.0

### Minor Changes

- c3da4c1: Put the newcomer entry points back on the current core major.

  `npx create-holoscript` scaffolded `@holoscript/core@^6.1.0` (resolving 6.1.4)
  while the registry ships 8.0.20, so every new project started two majors behind
  the ecosystem it was joining. `@holoscript/runtime@6.1.1` has the same problem
  from the other direction: its published manifest pins `core@^6.1.2`, because it
  has not been republished since core was v6 — its source already builds against
  workspace core 8.0.20.

  This is not merely stale. The ranges are incompatible, so the two resolve
  separately. Measured in a clean directory, `npm install @holoscript/engine@6.1.6
@holoscript/runtime@6.1.1` installs **five copies of `@holoscript/core` across
  three versions** (8.0.20, 8.0.6, 6.1.4) — including core nested inside core — and
  exits 0 with no warning. The result is five parsers and five trait registries,
  and anything crossing between them fails `instanceof` with nothing pointing at
  the cause.

  `create-holoscript` now pins `^8.0.20`, verified against the generated project's
  own validate script (`parseHolo` from the `@holoscript/core/parser` subpath
  resolves and parses on 8.0.20). Its tests previously asserted the literal
  `'^6.1.0'`, which locked the rot in rather than catching it; they now assert the
  scaffolded major matches the workspace's `packages/core` version, so the next
  major bump fails in CI instead of shipping.

  `@holoscript/runtime` needs no source change — 621 tests pass against core
  8.0.20 today. It only needs republishing so `pnpm publish` rewrites its
  `workspace:^` spec to the current major.

- Pin scaffolded `@holoscript/core` to `^8.7.0` so `npx create-holoscript` joins the live core major instead of omitting core (1.4.0) or pinning `^6.1.0` (canon source). Tests now assert the scaffolded major matches workspace `packages/core`.

## 1.4.0

### Minor Changes

- 454a89f: Add `--go` flag for 30-second time-to-wow: scaffolds the `instant` template, starts a stdlib HTTP server on port 3030, and auto-opens the user's default browser — all in one command, no `cd`, no `npm install`.
  - `npx create-holoscript my-world --go` is now the fastest path to a working 3D scene in browser
  - Implies `--yes` and defaults template to `instant` unless `--template` is explicitly passed
  - Adds `--port <n>` override (default 3030, auto-steps on conflict)
  - README updated with time-to-wow comparison table vs A-Frame / Babylon / Three.js / Unity
  - 5 new tests for `--go` / `-g` / explicit `--template` override / `--port` parsing

  Defensive competitive move per `docs/strategy/deep-dive-babylon-mcp.md`: closes the time-to-wow gap against Babylon.js Playground and A-Frame paste-HTML.
