/**
 * Service/fleet HoloKey identity.
 *
 * Studio users already arrive with a human owner id. Operational services do
 * not: they boot from Railway, Jetson seats, fleet workers, or an x402 bearer.
 * This module turns those runtime facts into an audit-safe owner id in the
 * `infra://` namespace, then normalizes `infra://<SECRET>` refs to the existing
 * encrypted `vault:<SECRET>` store key for that owner.
 *
 * The x402 path hashes the bearer. A bearer may prove custody, but it must not
 * become an owner id or log line in plaintext.
 */

import { createHash } from 'node:crypto';

import type { SecretRef } from './types';

type Env = Record<string, string | undefined>;

export type ServiceIdentitySource =
  | 'explicit'
  | 'holomesh-agent'
  | 'fleet-seat'
  | 'railway-service'
  | 'x402-bearer'
  | 'fallback';

export interface ServiceIdentity {
  /** Owner id used against SecretStore/SecretResolver. */
  readonly ownerId: string;
  /** Where the owner id came from. */
  readonly source: ServiceIdentitySource;
  /** Operational secrets live outside human workspace refs. */
  readonly namespace: 'infra';
  /** Human-readable audit label. Carries no secret material. */
  readonly label: string;
}

export interface ResolveServiceIdentityOpts {
  /** Environment to inspect. Defaults to process.env at the call site. */
  env?: Env;
  /** Explicit owner override. Preserves compatibility with HOLOKEY_OWNER. */
  owner?: string;
  /** Final fallback when no operational identity signal is present. */
  fallbackOwner?: string;
}

export interface NormalizedServiceSecretRef {
  /** Store-level ref. HoloKey value storage remains vault-backed. */
  readonly ref: SecretRef;
  /** Environment variable name used for fallback reads. */
  readonly envName: string;
  /** Ref namespace the caller used. */
  readonly namespace: 'infra' | 'vault' | 'env-name';
}

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function firstSet(env: Env, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function ownerUri(kind: 'agent' | 'fleet-seat' | 'service' | 'x402', raw: string): string {
  return `infra://${kind}/${encodeURIComponent(raw)}`;
}

function bearerFingerprint(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 20);
}

function identity(ownerId: string, source: ServiceIdentitySource, label: string): ServiceIdentity {
  return Object.freeze({ ownerId, source, namespace: 'infra' as const, label });
}

/**
 * Resolve the current service/fleet owner identity from explicit config or
 * operational runtime facts, ordered from strongest stable identity to weakest.
 */
export function resolveServiceIdentity(opts: ResolveServiceIdentityOpts = {}): ServiceIdentity {
  const env = opts.env ?? process.env;
  const explicit = opts.owner?.trim() || env.HOLOKEY_OWNER?.trim();
  if (explicit) return identity(explicit, 'explicit', explicit);

  const agentId = firstSet(env, ['HOLOMESH_AGENT_ID', 'HOLOMESH_AGENTID', 'AGENT_ID']);
  if (agentId) {
    return identity(ownerUri('agent', agentId), 'holomesh-agent', `HoloMesh agent ${agentId}`);
  }

  const fleetSeat = firstSet(env, [
    'HOLOMESH_FLEET_SEAT',
    'FLEET_SEAT_ID',
    'FLEET_AGENT_ID',
    'HOLOMESH_HANDLE',
  ]);
  if (fleetSeat) {
    return identity(
      ownerUri('fleet-seat', fleetSeat),
      'fleet-seat',
      `HoloMesh fleet seat ${fleetSeat}`
    );
  }

  const railwayService = firstSet(env, ['RAILWAY_SERVICE_ID', 'RAILWAY_SERVICE_NAME']);
  if (railwayService) {
    return identity(
      ownerUri('service', railwayService),
      'railway-service',
      `Railway service ${railwayService}`
    );
  }

  const x402Bearer = firstSet(env, [
    'HOLOMESH_X402_BEARER',
    'X402_BEARER',
    'HOLOMESH_API_KEY_X402',
  ]);
  if (x402Bearer) {
    const fp = bearerFingerprint(x402Bearer);
    return identity(ownerUri('x402', fp), 'x402-bearer', `x402 bearer sha256:${fp}`);
  }

  const fallback = opts.fallbackOwner ?? 'infra';
  return identity(fallback, 'fallback', fallback);
}

function assertSecretName(name: string, original: string): string {
  const trimmed = name.trim();
  if (!SECRET_NAME_RE.test(trimmed)) {
    throw new TypeError(
      `service-secret-ref: "${original}" must resolve to an UPPER_SNAKE secret name`
    );
  }
  return trimmed;
}

function lastPathSegment(ref: string): string {
  const parts = ref.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/**
 * Normalize service secret refs.
 *
 * Accepted inputs:
 *   - `OPENAI_API_KEY`             -> env fallback + `vault:OPENAI_API_KEY`
 *   - `vault:OPENAI_API_KEY`       -> explicit vault ref
 *   - `infra://OPENAI_API_KEY`     -> operational namespace for this service
 *   - `infra://mcp/OPENAI_API_KEY` -> same, with an audit-friendly grouping path
 */
export function normalizeServiceSecretRef(input: string): NormalizedServiceSecretRef {
  const raw = input.trim();
  if (raw.startsWith('infra://')) {
    const body = raw.slice('infra://'.length);
    const decoded = decodeURIComponent(lastPathSegment(body));
    const envName = assertSecretName(decoded, input);
    return { ref: `vault:${envName}`, envName, namespace: 'infra' };
  }
  if (raw.startsWith('vault:')) {
    const envName = assertSecretName(raw.slice('vault:'.length), input);
    return { ref: `vault:${envName}`, envName, namespace: 'vault' };
  }
  const envName = assertSecretName(raw, input);
  return { ref: `vault:${envName}`, envName, namespace: 'env-name' };
}

/** Build the operational namespace ref for a service secret name. */
export function infraSecretRef(name: string): SecretRef {
  const envName = assertSecretName(name, name);
  return `infra://${envName}`;
}
