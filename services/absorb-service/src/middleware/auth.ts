import { Request, Response, NextFunction } from 'express';
import { resolveGitHubToken } from './github-identity.js';

export interface AuthenticatedRequest extends Request {
  authenticated?: boolean;
  freeTier?: boolean;
  userId?: string;
  isAdmin?: boolean;
  githubUsername?: string;
}

const PUBLIC_PATHS = ['/health', '/.well-known/mcp', '/.well-known/mcp.json'];

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FREE_SCAN_LIMIT = 3;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Periodically clean expired rate limit entries to prevent memory leak
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // Don't block process exit

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > FREE_SCAN_LIMIT;
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

    // Path 1: Service-to-service API key
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
        return next();
      }
    } catch {
      // GitHub resolution failed — fall through to rejection
    }

    res.status(401).json({ error: 'Invalid API key or GitHub token' });
    return;
  }

  // Free tier: allow scan endpoint with rate limiting
  // Note: path is relative to mount point (/api/absorb), so check /scan not /api/absorb/scan
  if ((req.path === '/scan' || req.path === '/api/absorb/scan') && req.method === 'POST') {
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Free tier limited to ${FREE_SCAN_LIMIT} scans per hour. Add an API key for unlimited access.`,
        retryAfterMs: RATE_LIMIT_WINDOW_MS,
      });
      return;
    }
    authReq.authenticated = false;
    authReq.freeTier = true;
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
