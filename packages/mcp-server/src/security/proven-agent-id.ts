/**
 * Resolve the agent identity a request has PROVEN it owns.
 *
 * `POST /oauth/register` is open to anyone, and `client_secret` proves only
 * WHICH CLIENT is calling — neither can establish which AGENT the caller is.
 * Three things can, and they are exactly the three the canonical resolver
 * `holomesh/auth-utils` already accepts:
 *
 *   1. a platform-signed manifest (cryptographic proof of the id it names);
 *   2. a per-agent key in the HoloMesh key registry;
 *   3. a per-agent key in the legacy agent key store.
 *
 * Honouring all three matters as much as refusing everything else. Consulting
 * only the key registry meant an agent the rest of the server authenticates
 * normally — by manifest, or by a key predating the registry — got a hard
 * throw at registration on a field `main` simply ignored. Returns undefined
 * when nothing is proven, which makes every unproven `agent_id` fail closed.
 *
 * This lives in its own module on purpose. It is the verifier the whole
 * agent_id binding rests on, and `http-server.ts` builds an HTTP server and
 * listens at import time, so a copy that lived there could not be tested
 * without booting a server — which is how it shipped with no test at all.
 *
 * Accepted headers, and why these:
 *   - `x-agent-manifest` + `x-agent-manifest-sig` — platform-signed identity.
 *   - `x-agent-key`     — the agent-scoped key the daemon presents.
 *   - `x-mcp-api-key`   — the orchestrator convention, and the per-agent header
 *                         `resolveRequestingAgent` already treats as identity.
 *   - `Authorization: Bearer <key>` — the HTTP-standard spelling of the same
 *                         per-agent key. Accepted so an agent using the
 *                         documented primary convention is not silently
 *                         refused its own agent_id. A Bearer OAuth ACCESS token
 *                         is not in the key registry, so it proves nothing here
 *                         and simply falls through.
 *
 * WHAT IS REFUSED — and why the refusal is on the KEY, not on a header name:
 *
 * `HOLOSCRIPT_API_KEY` and its siblings are SHARED secrets, seeded into the key
 * registry on first boot and held in common by every caller configured with
 * them. Refusing only the `x-api-key` header left that same shared value
 * working under `x-mcp-api-key` and under `Bearer`, so "the shared key cannot
 * be upgraded into a proven identity" held for one spelling and failed for two.
 * A property enforced per header name is not the property; it is one of its
 * silhouettes. So the refusal is on the key itself: a record marked
 * `seededFromEnv`, or a value still equal to one of the seedable env vars —
 * the second test also covers a store seeded before that marker existed, which
 * is every store already running. `x-api-key` remains unaccepted as well.
 *
 * TWO FURTHER LIMITS ON THE MANIFEST AND LEGACY PATHS, because an id minted
 * here is DURABLE — it can be recorded as a client binding and stamped on
 * tokens long afterwards, without the proof ever being presented again:
 *
 *   - REPLAY. A manifest header pair is a bearer credential: whatever can
 *     observe one can resend it, and a signature alone never expires. So the
 *     manifest must carry a signed `issuedAt` and still be fresh
 *     (`requireBound`). Authenticating a single request does not get this
 *     treatment — `resolveRequestingAgent` still accepts unbounded manifests,
 *     because there the credential's reach ends with the request. WHO IS
 *     EXCLUDED: an integration whose manifest predates `issuedAt` can still
 *     call every route it always could, but can no longer bind an agent_id at
 *     registration or stamp one on a token. Re-sign the manifest with an
 *     `issuedAt` to restore that.
 *   - RESERVED IDS. `agent_founder` and the `agent_env_*` identities belong to
 *     key records the server seeds for itself. Nothing outside the key registry
 *     may claim one, or a signed manifest naming `agent_founder` would mint the
 *     founder's identity from a platform signature, and a legacy store record
 *     could carry a seeded id that the shared-key refusal exists to prevent.
 *     The registry path is exempt: there the RECORD is the authority, and a
 *     provisioned (non-seeded) founder key is the legitimate way to hold that
 *     identity.
 *
 * KNOWN AND NOT FIXED HERE: an identity, once carried, outlives the key that
 * proved it. A client bound at registration keeps stamping that agent_id after
 * the key is rotated, expired or revoked, because no later request re-presents
 * it. Revoking the CLIENT is the lever that exists today.
 */
import type { IncomingHttpHeaders } from 'http';
import {
  agentKeyStore,
  FOUNDER_AGENT_ID,
  keyRegistry,
  SEEDABLE_KEY_ENV_VARS,
} from '../holomesh/state';
import { resolveFromSignedManifest } from '../holomesh/auth-utils';
import { normalizeAgentIdentity } from '../auth/oauth2-provider';

/** Per-agent key headers, in resolution order. */
export const PROVEN_AGENT_KEY_HEADERS = ['x-agent-key', 'x-mcp-api-key'] as const;

/** Refusal message for a registration that asks to bind an unproven agent_id. */
export const AGENT_ID_NOT_BOUND_AT_REGISTRATION_ERROR =
  'agent_id can only be bound by a request that proves that agent-s own identity: ' +
  'its per-agent key, or a platform-signed manifest naming it. A shared API key ' +
  'proves which key is held, not which agent is calling.';

function firstHeaderValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return (value[0] || '').trim();
  return '';
}

/**
 * True when this key value is a SHARED env-seeded secret rather than one
 * agent's own key. Checked two ways because the marker is only written by a
 * fresh seeding: a server whose store was seeded under the old rule holds
 * unmarked records, and the env comparison still refuses those.
 */
function isSharedSeededKey(presented: string): boolean {
  if (keyRegistry.get(presented)?.seededFromEnv) return true;
  for (const envVar of SEEDABLE_KEY_ENV_VARS) {
    const configured = (process.env[envVar] || '').trim();
    if (configured && configured === presented) return true;
  }
  return false;
}

/** Prefix of the per-variable identities first-boot seeding mints for itself. */
export const SEEDED_AGENT_ID_PREFIX = 'agent_env_';

/**
 * True for an identity the SERVER reserves for its own seeded key records.
 *
 * These ids are attached to shared env keys, so nothing that proves itself some
 * other way may claim one: a platform-signed manifest naming `agent_founder`
 * would otherwise mint the founder's identity, walking straight around the
 * shared-key refusal above by presenting a different kind of proof. Matching by
 * prefix rather than by listing the four current variables keeps a newly
 * seedable variable reserved the day it is added, without a second edit.
 */
export function isReservedSeededAgentId(candidate: string | undefined): boolean {
  const normalized = String(candidate || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return normalized === FOUNDER_AGENT_ID || normalized.startsWith(SEEDED_AGENT_ID_PREFIX);
}

/** The agent a live per-agent key belongs to, or undefined if it proves nothing. */
function agentIdForKey(presented: string): string | undefined {
  if (!presented) return undefined;
  if (isSharedSeededKey(presented)) return undefined;

  const record = keyRegistry.get(presented);
  if (record) {
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) return undefined;
    // An `agent_env_*` identity is minted ONLY by first-boot seeding, so a
    // record carrying one is a seeded record whatever its current value is.
    // This is what still refuses a key that was rotated before the provenance
    // marker existed: rotation kept the seeded identity but moved the value off
    // every env var, so neither the marker nor the value test can see it.
    // `agent_founder` is deliberately not refused here — a provisioned founder
    // key is legitimate, and only the marker distinguishes it from a seeded one.
    if (String(record.agentId || '').toLowerCase().startsWith(SEEDED_AGENT_ID_PREFIX)) {
      return undefined;
    }
    return record.agentId || undefined;
  }

  // Agents registered before the key registry existed still hold a per-agent
  // key in the legacy store. `resolveRequestingAgent` honours those, so
  // refusing them here would lock a caller out of its own agent_id while the
  // rest of the server treats it as that very agent.
  const legacyId = agentKeyStore.get(presented)?.id;
  // ...but not a reserved id. The legacy store is not where the server's own
  // seeded identities live, so a record carrying one is not evidence of it.
  if (isReservedSeededAgentId(legacyId)) return undefined;
  return legacyId || undefined;
}

export function resolveProvenAgentId(headers: IncomingHttpHeaders): string | undefined {
  // A platform-signed manifest is verified against the platform public key, so
  // it proves the id it names. It is also the only proof available to an agent
  // that has no registry entry at all. Bounded here — the id this mints is
  // durable, so a captured header pair must not be replayable forever — and
  // never allowed to name one of the server's own reserved identities.
  const manifestCaller = resolveFromSignedManifest({ headers }, { requireBound: true });
  if (manifestCaller?.id && !isReservedSeededAgentId(manifestCaller.id)) {
    return manifestCaller.id;
  }

  for (const headerName of PROVEN_AGENT_KEY_HEADERS) {
    const proven = agentIdForKey(firstHeaderValue(headers[headerName]));
    if (proven) return proven;
  }

  const authorization = firstHeaderValue(headers['authorization']);
  if (authorization.startsWith('Bearer ')) {
    const proven = agentIdForKey(authorization.slice(7).trim());
    if (proven) return proven;
  }

  return undefined;
}

export type RegistrationAgentBinding =
  | { ok: true; boundAgentId?: string }
  | { ok: false; reason: string };

/**
 * Decide whether `POST /oauth/register` may record an agent binding.
 *
 * A client bound to an agent may later stamp that agent_id on a token WITHOUT
 * re-presenting the key, so the binding is exactly as trustworthy as this
 * check. It lives here, apart from the endpoint, because inline in
 * `http-server.ts` it could not be tested without booting a server — and an
 * untested gate is one nobody notices deleting.
 *
 * The comparison is case- and whitespace-insensitive to match the GRANT's
 * comparison. A stricter test here would let a client register under a
 * spelling its own token requests are then refused for: a legitimate caller
 * locked out by nothing but capitalisation. What gets RECORDED is still the
 * registry's spelling, never the caller's, because downstream principals are
 * compared as raw strings.
 */
export function agentBindingForRegistration(params: {
  requestedAgentId?: unknown;
  registrarAgentId?: string;
}): RegistrationAgentBinding {
  const requested = String(params.requestedAgentId ?? '').trim();
  // Nothing requested: an ordinary client registration, bound to no agent.
  if (!requested) return { ok: true };

  // An unproven registrar normalizes to the empty string, which can never
  // equal a non-empty request — so this single comparison also refuses the
  // caller that proved nothing at all.
  if (normalizeAgentIdentity(requested) !== normalizeAgentIdentity(params.registrarAgentId)) {
    return { ok: false, reason: AGENT_ID_NOT_BOUND_AT_REGISTRATION_ERROR };
  }

  return { ok: true, boundAgentId: params.registrarAgentId };
}
