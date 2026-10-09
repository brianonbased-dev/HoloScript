# @holoscript/absorb-service-host

## 6.1.6

### Patch Changes

- Updated dependencies
  - @holoscript/core@8.9.0

## 6.1.5

### Fixed

- Report the host package version (6.1.5) from `/health`, matching the
  published engine line. Also report `engineVersion` from the
  `@holoscript/absorb-service` package Node resolves at runtime.

## 6.1.4

### Patch Changes

- Updated dependencies [7c22951]
- Updated dependencies [664f178]
- Updated dependencies [d9705dc]
- Updated dependencies [64f7022]
- Updated dependencies [d26629c]
  - @holoscript/core@8.7.0
  - @holoscript/secrets-broker@6.2.0

## 6.1.3

### Fixed

- Completed and build-smoked the engine MCP runtime dependency closure, and
  refuse service admission when the resolved tool inventory is empty.

## 6.1.2

### Fixed

- Added the canonical stateless Streamable HTTP `POST /mcp` transport so
  Railway replica changes do not invalidate an in-memory SSE session.
- Registered the engine's standard JSON Schema tool definitions through the
  MCP protocol server instead of the SDK's Zod-only convenience overload.
- Advertised HoloAbsorb and its preferred/fallback transports truthfully in
  MCP discovery.

## 6.1.1

### Patch Changes

- Updated dependencies [c64fc1a]
  - @holoscript/core@8.0.6

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.2

### Patch Changes

- Updated dependencies
  - @holoscript/core@6.1.0
  - @holoscript/absorb-service@6.1.0

## 6.0.1

### Patch Changes

- @holoscript/core@6.0.3
