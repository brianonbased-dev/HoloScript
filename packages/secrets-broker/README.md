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
- Repository identity origination and transitions through explicit HoloKey
  clock, signature-verifier, and atomic authority-store capabilities.

`@holoscript/config` uses this package as its default HoloKey-aware secret bridge, so callers such as Absorb and HoloLlama can resolve service config from HoloKey without taking a direct dependency on broker internals.

## What stays outside this npm package

The npm package is the custody primitive, not the whole deployed product:

- HTTP/MCP routes live in `packages/mcp-server` and call the broker contracts.
- Studio UX lives in `packages/studio`.
- Wallet identity, x402 signing, and long-lived seat custody remain in the HoloMesh identity layer.
- Protocol commercialization belongs to the `/protocol` economic layer.
- After verifier-facade migration, HoloRepo may verify or project deprecated
  `holorepo.*` v1 repository-identity wires but must not originate, rotate,
  revoke, migrate, or recover them. The current packed HoloRepo still exports
  legacy mutators, so this production ownership migration is not complete.
- Production deployments must provide a production-grade KEK source; the env KEK provider is dev/bootstrap only and is rejected by the production gate.

## Repository identity authority contract

HoloKey is the designated sole durable owner of repository identity. This
package supplies its authority contract and a bootstrap implementation; it does
not yet prove that an authenticated durable HoloKey root issued or read back an
identity. Import the dedicated entry point so that boundary remains visible:

```typescript
import {
  buildProvisionalRepositoryIdentity,
  buildRepositoryAuthorityIntent,
  transitionRepositoryIdentity,
} from '@holoscript/secrets-broker/repository-identity';
```

The same entry point also exposes the read-only compatibility boundary used by
HoloRepo:

```typescript
import {
  projectHoloKeyIdentityEvidence,
  verifyHoloKeyIdentityEvidence,
} from '@holoscript/secrets-broker/repository-identity';
```

Those functions accept an explicit
`holokey.repository-identity-evidence.v1` envelope, validate the HoloKey
identity content binding, and return compatibility/readback evidence without
issuing, persisting, or mutating identity. The current envelope is deliberately
marked `caller-injected-contract-capabilities` with
`authenticatedDurableReadback: false`; it is not an authenticated HoloKey root
receipt.

Provisional contract-object construction requires an injected trusted clock. A
transition additionally requires a signature-verifier capability and an
authority store whose single
`compareAndCommit` operation atomically binds the expected checkpoint, nonce,
signed payload, semantic intent, successor identity, and transition receipt.
The CAS request carries the intent issue/expiry timestamps in clear typed fields
as well as their content hashes, so the store can enforce the deadline at the
atomic commit point. The bootstrap module also re-reads its trusted clock after
signature verification to reject approvals that cross expiry before CAS.
The store may return `replayed-exact` only for the identical commit request;
stale checkpoints, reused nonces with changed content, and forks are conflicts.
Rotate-to-current-controller and migrate-to-identical-repository requests are
semantic no-ops and are rejected; callers must choose the action that actually
changes the governed state.
Recovery key sets and thresholds are capped at `MAX_APPROVALS - 1` so the
required successor approval always fits within the shared approval bound.

Only portable key references, detached public signatures, and digest-bound
verification receipts cross this API. Raw private keys, seed phrases, bearer
tokens, credential URLs, local paths, coercive objects, getters, proxies,
cycles, sparse arrays, and unbounded JSON are rejected.

Signature receipts use explicit byte semantics: `signingMessageHash` is SHA-256
over the raw UTF-8 bytes of the canonical JSON signing message and therefore
equals `payloadHash`; `signatureDigest` is SHA-256 over the decoded
65-byte EIP-191 signature, not over a JSON-quoted string.

The `holorepo.*` v1 constants and `projectLegacyRepositoryIdentity()` exist only
for a deprecated read-only compatibility projection. Projection requires the
same-module local bootstrap contract result; a
deserialized record with self-consistent unkeyed hashes is intentionally
refused because hashes and a closure brand do not prove authenticated HoloKey
issuance. The projection explicitly reports
`local-bootstrap-contract-only` and
`authenticatedDurableReadback: false`. Closure brands are module-instance
local, so ESM and CJS results cannot be mixed in one authority lifecycle; use
one module system consistently until authenticated durable readback replaces
that bootstrap boundary. These schemas are not accepted by the authority
contract mutation path and must be removed from HoloRepo in its next major
version.

### Native publication status

The source-level transition table lives at the exported
`@holoscript/secrets-broker/repository-identity/source` path. The native gate
invokes the repository-owned `holoscriptc`, executes three independently
compiled five-bit state-row programs, reconstructs the complete 15-bit
state/action table, and requires both native source and bootstrap adapter to
equal the reviewed bitmask `16833`:

```bash
pnpm --filter @holoscript/secrets-broker run check:repository-identity-native
```

That compiler currently cannot materialize the full importable ESM/CJS package
surface for bounded canonical JSON, SHA-256 binding, signature verification,
atomic compare-and-commit, or authenticated durable HoloKey authority-root
readback. The command therefore emits a machine-readable
`HOLOKEY_NATIVE_AUTHORITY_SURFACE_INCOMPLETE` and
`HOLOREPO_IDENTITY_MUTATOR_MIGRATION_INCOMPLETE` blockers and exits nonzero even
when the complete transition-table equivalence check passes. `prepack` runs
this gate, so the repository-identity authority cannot be published until the
language builds the entire implementation and HoloRepo becomes a verifier
facade. The TypeScript module is a bootstrap contract implementation, not an
authority-root or graduation receipt.

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
# Expected to remain nonzero until holoscriptc materializes the full authority:
corepack pnpm --filter @holoscript/secrets-broker run check:repository-identity-native
```

## Package boundary & release posture

`@holoscript/secrets-broker` is a **v0-preview** sovereign custody primitive for external operators, agent frameworks, and founder-owned services that need capability-token minting, HoloKey vault storage, and service-secret resolution. It **does not ship** any wallet identity, x402 signing, long-lived seat custody, or hosted HTTP/MCP routes — those stay in their owning packages (`packages/mcp-server`, the HoloMesh identity layer, and the `/protocol` economic layer). The package boundary is the custody contract only: every KEK source, storage backend (in-memory or Postgres), and lease adapter is caller-owned — bring your own KEK material, storage backend, and environment variables and point the resolver at your own vault or `process.env`.

**Known limitations:** the built-in env KEK provider is dev/bootstrap only and is rejected outright in `NODE_ENV=production`; production deployments must supply a scoped-keyring/KMS-backed KEK. Interfaces may change before the v1 release.

## License

MIT, see repo root.
