# @holoscript/platform

`@holoscript/platform` is the enterprise platform substrate for HoloScript. It
packages security, identity, registry, tenancy, rate-limit, crypto, Web of
Things, contracts, ANS, Web3, access-control, and platform renderer exports
behind one installable package.

## Install

```bash
npm install @holoscript/platform
```

## Use

```ts
import { CapabilityValidator, PackageRegistry } from '@holoscript/platform';
```

## Package Surface

| Subsystem        | Purpose                                         |
| ---------------- | ----------------------------------------------- |
| `security`       | Security framework and crypto utilities         |
| `identity`       | Capability and identity validation              |
| `registry`       | Package registry and certification support      |
| `tenancy`        | Tenant context and workspace isolation          |
| `ratelimit`      | Quotas, buckets, and rate-limit tiers           |
| `web3`           | Web3 connector and blockchain-facing primitives |
| `contracts`      | Contract helpers and platform agreements        |
| `crypto`         | Hybrid and post-quantum crypto helpers          |
| `wot`            | Web of Things integration surface               |
| `renderer`       | Platform-aware renderer exports                 |

## Strategy Role

This package is a supported runtime module, not a default v1 fleet install. Use
it when a service or package needs platform security, identity, registry, or
Web3 primitives directly.

Marketplace service APIs belong in `@holoscript/marketplace-api`; lower-level
network and collaboration primitives belong in `@holoscript/mesh`; agent
lifecycle orchestration belongs in `@holoscript/framework` and
`@holoscript/agent-protocol`.

Promote `@holoscript/platform` into the laptop, Jetson, and Vast consumption
matrix only when a concrete fleet consumer needs to install it directly rather
than receiving it through a higher-level package.

## Validation

```bash
corepack pnpm --filter @holoscript/platform run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
