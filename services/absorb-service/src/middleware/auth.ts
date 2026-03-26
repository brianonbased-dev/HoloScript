import { Request, Response, NextFunction } from 'express';
import { resolveGitHubToken } from './github-identity.js';

export interface AuthenticatedRequest extends Request {
  authenticated?: boolean;
  freeTier?: boolean;
  userId?: string;
  isAdmin?: boolean;
  githubUsername?: string;
  /** Credit tier resolved from DB (free/pro/enterprise) */
  tier?: string;
}

const PUBLIC_PATHS = ['/health', '/.well-known/mcp', '/.well-known/mcp.json'];

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const userRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ANON_SCAN_LIMIT = 3;
const FREE_USER_SCAN_LIMIT = 10;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Periodically clean expired rate limit entries to prevent memory leak
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
  for (const [key, entry] of userRateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      userRateLimitMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // Don't block process exit

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

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
 * Resolve the user's credit tier from the database.
 * Returns 'free' if DB is unavailable or account doesn't exist yet.
 */
async function resolveUserTier(userId: string): Promise<string> {
  try {
    const { getOrCreateAccount } = await import('@holoscript/absorb-service/credits');
    const account = await getOrCreateAccount(userId);
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

    // Path 1: Service-to-service API key — no rate limit
    if (apiKey && token === apiKey) {
      authReq.authenticated = true;
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

  // Anonymous: allow scan endpoint with IP-based rate limiting
  if ((req.path === '/scan' || req.path === '/api/absorb/scan') && req.method === 'POST') {
    const ip = getClientIp(req);
    const { limited, remaining } = checkRateLimit(rateLimitMap, ip, ANON_SCAN_LIMIT);
    if (limited) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Anonymous tier limited to ${ANON_SCAN_LIMIT} scans per hour. Sign in with GitHub for ${FREE_USER_SCAN_LIMIT}/hr, or purchase credits for unlimited access.`,
        retryAfterMs: RATE_LIMIT_WINDOW_MS,
        remaining: 0,
      });
      return;
    }
    authReq.authenticated = false;
    authReq.freeTier = true;
    res.setHeader('X-RateLimit-Remaining', remaining);
    return next();
  }

  // If no API key is configured, allow all requests (development mode)
  if (!apiKey) {
    authReq.authenticated = false;
    return next();
  }

  res.status(401).json({
    error: 'Authentication required',
    message: 'Provide an API key via Authorization: Bearer <key> header, or a GitHub OAuth token',
  });
}
