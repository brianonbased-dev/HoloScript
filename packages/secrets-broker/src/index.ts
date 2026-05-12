/**
 * @holoscript/secrets-broker — Sovereign primitive for AI-surface capability tokens
 *
 * Generalizes the per-brain `HOLOMESH_API_KEY_<HANDLE>_X402` + x402 pattern (S.IDENT,
 * docs/headless-agents.md) into a typed, framework-agnostic contract usable by any
 * AI surface (mobile, desktop, headless, hardware). The broker server holds wallets
 * and long-lived bearers; surfaces present a short-lived, scoped capability token
 * per session.
 *
 * Companion to:
 *   - `/protocol` (HoloScript Protocol economic layer) for commercialization (D.013)
 *   - HoloMesh signing-middleware for signed-attribution coverage (S.IDENT triangle)
 *   - `packages/studio/src/lib/workspace/secretBroker.ts` (workspace-scoped grants;
 *     this package generalizes that pattern to surface-scoped agent bearers)
 *
 * Scope of this scaffold (P5 FOUNDATION first iteration):
 *   - Typed contract for surfaces / handles / capabilities / capability tokens
 *   - Pure (no I/O) capability-token mint + validate + revoke logic
 *   - Device-flow pairing contract (interface only; transport in follow-up task)
 *   - Audit-receipt shape compatible with existing HoloDoor policy emission
 *
 * Out of scope (filed as follow-up tasks):
 *   - HTTP transport / HoloMesh server routes
 *   - Wallet storage / x402 bearer minting against real Anthropic / GitHub
 *   - /protocol on-chain commercialization wiring
 *   - Per-surface UX (mobile paste flow, desktop OAuth)
 *
 * @module @holoscript/secrets-broker
 */

import { createHash, randomBytes } from 'node:crypto';

// =============================================================================
// SURFACES & HANDLES
// =============================================================================

/**
 * Surface kind — drives auto-numbering of handles and capability defaults.
 * Mirrors the per-window handle revamp from `research/2026-04-27_identity-revamp-per-window.md`.
 */
export type SurfaceKind =
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'gemini'
  | 'codex'
  | 'mobile'
  | 'headless';

/**
 * Surface trust tier — gates which capabilities a surface can request.
 * Mobile defaults to a reduced tier (S-3 / S-4 from mobile-as-seat memo).
 */
export type SurfaceTrust = 'full' | 'reduced' | 'read-only';

/**
 * Auto-numbered per-window handle (e.g. `claude1`, `cursor2`, `mobile1`).
 * Naming convention: surface name + small-int slot, NOT editor name.
 */
export type Handle = `${SurfaceKind}${number}`;

/**
 * Capability strings — what a capability token can do.
 * Closed set so the broker can enforce policy without inspecting payloads.
 */
export type Capability =
  | 'mesh:read'
  | 'mesh:message'
  | 'mesh:claim'
  | 'mesh:done'
  | 'mesh:knowledge.write'
  | 'mesh:suggestion.write'
  | 'mesh:suggestion.vote'
  | 'mesh:sign'
  | 'protocol:lookup'
  | 'protocol:publish'
  | 'protocol:collect'
  | 'github:read'
  | 'github:pr.comment';

/**
 * Capability set returned for a given surface kind under a trust tier.
 * Pure data table; consumers may override via {@link CapabilityPolicy}.
 */
export const DEFAULT_CAPABILITY_BY_TRUST: Record<SurfaceTrust, readonly Capability[]> = {
  'read-only': ['mesh:read', 'protocol:lookup', 'github:read'],
  reduced: [
    'mesh:read',
    'mesh:message',
    'mesh:knowledge.write',
    'mesh:suggestion.vote',
    'protocol:lookup',
    'github:read',
  ],
  full: [
    'mesh:read',
    'mesh:message',
    'mesh:claim',
    'mesh:done',
    'mesh:knowledge.write',
    'mesh:suggestion.write',
    'mesh:suggestion.vote',
    'mesh:sign',
    'protocol:lookup',
    'protocol:publish',
    'protocol:collect',
    'github:read',
    'github:pr.comment',
  ],
} as const;

/**
 * Per-surface trust defaults. Mobile + headless start at `reduced` per S-3
 * (mobile-as-seat memo) and headless-agents cost discipline.
 */
export const DEFAULT_TRUST_BY_SURFACE: Record<SurfaceKind, SurfaceTrust> = {
  claude: 'full',
  cursor: 'full',
  copilot: 'full',
  gemini: 'full',
  codex: 'full',
  mobile: 'reduced',
  headless: 'reduced',
} as const;

// =============================================================================
// CAPABILITY TOKEN MODEL
// =============================================================================

/**
 * Minted, opaque-from-client capability token.
 * Server holds the underlying bearer / wallet keys; client only ever sees this token.
 *
 * Shape is JSON-stable so it can be serialised to HTTP headers, mobile push payloads,
 * or x402 challenges without renegotiation.
 */
export interface CapabilityToken {
  readonly version: 1;
  readonly event: 'capability.minted';
  readonly tokenId: string;
  readonly handle: Handle;
  readonly surface: SurfaceKind;
  readonly trust: SurfaceTrust;
  readonly capabilities: readonly Capability[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Random opaque secret. Server stores a hash; never log this plaintext. */
  readonly tokenSecret: string;
  /** Hash of the canonical token record. */
  readonly receiptHash: string;
}

/**
 * Server-side stored shape: same as {@link CapabilityToken} minus the plaintext
 * `tokenSecret`. Stored for revocation + lookup.
 */
export type StoredCapabilityToken = Omit<CapabilityToken, 'tokenSecret'> & {
  readonly tokenSecretHash: string;
  revokedAt?: string;
  revokeReason?: string;
};

/**
 * Input to {@link mintCapabilityToken}.
 */
export interface MintInput {
  handle: Handle;
  surface: SurfaceKind;
  /** Override the surface default trust. Cannot exceed `full`. */
  trust?: SurfaceTrust;
  /** Subset of capabilities to grant. Must be a subset of the trust tier's defaults. */
  capabilities?: readonly Capability[];
  /** TTL in seconds. Clamped to [{@link MIN_TTL_SECONDS}, {@link MAX_TTL_SECONDS}]. */
  ttlSeconds?: number;
  /** Inject a deterministic clock + RNG for testing. */
  now?: Date;
  randomBytes?: (size: number) => Buffer;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const MIN_TTL_SECONDS = 60;
/** 1 hour upper bound — short-lived per S-7 memo. */
export const MAX_TTL_SECONDS = 60 * 60;
/** Default TTL when caller doesn't specify one. */
export const DEFAULT_TTL_SECONDS = 15 * 60;

// =============================================================================
// ERRORS
// =============================================================================

export type CapabilityTokenErrorCode =
  | 'INVALID_HANDLE'
  | 'TRUST_NOT_ALLOWED'
  | 'CAPABILITY_NOT_IN_TRUST_TIER'
  | 'TTL_OUT_OF_RANGE'
  | 'TOKEN_REVOKED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID_SECRET';

export class CapabilityTokenError extends Error {
  constructor(
    message: string,
    public readonly code: CapabilityTokenErrorCode
  ) {
    super(message);
    this.name = 'CapabilityTokenError';
  }
}

// =============================================================================
// PURE HELPERS
// =============================================================================

const HANDLE_RE = /^(claude|cursor|copilot|gemini|codex|mobile|headless)(\d+)$/;

/**
 * Parse a handle string into {surface, slot}. Returns null on malformed input.
 */
export function parseHandle(handle: string): { surface: SurfaceKind; slot: number } | null {
  const m = HANDLE_RE.exec(handle);
  if (!m) return null;
  return { surface: m[1] as SurfaceKind, slot: Number(m[2]) };
}

/**
 * Assert a handle is well-formed and matches the claimed surface. Throws otherwise.
 */
export function assertHandle(handle: string, surface: SurfaceKind): asserts handle is Handle {
  const parsed = parseHandle(handle);
  if (!parsed) {
    throw new CapabilityTokenError(`Malformed handle: ${handle}`, 'INVALID_HANDLE');
  }
  if (parsed.surface !== surface) {
    throw new CapabilityTokenError(
      `Handle ${handle} does not match surface ${surface}`,
      'INVALID_HANDLE'
    );
  }
}

function clampTtl(seconds: number | undefined): number {
  if (seconds === undefined) return DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(seconds)) {
    throw new CapabilityTokenError(`Non-finite ttlSeconds: ${seconds}`, 'TTL_OUT_OF_RANGE');
  }
  const floored = Math.floor(seconds);
  if (floored < MIN_TTL_SECONDS || floored > MAX_TTL_SECONDS) {
    throw new CapabilityTokenError(
      `ttlSeconds ${floored} outside [${MIN_TTL_SECONDS}, ${MAX_TTL_SECONDS}]`,
      'TTL_OUT_OF_RANGE'
    );
  }
  return floored;
}

function canonicalHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

// =============================================================================
// CORE: MINT / VALIDATE / REVOKE
// =============================================================================

/**
 * Mint a fresh capability token for a surface handle.
 *
 * Pure: caller injects {@link MintInput.now} and {@link MintInput.randomBytes} for
 * determinism. No I/O. Throws {@link CapabilityTokenError} on policy violations.
 */
export function mintCapabilityToken(input: MintInput): CapabilityToken {
  assertHandle(input.handle, input.surface);

  const surfaceDefault = DEFAULT_TRUST_BY_SURFACE[input.surface];
  const trust = input.trust ?? surfaceDefault;

  // A surface cannot escalate above its default trust tier (e.g. mobile cannot ask for full).
  const trustRank: Record<SurfaceTrust, number> = { 'read-only': 0, reduced: 1, full: 2 };
  if (trustRank[trust] > trustRank[surfaceDefault]) {
    throw new CapabilityTokenError(
      `Surface ${input.surface} cannot request trust=${trust} (max=${surfaceDefault})`,
      'TRUST_NOT_ALLOWED'
    );
  }

  const allowed = DEFAULT_CAPABILITY_BY_TRUST[trust];
  const requested = input.capabilities ?? allowed;
  for (const cap of requested) {
    if (!allowed.includes(cap)) {
      throw new CapabilityTokenError(
        `Capability ${cap} not in trust tier ${trust}`,
        'CAPABILITY_NOT_IN_TRUST_TIER'
      );
    }
  }

  const ttl = clampTtl(input.ttlSeconds);
  const issuedAtDate = input.now ?? new Date();
  const issuedAt = issuedAtDate.toISOString();
  const expiresAt = new Date(issuedAtDate.getTime() + ttl * 1000).toISOString();

  const rng = input.randomBytes ?? randomBytes;
  // 32 bytes = 256 bits of entropy; hex-encoded for transport.
  const tokenSecret = rng(32).toString('hex');

  const tokenIdSeed = `${input.handle}|${input.surface}|${issuedAt}|${tokenSecret}`;
  const tokenId = `captok_${createHash('sha256').update(tokenIdSeed).digest('hex').slice(0, 24)}`;

  const unsigned: Omit<CapabilityToken, 'receiptHash' | 'tokenSecret'> = {
    version: 1,
    event: 'capability.minted',
    tokenId,
    handle: input.handle,
    surface: input.surface,
    trust,
    capabilities: Object.freeze([...requested]),
    issuedAt,
    expiresAt,
  };

  return Object.freeze({
    ...unsigned,
    tokenSecret,
    receiptHash: canonicalHash({ ...unsigned, tokenSecret }),
  });
}

/**
 * Convert a minted {@link CapabilityToken} into the server-side {@link StoredCapabilityToken}
 * shape. Strips plaintext `tokenSecret`, hashes it for later verification.
 */
export function storeCapabilityToken(token: CapabilityToken): StoredCapabilityToken {
  const { tokenSecret, ...rest } = token;
  return Object.freeze({
    ...rest,
    tokenSecretHash: `sha256:${createHash('sha256').update(tokenSecret).digest('hex')}`,
  });
}

export interface ValidateInput {
  presentedSecret: string;
  stored: StoredCapabilityToken;
  /** Capability the caller wants to exercise. Must be in stored.capabilities. */
  needsCapability: Capability;
  /** Inject a deterministic clock for testing. */
  now?: Date;
}

/**
 * Validate a presented capability token against its stored record.
 *
 * Returns `true` only when ALL of:
 *  - not revoked
 *  - not expired (vs `now`)
 *  - presented secret hashes to the stored hash
 *  - `needsCapability` is in the token's granted capability set
 *
 * Throws {@link CapabilityTokenError} on first failure; never returns false (G.GOLD.013:
 * computed-truth assertions need the false-case test, which lives in `index.test.ts`).
 */
export function validateCapabilityToken(input: ValidateInput): true {
  const nowDate = input.now ?? new Date();

  if (input.stored.revokedAt) {
    throw new CapabilityTokenError(
      `Token ${input.stored.tokenId} revoked: ${input.stored.revokeReason ?? 'no reason'}`,
      'TOKEN_REVOKED'
    );
  }

  if (new Date(input.stored.expiresAt).getTime() <= nowDate.getTime()) {
    throw new CapabilityTokenError(
      `Token ${input.stored.tokenId} expired at ${input.stored.expiresAt}`,
      'TOKEN_EXPIRED'
    );
  }

  const presentedHash = `sha256:${createHash('sha256').update(input.presentedSecret).digest('hex')}`;
  if (presentedHash !== input.stored.tokenSecretHash) {
    throw new CapabilityTokenError(
      `Token ${input.stored.tokenId} secret mismatch`,
      'TOKEN_INVALID_SECRET'
    );
  }

  if (!input.stored.capabilities.includes(input.needsCapability)) {
    throw new CapabilityTokenError(
      `Token ${input.stored.tokenId} does not grant ${input.needsCapability}`,
      'CAPABILITY_NOT_IN_TRUST_TIER'
    );
  }

  return true;
}

/**
 * Mark a stored token as revoked. Returns a new frozen object; does not mutate input.
 */
export function revokeCapabilityToken(
  stored: StoredCapabilityToken,
  reason: string,
  now: Date = new Date()
): StoredCapabilityToken {
  return Object.freeze({
    ...stored,
    revokedAt: now.toISOString(),
    revokeReason: reason,
  });
}

// =============================================================================
// DEVICE-FLOW PAIRING CONTRACT
// =============================================================================

/**
 * Stage-1 of device-flow: server issues a short user-code + opaque device-code.
 * Surface shows the user-code to the operator; operator visits the verification URL
 * on a paired desktop, confirms identity, and the server resolves the device-code
 * to a minted capability token.
 *
 * This package defines the CONTRACT only — transport + UI are deferred to follow-up
 * tasks (`packages/mcp-server/holomesh/routes/secrets-broker-routes.ts` plus a Studio
 * verify page).
 */
export interface DeviceFlowChallenge {
  readonly version: 1;
  readonly event: 'device-flow.challenge';
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
  readonly receiptHash: string;
}

export interface CreateDeviceFlowChallengeInput {
  verificationUri: string;
  /** TTL of the device-code itself; user-code expires together. */
  ttlSeconds?: number;
  /** Polling interval the surface should respect. Defaults to 5s. */
  intervalSeconds?: number;
  now?: Date;
  randomBytes?: (size: number) => Buffer;
}

/**
 * Mint a device-flow challenge. Pure; transport-agnostic.
 */
export function createDeviceFlowChallenge(
  input: CreateDeviceFlowChallengeInput
): DeviceFlowChallenge {
  const ttl = clampTtl(input.ttlSeconds ?? 10 * 60);
  const interval = input.intervalSeconds ?? 5;
  if (interval < 1 || interval > 60 || !Number.isFinite(interval)) {
    throw new CapabilityTokenError(
      `intervalSeconds ${interval} outside [1, 60]`,
      'TTL_OUT_OF_RANGE'
    );
  }

  const rng = input.randomBytes ?? randomBytes;
  const deviceCode = rng(24).toString('hex');
  // 8-char user-code, alphabet excludes ambiguous chars (0/O/1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const userBuf = rng(8);
  let userCode = '';
  for (let i = 0; i < 8; i++) {
    userCode += alphabet[userBuf[i] % alphabet.length];
  }
  // Hyphenate for human readability: ABCD-EFGH
  userCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;

  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttl * 1000).toISOString();

  const unsigned: Omit<DeviceFlowChallenge, 'receiptHash'> = {
    version: 1,
    event: 'device-flow.challenge',
    deviceCode,
    userCode,
    verificationUri: input.verificationUri,
    expiresAt,
    intervalSeconds: interval,
  };

  return Object.freeze({
    ...unsigned,
    receiptHash: canonicalHash(unsigned),
  });
}

// =============================================================================
// CAPABILITY TOKEN REGISTRY
// =============================================================================

/**
 * In-memory store for {@link StoredCapabilityToken}, keyed on `tokenId`.
 *
 * Composes the existing pure mint / validate / revoke functions into a usable
 * server-side surface: a route handler can `put` a stored token after minting,
 * later `get` it by id from a presented capability-token header, and `revoke`
 * it when the owning seat retires or a compromise is detected.
 *
 * Phase 1 storage is in-memory only — the registry is rebuilt on server boot
 * from a persistence layer when that ships (mirrors the AttestationRegistry
 * Phase-1 pattern at `packages/mcp-server/src/holomesh/identity/attestation-registry.ts`).
 *
 * No automatic expiry sweep: callers either let {@link validateCapabilityToken}
 * reject expired tokens at validate-time (cheap, lazy), or call
 * {@link CapabilityTokenRegistry.pruneExpired} on a timer.
 *
 * @see mintCapabilityToken
 * @see storeCapabilityToken
 * @see validateCapabilityToken
 * @see revokeCapabilityToken
 */
export class CapabilityTokenRegistry {
  private readonly byId = new Map<string, StoredCapabilityToken>();

  /**
   * Add or replace a stored token. Replacement is idempotent on identical
   * input; callers re-storing a revoked token (e.g. on resurrection during
   * key rotation) should explicitly mint a fresh token instead.
   */
  put(stored: StoredCapabilityToken): void {
    if (!stored.tokenId) throw new CapabilityTokenError('put: tokenId required', 'INVALID_HANDLE');
    this.byId.set(stored.tokenId, stored);
  }

  /** Look up a stored token by id. Returns `undefined` when not found. */
  get(tokenId: string): StoredCapabilityToken | undefined {
    return this.byId.get(tokenId);
  }

  /** True iff the registry holds a token under this id (regardless of revoked/expired state). */
  has(tokenId: string): boolean {
    return this.byId.has(tokenId);
  }

  /**
   * Revoke the stored token under `tokenId`. Returns the new (revoked) record
   * or `null` if no token exists under that id. Idempotent on already-revoked
   * tokens — re-revoking returns the existing revoked record without overwriting
   * the original `revokedAt` / `revokeReason`.
   */
  revoke(tokenId: string, reason: string, now: Date = new Date()): StoredCapabilityToken | null {
    const existing = this.byId.get(tokenId);
    if (!existing) return null;
    if (existing.revokedAt) return existing;
    const revoked = revokeCapabilityToken(existing, reason, now);
    this.byId.set(tokenId, revoked);
    return revoked;
  }

  /** Number of stored tokens (active + revoked + expired). */
  size(): number {
    return this.byId.size;
  }

  /** Snapshot of all stored tokens. Returned array is independent of internal state. */
  list(): readonly StoredCapabilityToken[] {
    return Array.from(this.byId.values());
  }

  /**
   * Drop expired tokens from the registry. Returns the count removed.
   * Callers can run this on a timer to bound memory; not running it is fine —
   * {@link validateCapabilityToken} rejects expired tokens lazily.
   */
  pruneExpired(now: Date = new Date()): number {
    const cutoff = now.getTime();
    let removed = 0;
    for (const [id, t] of this.byId) {
      if (new Date(t.expiresAt).getTime() <= cutoff) {
        this.byId.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Convenience: combine {@link get} + {@link validateCapabilityToken} into a
   * single call. The caller presents a token id + plaintext secret + the
   * capability they want to exercise; returns `true` on full success or
   * throws {@link CapabilityTokenError} otherwise.
   *
   * Returns `true` only — never `false` — matching the existing validator
   * contract. Use this in HTTP route handlers wrapping mutating operations.
   */
  validateById(
    tokenId: string,
    presentedSecret: string,
    needsCapability: Capability,
    now: Date = new Date()
  ): true {
    const stored = this.byId.get(tokenId);
    if (!stored) {
      throw new CapabilityTokenError(`Token ${tokenId} not found`, 'TOKEN_INVALID_SECRET');
    }
    return validateCapabilityToken({ presentedSecret, stored, needsCapability, now });
  }

  /** Test-only: drop all entries. */
  clear(): void {
    this.byId.clear();
  }
}
