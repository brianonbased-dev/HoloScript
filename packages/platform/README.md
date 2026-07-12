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

The live-service receipt gate is secret-safe by default. It probes hosted
service health and HoloMesh registration-challenge availability without API
keys, wallet private keys, signing, payment execution, identity creation, or
wallet environment mutation, and it records only sanitized hashes for canary
inputs:

```bash
corepack pnpm run check:platform-live-service-receipt
```

## Validation

```bash
corepack pnpm --filter @holoscript/platform run test
corepack pnpm run check:registry-cold-start:platform-public-api
corepack pnpm run check:package-consumption
corepack pnpm run check:platform-live-service-receipt
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```

## Package boundary & release posture

`@holoscript/platform` is a **v0-preview** enterprise platform substrate for external and agent-framework consumers who need security, identity, registry, Web3/ANS, contract, token, and access-control primitives directly, without depending on the rest of the HoloScript monorepo. It **does not ship** any founder-local deployment, fleet topology, or hosted registry — every registry endpoint, KEK material, tenancy/quota policy, and Web3/contract/ANS namespace is caller-owned: bring your own config, credentials, and environment variables and point it at your own registry, contract, and identity endpoints.

**Known limitations:** package installation proves the local API surface only; hosted HoloKey/x402 payment, wallet custody, and identity-service availability still require separate live endpoint receipts. Several capabilities (renderer, Web3/gltf tooling, tree-sitter grammars) are `optionalDependencies` the consumer installs as needed. Interfaces may change before the v1 release.
