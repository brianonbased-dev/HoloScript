import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveGitHubToken } from './github-identity.js';
import {
  FallbackRateCounterStore,
  MemoryRateCounterStore,
  PostgresRateCounterStore,
  RateLimiter,
  type SqlQuery,
} from './rateLimiter.js';

export interface AuthenticatedRequest extends Request {
  authenticated?: boolean;
  userId?: string;
  isAdmin?: boolean;
  githubUsername?: string;
  /** Credit tier resolved from DB (free/pro/enterprise) or attested by MCPMe orchestrator */
  tier?: string;
  /**
   * When true, this request was quota-checked by the MCPMe orchestrator.
   * Absorb-service should skip its own credit deduction to prevent double billing.
   */
  orchestratorGated?: boolean;
  /**
   * Set ONLY by a verified v1 orchestrator attestation (CoS 2026-10-24, exactly one
   * biller). Absorb does not charge this request; it returns the price in
   * X-Absorb-Credit-Cost and the orchestrator debits the end user that amount.
   */
  orchestratorBilled?: boolean;
  /**
   * Delegated access grant (an outside agent/app acting for this user).
   * Set ONLY by server-side token resolution, never from headers or body.
   * The per-(user, app) rate limit takes its app id and cap from here.
   */
  grant?: { clientId: string; hourlyLimit?: number };
}

/** Rate-limit inputs for a verified caller. App id/cap come from the grant only. */
export function rateLimitInputs(req: AuthenticatedRequest, userId: string, userLimit: number) {
  return {
    userId,
    userLimit,
    clientId: req.grant?.clientId,
    appLimit: req.grant?.hourlyLimit,
  };
}

/**
 * Canonical HMAC-SHA256 hex: exactly 64 lowercase hex chars. Buffer.from(x, 'hex')
 * silently drops trailing non-hex and folds case, so without this a replayed sig
 * could be re-spelled (uppercase / junk suffix) to dodge the nonce store.
 */
export const SIG_HEX_RE = /^[0-9a-f]{64}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The caller's user UUID, or null for non-user identities (API-key / service /
 * anonymous). DB `user_id` columns are `uuid`; querying them with a non-uuid
 * string — e.g. the legacy `userId || 'anonymous'` default — makes Postgres
 * throw `invalid input syntax for type uuid` → a 500 the route's catch turns
 * into "Failed to …". A service identity legitimately has NO user-scoped rows,
 * so callers must treat null as "no user scope" (return empty/default), NOT pass
 * a placeholder string into a uuid query. (Root cause of the absorb /projects +
 * credits /balance 500s Brittney surfaced.)
 */
export function userUuid(req: Request): string | null {
  const id = (req as AuthenticatedRequest).userId;
  return id && UUID_RE.test(id) ? id : null;
}

const PUBLIC_PATHS = ['/health', '/.well-known/mcp', '/.well-known/mcp.json'];

// ─── Rate Limiting ──────────────────────────────────────────────────────────

// There is deliberately NO anonymous tier. Until 2026-09-15 anonymous callers could
// POST /api/absorb/scan (3/hr per IP, keyed on the client-supplied first
// X-Forwarded-For entry, so trivially reset). That route scans `path` on the
// SERVICE's own disk, so the tier let any stranger map the server's filesystem.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FREE_USER_SCAN_LIMIT = 10;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Durable (Postgres) counters when DATABASE_URL is set, so limits survive
// deploys and are shared by replicas; memory otherwise (see rateLimiter.ts).
const memoryCounters = new MemoryRateCounterStore();
const cleanupTimer = setInterval(() => memoryCounters.sweep(RATE_LIMIT_WINDOW_MS, Date.now()), CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // Don't block process exit

// The DB client is imported lazily so modules that import auth.ts (mcp-handler,
// transport auth, tests) do not pull the schema package at load time.
async function buildRateLimiter(): Promise<RateLimiter> {
  let db: ReturnType<typeof import('../db/client.js').getDb> = null;
  try {
    db = (await import('../db/client.js')).getDb();
  } catch (e) {
    console.warn('[auth] DB client unavailable, rate limits counted in memory:', (e as Error)?.message);
  }
  if (!db) return new RateLimiter(memoryCounters, RATE_LIMIT_WINDOW_MS);
  const query: SqlQuery = async (text, params) => db.$client.query(text, params as unknown[]);
  return new RateLimiter(
    new FallbackRateCounterStore(new PostgresRateCounterStore(query), memoryCounters, (e) =>
      console.warn('[auth] durable rate counter unavailable, counting in memory:', (e as Error)?.message),
    ),
    RATE_LIMIT_WINDOW_MS,
  );
}

let rateLimiter: Promise<RateLimiter> | null = null;
function getRateLimiter(): Promise<RateLimiter> {
  if (!rateLimiter) rateLimiter = buildRateLimiter();
  return rateLimiter;
}

/** Test hook. */
export function __setRateLimiterForTests(limiter: RateLimiter | null): void {
  rateLimiter = limiter ? Promise.resolve(limiter) : null;
}

/**
 * MCPMe orchestrator attestation, v1.
 *
 * The orchestrator signs
 *   `v1:mcpme-orchestrator-absorb:${METHOD}:${path}:${apiKeyId}:${tier}:${accountUuid}:${nonce}:${window}`
 * with ORCHESTRATOR_SECRET, where window = Math.floor(Date.now() / 30_000) and
 * path is the request path without the query string. The domain prefix keeps
 * the MAC from being reused for any other protocol, method and path bind it to
 * one route, and the UUID binds it to one account. Current and previous window
 * are accepted (clock skew), so a signature lives at most ~60 s; inside that
 * window the nonce makes it single-use (see consumeOrchestratorNonce).
 */
export const ORCHESTRATOR_SIG_DOMAIN = 'v1:mcpme-orchestrator-absorb';
const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function orchestratorSigMessage(
  method: string,
  path: string,
  apiKeyId: string,
  tier: string,
  accountUuid: string,
  nonce: string,
  window: number
): string {
  return `${ORCHESTRATOR_SIG_DOMAIN}:${method.toUpperCase()}:${path}:${apiKeyId}:${tier}:${accountUuid.toLowerCase()}:${nonce}:${window}`;
}

export function verifyOrchestratorSig(
  method: string,
  path: string,
  apiKeyId: string,
  tier: string,
  accountUuid: string,
  nonce: string,
  sig: string,
  now: number = Date.now()
): boolean {
  const secret = process.env.ORCHESTRATOR_SECRET;
  if (!secret || !method || !path || !apiKeyId || !tier || !sig) return false;
  if (!SIG_HEX_RE.test(sig)) return false;
  if (!accountUuid || !UUID_RE.test(accountUuid)) return false;
  if (!nonce || !NONCE_RE.test(nonce)) return false;
  const window = Math.floor(now / 30_000);
  for (const w of [window, window - 1]) {
    const message = orchestratorSigMessage(method, path, apiKeyId, tier, accountUuid, nonce, w);
    const expected = createHmac('sha256', secret).update(message).digest('hex');
    try {
      if (timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
        return true;
      }
    } catch {
      // buffers of different length: invalid sig format
    }
  }
  return false;
}

/**
 * Single-use nonces for orchestrator attestations. In-memory with a TTL longer
 * than the ~60 s signature lifetime, so no schema change. Scope: one absorb
 * process. With several replicas a replay could land on another replica inside
 * the window; a shared store would close that and needs a separate decision.
 */
const NONCE_TTL_MS = 90_000;
const seenNonces = new Map<string, number>();
export function consumeOrchestratorNonce(apiKeyId: string, nonce: string, now: number = Date.now()): boolean {
  for (const [k, exp] of seenNonces) {
    if (exp > now) break;
    seenNonces.delete(k);
  }
  const key = `${apiKeyId}:${nonce}`;
  const exp = seenNonces.get(key);
  if (exp !== undefined && exp > now) return false;
  seenNonces.delete(key);
  seenNonces.set(key, now + NONCE_TTL_MS);
  return true;
}
/** Test hook. */
export function __resetOrchestratorNoncesForTests(): void {
  seenNonces.clear();
}

/** Path the caller addressed, independent of where the middleware is mounted. */
function requestPath(req: Request): string {
  const raw = req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`;
  const q = raw.indexOf('?');
  return q >= 0 ? raw.slice(0, q) : raw;
}

/**
 * Resolve the user's credit tier from the database.
 * Fails closed: returns null when the DB is unavailable or the account has no
 * tier, and the caller refuses the request (503) instead of guessing 'free'.
 */
export async function resolveUserTier(userId: string): Promise<string | null> {
  try {
    const { getOrCreateAccount } = await import('@holoscript/absorb-service/credits');
    const account = await getOrCreateAccount(userId);
    // @ts-ignore - Automatic remediation for TS2339
    const tier = account?.tier;
    return typeof tier === 'string' && tier ? tier : null;
  } catch {
    return null;
  }
}

function refuseTierUnavailable(res: Response): void {
  res.status(503).json({
    error: 'Could not resolve the account tier. Try again shortly.',
    reason: 'tier_unavailable',
  });
}

/**
 * TRANSITION FLAG: accept the pre-v1 attestation (`${apiKeyId}:${tier}:${window}`,
 * header X-MCPMe-Orchestrator-Sig) from an orchestrator that predates v1, so the
 * two services can deploy in either order. Such a call is ACCOUNT-UNKNOWN: it is
 * authenticated but carries no userId and no tier, so every paid or user-scoped
 * route refuses it exactly as it refuses any caller without a user UUID. The old
 * orchestrator bills its own wallet for it, so it is still charged once. Each
 * legacy signature is single-use (replay -> 409).
 * REMOVE once the v1 orchestrator companion is deployed everywhere: delete this
 * flag and verifyLegacyOrchestratorSig, and the legacy branch below.
 * Set ABSORB_ACCEPT_LEGACY_ORCHESTRATOR_SIG=false to switch it off early.
 */
export const LEGACY_ORCHESTRATOR_SIG_FLAG = 'ABSORB_ACCEPT_LEGACY_ORCHESTRATOR_SIG';
export function acceptLegacyOrchestratorSig(): boolean {
  return process.env[LEGACY_ORCHESTRATOR_SIG_FLAG] !== 'false';
}

/** Pre-v1 format. Transition only, see LEGACY_ORCHESTRATOR_SIG_FLAG. */
export function verifyLegacyOrchestratorSig(apiKeyId: string, tier: string, sig: string, now: number = Date.now()): boolean {
  const secret = process.env.ORCHESTRATOR_SECRET;
  if (!secret || !apiKeyId || !tier || !sig) return false;
  if (!SIG_HEX_RE.test(sig)) return false;
  const window = Math.floor(now / 30_000);
  for (const w of [window, window - 1]) {
    const expected = createHmac('sha256', secret).update(`${apiKeyId}:${tier}:${w}`).digest('hex');
    try {
      if (timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return true;
    } catch {
      // different length
    }
  }
  return false;
}

/**
 * Exactly one biller (CoS ruling 2026-10-24): for a verified v1 orchestrator
 * call absorb charges NOTHING itself. On a 2xx it returns
 *   X-Absorb-Billed-Account: v1
 *   X-Absorb-Credit-Cost: <credits, integer >= 0>
 * and the orchestrator debits the end user exactly that amount (0 means 0;
 * a replay or cached result answers 0). Prices stay absorb's (OPERATION_COSTS);
 * the orchestrator never decides one. A 409 replay or any non-2xx carries no
 * cost header and nothing is charged on either side.
 */
export const ABSORB_BILLED_HEADER = 'X-Absorb-Billed-Account';
export const ABSORB_CREDIT_COST_HEADER = 'X-Absorb-Credit-Cost';

export function isOrchestratorBilled(req: Request): boolean {
  return (req as AuthenticatedRequest).orchestratorBilled === true;
}

/** Hand the price to the orchestrator (call only on a 2xx). */
export function setOrchestratorCost(res: Response, cents: unknown): void {
  const n = typeof cents === 'number' && Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0;
  res.setHeader(ABSORB_BILLED_HEADER, 'v1');
  res.setHeader(ABSORB_CREDIT_COST_HEADER, String(n));
}

/** Absorb's own list price for an operation, without a balance check. Fails closed. */
export function orchestratorPrice(creditsModule: unknown, op: string): number {
  const m = ((creditsModule as any)?.default ?? creditsModule) as any;
  const p = m?.OPERATION_COSTS?.[op]?.baseCostCents;
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0) throw new Error(`No price for operation ${op}`);
  return p;
}

/**
 * Path 1.5: MCPMe orchestrator attestation.
 * v1 (X-MCPMe-Orchestrator-Sig-V1): signed account UUID, method, path, nonce;
 * runs as that account and absorb charges it. Legacy (X-MCPMe-Orchestrator-Sig
 * only): transition, account-unknown, see LEGACY_ORCHESTRATOR_SIG_FLAG.
 * Returns true when it handled the request (next() called or response sent).
 * Runs before the Authorization-header paths because the orchestrator does not
 * send an Authorization header.
 */
async function handleOrchestratorAttestation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<boolean> {
  const authReq = req as AuthenticatedRequest;
  const orchKey = req.headers['x-mcpme-orchestrator-key'] as string | undefined;
  const orchTier = req.headers['x-mcpme-orchestrator-tier'] as string | undefined;
  const orchSigV1 = req.headers['x-mcpme-orchestrator-sig-v1'] as string | undefined;
  const orchSigLegacy = req.headers['x-mcpme-orchestrator-sig'] as string | undefined;
  const orchUser = req.headers['x-mcpme-orchestrator-user'] as string | undefined;
  const orchNonce = req.headers['x-mcpme-orchestrator-nonce'] as string | undefined;
  if (!(orchKey || orchTier || orchSigV1 || orchSigLegacy || orchUser || orchNonce)) return false;

  const refuse = (status: number, reason: string, error: string): true => {
    res.status(status).json({ error, reason });
    return true;
  };

  if (!orchSigV1) {
    // Legacy (pre-v1) orchestrator. Never charges anyone here and never sets a user.
    if (!orchUser && orchKey && orchTier && orchSigLegacy && acceptLegacyOrchestratorSig()) {
      if (!verifyLegacyOrchestratorSig(orchKey, orchTier, orchSigLegacy)) {
        return refuse(401, 'orchestrator_attestation_invalid', 'Orchestrator attestation signature is invalid or expired.');
      }
      if (!SIG_HEX_RE.test(orchSigLegacy) || !consumeOrchestratorNonce(orchKey, `legacy:${orchSigLegacy}`)) {
        return refuse(409, 'orchestrator_attestation_replayed', 'Orchestrator attestation was already used.');
      }
      authReq.authenticated = true;
      return next(), true;
    }
    if (!orchUser) {
      return refuse(401, 'orchestrator_attestation_no_user', 'Orchestrator attestation must carry the end user account UUID.');
    }
    return refuse(401, 'orchestrator_attestation_invalid', 'Orchestrator attestation signature is invalid or expired.');
  }

  if (!orchUser || !UUID_RE.test(orchUser)) {
    return refuse(401, 'orchestrator_attestation_no_user', 'Orchestrator attestation must carry the end user account UUID.');
  }
  if (
    !orchKey ||
    !orchTier ||
    !orchNonce ||
    !verifyOrchestratorSig(req.method, requestPath(req), orchKey, orchTier, orchUser, orchNonce, orchSigV1)
  ) {
    return refuse(401, 'orchestrator_attestation_invalid', 'Orchestrator attestation signature is invalid or expired.');
  }
  if (!consumeOrchestratorNonce(orchKey, orchNonce)) {
    return refuse(409, 'orchestrator_attestation_replayed', 'Orchestrator attestation was already used.');
  }
  const tier = await resolveUserTier(orchUser.toLowerCase());
  if (!tier) {
    refuseTierUnavailable(res);
    return true;
  }
  authReq.authenticated = true;
  authReq.userId = orchUser.toLowerCase();
  authReq.tier = tier;
  authReq.orchestratorBilled = true;
  next();
  return true;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p))) {
    return next();
  }

  if (await handleOrchestratorAttestation(req, res, next)) return;

  const apiKey = process.env.ABSORB_API_KEY;
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // Path 1: Service-to-service API key — no rate limit.
    // When the Studio proxy forwards a request it authenticates with the service
    // key (ABSORB_API_KEY) AND passes the original user's GitHub token in
    // X-User-Authorization.  Resolve that secondary token so user-scoped routes
    // (projects, moltbook agents, credits) can return data for the actual caller
    // instead of always seeing userUuid(req) === null.
    if (apiKey && token === apiKey) {
      authReq.authenticated = true;

      const userAuthHeader = req.headers['x-user-authorization'] as string | undefined;
      if (userAuthHeader) {
        const userToken = userAuthHeader.startsWith('Bearer ')
          ? userAuthHeader.slice(7)
          : userAuthHeader;
        // Mapping #654 N1: a forwarded user credential that cannot be resolved
        // must not silently degrade to an anonymous service call (fail closed).
        let identity: Awaited<ReturnType<typeof resolveGitHubToken>>;
        try {
          identity = await resolveGitHubToken(userToken);
        } catch {
          res.status(503).json({ error: 'User identity resolver unavailable' });
          return;
        }
        if (!identity) {
          res.status(401).json({ error: 'Invalid X-User-Authorization token' });
          return;
        }
        authReq.userId = identity.userId;
        authReq.githubUsername = identity.githubUsername;
        authReq.isAdmin = identity.isAdmin;
      }

      return next();
    }

    // Path 2: GitHub OAuth token
    try {
      const identity = await resolveGitHubToken(token);
      if (identity) {
        authReq.authenticated = true;
        authReq.userId = identity.userId;
        authReq.isAdmin = identity.isAdmin;
        authReq.githubUsername = identity.githubUsername;

        // Admins bypass rate limits entirely
        if (identity.isAdmin) {
          authReq.tier = 'admin';
          return next();
        }

        // Resolve tier and apply per-user rate limit for free tier
        const tier = await resolveUserTier(identity.userId);
        if (!tier) {
          refuseTierUnavailable(res);
          return;
        }
        authReq.tier = tier;

        if (tier === 'free') {
          const { limited, remaining } = await (await getRateLimiter()).check(
            rateLimitInputs(authReq, identity.userId, FREE_USER_SCAN_LIMIT),
          );
          if (limited) {
            res.status(429).json({
              error: 'Rate limit exceeded',
              message: `Free GitHub tier limited to ${FREE_USER_SCAN_LIMIT} requests per hour. Purchase credits for unlimited access.`,
              retryAfterMs: RATE_LIMIT_WINDOW_MS,
              remaining: 0,
              purchaseUrl: '/absorb?tab=credits',
            });
            return;
          }
          res.setHeader('X-RateLimit-Remaining', remaining);
        }
        // pro/enterprise: no rate limit (credit-gated in route handlers)

        return next();
      }
    } catch {
      // GitHub resolution failed — fall through to rejection
    }

    res.status(401).json({ error: 'Invalid API key or GitHub token' });
    return;
  }

  // No API key configured: open only for local development. In production a
  // missing ABSORB_API_KEY must fail closed, not silently open every route
  // (requireConfig does not list ABSORB_API_KEY, so nothing else catches it).
  if (!apiKey && process.env.NODE_ENV !== 'production') {
    authReq.authenticated = false;
    return next();
  }

  res.status(401).json({
    error: 'Authentication required',
    message: 'Provide an API key via Authorization: Bearer <key> header, or a GitHub OAuth token',
  });
}
