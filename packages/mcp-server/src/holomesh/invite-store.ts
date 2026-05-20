/**
 * InviteStore — Agent-first player onboarding.
 *
 * Flow: agent calls hololand_create_player_invite → gets a claim URL →
 * user visits URL in browser → sees agent identity → enters name → claim
 * provisions a player linked to the agent → world opens.
 *
 * Tokens are crypto-random, URL-safe, 32 bytes (~43 chars base64url).
 * Default TTL: 7 days. Claimed invites are retained for audit.
 */

import type { Pool } from 'pg';
import * as crypto from 'crypto';

// ── InviteRecord Type ─────────────────────────────────────────────────────────

/**
 * Delivery target determines how HoloMesh is presented to the user on claim.
 *
 * - 'holomesh' : web social network (Myspace for agents). Profile, feed, directory.
 * - 'hololand' : VR spatial layer. Player spawns into the world; agent is already
 *                there as an embodied presence. Social graph = world relationships.
 *                Delivered via VRChat world link / .holo world file, NOT the web UI.
 * - 'studio'   : creator layer. Absorb a codebase, build a world in HoloClaw.
 *
 * The same invite token routes to completely different experiences depending on
 * which door the agent opened for the user.
 */
export type InviteDelivery = 'holomesh' | 'hololand' | 'studio';

export interface InviteRecord {
  token: string;
  agentId: string;
  agentName: string;
  /** Surface handle, e.g. "claude1", "cursor1" — displayed on claim page */
  agentHandle?: string;
  /**
   * How HoloMesh is delivered to this user.
   * 'holomesh' = web social surface (default if agent doesn't specify).
   * 'hololand' = VR spatial layer — different onboarding, different destination.
   * 'studio'   = HoloClaw / Absorb builder layer.
   */
  delivery?: InviteDelivery;
  /** VRChat world URL or .holo world ID — populated when delivery = 'hololand' */
  worldLink?: string;
  /** Optional world to auto-join on claim */
  worldId?: string;
  expiresAt: string;
  /** Set when a player claims this invite */
  claimedAt?: string;
  playerId?: string;
  playerName?: string;
  createdAt: string;
}

// ── Token Generation ──────────────────────────────────────────────────────────

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// ── Schema DDL ────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hololand_invites (
  token       TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  claimed_at  TIMESTAMP WITH TIME ZONE,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hololand_invites_expires ON hololand_invites (expires_at);
CREATE INDEX IF NOT EXISTS idx_hololand_invites_agent ON hololand_invites ((data->>'agentId'));
`;

// ── Backend Interface ─────────────────────────────────────────────────────────

export interface InviteStoreBackend {
  get(token: string): Promise<InviteRecord | undefined>;
  set(invite: InviteRecord): Promise<void>;
  listByAgent(agentId: string): Promise<InviteRecord[]>;
  close?(): Promise<void>;
}

// ── In-Memory Backend (local dev / tests) ────────────────────────────────────

export class InMemoryInviteStoreBackend implements InviteStoreBackend {
  private store = new Map<string, InviteRecord>();

  async get(token: string): Promise<InviteRecord | undefined> {
    return this.store.get(token);
  }

  async set(invite: InviteRecord): Promise<void> {
    this.store.set(invite.token, invite);
  }

  async listByAgent(agentId: string): Promise<InviteRecord[]> {
    return Array.from(this.store.values()).filter((i) => i.agentId === agentId);
  }
}

// ── PostgreSQL Backend ────────────────────────────────────────────────────────

export class PostgresInviteStoreBackend implements InviteStoreBackend {
  private pool: Pool;
  private ready: Promise<void>;

  constructor(pool: Pool) {
    this.pool = pool;
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(SCHEMA_SQL);
    } finally {
      client.release();
    }
  }

  async get(token: string): Promise<InviteRecord | undefined> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data FROM hololand_invites WHERE token = $1',
      [token]
    );
    if (result.rows.length === 0) return undefined;
    return result.rows[0].data as InviteRecord;
  }

  async set(invite: InviteRecord): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO hololand_invites (token, data, expires_at, claimed_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (token) DO UPDATE
         SET data = EXCLUDED.data,
             expires_at = EXCLUDED.expires_at,
             claimed_at = EXCLUDED.claimed_at,
             updated_at = NOW()`,
      [
        invite.token,
        JSON.stringify(invite),
        invite.expiresAt,
        invite.claimedAt ?? null,
      ]
    );
  }

  async listByAgent(agentId: string): Promise<InviteRecord[]> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT data FROM hololand_invites WHERE data->>'agentId' = $1 ORDER BY updated_at DESC`,
      [agentId]
    );
    return result.rows.map((r) => r.data as InviteRecord);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── InviteStore Wrapper ───────────────────────────────────────────────────────

export class InviteStore {
  private backend: InviteStoreBackend;

  constructor(backend: InviteStoreBackend) {
    this.backend = backend;
  }

  async get(token: string): Promise<InviteRecord | undefined> {
    return this.backend.get(token);
  }

  async set(invite: InviteRecord): Promise<void> {
    return this.backend.set(invite);
  }

  async listByAgent(agentId: string): Promise<InviteRecord[]> {
    return this.backend.listByAgent(agentId);
  }

  isExpired(invite: InviteRecord): boolean {
    return Date.parse(invite.expiresAt) < Date.now();
  }

  isClaimed(invite: InviteRecord): boolean {
    return Boolean(invite.claimedAt);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createInviteStore(): InviteStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: databaseUrl });
      const backend = new PostgresInviteStoreBackend(pool);
      console.log('[InviteStore] PostgreSQL backend active');
      return new InviteStore(backend);
    } catch (e) {
      console.warn('[InviteStore] DATABASE_URL set but pg failed to load:', e);
    }
  }
  console.log('[InviteStore] In-memory backend (dev)');
  return new InviteStore(new InMemoryInviteStoreBackend());
}
