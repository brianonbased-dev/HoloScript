/**
 * Scoped service keys: the outside-agent door for absorb (card
 * absorb-service-key-path, after #623).
 *
 * #623 refused key-only absorb, because a bare service key names nobody to
 * charge. A scoped service key names the owner it charges, and only owners it
 * was issued for:
 *
 * - The caller sends `Authorization: Bearer <scoped key>` and
 *   `X-Absorb-Charge-Owner: <owner user uuid>`.
 * - The key is matched by its SHA-256 hash. Config holds hashes only
 *   (ABSORB_SCOPED_SERVICE_KEYS, JSON), never a key.
 * - The owner must be in that key's `owners` list, or the request is refused
 *   (403 owner_not_in_key_scope). No owner: 401 owner_required.
 * - On success the request runs AS the owner (req.userId = owner), so the
 *   route charges that owner with that owner's own importId claim, pending
 *   slot, replay at cost 0, compare-and-clear and import_id_reused, exactly as
 *   the session path. There is no fallback: a bad config, an unknown key or a
 *   refused owner never runs on the shared ABSORB_API_KEY or any other key.
 * - Rate limit per key (all owners) and per owner (rolls up to the human's own
 *   counter, as an app acting for them).
 *
 * The shared ABSORB_API_KEY proxy path in auth.ts is unchanged.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const SCOPED_KEYS_ENV = 'ABSORB_SCOPED_SERVICE_KEYS';
export const CHARGE_OWNER_HEADER = 'x-absorb-charge-owner';
/** Default per-key hourly cap when the config gives none. */
export const DEFAULT_SCOPED_KEY_HOURLY_LIMIT = 60;
/** The owner's own hourly cap for calls made through any scoped key. */
export const SCOPED_OWNER_HOURLY_LIMIT = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/i;

export interface ScopedServiceKey {
  /** Public, non-secret label, used in rate-limit keys and logs. */
  id: string;
  /** SHA-256 (hex) of the key. The key itself is never configured or stored. */
  sha256: string;
  /** User uuids this key may charge. */
  owners: string[];
  hourlyLimit: number;
}

/**
 * Parse the scoped-key config. Anything malformed makes the WHOLE config
 * empty (fail closed): no entry is half-trusted.
 */
export function loadScopedServiceKeys(env: NodeJS.ProcessEnv = process.env): ScopedServiceKey[] {
  const raw = env[SCOPED_KEYS_ENV];
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[auth] ${SCOPED_KEYS_ENV} is not valid JSON; no scoped keys accepted`);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ScopedServiceKey[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const e of parsed as Array<Record<string, unknown>>) {
    const id = e?.id;
    const sha = e?.sha256;
    const owners = e?.owners;
    const limit = e?.hourlyLimit ?? DEFAULT_SCOPED_KEY_HOURLY_LIMIT;
    const ok =
      typeof id === 'string' &&
      /^[a-z0-9_-]{1,64}$/i.test(id) &&
      !ids.has(id) &&
      typeof sha === 'string' &&
      HEX64_RE.test(sha) &&
      // N3 (Mapping, #624): two entries with one hash make the owner scope
      // ambiguous, so the whole config is malformed.
      !hashes.has((sha as string).toLowerCase()) &&
      Array.isArray(owners) &&
      owners.length > 0 &&
      owners.every((o) => typeof o === 'string' && UUID_RE.test(o)) &&
      typeof limit === 'number' &&
      Number.isInteger(limit) &&
      limit > 0;
    if (!ok) {
      console.warn(`[auth] ${SCOPED_KEYS_ENV} has a malformed entry; no scoped keys accepted`);
      return [];
    }
    ids.add(id as string);
    hashes.add((sha as string).toLowerCase());
    out.push({
      id: id as string,
      sha256: (sha as string).toLowerCase(),
      owners: (owners as string[]).map((o) => o.toLowerCase()),
      hourlyLimit: limit as number,
    });
  }
  return out;
}

export function sha256Hex(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** The configured key whose hash matches `token`, compared in constant time. */
export function matchScopedKey(token: string, keys: ScopedServiceKey[]): ScopedServiceKey | null {
  if (!token || keys.length === 0) return null;
  const got = Buffer.from(sha256Hex(token), 'hex');
  let found: ScopedServiceKey | null = null;
  for (const k of keys) {
    const want = Buffer.from(k.sha256, 'hex');
    if (want.length === got.length && timingSafeEqual(want, got) && !found) found = k;
  }
  return found;
}

export type ScopedOwnerResult =
  | { ok: true; ownerId: string }
  | { ok: false; status: number; error: string; message: string };

/** The owner a matched key charges, or the refusal. Never a default owner. */
export function scopedKeyOwner(
  key: ScopedServiceKey,
  ownerHeader: string | string[] | undefined
): ScopedOwnerResult {
  const owner = Array.isArray(ownerHeader) ? undefined : ownerHeader?.trim();
  if (!owner) {
    return {
      ok: false,
      status: 401,
      error: 'owner_required',
      message: 'A scoped service key charges a named owner. Send X-Absorb-Charge-Owner.',
    };
  }
  if (!UUID_RE.test(owner)) {
    return {
      ok: false,
      status: 400,
      error: 'owner_invalid',
      message: 'X-Absorb-Charge-Owner must be a user id.',
    };
  }
  if (!key.owners.includes(owner.toLowerCase())) {
    return {
      ok: false,
      status: 403,
      error: 'owner_not_in_key_scope',
      message: 'This key may not charge that owner.',
    };
  }
  return { ok: true, ownerId: owner.toLowerCase() };
}
/**
 * N1 (Mapping, #624): a scoped key reaches only the absorb scan/import route
 * (POST /api/absorb/scan carries both folder scans and URL imports). Every
 * other route (projects, query, credits, admin, MCP, ...) refuses it, so the
 * key never acts as the owner's whole account.
 */
export const SCOPED_KEY_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/absorb/scan' },
];

export function scopedKeyRouteAllowed(method: string, fullPath: string): boolean {
  const p = fullPath.replace(/\/+$/, '');
  return SCOPED_KEY_ROUTES.some((r) => r.method === method.toUpperCase() && r.path === p);
}

/**
 * N4 (Mapping, #624): does the owner already have a credit account? Read-only.
 * This path never creates an account or grants starter credits; an unknown
 * owner is refused (403 owner_unknown). Returns null when it cannot tell
 * (no database), and the caller refuses (fail closed).
 */
export type OwnerLookup = (ownerId: string) => Promise<boolean | null>;

export const OWNER_EXISTS_SQL = 'SELECT 1 FROM credit_accounts WHERE user_id = $1 LIMIT 1';

export function sqlOwnerLookup(
  query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>
): OwnerLookup {
  return async (ownerId) => (await query(OWNER_EXISTS_SQL, [ownerId])).rows.length > 0;
}