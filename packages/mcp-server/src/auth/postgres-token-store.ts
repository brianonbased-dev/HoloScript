/**
 * PostgreSQL-backed Token Store for OAuth 2.1
 *
 * Drop-in replacement for InMemoryTokenStore. Uses `pg.Pool` for
 * persistent token storage that survives server restarts.
 *
 * Schema is auto-created on first connection via `ensureSchema()`.
 *
 * Usage:
 * ```typescript
 * import { Pool } from 'pg';
 * import { PostgresTokenStore } from './postgres-token-store';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const backend = new PostgresTokenStore(pool);
 * const store = new TokenStore({ backend });
 * ```
 */

import type { Pool } from 'pg';
import type {
  TokenStoreBackend,
  TokenStoreStats,
  StoredAccessToken,
  StoredRefreshToken,
  StoredAuthorizationCode,
  StoredClient,
} from './token-store';

// ── Schema DDL ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token           TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  issued_at       BIGINT NOT NULL,
  expires_at      BIGINT NOT NULL,
  agent_id        TEXT,
  dpop_thumbprint TEXT
);
CREATE INDEX IF NOT EXISTS idx_at_client ON oauth_access_tokens (client_id);
CREATE INDEX IF NOT EXISTS idx_at_expires ON oauth_access_tokens (expires_at);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token       TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  issued_at   BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  chain_id    TEXT NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_rt_client ON oauth_refresh_tokens (client_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires ON oauth_refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code                  TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,
  redirect_uri          TEXT NOT NULL,
  scopes                TEXT[] NOT NULL DEFAULT '{}',
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  expires_at            BIGINT NOT NULL,
  used                  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id          TEXT PRIMARY KEY,
  client_secret_hash TEXT NOT NULL,
  client_name        TEXT NOT NULL,
  redirect_uris      TEXT[] NOT NULL DEFAULT '{}',
  scopes             TEXT[] NOT NULL DEFAULT '{}',
  created_at         BIGINT NOT NULL,
  client_type        TEXT NOT NULL DEFAULT 'public',
  rate_limit         INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS oauth_revoked_chains (
  chain_id   TEXT PRIMARY KEY,
  revoked_at BIGINT NOT NULL
);
`;

// ── PostgresTokenStore ───────────────────────────────────────────────────────

export class PostgresTokenStore implements TokenStoreBackend {
  private pool: Pool;
  private schemaReady: Promise<void> | null = null;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.pool.query(SCHEMA_SQL).then(() => {
        // schema ensured
      });
    }
    return this.schemaReady;
  }

  // ── Access Tokens ─────────────────────────────────────────────────────

  async getAccessToken(token: string): Promise<StoredAccessToken | undefined> {
    await this.ensureSchema();
    const { rows } = await this.pool.query(
      `SELECT token, client_id, scopes, issued_at, expires_at, agent_id, dpop_thumbprint
       FROM oauth_access_tokens WHERE token = $1 AND expires_at > $2`,
      [token, Date.now()]
    );
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      token: r.token,
      clientId: r.client_id,
      scopes: r.scopes,
      issuedAt: Number(r.issued_at),
      expiresAt: Number(r.expires_at),
      agentId: r.agent_id ?? undefined,
      dpopThumbprint: r.dpop_thumbprint ?? undefined,
    };
  }

  async setAccessToken(token: StoredAccessToken): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO oauth_access_tokens (token, client_id, scopes, issued_at, expires_at, agent_id, dpop_thumbprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (token) DO UPDATE SET
         client_id = EXCLUDED.client_id, scopes = EXCLUDED.scopes,
         issued_at = EXCLUDED.issued_at, expires_at = EXCLUDED.expires_at,
         agent_id = EXCLUDED.agent_id, dpop_thumbprint = EXCLUDED.dpop_thumbprint`,
      [
        token.token,
        token.clientId,
        token.scopes,
        token.issuedAt,
        token.expiresAt,
        token.agentId ?? null,
        token.dpopThumbprint ?? null,
      ]
    );
  }

  async deleteAccessToken(token: string): Promise<boolean> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query('DELETE FROM oauth_access_tokens WHERE token = $1', [
      token,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async deleteAccessTokensByClient(clientId: string): Promise<number> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query(
      'DELETE FROM oauth_access_tokens WHERE client_id = $1',
      [clientId]
    );
    return rowCount ?? 0;
  }

  // ── Refresh Tokens ────────────────────────────────────────────────────

  async getRefreshToken(token: string): Promise<StoredRefreshToken | undefined> {
    await this.ensureSchema();
    const { rows } = await this.pool.query(
      `SELECT token, client_id, scopes, issued_at, expires_at, chain_id, used
       FROM oauth_refresh_tokens WHERE token = $1 AND expires_at > $2`,
      [token, Date.now()]
    );
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      token: r.token,
      clientId: r.client_id,
      scopes: r.scopes,
      issuedAt: Number(r.issued_at),
      expiresAt: Number(r.expires_at),
      chainId: r.chain_id,
      used: r.used,
    };
  }

  async setRefreshToken(token: StoredRefreshToken): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO oauth_refresh_tokens (token, client_id, scopes, issued_at, expires_at, chain_id, used)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (token) DO UPDATE SET
         client_id = EXCLUDED.client_id, scopes = EXCLUDED.scopes,
         issued_at = EXCLUDED.issued_at, expires_at = EXCLUDED.expires_at,
         chain_id = EXCLUDED.chain_id, used = EXCLUDED.used`,
      [
        token.token,
        token.clientId,
        token.scopes,
        token.issuedAt,
        token.expiresAt,
        token.chainId,
        token.used,
      ]
    );
  }

  async deleteRefreshToken(token: string): Promise<boolean> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query(
      'DELETE FROM oauth_refresh_tokens WHERE token = $1',
      [token]
    );
    return (rowCount ?? 0) > 0;
  }

  async deleteRefreshTokensByClient(clientId: string): Promise<number> {
    await this.ensureSchema();
    // Also revoke chains for these tokens
    await this.pool.query(
      `INSERT INTO oauth_revoked_chains (chain_id, revoked_at)
       SELECT DISTINCT chain_id, $2 FROM oauth_refresh_tokens WHERE client_id = $1
       ON CONFLICT (chain_id) DO NOTHING`,
      [clientId, Date.now()]
    );
    const { rowCount } = await this.pool.query(
      'DELETE FROM oauth_refresh_tokens WHERE client_id = $1',
      [clientId]
    );
    return rowCount ?? 0;
  }

  async markRefreshTokenUsed(token: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query('UPDATE oauth_refresh_tokens SET used = TRUE WHERE token = $1', [token]);
  }

  // ── Authorization Codes ───────────────────────────────────────────────

  async getAuthorizationCode(code: string): Promise<StoredAuthorizationCode | undefined> {
    await this.ensureSchema();
    const { rows } = await this.pool.query(
      `SELECT code, client_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used
       FROM oauth_auth_codes WHERE code = $1 AND expires_at > $2`,
      [code, Date.now()]
    );
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      code: r.code,
      clientId: r.client_id,
      redirectUri: r.redirect_uri,
      scopes: r.scopes,
      codeChallenge: r.code_challenge,
      codeChallengeMethod: r.code_challenge_method as 'S256',
      expiresAt: Number(r.expires_at),
      used: r.used,
    };
  }

  async setAuthorizationCode(code: StoredAuthorizationCode): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO oauth_auth_codes (code, client_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (code) DO UPDATE SET
         client_id = EXCLUDED.client_id, redirect_uri = EXCLUDED.redirect_uri,
         scopes = EXCLUDED.scopes, code_challenge = EXCLUDED.code_challenge,
         code_challenge_method = EXCLUDED.code_challenge_method,
         expires_at = EXCLUDED.expires_at, used = EXCLUDED.used`,
      [
        code.code,
        code.clientId,
        code.redirectUri,
        code.scopes,
        code.codeChallenge,
        code.codeChallengeMethod,
        code.expiresAt,
        code.used,
      ]
    );
  }

  async deleteAuthorizationCode(code: string): Promise<boolean> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query('DELETE FROM oauth_auth_codes WHERE code = $1', [
      code,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async markAuthorizationCodeUsed(code: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query('UPDATE oauth_auth_codes SET used = TRUE WHERE code = $1', [code]);
  }

  // ── Clients ───────────────────────────────────────────────────────────

  async getClient(clientId: string): Promise<StoredClient | undefined> {
    await this.ensureSchema();
    const { rows } = await this.pool.query(
      `SELECT client_id, client_secret_hash, client_name, redirect_uris, scopes, created_at, client_type, rate_limit
       FROM oauth_clients WHERE client_id = $1`,
      [clientId]
    );
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      clientId: r.client_id,
      clientSecretHash: r.client_secret_hash,
      clientName: r.client_name,
      redirectUris: r.redirect_uris,
      scopes: r.scopes,
      createdAt: Number(r.created_at),
      clientType: r.client_type as 'confidential' | 'public',
      rateLimit: r.rate_limit,
    };
  }

  async setClient(client: StoredClient): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, scopes, created_at, client_type, rate_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (client_id) DO UPDATE SET
         client_secret_hash = EXCLUDED.client_secret_hash, client_name = EXCLUDED.client_name,
         redirect_uris = EXCLUDED.redirect_uris, scopes = EXCLUDED.scopes,
         created_at = EXCLUDED.created_at, client_type = EXCLUDED.client_type,
         rate_limit = EXCLUDED.rate_limit`,
      [
        client.clientId,
        client.clientSecretHash,
        client.clientName,
        client.redirectUris,
        client.scopes,
        client.createdAt,
        client.clientType,
        client.rateLimit,
      ]
    );
  }

  async deleteClient(clientId: string): Promise<boolean> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query('DELETE FROM oauth_clients WHERE client_id = $1', [
      clientId,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async countClients(): Promise<number> {
    await this.ensureSchema();
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS count FROM oauth_clients');
    return rows[0].count;
  }

  // ── Revoked Chains ────────────────────────────────────────────────────

  async isChainRevoked(chainId: string): Promise<boolean> {
    await this.ensureSchema();
    const { rows } = await this.pool.query(
      'SELECT 1 FROM oauth_revoked_chains WHERE chain_id = $1 LIMIT 1',
      [chainId]
    );
    return rows.length > 0;
  }

  async revokeChain(chainId: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO oauth_revoked_chains (chain_id, revoked_at) VALUES ($1, $2)
       ON CONFLICT (chain_id) DO NOTHING`,
      [chainId, Date.now()]
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  async cleanup(): Promise<number> {
    await this.ensureSchema();
    const now = Date.now();
    let removed = 0;

    const r1 = await this.pool.query(
      'DELETE FROM oauth_auth_codes WHERE expires_at < $1 OR used = TRUE',
      [now]
    );
    removed += r1.rowCount ?? 0;

    const r2 = await this.pool.query('DELETE FROM oauth_access_tokens WHERE expires_at < $1', [
      now,
    ]);
    removed += r2.rowCount ?? 0;

    const r3 = await this.pool.query(
      'DELETE FROM oauth_refresh_tokens WHERE expires_at < $1 OR used = TRUE',
      [now]
    );
    removed += r3.rowCount ?? 0;

    return removed;
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<TokenStoreStats> {
    await this.ensureSchema();
    const now = Date.now();

    const [clients, at, rt, codes, chains] = await Promise.all([
      this.pool.query('SELECT COUNT(*)::int AS c FROM oauth_clients'),
      this.pool.query('SELECT COUNT(*)::int AS c FROM oauth_access_tokens WHERE expires_at > $1', [
        now,
      ]),
      this.pool.query(
        'SELECT COUNT(*)::int AS c FROM oauth_refresh_tokens WHERE expires_at > $1 AND used = FALSE',
        [now]
      ),
      this.pool.query(
        'SELECT COUNT(*)::int AS c FROM oauth_auth_codes WHERE expires_at > $1 AND used = FALSE',
        [now]
      ),
      this.pool.query('SELECT COUNT(*)::int AS c FROM oauth_revoked_chains'),
    ]);

    return {
      registeredClients: clients.rows[0].c,
      activeAccessTokens: at.rows[0].c,
      activeRefreshTokens: rt.rows[0].c,
      pendingAuthCodes: codes.rows[0].c,
      revokedChains: chains.rows[0].c,
    };
  }
}
