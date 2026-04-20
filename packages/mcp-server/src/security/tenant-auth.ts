/**
 * Dynamic Tenant Authentication
 *
 * Bridges the static OAuth21 configuration to a high-speed database store
 * (PostgreSQL or Upstash Redis) to allow multi-tenant, enterprise consumption.
 *
 * @module security/tenant-auth
 */

import type { TokenIntrospection } from './oauth21';

export interface TenantContext {
  tenantId: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  limits: {
    maxVideoDurationSec: number;
    maxMediaResolution: number;
    allowProcessExec: boolean;
    rateLimitRequestsPerMin: number;
  };
}

export type TokenIntrospectionWithTenant = TokenIntrospection & {
  tenantContext?: TenantContext;
};

let pgPool: any = null;

/**
 * SEC-T09: Build node-postgres SSL options with cert validation ON by default.
 *
 * Production: `rejectUnauthorized: true`. The CA bundle is read from
 * `PG_SSL_CA` (raw PEM) or `PG_SSL_CA_B64` (base64-encoded PEM). Providers
 * that use publicly-trusted roots (managed cloud Postgres) work without a
 * CA override because node uses the system trust store.
 *
 * Development: allow `PG_SSL_INSECURE=1` as an explicit opt-in escape hatch
 * for local Docker Compose setups with self-signed certs. Never honored in
 * production regardless of the flag.
 *
 * `DATABASE_SSL=false` still disables SSL entirely for local non-TLS DBs.
 */
function buildPostgresSslOptions():
  | false
  | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.DATABASE_SSL === 'false') {
    return false;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const devInsecure = !isProd && process.env.PG_SSL_INSECURE === '1';

  let ca: string | undefined;
  if (process.env.PG_SSL_CA) {
    ca = process.env.PG_SSL_CA;
  } else if (process.env.PG_SSL_CA_B64) {
    try {
      ca = Buffer.from(process.env.PG_SSL_CA_B64, 'base64').toString('utf8');
    } catch {
      /* fall through to system trust store */
    }
  }

  return devInsecure
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

/**
 * Development-only escape hatch: no hardcoded keys in the repo.
 * Set TENANT_AUTH_DEV_MOCK_KEY locally to a private value; never in production.
 */
function tryDevMockTenant(apiKey: string): TenantContext | undefined {
  if (process.env.NODE_ENV !== 'development') {
    return undefined;
  }
  const devKey = process.env.TENANT_AUTH_DEV_MOCK_KEY?.trim();
  if (!devKey || devKey !== apiKey) {
    return undefined;
  }
  console.warn(
    '[TenantAuth] DEV ONLY: TENANT_AUTH_DEV_MOCK_KEY matched — granting mock enterprise tenant. Disable outside local development.'
  );
  return {
    tenantId: 'tenant_dev_mock',
    subscriptionTier: 'enterprise',
    limits: {
      maxVideoDurationSec: 3600,
      maxMediaResolution: 4096,
      allowProcessExec: true,
      rateLimitRequestsPerMin: 1000,
    },
  };
}

/**
 * Validates a dynamic API key against the configured backend store.
 */
export async function validateTenantKey(
  apiKey: string
): Promise<TokenIntrospectionWithTenant | null> {
  let tenant: TenantContext | undefined;

  // 1. Try PostgreSQL if configured
  if (process.env.DATABASE_URL) {
    try {
      if (!pgPool) {
        const { Pool } = require('pg');
        pgPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          // SEC-T09: previously used `rejectUnauthorized: false`, which
          // negotiates TLS but skips cert validation — MITM on the network
          // path between app and DB could intercept auth queries. Now
          // defaults to strict verification; callers provide the PEM-encoded
          // CA bundle via `PG_SSL_CA` (raw) or `PG_SSL_CA_B64` (base64). In
          // non-production we still allow the lax mode behind an explicit
          // env opt-in to keep local dev ergonomic.
          ssl: buildPostgresSslOptions(),
        });
      }
      const res = await pgPool.query(
        'SELECT tenant_id, tier, limits FROM api_keys WHERE key = $1 AND revoked = false',
        [apiKey]
      );
      if (res.rows.length > 0) {
        tenant = {
          tenantId: res.rows[0].tenant_id,
          subscriptionTier: res.rows[0].tier,
          limits:
            typeof res.rows[0].limits === 'string'
              ? JSON.parse(res.rows[0].limits)
              : res.rows[0].limits,
        };
      }
    } catch (e) {
      console.warn('[TenantAuth] DB query failed:', e);
    }
  }

  // 2. Try Upstash Redis if configured (fastest)
  //
  // SEC-T08: the API key was previously URL-interpolated straight into the
  // Upstash REST path. A key value containing `/`, `?`, `#`, or `&` could
  // trick the request into hitting a different Upstash verb or smuggling
  // querystring parameters. We URL-encode the key before interpolation and
  // also enforce a conservative format check so malformed keys are rejected
  // before any outbound request.
  if (
    !tenant &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN &&
    /^[A-Za-z0-9_\-]{16,128}$/.test(apiKey)
  ) {
    try {
      const encodedKey = encodeURIComponent(apiKey);
      const resp = await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/get/apikey:${encodedKey}`,
        {
          headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
        }
      );
      const data = await resp.json();
      if (data && data.result) {
        tenant = JSON.parse(data.result);
      }
    } catch (e) {
      console.warn('[TenantAuth] Upstash query failed:', e);
    }
  }

  // 3. Optional dev-only mock (explicit env key only — never a repo-baked secret)
  if (!tenant) {
    const dev = tryDevMockTenant(apiKey);
    if (dev) tenant = dev;
  }

  // If found, grant scopes dynamically based on tier
  if (tenant) {
    const scopes = ['tools:read', 'tools:write', 'tools:codebase', 'tools:browser'];
    if (tenant.subscriptionTier === 'enterprise') {
      scopes.push('tools:admin');
      scopes.push('admin:*'); // Give enterprises full standard access
    }

    return {
      active: true,
      scopes,
      agentId: `agent_${tenant.tenantId}`,
      clientId: `client_${tenant.tenantId}`,
      tenantContext: tenant,
    };
  }

  return null;
}
