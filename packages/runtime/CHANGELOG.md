# @holoscript/runtime

## 6.1.2

### Patch Changes

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

- Updated dependencies [7c22951]
- Updated dependencies [f2dc653]
- Updated dependencies [664f178]
- Updated dependencies [64f7022]
- Updated dependencies [848f3bf]
- Updated dependencies [2b399da]
- Updated dependencies [d26629c]
  - @holoscript/core@8.7.0
  - @holoscript/engine@6.1.7

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- @holoscript/core@6.0.3
