# @holoscript/secrets-broker

**Sovereign primitive: capability-token broker for per-surface AI-agent bearers.**

Generalizes the per-brain `HOLOMESH_API_KEY_<HANDLE>_X402` + x402 pattern (see [`docs/headless-agents.md`](../../docs/headless-agents.md) and `research/2026-04-27_identity-revamp-per-window.md`) into a typed, framework-agnostic contract usable by any AI surface — mobile, desktop, headless, hardware.

## What this package is

A **pure typed contract** for:

- Handle parsing and trust-tier defaults (`claude1`, `cursor1`, `mobile1`, `headless1`, etc.)
- Capability-token minting with short-lived TTL (60s–3600s, default 15min)
- Capability-token validation, revocation, and store-form transformation
- Device-flow pairing challenges (user-code + device-code, RFC-8628-style)

The package has **no I/O**. It exposes pure functions; consumers wire transport, persistence, and wallet storage. This is intentional — the same primitives back the HoloMesh server route, the Studio Verify page, and any future commercial deployment of the broker as a service.

## What this package is NOT (yet)

Filed as follow-up tasks (see `/room board`):

- HTTP transport: HoloMesh server routes (`/api/holomesh/team/:id/secrets-broker/*`)
- Wallet / long-lived bearer storage (uses existing HoloMesh identity layer)
- HoloScript Protocol economic-layer commercialization (D.013)
- Per-surface UX: mobile paste flow, desktop OAuth verify page
- GitHub OAuth device-flow integration (S-6 from mobile-as-seat memo)

## Why a sovereign primitive

Per founder ruling 2026-05-11 (`task_1778474262916_j7z0`):

> Lives as sovereign primitive in HoloScript core (e.g. `packages/secrets-broker`), commercialized through existing `/protocol` layer pattern.

The pattern was already implicit across the ecosystem — each agent surface read its own `HOLOMESH_API_KEY_<HANDLE>_X402` env var, and Studio shipped a workspace-scoped `secretBroker.ts`. Making it sovereign means:

1. **One contract, many surfaces.** Mobile, Studio, headless agents, future commercial consumers all bind to the same shape.
2. **Sellable** (D.013). The /protocol layer can publish capability-broker grants as on-chain compositions with revenue splits.
3. **Auditable.** Every minted token carries a `receiptHash`; every revoke is timestamped + reasoned.

## API surface

```typescript
import {
  mintCapabilityToken,
  storeCapabilityToken,
  validateCapabilityToken,
  revokeCapabilityToken,
  createDeviceFlowChallenge,
  parseHandle,
  assertHandle,
  DEFAULT_CAPABILITY_BY_TRUST,
  DEFAULT_TRUST_BY_SURFACE,
} from '@holoscript/secrets-broker';

// Mint a token for a mobile surface (defaults to `reduced` trust tier).
const token = mintCapabilityToken({
  handle: 'mobile1',
  surface: 'mobile',
  ttlSeconds: 900,
});
// → { tokenId, tokenSecret, capabilities, expiresAt, receiptHash, ... }

// Server stores the hash; client gets the plaintext secret once.
const stored = storeCapabilityToken(token);

// Per request: validate against the stored record.
validateCapabilityToken({
  presentedSecret: token.tokenSecret,
  stored,
  needsCapability: 'mesh:read',
});
// → throws CapabilityTokenError on revoked / expired / wrong secret / missing capability
```

## Trust tiers

| Trust tier | Surfaces (default) | Capabilities |
|-----------|---------------------|--------------|
| `full` | `claude`, `cursor`, `copilot`, `gemini`, `codex` | All — including `mesh:claim`, `mesh:done`, `mesh:sign`, `protocol:publish`, `protocol:collect`, `github:pr.comment` |
| `reduced` | `mobile`, `headless` | Read + message + knowledge.write + suggestion.vote + protocol.lookup + github.read |
| `read-only` | (opt-in via `trust: 'read-only'`) | Read + protocol.lookup + github.read |

A surface can step **down** its trust tier (mobile → read-only) but cannot escalate above its default (mobile cannot ask for `full`). This matches the mobile-as-seat memo's S-3 + SEC-2 + SEC-3 constraints.

## Security posture

- **Token plaintext is returned exactly once** at mint time. Server stores only the SHA-256 hash.
- **Short TTLs.** Default 15 min; hard maximum 1 hour. Per S-7 (mobile-as-seat memo).
- **Revocation is explicit and reasoned.** No silent expiry-only flow; ops can revoke + audit.
- **Constant-error semantics.** All validation failures throw `CapabilityTokenError` with a code — no boolean false-return that callers might mishandle (G.GOLD.013).
- **No wallet I/O.** This package never touches `HOLOMESH_WALLET_ADDRESS` / `HOLOMESH_WALLET_KEY` (G.GOLD.016 — wallets sacred).
- **Frozen objects.** Minted tokens and stored records are `Object.freeze`d to prevent accidental mutation.

## Follow-up scope (tracked on the board)

The P5 FOUNDATION task `task_1778474262916_j7z0` decomposes into:

1. **Scaffold** (this commit) — package + interface + tests
2. **HoloMesh server routes** — `POST /team/:id/secrets-broker/mint`, `POST /verify`, `POST /revoke`, `POST /device-flow/challenge`, `POST /device-flow/poll`
3. **Wallet/bearer storage layer** — bind to existing HoloMesh per-handle identity
4. **Studio Verify page** — UI for `verificationUri` in device-flow challenges
5. **/protocol commercialization** — publish broker grants as on-chain compositions
6. **Mobile pilot wiring** — `/mobile-brief` consumes a `mobile1` capability token
7. **GOLD entry** — graduate the public-service architecture decision

## License

MIT — see repo root.
