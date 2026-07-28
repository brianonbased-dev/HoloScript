# @holoscript/secrets-broker

**Sovereign primitive: HoloKey vault, service-secret resolver, and capability-token broker for AI surfaces.**

The package generalizes the per-brain `HOLOMESH_API_KEY_<HANDLE>_X402` pattern into a reusable HoloKey custody surface. Mobile, desktop, headless, Jetson, fleet, and service processes can all share the same contracts for scoped capability tokens, vault-backed operational secrets, KEK rotation, and auditable resolution.

## Install

```bash
npm install @holoscript/secrets-broker
```

## What this package is

This package now carries both pure contracts and runtime-safe server primitives:

- Capability-token minting, hashing, validation, revocation, and trust-tier policy.
- Device-flow challenge contracts for pairing constrained surfaces.
- HoloKey `SecretStore` with AES-256-GCM value encryption and wrapped DEKs.
- Env, scoped-keyring, and KMS-shaped KEK providers behind the same `KekProvider` interface.
- In-memory and Postgres secret backends plus lease adapters.
- `createHoloKeyVault()` bootstrap for turning the encrypted value store on when a KEK is configured.
- `createServiceSecretResolver()` for "vault first, then `process.env`" service migration.
- `@needs_key` trait helpers for request-scoped secret resolution.
- Resolve receipts and access-policy checks that never emit secret plaintext.

`@holoscript/config` uses this package as its default HoloKey-aware secret bridge, so callers such as Absorb and HoloLlama can resolve service config from HoloKey without taking a direct dependency on broker internals.

## What stays outside this npm package

The npm package is the custody primitive, not the whole deployed product:

- HTTP/MCP routes live in `packages/mcp-server` and call the broker contracts.
- Studio UX lives in `packages/studio`.
- Wallet identity, x402 signing, and long-lived seat custody remain in the HoloMesh identity layer.
- Protocol commercialization belongs to the `/protocol` economic layer.
- Production deployments must provide a production-grade KEK source; the env KEK provider is dev/bootstrap only and is rejected by the production gate.

## HoloKey service migration

Use the service resolver when a process should read operational config from the vault when present and keep its old env behavior when the vault is off.

```typescript
import { createServiceSecretResolver } from '@holoscript/secrets-broker';

const secrets = createServiceSecretResolver();

const endpoint = await secrets.resolve('HOLOLLAMA_ENDPOINT');
const apiKey = await secrets.resolve('OPENAI_API_KEY');
```

Resolution order:

1. `vault:<NAME>` under the derived service owner.
2. `infra://.../<NAME>` normalized to the service owner.
3. `process.env.NAME`.

If the env value itself is a vault ref, such as `HOLOLLAMA_ENDPOINT=vault:HOLOLLAMA_ENDPOINT`, the resolver dereferences it when the vault is on and returns `undefined` when the vault is off, preventing a vault ref literal from leaking to callers.

## KEK configuration

Development and tests may use the env KEK provider:

```bash
SECRETS_VAULT_KEK_CURRENT=v1
SECRETS_VAULT_KEK_V1=<base64-32-byte-kek>
```

Production should use the scoped-keyring/KMS path:

```bash
HOLOKEY_PROD_KEK_CURRENT=v1
HOLOKEY_PROD_KEK_V1=<sealed-or-managed-kek-material>
```

`NODE_ENV=production` rejects the dev env KEK provider. That is intentional: a single leaked env KEK would unwrap every stored operational secret.

## Capability-token API

```typescript
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

The plaintext token secret is returned once at mint time. Servers persist only the hash.

## Trust tiers

| Trust tier  | Surfaces (default)                               | Capabilities                                                                  |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `full`      | `claude`, `cursor`, `copilot`, `gemini`, `codex` | Full mesh/protocol/GitHub command set                                         |
| `reduced`   | `mobile`, `headless`                             | Read, message, knowledge write, suggestion vote, protocol lookup, GitHub read |
| `read-only` | Opt-in                                           | Read, protocol lookup, GitHub read                                            |

A surface can step down its trust tier, but cannot escalate above its default.

## Security posture

- Secret plaintext is never emitted in receipts, audits, or resolve-denied events.
- Capability tokens are short-lived with a hard one-hour maximum.
- Revocation is explicit and reasoned.
- Validation throws `CapabilityTokenError`; it never returns a silent `false`.
- Wallet custody is not duplicated in this package.
- HoloKey vault bootstrap is flag-gated: no KEK means vault off, not boot failure.
- Production rejects dev-grade KEKs.

## Validation

```bash
corepack pnpm --filter @holoscript/secrets-broker run build
corepack pnpm --filter @holoscript/secrets-broker run test
```

## Package boundary & release posture

`@holoscript/secrets-broker` is a **v0-preview** sovereign custody primitive for external operators, agent frameworks, and founder-owned services that need capability-token minting, HoloKey vault storage, and service-secret resolution. It **does not ship** any wallet identity, x402 signing, long-lived seat custody, or hosted HTTP/MCP routes — those stay in their owning packages (`packages/mcp-server`, the HoloMesh identity layer, and the `/protocol` economic layer). The package boundary is the custody contract only: every KEK source, storage backend (in-memory or Postgres), and lease adapter is caller-owned — bring your own KEK material, storage backend, and environment variables and point the resolver at your own vault or `process.env`.

**Known limitations:** the built-in env KEK provider is dev/bootstrap only and is rejected outright in `NODE_ENV=production`; production deployments must supply a scoped-keyring/KMS-backed KEK. Interfaces may change before the v1 release.

## License

MIT, see repo root.
