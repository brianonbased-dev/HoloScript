# @holoscript/secrets-broker

`@holoscript/secrets-broker` is the HoloKey capability-token and scoped-secret
contract package. It turns per-surface agent bearers, device-flow pairing,
secret grants, scoped key resolution, vault manifests, and production key
encryption boundaries into a typed package that services and agent surfaces can
consume without copying private key logic.

## Install

```bash
npm install @holoscript/secrets-broker
```

## Use

```ts
import {
  mintCapabilityToken,
  storeCapabilityToken,
  validateCapabilityToken,
} from '@holoscript/secrets-broker';

const token = mintCapabilityToken({
  handle: 'mobile1',
  surface: 'mobile',
  ttlSeconds: 900,
});

const stored = storeCapabilityToken(token);
validateCapabilityToken({
  presentedSecret: token.tokenSecret,
  stored,
  needsCapability: 'mesh:read',
});
```

## Package Surface

| Subsystem         | Purpose                                      |
| ----------------- | -------------------------------------------- |
| Capability tokens | Mint, store, validate, and revoke bearers    |
| Device flow       | Pair agent surfaces with short-lived codes   |
| Secret grants     | Policy-gated access to named secrets         |
| Secret resolvers  | Resolve scoped secrets through approved APIs |
| Secret stores     | Encrypted per-owner secret storage contracts |
| Lease adapters    | Memory and Postgres-backed lease boundaries  |
| KEK providers     | Environment and KMS key-encryption providers |
| HoloKey receipts  | Tamper-evident secret-resolution receipts    |

## Strategy Role

This package is a supported runtime module for sovereign key custody and
agent-surface authorization. It is not a general auth server and it does not own
wallet material directly. Keep HTTP transport in HoloMesh service routes,
marketplace/API authentication in the service packages, and low-level sandboxing
in `@holoscript/security-sandbox`.

Promote `@holoscript/secrets-broker` into laptop, Jetson, and Vast consumption
only when a concrete fleet consumer needs direct HoloKey or scoped-secret
resolution rather than receiving it through MCP/server infrastructure.

## Validation

```bash
corepack pnpm --filter @holoscript/secrets-broker run build
corepack pnpm --filter @holoscript/secrets-broker run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
