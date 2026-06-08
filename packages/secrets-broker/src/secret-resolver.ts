/**
 * Secret resolver — the FAIL-CLOSED, audited value-resolution entry point.
 *
 * This is the one blessed path through which server-side consumers (Studio /
 * Brittney, the Fleet job runner) turn an authenticated user identity + a
 * `vault:<key>` ref into a plaintext secret. Secret VALUES never cross the MCP
 * wire — the broker tools stay handle/lease-only; value resolution happens here,
 * inside the trusted server, with the caller's OWN established auth.
 *
 * ── Gate-first invariant (vault premortem, 2026-06-08) ───────────────────────
 *   1. FAIL CLOSED: a resolve with no authenticated owner is DENIED — it never
 *      reaches the store and never returns a value. There is no admin/default
 *      fallback. (This is the "gate is live and tested to DENY before it is
 *      taught to return a value" requirement, enforced at the value boundary.)
 *   2. OWNER-BOUND: the authenticated owner is passed straight to
 *      `SecretStore.get`, which re-checks ownership inside itself — so isolation
 *      holds even if a future caller is mis-wired.
 *   3. AUDITED: every attempt (allowed OR denied) emits an audit event carrying
 *      only owner + ref + outcome — never the value.
 *
 * Consumers MUST derive `authenticatedOwnerId` from verified auth (Studio
 * session subject, Fleet seat owner) — NEVER from untrusted request input.
 *
 * @module secrets-broker/secret-resolver
 */

import {
  DecryptError,
  OwnerMismatchError,
  SecretNotFoundError,
  type SecretRef,
  type SecretStore,
} from './secret-store';

/** Thrown when a resolve is attempted without an authenticated owner identity. */
export class AuthRequiredError extends Error {
  readonly ref: SecretRef;
  constructor(ref: SecretRef) {
    super(`secret-resolver: refusing to resolve ${ref} without an authenticated owner`);
    this.name = 'AuthRequiredError';
    this.ref = ref;
  }
}

/** Audit record emitted on EVERY resolve attempt. Carries no secret material. */
export interface SecretResolveAudit {
  readonly event: 'secret.resolve';
  /** Authenticated owner that attempted the resolve (or '<none>' when unauthenticated). */
  readonly ownerId: string;
  /** The ref that was requested. */
  readonly ref: SecretRef;
  /** Optional human-readable purpose for compliance. */
  readonly purpose: string | null;
  /** Whether a value was returned. */
  readonly outcome: 'allowed' | 'denied';
  /** Denial reason (error name) when `outcome === 'denied'`. */
  readonly reason: string | null;
  /** ISO 8601 timestamp. */
  readonly at: string;
}

export interface SecretResolverDeps {
  store: SecretStore;
  /** Audit sink — called for every attempt (allowed + denied). Defaults to no-op. */
  audit?: (event: SecretResolveAudit) => void;
  /** Optional fixed clock for deterministic tests. */
  now?: () => Date;
}

export interface ResolveInput {
  /**
   * Authenticated caller identity. MUST come from verified server-side auth
   * (Studio session / Fleet seat) — never from untrusted request input. An empty
   * or missing value is treated as unauthenticated and DENIED.
   */
  authenticatedOwnerId: string | undefined | null;
  /** Canonical ref of the secret to resolve. */
  ref: SecretRef;
  /** Optional purpose recorded in the audit trail. */
  purpose?: string;
}

export interface SecretResolver {
  /**
   * Resolve a secret value for an authenticated owner. Throws — never returns a
   * value — when unauthenticated ({@link AuthRequiredError}), when the owner does
   * not own the secret ({@link OwnerMismatchError}), when it is absent
   * ({@link SecretNotFoundError}), or on a decrypt failure ({@link DecryptError}).
   */
  resolve(input: ResolveInput): Promise<{ value: string }>;
}

/**
 * Create a fail-closed, audited {@link SecretResolver} over a {@link SecretStore}.
 */
export function createSecretResolver(deps: SecretResolverDeps): SecretResolver {
  const audit = deps.audit ?? (() => {});
  const now = deps.now ?? (() => new Date());

  const emit = (
    ownerId: string,
    ref: SecretRef,
    purpose: string | null,
    outcome: 'allowed' | 'denied',
    reason: string | null
  ): void => {
    audit({ event: 'secret.resolve', ownerId, ref, purpose, outcome, reason, at: now().toISOString() });
  };

  return {
    async resolve({ authenticatedOwnerId, ref, purpose }: ResolveInput): Promise<{ value: string }> {
      const purposeOrNull = purpose ?? null;

      // (1) FAIL CLOSED — no authenticated owner means no value, full stop.
      if (!authenticatedOwnerId) {
        emit('<none>', ref, purposeOrNull, 'denied', 'AuthRequiredError');
        throw new AuthRequiredError(ref);
      }

      // (2) OWNER-BOUND — the store re-checks ownership inside get().
      try {
        const { value } = await deps.store.get({ ownerId: authenticatedOwnerId, ref });
        // (3) AUDITED — record the allow.
        emit(authenticatedOwnerId, ref, purposeOrNull, 'allowed', null);
        return { value };
      } catch (err) {
        const reason =
          err instanceof OwnerMismatchError ||
          err instanceof SecretNotFoundError ||
          err instanceof DecryptError
            ? err.name
            : err instanceof Error
              ? err.name
              : 'UnknownError';
        // (3) AUDITED — record the denial, then propagate (no value escapes).
        emit(authenticatedOwnerId, ref, purposeOrNull, 'denied', reason);
        throw err;
      }
    },
  };
}
