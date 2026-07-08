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

This package is the fleet control-plane utility for consumers that need
platform security, identity, registry, Web3, contract, token, ACL, or
HoloKey/x402-adjacent primitives directly. Keep marketplace APIs in
`@holoscript/marketplace-api`, mesh/network coordination in `@holoscript/mesh`,
and agent lifecycle orchestration in `@holoscript/framework` or
`@holoscript/agent-protocol`.

Package installation proves the local API surface. Hosted HoloKey/x402 payment,
wallet custody, and identity-service availability still require separate live
endpoint receipts.

The live-service receipt gate is secret-safe by default. Without configured
wallet and bearer inputs it records missing live proof rather than claiming
hosted availability. Use the strict form only on a deployment lane that has
live endpoint credentials available through environment variables or HoloKey:

```bash
corepack pnpm run check:platform-live-service-receipts
corepack pnpm run check:platform-live-service-receipts -- --require-live --json
```

## Validation

```bash
corepack pnpm --filter @holoscript/platform run test
corepack pnpm run check:registry-cold-start:platform-public-api
corepack pnpm run check:package-consumption
corepack pnpm run check:platform-live-service-receipts
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
