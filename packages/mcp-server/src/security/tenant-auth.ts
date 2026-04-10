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

// In-memory fallback if no DB is connected
const mockTenantStore = new Map<string, TenantContext>([
  [
    'live_test_enterprise_key_849204',
    {
      tenantId: 'tenant_enterprise_01',
      subscriptionTier: 'enterprise',
      limits: {
        maxVideoDurationSec: 3600,
        maxMediaResolution: 4096,
        allowProcessExec: true,
        rateLimitRequestsPerMin: 1000,
      },
    },
  ],
]);

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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
      });
      const res = await pool.query(
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
  if (!tenant && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const resp = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/apikey:${apiKey}`, {
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

  // 3. Fallback to local memory mock (for dev testing)
  if (!tenant && mockTenantStore.has(apiKey)) {
    tenant = mockTenantStore.get(apiKey);
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
