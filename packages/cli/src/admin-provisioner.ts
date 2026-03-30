import * as crypto from 'crypto';

export async function issueTenantKey(tenantId: string, tier: 'free' | 'pro' | 'enterprise') {
  // Generate a cryptographically secure random key
  const randString = crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '');
  const apiKey = `holoscript_live_${randString}`;

  const limits = {
    free: {
      maxVideoDurationSec: 30,
      maxMediaResolution: 1024,
      allowProcessExec: false,
      rateLimitRequestsPerMin: 10,
    },
    pro: {
      maxVideoDurationSec: 300,
      maxMediaResolution: 2048,
      allowProcessExec: false,
      rateLimitRequestsPerMin: 100,
    },
    enterprise: {
      maxVideoDurationSec: 3600,
      maxMediaResolution: 4096,
      allowProcessExec: true,
      rateLimitRequestsPerMin: 1000,
    },
  }[tier] || {
    maxVideoDurationSec: 30,
    maxMediaResolution: 1024,
    allowProcessExec: false,
    rateLimitRequestsPerMin: 10,
  };

  let savedToDb = false;

  // 1. Try PostgreSQL
  if (process.env.DATABASE_URL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
      });

      const query = `
        INSERT INTO api_keys (key, tenant_id, tier, limits, revoked)
        VALUES ($1, $2, $3, $4, false)
      `;
      await pool.query(query, [apiKey, tenantId, tier, JSON.stringify(limits)]);
      savedToDb = true;
      console.log(`\x1b[32m✓\x1b[0m Successfully saved to PostgreSQL database.`);
    } catch (e: any) {
      console.warn(`\x1b[33m⚠\x1b[0m Failed to save to Postgres: ${e.message}`);
    }
  }

  // 2. Try Upstash Redis
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const payload = {
        tenantId,
        subscriptionTier: tier,
        limits,
      };

      const resp = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/apikey:${apiKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error(`Upstash returned ${resp.status}`);
      }

      console.log(`\x1b[32m✓\x1b[0m Successfully synchronized cache in Upstash Redis.`);
    } catch (e: any) {
      console.warn(`\x1b[33m⚠\x1b[0m Failed to sync to Upstash Redis: ${e.message}`);
    }
  }

  if (!savedToDb && !process.env.UPSTASH_REDIS_REST_URL) {
    console.warn(
      `\x1b[33m⚠\x1b[0m Neither DATABASE_URL nor UPSTASH_REDIS_REST_URL are configured. Outputting dry-run only.`
    );
  }

  console.log(`\n\x1b[1m🔑 Generated Enterprise API Key\x1b[0m`);
  console.log(`\x1b[36mTenant:\x1b[0m ${tenantId}`);
  console.log(`\x1b[36mTier:\x1b[0m   ${tier}`);
  console.log(`\x1b[36mKey:\x1b[0m    \x1b[1m${apiKey}\x1b[0m\n`);

  return apiKey;
}
