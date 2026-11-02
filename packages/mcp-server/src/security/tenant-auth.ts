/**
 * Dynamic Tenant Authentication
 *
 * Bridges the static OAuth21 configuration to a high-speed database store
 * (PostgreSQL or Upstash Redis) to allow multi-tenant, enterprise consumption.
 *
 * @module security/tenant-auth
 */

import { Pool } from 'pg';
import type { TokenIntrospection } from './oauth21';
import { createRailwayPostgresPoolOptions } from '../postgres-pool-options';

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
        // Same pool options as the other Railway Postgres pools in this server
        // (http-server, holokey-resolver): DATABASE_SSL=false disables TLS,
        // otherwise TLS without certificate verification on the private network.
        pgPool = new Pool(createRailwayPostgresPoolOptions(process.env.DATABASE_URL));
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
      // Log only the error code and name: the full pg error can carry
      // connection details.
      const err = (e ?? {}) as { code?: unknown; name?: unknown };
      console.warn('[TenantAuth] DB query failed:', {
        code: typeof err.code === 'string' ? err.code : undefined,
        name: typeof err.name === 'string' ? err.name : undefined,
      });
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
      const resp = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/apikey:${encodedKey}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
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

  // A customer key never carries an operator scope, whatever its tier (task jch1). admin:* and
  // tools:admin reach the host's files, git, secrets, and install_plugin's in-process code: the
  // server every tenant shares. A tier buys limits (tenantContext.limits), not control of it.
  if (tenant) {
    const scopes = ['tools:read', 'tools:write', 'tools:codebase', 'tools:browser'];

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
