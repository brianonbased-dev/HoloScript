/**
 * Attestation Registry — Phase 1-2 substrate for the seat-wallets-adr.
 *
 * Maps `public_key → attestation` for all seat wallets the founder has
 * signed off on, plus a retired set for revoked seats. The registry is the
 * source of truth for "is this signer authorized" and "is this signer
 * still active" — `request-signing.ts::verifyEnvelope` calls into it via
 * the optional `registryCheck` hook so a retired seat's new signatures
 * are rejected even if cryptographically valid.
 *
 * Phase 1 storage: in-memory only. Persistence (disk / database) is a
 * future hardening step — the registry is rebuilt on server boot from
 * the founder's signed attestation log when that ships.
 *
 * Propagation: when an attestation is retired, the registry fires its
 * `onRetire` callback so consumers (route handlers that hold the team
 * room context) can broadcast a `attestation:retire` event over the
 * existing SSE feed. Per ADR §"Attestation registry (Q5 SSE <60s)" the
 * 50-event ring buffer in team-room.ts gives reconnecting clients
 * cache-invalidation under the 60s propagation bound.
 *
 * Past signatures from retired seats remain cryptographically valid
 * at-time-of-signing — retire only blocks NEW claims (caller must call
 * registryCheck on each new mutation).
 *
 * Spec: research/2026-04-21_seat-wallets-adr.md §"Revocation",
 * §"Attestation registry", §"Resolved defaults #5".
 *
 * @module holomesh/identity/attestation-registry
 */

/** A founder-signed attestation binding a seat's public key to an authorized identity. */
export interface Attestation {
  /** Lowercased 0x… ethereum address of the seat. */
  publicKey: string;
  /** Human-readable seat identifier (e.g. claude-claudecode-abc-default-x402). */
  seatId: string;
  /** Who signed this attestation: ecosystem-root / platform-root / a parent wallet. */
  authorizedBy: string;
  /** ISO 8601 issuance timestamp. */
  issuedAt: string;
  /** ISO 8601 expiry; null = never expires. */
  expiresAt: string | null;
  /** Set when retired; reflects the retirement timestamp, not the issuance. */
  retiredAt?: string;
  /** Set when retired; human-readable reason ('compromise' / 'rotation' / etc). */
  retireReason?: string;
}

/** Event fired when an attestation is retired. Consumers wire this to SSE. */
export interface AttestationRetireEvent {
  publicKey: string;
  seatId: string;
  retiredAt: string;
  reason: string;
}

/** Optional callback fired on retire so consumers can broadcast the event. */
export type OnRetireCallback = (event: AttestationRetireEvent) => void;

/** Registry-side check used by request-signing's verifyEnvelope. */
export interface RegistryCheckResult {
  attested: boolean;
  retired: boolean;
  /** Optional reason string for logging when attested=false / retired=true. */
  reason?: string;
}

/** Lowercase + 0x-prefix normalize for case-insensitive Ethereum-address keys. */
function normalizeKey(publicKey: string): string {
  if (typeof publicKey !== 'string') return '';
  return publicKey.toLowerCase();
}

export class AttestationRegistry {
  private byKey = new Map<string, Attestation>();
  private retired = new Set<string>();
  private onRetire?: OnRetireCallback;

  constructor(opts: { onRetire?: OnRetireCallback } = {}) {
    this.onRetire = opts.onRetire;
  }

  /** Add or replace an attestation. Idempotent on identical input. */
  attest(att: Attestation): void {
    if (!att.publicKey) throw new Error('attest: publicKey required');
    if (!att.seatId) throw new Error('attest: seatId required');
    const key = normalizeKey(att.publicKey);
    this.byKey.set(key, { ...att, publicKey: key });
    // Re-attesting an explicitly-retired key is allowed (key rotation flows);
    // callers must understand the implications. Clear the retired flag.
    this.retired.delete(key);
  }

  /**
   * Mark an attestation as retired. Returns the (now-retired) attestation, or
   * null if the key was unknown. Fires onRetire callback when present.
   */
  retire(publicKey: string, reason: string): Attestation | null {
    const key = normalizeKey(publicKey);
    const att = this.byKey.get(key);
    if (!att) return null;
    if (this.retired.has(key)) return att; // already retired; no double-fire
    const retiredAt = new Date().toISOString();
    const updated: Attestation = { ...att, retiredAt, retireReason: reason };
    this.byKey.set(key, updated);
    this.retired.add(key);
    if (this.onRetire) {
      try {
        this.onRetire({ publicKey: key, seatId: att.seatId, retiredAt, reason });
      } catch {
        // Broadcast failure must not break the retire — attestation state is
        // authoritative even if the SSE feed is down. Consumer handles resync.
      }
    }
    return updated;
  }

  /** Look up an attestation by public key. Returns undefined when unknown. */
  lookup(publicKey: string): Attestation | undefined {
    return this.byKey.get(normalizeKey(publicKey));
  }

  /** True iff the key is attested AND not retired AND not expired (vs nowMs). */
  isAttested(publicKey: string, nowMs: number = Date.now()): boolean {
    const key = normalizeKey(publicKey);
    const att = this.byKey.get(key);
    if (!att) return false;
    if (this.retired.has(key)) return false;
    if (att.expiresAt) {
      const exp = Date.parse(att.expiresAt);
      if (!Number.isNaN(exp) && exp <= nowMs) return false;
    }
    return true;
  }

  /** True iff the key is in the retired set (regardless of expiry / re-attest). */
  isRetired(publicKey: string): boolean {
    return this.retired.has(normalizeKey(publicKey));
  }

  /** Number of distinct attestations (retired + active). */
  size(): number {
    return this.byKey.size;
  }

  /** Number of currently-retired attestations. */
  retiredCount(): number {
    return this.retired.size;
  }

  /**
   * Build a registryCheck function suitable for `request-signing.ts`'s
   * `verifyEnvelope({ registryCheck })` option. The returned function is
   * sync-result wrapped in a Promise (registry is in-memory) so callers
   * can await uniformly with future persistence-backed implementations.
   */
  toRegistryCheck(nowMs?: number): (publicKey: string) => Promise<RegistryCheckResult> {
    return async (publicKey: string) => {
      const key = normalizeKey(publicKey);
      const retired = this.retired.has(key);
      if (retired) {
        return { attested: false, retired: true, reason: 'signer-retired' };
      }
      const attested = this.isAttested(key, nowMs);
      return {
        attested,
        retired: false,
        reason: attested ? undefined : 'signer-not-attested',
      };
    };
  }

  /** Test-only: reset state. Avoid in production code paths. */
  clear(): void {
    this.byKey.clear();
    this.retired.clear();
  }
}

/**
 * Compose with a SSE broadcaster (e.g. `broadcastToRoom` from `team-room.ts`)
 * to get a registry whose retires propagate to the team's `/room/live` clients
 * within the 60s SSE bound. Wire from the route handler that calls retire():
 *
 *     const registry = createBroadcastingRegistry(teamId, broadcastToRoom);
 *     registry.retire(pubkey, 'compromise');  // event fires automatically
 *
 * The `broadcaster` arg is intentionally typed as a minimal call shape so this
 * module never imports from team-room.ts (preserves Identity-namespace
 * separation; tests can pass a spy).
 */
export function createBroadcastingRegistry(
  teamId: string,
  broadcaster: (roomId: string, event: { type: string; agent?: string; data?: unknown }) => void,
  opts: { agent?: string } = {}
): AttestationRegistry {
  return new AttestationRegistry({
    onRetire: (event) => {
      broadcaster(teamId, {
        type: 'attestation:retire',
        agent: opts.agent,
        data: event,
      });
    },
  });
}
