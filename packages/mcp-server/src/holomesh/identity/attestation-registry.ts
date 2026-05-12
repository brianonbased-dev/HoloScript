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
  /**
   * Optional ML-DSA-65 public key bytes (FIPS-204 Category-3 / ~AES-192).
   * Present once the seat's owner has bound a post-quantum key alongside
   * the classical Ethereum address. The same Attestation entry carries both
   * keys so dual-mode signature verification can cross-check that the
   * classical address AND the pqc key map to the SAME seat (defends against
   * substitution attacks where an attacker pairs a valid classical sig from
   * seat A with a valid pqc sig from seat B).
   *
   * 2030 NIST classical-deprecation runway — see
   * research/2026-05-12_pqc-dual-sign-design.md.
   */
  pqcPublicKey?: Uint8Array;
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

/**
 * Encode a PQC public key as a stable hex string for use as a Map key.
 * ML-DSA-65 public keys are 1952 bytes; hex doubles that — within memory
 * budget for the in-memory registry (a few hundred entries max).
 *
 * Returns the empty string for empty/missing input so the secondary index
 * never accidentally indexes a zero-length key.
 */
export function pqcKeyToHex(pqcPublicKey: Uint8Array | undefined): string {
  if (!pqcPublicKey || pqcPublicKey.length === 0) return '';
  let hex = '';
  for (let i = 0; i < pqcPublicKey.length; i++) {
    hex += pqcPublicKey[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Constant-time-flavor compare of two Uint8Arrays — registry indices use hex
 *  for Map keys so this is only used in defensive equality checks at boundaries. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export class AttestationRegistry {
  private byKey = new Map<string, Attestation>();
  /** Secondary index — pqcPublicKey hex → attestation. Always references the
   *  same Attestation object stored in byKey; updated atomically with attest()
   *  and retire(). */
  private byPqcKey = new Map<string, Attestation>();
  private retired = new Set<string>();
  private onRetire?: OnRetireCallback;

  constructor(opts: { onRetire?: OnRetireCallback } = {}) {
    this.onRetire = opts.onRetire;
  }

  /** Add or replace an attestation. Idempotent on identical input.
   *
   *  When the attestation carries a `pqcPublicKey`, the secondary index is
   *  also updated. Re-attesting WITHOUT a pqcPublicKey removes any previous
   *  PQC binding for this seat (intentional: callers explicitly drop PQC
   *  by re-attesting without it).
   */
  attest(att: Attestation): void {
    if (!att.publicKey) throw new Error('attest: publicKey required');
    if (!att.seatId) throw new Error('attest: seatId required');
    const key = normalizeKey(att.publicKey);

    // Clear any previous PQC index entry for this seat (re-attest may rotate
    // or drop the PQC key).
    const previous = this.byKey.get(key);
    if (previous?.pqcPublicKey) {
      this.byPqcKey.delete(pqcKeyToHex(previous.pqcPublicKey));
    }

    const stored: Attestation = { ...att, publicKey: key };
    this.byKey.set(key, stored);

    if (stored.pqcPublicKey && stored.pqcPublicKey.length > 0) {
      this.byPqcKey.set(pqcKeyToHex(stored.pqcPublicKey), stored);
    }

    // Re-attesting an explicitly-retired key is allowed (key rotation flows);
    // callers must understand the implications. Clear the retired flag.
    this.retired.delete(key);
  }

  /**
   * Mark an attestation as retired. Returns the (now-retired) attestation, or
   * null if the key was unknown. Fires onRetire callback when present.
   *
   * Retirement affects BOTH the classical and the PQC indices — a retired
   * seat is rejected regardless of which key the verifier looks up.
   */
  retire(publicKey: string, reason: string): Attestation | null {
    const key = normalizeKey(publicKey);
    const att = this.byKey.get(key);
    if (!att) return null;
    if (this.retired.has(key)) return att; // already retired; no double-fire
    const retiredAt = new Date().toISOString();
    const updated: Attestation = { ...att, retiredAt, retireReason: reason };
    this.byKey.set(key, updated);
    // Keep the PQC index pointing at the now-retired attestation so PQC-side
    // lookups still find it and see retiredAt — they reject the same way the
    // classical lookup does.
    if (updated.pqcPublicKey && updated.pqcPublicKey.length > 0) {
      this.byPqcKey.set(pqcKeyToHex(updated.pqcPublicKey), updated);
    }
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

  /** Look up an attestation by ML-DSA-65 public key (PQC side).
   *  Returns undefined when no seat has been attested with this PQC key. */
  lookupByPqcKey(pqcPublicKey: Uint8Array): Attestation | undefined {
    const hex = pqcKeyToHex(pqcPublicKey);
    if (!hex) return undefined;
    const att = this.byPqcKey.get(hex);
    if (!att) return undefined;
    // Defensive equality check — guard against the (vanishingly unlikely)
    // hex-string collision on degenerate inputs.
    if (!att.pqcPublicKey || !bytesEqual(att.pqcPublicKey, pqcPublicKey)) return undefined;
    return att;
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

  /** PQC-side equivalent of `isAttested`. True iff the PQC key resolves to an
   *  attestation that is NOT retired AND NOT expired. */
  isPqcAttested(pqcPublicKey: Uint8Array, nowMs: number = Date.now()): boolean {
    const att = this.lookupByPqcKey(pqcPublicKey);
    if (!att) return false;
    if (this.retired.has(normalizeKey(att.publicKey))) return false;
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

  /** PQC-side equivalent of `isRetired`. True iff the seat bound to this PQC
   *  key has been retired. */
  isPqcRetired(pqcPublicKey: Uint8Array): boolean {
    const att = this.lookupByPqcKey(pqcPublicKey);
    if (!att) return false;
    return this.retired.has(normalizeKey(att.publicKey));
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

  /**
   * Build a PQC-side registryCheck function. Same shape as `toRegistryCheck`
   * but keyed on `Uint8Array` (the ML-DSA-65 public key bytes) instead of a
   * 0x-Ethereum-address string.
   */
  toPqcRegistryCheck(
    nowMs?: number
  ): (pqcPublicKey: Uint8Array) => Promise<RegistryCheckResult> {
    return async (pqcPublicKey: Uint8Array) => {
      const att = this.lookupByPqcKey(pqcPublicKey);
      if (!att) {
        return { attested: false, retired: false, reason: 'signer-not-attested' };
      }
      const classicalKey = normalizeKey(att.publicKey);
      if (this.retired.has(classicalKey)) {
        return { attested: false, retired: true, reason: 'signer-retired' };
      }
      const attested = this.isPqcAttested(pqcPublicKey, nowMs);
      return {
        attested,
        retired: false,
        reason: attested ? undefined : 'signer-not-attested',
      };
    };
  }

  /**
   * Dual-mode cross-verify — confirm that a classical address AND a PQC key
   * resolve to the SAME attestation entry. Defends against substitution
   * attacks where an attacker pairs a valid classical sig from seat A with a
   * valid PQC sig from seat B (both keys are individually attested but for
   * different seats).
   *
   * Returns:
   *   - `{matched: true,  attestation}` when both keys point at one entry.
   *   - `{matched: false, reason: 'classical-not-attested'}` when classical missing.
   *   - `{matched: false, reason: 'pqc-not-attested'}`       when pqc missing.
   *   - `{matched: false, reason: 'cross-key-mismatch'}`     when both exist but
   *     bind to different seats.
   *   - `{matched: false, reason: 'signer-retired'}`         when the bound seat is retired.
   */
  crossVerifyDual(
    classicalAddress: string,
    pqcPublicKey: Uint8Array,
    nowMs?: number
  ): { matched: true; attestation: Attestation } | { matched: false; reason: string } {
    const classicalAtt = this.lookup(classicalAddress);
    if (!classicalAtt) return { matched: false, reason: 'classical-not-attested' };
    const pqcAtt = this.lookupByPqcKey(pqcPublicKey);
    if (!pqcAtt) return { matched: false, reason: 'pqc-not-attested' };
    if (normalizeKey(classicalAtt.publicKey) !== normalizeKey(pqcAtt.publicKey)) {
      return { matched: false, reason: 'cross-key-mismatch' };
    }
    if (this.retired.has(normalizeKey(classicalAtt.publicKey))) {
      return { matched: false, reason: 'signer-retired' };
    }
    // Expiry check — both keys share the same Attestation entry so one check covers both.
    if (classicalAtt.expiresAt) {
      const exp = Date.parse(classicalAtt.expiresAt);
      const now = nowMs ?? Date.now();
      if (!Number.isNaN(exp) && exp <= now) {
        return { matched: false, reason: 'signer-expired' };
      }
    }
    return { matched: true, attestation: classicalAtt };
  }

  /** Test-only: reset state. Avoid in production code paths. */
  clear(): void {
    this.byKey.clear();
    this.byPqcKey.clear();
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
