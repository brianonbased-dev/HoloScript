# @holoscript/platform

Enterprise platform substrate for HoloScript packages and services.

## Install

```bash
npm install @holoscript/platform
```

## Use

```ts
import { CapabilityValidator, PackageRegistry } from '@holoscript/platform';
```

## Package Surface

`@holoscript/platform` owns cross-cutting service primitives:

- security and sandbox policy helpers
- identity, capability, and access-control utilities
- package registry and certification support
- tenancy, quota, and rate-limit helpers
- Web of Things, contract, crypto, ANS, and Web3 integration points
- renderer exports used by platform-aware HoloLand surfaces

## Strategy Role

This package is a supported runtime module, not a v1 fleet default. Use it when
consumers need platform security, identity, registry, or Web3 primitives
directly. Keep marketplace APIs in `@holoscript/marketplace-api`, mesh/network
coordination in `@holoscript/mesh`, and agent lifecycle orchestration in
`@holoscript/framework` or `@holoscript/agent-protocol`.

Promote it into a fleet lane only when a laptop, Jetson, or Vast consumer proves
a direct install need rather than receiving platform behavior transitively.

## Validation

```bash
corepack pnpm --filter @holoscript/platform run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
