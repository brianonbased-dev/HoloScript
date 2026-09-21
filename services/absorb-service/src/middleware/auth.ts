import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveGitHubToken } from './github-identity.js';

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
}

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
const userRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FREE_USER_SCAN_LIMIT = 10;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Periodically clean expired rate limit entries to prevent memory leak
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userRateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      userRateLimitMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // Don't block process exit

function checkRateLimit(
  map: Map<string, { count: number; windowStart: number }>,
  key: string,
  limit: number,
): { limited: boolean; remaining: number } {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return { limited: false, remaining: limit - 1 };
  }
  entry.count++;
  return { limited: entry.count > limit, remaining: Math.max(0, limit - entry.count) };
}

/**
 * Verify an MCPMe orchestrator attestation signature.
 *
 * The orchestrator signs `${apiKeyId}:${tier}:${window}` with a shared secret
 * where window = Math.floor(Date.now() / 30_000) (30-second tick).
 * We allow the current AND the previous window to handle clock skew at boundaries.
 */
function verifyOrchestratorSig(apiKeyId: string, tier: string, sig: string): boolean {
  const secret = process.env.ORCHESTRATOR_SECRET;
  if (!secret || !apiKeyId || !tier || !sig) return false;
  const window = Math.floor(Date.now() / 30_000);
  for (const w of [window, window - 1]) {
    const message = `${apiKeyId}:${tier}:${w}`;
    const expected = createHmac('sha256', secret).update(message).digest('hex');
    try {
      if (timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
        return true;
      }
    } catch {
      // buffers of different length — invalid sig format
    }
  }
  return false;
}

/**
 * Resolve the user's credit tier from the database.
 * Returns 'free' if DB is unavailable or account doesn't exist yet.
 */
async function resolveUserTier(userId: string): Promise<string> {
  try {
    const { getOrCreateAccount } = await import('@holoscript/absorb-service/credits');
    const account = await getOrCreateAccount(userId);
    // @ts-ignore - Automatic remediation for TS2339
    return account?.tier ?? 'free';
  } catch {
    return 'free';
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p))) {
    return next();
  }

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
        try {
          const identity = await resolveGitHubToken(userToken);
          if (identity) {
            authReq.userId = identity.userId;
            authReq.githubUsername = identity.githubUsername;
            authReq.isAdmin = identity.isAdmin;
          }
        } catch {
          // Token resolution failure is non-fatal for service-key auth.
          // The request proceeds without a userId — user-scoped routes return
          // empty data, which is safer than a hard 500.
        }
      }

      return next();
    }

    // Path 1.5: MCPMe orchestrator attestation — billing already handled upstream.
    // When the MCP mesh routes a call to absorb-service, it attaches a HMAC-signed
    // header proving the request passed MCPMe quota checks. In this case we skip
    // absorb credits entirely to prevent double billing.
    const orchKey = req.headers['x-mcpme-orchestrator-key'] as string | undefined;
    const orchTier = req.headers['x-mcpme-orchestrator-tier'] as string | undefined;
    const orchSig = req.headers['x-mcpme-orchestrator-sig'] as string | undefined;
    if (orchKey && orchTier && orchSig && verifyOrchestratorSig(orchKey, orchTier, orchSig)) {
      authReq.authenticated = true;
      authReq.orchestratorGated = true;
      authReq.userId = `orchestrator:${orchKey}`;
      authReq.tier = orchTier;
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
        authReq.tier = tier;

        if (tier === 'free') {
          const { limited, remaining } = checkRateLimit(userRateLimitMap, identity.userId, FREE_USER_SCAN_LIMIT);
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
