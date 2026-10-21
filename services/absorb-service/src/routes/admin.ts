/**
 * Admin Routes
 *
 * Platform administration endpoints for brianonbased-dev (and other admins).
 * All routes require `req.isAdmin === true` (set by auth middleware when
 * GitHub identity matches ADMIN_GITHUB_USERNAMES env var).
 *
 * Mounted at /api/admin in server.ts.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
// Static (not per-request dynamic) imports for the credit-grant route: it runs
// concurrently by design, and its race tests must see one module instance.
import { users as usersTable, adminCreditGrants } from '../db/schema.js';
import { eq as dEq, and as dAnd, gte as dGte, sql as dSql } from 'drizzle-orm';

const router = Router();

// Express 5 types req.params values as `string | string[]` (ParamsDictionary).
// Drizzle's eq() and other consumers need a plain string. Same guard pattern as
// commit b7b1c1683 applied to studio + llm-service. Centralized here so any
// new param-using route can reuse it instead of inlining the cast.
const paramOf = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

// ─── Admin Guard ────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!(req as AuthenticatedRequest).isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

router.use(requireAdmin);

// ─── GET /users — List all users ────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { users, accounts, absorbProjects } = await import('../db/schema.js');
    const { sql, eq } = await import('drizzle-orm');

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        createdAt: users.createdAt,
      })
      .from(users)
      .limit(limit)
      .offset(offset);

    // Enrich with GitHub username from accounts
    const enriched: any[] = [];
    for (const user of allUsers) {
      const [account] = await db
        .select({ providerAccountId: accounts.providerAccountId })
        .from(accounts)
        .where(eq(accounts.userId, user.id))
        .limit(1);

      const [projectCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        // @ts-ignore - Automatic remediation for TS2345
        .from(absorbProjects)
        // @ts-ignore - Automatic remediation for TS18046
        .where(eq(absorbProjects.userId, user.id));

      enriched.push({
        ...user,
        githubId: account?.providerAccountId ?? null,
        projectCount: projectCount?.count ?? 0,
      });
    }

    res.json({ users: enriched, limit, offset });
  } catch (error: any) {
    console.error('[admin] List users error:', error.message);
    res.status(500).json({ error: 'Failed to list users', message: error.message });
  }
});

// ─── GET /users/:id — Detailed user profile ────────────────────────────────

router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { users, accounts, absorbProjects, moltbookAgents } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, paramOf(req.params.id)))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userAccounts = await db
      .select({ provider: accounts.provider, providerAccountId: accounts.providerAccountId })
      .from(accounts)
      .where(eq(accounts.userId, user.id));

    const projects = await db
      .select()
      // @ts-ignore - Automatic remediation for TS2345
      .from(absorbProjects)
      // @ts-ignore - Automatic remediation for TS18046
      .where(eq(absorbProjects.userId, user.id))
      .limit(50);

    const agents = await db
      .select()
      .from(moltbookAgents)
      .where(eq(moltbookAgents.userId, user.id))
      .limit(50);

    // Try to get credit balance
    let creditBalance = 0;
    try {
      const creditsModule = await import('@holoscript/absorb-service/credits');
      const { checkBalance } = (creditsModule as any).default || creditsModule;
      const result = await (checkBalance as Function)(user.id, 0);
      creditBalance = (result as any)?.balanceCents ?? 0;
    } catch {
      // Credit system may not be initialized
    }

    res.json({
      user,
      accounts: userAccounts,
      projects,
      agents: agents.map((a) => ({ ...a, moltbookApiKey: '***' })),
      creditBalanceCents: creditBalance,
    });
  } catch (error: any) {
    console.error('[admin] User detail error:', error.message);
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

// ─── GET /projects — All projects cross-user ────────────────────────────────

router.get('/projects', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('../db/schema.js');
    const { eq, desc } = await import('drizzle-orm');

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);

    // @ts-ignore - Automatic remediation for TS2345
    const base = db.select().from(absorbProjects);
    const projects = req.query.userId
      ? await base
          // @ts-ignore - Automatic remediation for TS18046
          .where(eq(absorbProjects.userId, req.query.userId as string))
          // @ts-ignore - Automatic remediation for TS18046
          .orderBy(desc(absorbProjects.createdAt))
          .limit(limit)
      : await base
          // @ts-ignore - Automatic remediation for TS18046
          .orderBy(desc(absorbProjects.createdAt))
          .limit(limit);
    res.json({ projects, count: projects.length });
  } catch (error: any) {
    console.error('[admin] List projects error:', error.message);
    res.status(500).json({ error: 'Failed to list projects', message: error.message });
  }
});

// ─── GET /agents — All moltbook agents cross-user ───────────────────────────

router.get('/agents', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { desc } = await import('drizzle-orm');

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);

    const agents = await db
      .select()
      .from(moltbookAgents)
      .orderBy(desc(moltbookAgents.createdAt))
      .limit(limit);

    // Mask API keys
    const safeAgents = agents.map((a) => ({
      ...a,
      moltbookApiKey: a.moltbookApiKey.length > 8
        ? a.moltbookApiKey.slice(0, 4) + '***...' + a.moltbookApiKey.slice(-3)
        : '***',
    }));

    res.json({ agents: safeAgents, count: safeAgents.length });
  } catch (error: any) {
    console.error('[admin] List agents error:', error.message);
    res.status(500).json({ error: 'Failed to list agents', message: error.message });
  }
});

// ─── GET /stats — Global platform statistics ────────────────────────────────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { users, absorbProjects, moltbookAgents } = await import('../db/schema.js');
    const { sql } = await import('drizzle-orm');

    const [userStats] = await db
      .select({ totalUsers: sql<number>`count(*)::int` })
      .from(users);

    const [projectStats] = await db
      .select({ totalProjects: sql<number>`count(*)::int` })
      // @ts-ignore - Automatic remediation for TS2345
      .from(absorbProjects);

    const [agentStats] = await db
      .select({
        totalAgents: sql<number>`count(*)::int`,
        activeAgents: sql<number>`(count(*) filter (where ${moltbookAgents.heartbeatEnabled} = true))::int`,
        totalPosts: sql<number>`coalesce(sum(${moltbookAgents.totalPostsGenerated}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${moltbookAgents.totalCommentsGenerated}), 0)::int`,
        totalUpvotesGiven: sql<number>`coalesce(sum(${moltbookAgents.totalUpvotesGiven}), 0)::int`,
        totalLlmSpentCents: sql<number>`coalesce(sum(${moltbookAgents.totalLlmSpentCents}), 0)::int`,
      })
      .from(moltbookAgents);

    res.json({
      totalUsers: userStats?.totalUsers ?? 0,
      totalProjects: projectStats?.totalProjects ?? 0,
      ...agentStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin] Stats error:', error.message);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

// ─── POST /agents/:id/force-stop — Force stop any agent ────────────────────

router.post('/agents/:id/force-stop', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');

    const result = await db
      .update(moltbookAgents)
      .set({ heartbeatEnabled: false, updatedAt: new Date() })
      .where(eq(moltbookAgents.id, paramOf(req.params.id)))
      .returning();

    if (!Array.isArray(result) || result.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const admin = (req as AuthenticatedRequest).githubUsername || 'admin';
    console.log(`[admin] Force-stopped agent ${paramOf(req.params.id)} by ${admin}`);

    res.json({
      forceStopped: true,
      agentId: paramOf(req.params.id),
      agentName: result[0].agentName,
      stoppedBy: admin,
    });
  } catch (error: any) {
    console.error('[admin] Force-stop error:', error.message);
    res.status(500).json({ error: 'Failed to force-stop agent', message: error.message });
  }
});

// ─── GET /health-matrix — Probe entire ecosystem health ──────────────────────

router.get('/health-matrix', async (req: Request, res: Response) => {
  const endpoints = [
    { service: 'MCP Orchestrator', url: 'https://mcp-orchestrator-production-45f9.up.railway.app/health' },
    { service: 'uAA2 Engine', url: 'https://uaa2-service-production.up.railway.app/health' },
    { service: 'TrainingMonkey', url: 'https://trainingmonkey-production.up.railway.app/health' },
    { service: 'AI Workspace', url: 'https://aiworkspace-production.up.railway.app/health' },
    { service: 'Hololand Spatial', url: 'https://hololand-production.up.railway.app/health' },
    { service: 'HoloScript Core', url: 'https://holoscript.net' } // Dogfood UI platform monitor
  ];

  try {
    const results = await Promise.allSettled(
      endpoints.map(async (ep) => {
        const start = Date.now();
        const response = await fetch(ep.url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
        const latencyMs = Date.now() - start;
        return {
          service: ep.service,
          status: response.ok ? 'ONLINE' : 'OFFLINE',
          latencyMs,
          statusCode: response.status
        };
      })
    );

    const matrix = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: endpoints[i].service,
          status: 'OFFLINE',
          latencyMs: -1,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        };
      }
    });

    res.json({ timestamp: new Date().toISOString(), matrix });
  } catch (error: any) {
    console.error('[admin] Health matrix error:', error.message);
    res.status(500).json({ error: 'Failed to probe ecosystem', message: error.message });
  }
});

// ─── GET /operations-surface — Expose HoloScript 2D Telemetry ───────────────

router.get('/operations-surface', async (req: Request, res: Response) => {
  try {
    // We dynamically import the daemon operations surface generator and state
    const surfaceModule = await import('../lib/daemon/operationsSurfaceHolo.js');
    const { buildDaemonOperationsSurfaceCode } = (surfaceModule as any).default || surfaceModule;
    const { listDaemonJobs, getTelemetrySummary } = await import('../daemon/jobs/store.js');
    
    // Fetch state
    const jobs = listDaemonJobs();
    const telemetry = getTelemetrySummary();

    // Generate the HoloScript 2D surface projection
    const surfaceHolo = buildDaemonOperationsSurfaceCode('hsplus', jobs, telemetry);

    res.json({ surfaceHolo });
  } catch (error: any) {
    console.error('[admin] Operations surface error:', error.message);
    res.status(500).json({ error: 'Failed to generate operations surface', message: error.message });
  }
});

// --- POST /credits/grant: admin credit grant (idempotent, capped, audited) ---

/** Largest single grant: $500. Larger amounts need more than one reviewed call. */
export const ADMIN_GRANT_MAX_CENTS = 50_000;

/**
 * Most one admin may grant per UTC day: $1,000. Enforced inside the grant's
 * transaction under a per-admin advisory lock, so two concurrent grants by the
 * same admin cannot both read the same "spent today" total and both pass.
 */
export const ADMIN_GRANT_DAILY_CAP_CENTS = 100_000;

// One shared load of the credits module: concurrent grants await the same
// promise instead of racing separate dynamic imports.
let creditsModulePromise: Promise<any> | null = null;
const loadCreditsModule = () =>
  (creditsModulePromise ??= import('@holoscript/absorb-service/credits'));

class DailyCapError extends Error {
  constructor(public readonly grantedTodayCents: number) {
    super('daily admin grant cap reached');
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function grantResponse(row: any, replayed: boolean) {
  return {
    granted: !replayed,
    replayed,
    userId: row.userId,
    amountCents: row.amountCents,
    balanceAfterCents: row.balanceAfterCents,
    note: row.note,
    idempotencyKey: row.idempotencyKey,
    grantedBy: row.adminGithubUsername,
    grantedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

router.post('/credits/grant', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const userRef = typeof body.user === 'string' ? body.user.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const amountCents = body.amountCents;

  if (!userRef) {
    res.status(400).json({ error: 'user (email or id) is required' });
    return;
  }
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: 'amountCents must be a positive integer' });
    return;
  }
  if (amountCents > ADMIN_GRANT_MAX_CENTS) {
    res.status(400).json({
      error: `amountCents exceeds the single-grant cap of ${ADMIN_GRANT_MAX_CENTS} ($500)`,
      maxCents: ADMIN_GRANT_MAX_CENTS,
    });
    return;
  }
  if (!note) {
    res.status(400).json({ error: 'note is required' });
    return;
  }
  if (!idempotencyKey || idempotencyKey.length > 200) {
    res.status(400).json({ error: 'idempotencyKey is required (1-200 chars)' });
    return;
  }

  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const users = usersTable;
    const eq = dEq;
    const and = dAnd;
    const gte = dGte;
    const sql = dSql;

    const findPrior = async () => {
      const [prior] = await db
        .select()
        .from(adminCreditGrants)
        .where(eq(adminCreditGrants.idempotencyKey, idempotencyKey))
        .limit(1);
      return prior ?? null;
    };

    // A key that already applied returns its original result and moves nothing.
    // Same key with a different user or amount is a client bug: refuse it.
    const replay = (prior: any): void => {
      res.status(200).json(grantResponse(prior, true));
    };

    const prior = await findPrior();

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(UUID_RE.test(userRef) ? eq(users.id, userRef) : eq(users.email, userRef))
      .limit(1);

    if (prior) {
      if (prior.amountCents !== amountCents || (user && prior.userId !== user.id)) {
        res.status(409).json({
          error: 'idempotencyKey was already used for a different grant',
          original: grantResponse(prior, true),
        });
        return;
      }
      replay(prior);
      return;
    }

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const admin = (req as AuthenticatedRequest).githubUsername || 'unknown-admin';

    const creditsModule = await loadCreditsModule();
    const { addCredits } = ((creditsModule as any).default || creditsModule) as {
      addCredits: (
        userId: string,
        amountCents: number,
        description: string,
        opts?: Record<string, unknown>
      ) => Promise<{ balanceCents: number } | null>;
    };

    let auditRow: any = null;
    let result: { balanceCents: number } | null;
    try {
      result = await addCredits(user.id, amountCents, `Admin grant by ${admin}: ${note}`, {
        type: 'admin_grant',
        // Free credit is not revenue: keep it out of lifetime_purchased_cents.
        countAsPurchase: false,
        metadata: { grantedBy: admin, idempotencyKey, note },
        withinTransaction: async (tx: any, applied: { balanceCents: number }) => {
          // Serialize this admin's grants for the rest of the transaction, then
          // read today's total. Released automatically at commit or rollback.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${'admin-credit-grant:' + admin}))`
          );
          const [today] = await tx
            .select({
              total: sql<number>`coalesce(sum(${adminCreditGrants.amountCents}), 0)::int`,
            })
            .from(adminCreditGrants)
            .where(
              and(
                eq(adminCreditGrants.adminGithubUsername, admin),
                gte(adminCreditGrants.createdAt, sql`(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`)
              )
            );
          const grantedToday = Number(today?.total ?? 0);
          if (grantedToday + amountCents > ADMIN_GRANT_DAILY_CAP_CENTS) {
            throw new DailyCapError(grantedToday);
          }
          const [row] = await tx
            .insert(adminCreditGrants)
            .values({
              idempotencyKey,
              adminGithubUsername: admin,
              userId: user.id,
              amountCents,
              note,
              balanceAfterCents: applied.balanceCents,
            })
            .returning();
          auditRow = row;
        },
      });
    } catch (err) {
      if (err instanceof DailyCapError) {
        res.status(429).json({
          error: `Daily admin grant cap of ${ADMIN_GRANT_DAILY_CAP_CENTS} cents ($1,000) reached`,
          grantedTodayCents: err.grantedTodayCents,
          remainingTodayCents: Math.max(0, ADMIN_GRANT_DAILY_CAP_CENTS - err.grantedTodayCents),
        });
        return;
      }
      // Lost a race with the same key: our transaction rolled back, the winner's stands.
      if (isUniqueViolation(err)) {
        const winner = await findPrior();
        if (winner) {
          replay(winner);
          return;
        }
      }
      throw err;
    }

    if (!result || !auditRow) {
      res.status(503).json({ error: 'Credit grant not applied (credit store unavailable)' });
      return;
    }

    console.log(
      `[admin] Credit grant ${amountCents}c to ${user.id} by ${admin} (key ${idempotencyKey})`
    );
    res.status(201).json(grantResponse(auditRow, false));
  } catch (error: any) {
    console.error('[admin] Credit grant error:', error.message);
    res.status(500).json({ error: 'Failed to grant credits' });
  }
});

export { router as adminRouter };
