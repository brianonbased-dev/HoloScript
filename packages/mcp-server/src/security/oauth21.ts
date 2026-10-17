/**
 * OAuth 2.1 Token Service for HoloScript MCP Server
 *
 * Implements OAuth 2.1 (draft-ietf-oauth-v2-1) with:
 * - PKCE (RFC 7636) mandatory for all flows
 * - Token rotation with refresh tokens
 * - DPoP (RFC 9449) proof-of-possession binding
 * - Access tokens (1 hour default, configurable via OAUTH_ACCESS_TTL), long-lived refresh (24h)
 * - Client credential registration and management
 *
 * This replaces the legacy Ed25519/API key authentication with
 * standards-based OAuth 2.1 per AAIF enterprise requirements.
 *
 * Backwards-compatible: legacy API key auth is still accepted during
 * migration period (OAUTH_MIGRATION_MODE=permissive).
 */

import { randomUUID, createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  agentIdBindingAllowed,
  canonicalAgentIdFor,
  AGENT_ID_NOT_BOUND_ERROR,
  expandScopes,
  hasConfiguredLegacyKey,
  isProductionRuntime,
  openDevModeAllowed,
  OAUTH2_PUBLIC_SCOPE_NAMES,
  consentFreeScopes,
  USER_BOUND_SCOPES,
  CLIENT_CREDENTIALS_MAX_SCOPES,
  USER_BOUND_SCOPE_CC_ERROR,
} from '../auth/oauth2-provider';
import {
  ClientNotApprovedError,
  ClientStoreFullError,
  DEFAULT_MAX_CLIENTS,
  clientIsApproved,
  scopesIssuedTo,
  type OAuthClientStatus,
} from '../auth/token-store';
import type { ClientProvisioning } from '../auth/token-store';

// ── Configuration ────────────────────────────────────────────────────────────

export interface OAuth21Config {
  /** Issuer identifier (e.g., "https://mcp.holoscript.net") */
  issuer: string;
  /** Access token TTL in seconds. Default: 3600 (1 hour) */
  accessTokenTTL: number;
  /** Refresh token TTL in seconds. Default: 86400 (24h) */
  refreshTokenTTL: number;
  /** Authorization code TTL in seconds. Default: 300 (5 min) */
  authCodeTTL: number;
  /** HMAC secret for token signing (must be >= 32 bytes) */
  tokenSecret: string;
  /** Migration mode: "strict" rejects legacy keys, "permissive" accepts both */
  migrationMode: 'strict' | 'permissive';
  /** Legacy API key (for backwards compat during migration) */
  legacyApiKey?: string;
  /**
   * Max clients this in-memory registry holds. Default: DEFAULT_MAX_CLIENTS,
   * the same cap as the durable store it fronts, so this cache never refuses a
   * registration the store has room for.
   */
  maxClients: number;
  /** Require DPoP proof-of-possession. Default: false (recommended: true in prod) */
  requireDPoP: boolean;
}

export const DEFAULT_OAUTH_CONFIG: OAuth21Config = {
  issuer: process.env.OAUTH_ISSUER || 'https://mcp.holoscript.net',
  accessTokenTTL: parseInt(process.env.OAUTH_ACCESS_TTL || '3600', 10),
  refreshTokenTTL: 86400,
  authCodeTTL: 300,
  tokenSecret: process.env.OAUTH_TOKEN_SECRET || '',
  migrationMode: (process.env.OAUTH_MIGRATION_MODE as 'strict' | 'permissive') || 'permissive',
  legacyApiKey: process.env.HOLOSCRIPT_API_KEY || '',
  maxClients: DEFAULT_MAX_CLIENTS,
  requireDPoP: process.env.OAUTH_REQUIRE_DPOP === 'true',
};

// ── Types ────────────────────────────────────────────────────────────────────

export type GrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';

/** Scopes follow the pattern: domain:action */
export type OAuthScope = string;

/** Pre-defined scope categories for HoloScript MCP tools */
export const SCOPE_CATEGORIES = {
  /** Read-only language operations (parse, validate, explain, list) */
  'tools:read': 'Read-only tool access (parse, validate, list, explain)',
  /** Write/mutate operations (generate, compile, render, share) */
  'tools:write': 'Write tool access (generate, compile, render, edit)',
  /** Codebase intelligence (absorb, query, impact analysis) */
  'tools:codebase': 'Codebase intelligence tools (absorb, query, impact)',
  /** Browser control tools */
  'tools:browser': 'Browser control (launch, execute, screenshot)',
  /** Self-improvement and daemon tools */
  'tools:admin': 'Administrative tools (self-improve, diagnostics)',
  /** A2A task management */
  'a2a:tasks': 'A2A task lifecycle (create, list, cancel)',
  /** Scene management */
  'scenes:read': 'Read scenes and embeds',
  'scenes:write': 'Create and store scenes',
  /** Full access */
  'admin:*': 'Full administrative access to all tools and endpoints',
} as const;

export interface RegisteredClient {
  clientId: string;
  clientSecret: string; // hashed
  clientName: string;
  redirectUris: string[];
  scopes: OAuthScope[];
  createdAt: number;
  /** Client type per OAuth 2.1: "confidential" or "public" */
  clientType: 'confidential' | 'public';
  /** Rate limit: requests per minute */
  rateLimit: number;
  /**
   * Agent this client is bound to, recorded at registration and only when the
   * registering request proved that agent's own key. A token request may stamp
   * this agent_id without re-presenting the key; any other agent_id is refused.
   */
  agentId?: string;
  /** The registration proved nothing: tools:execute is issued as tools:write (scopesIssuedTo). */
  registeredUnproven?: boolean;
  /** Review state (Muse Gap 9). Absent = legacy, treated as approved. */
  status?: OAuthClientStatus;
  /** Open self-registration: public social scopes only without a human's consent. */
  selfRegistered?: boolean;
  /** Registered without the client_credentials grant (Trust & Consent A1). Absent = legacy, allowed. */
  noClientCredentials?: boolean;
  /** Admin-provisioned machine client: client_credentials only, expiring secret, owner. */
  provisioning?: ClientProvisioning;
}

export const PROVISIONED_SECRET_EXPIRED_ERROR =
  'invalid_client: this client secret has expired. An admin must rotate it (POST /oauth/admin/clients/:id/rotate).';

export const PROVISIONED_NO_BROWSER_ERROR =
  'unauthorized_client: an admin-provisioned client is client_credentials only; it cannot use authorization_code or a browser sign-in.';

/**
 * Refuse a client that is not approved (Muse Gap 9). Called by every grant and
 * by authorize, after the client is found and before anything is issued.
 */
export const CLIENT_CREDENTIALS_NOT_REGISTERED_ERROR =
  'unauthorized_client: this client did not register the client_credentials grant. Use authorization_code with a signed-in user.';

export const CONSENT_REQUIRED_ERROR =
  'consent_required: this self-registered client can act without a human only on public social scopes (social). ' +
  'Other scopes need the human to approve it while signed in to Studio.';

function assertClientApproved(client: RegisteredClient): void {
  if (!clientIsApproved(client)) {
    throw new ClientNotApprovedError(client.clientId, client.status ?? 'suspended');
  }
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: OAuthScope[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: number;
  used: boolean;
  /** Human who consented in a signed-in Studio session (Muse Gap 9). */
  userId?: string;
  grantId?: string;
}

export interface AccessToken {
  token: string;
  clientId: string;
  scopes: OAuthScope[];
  issuedAt: number;
  expiresAt: number;
  /** Agent identity (who is using this token) */
  agentId?: string;
  /** DPoP thumbprint if DPoP was used */
  dpopThumbprint?: string;
  /** Human this token acts for, from consent (Muse Gap 9). Absent: no human. */
  userId?: string;
  grantId?: string;
  /**
   * Rehydrated from the durable store by authenticateRequestAsync (Muse Gap 9
   * S1). Its client may not be loaded here, so it is active only while a fresh
   * (<= CLIENT_STATUS_TTL_MS) durable status check says the client is approved.
   */
  rehydrated?: true;
}

export interface RefreshToken {
  token: string;
  clientId: string;
  scopes: OAuthScope[];
  issuedAt: number;
  expiresAt: number;
  /** Chain ID for token rotation tracking */
  chainId: string;
  /** Whether this token has been used (for rotation) */
  used: boolean;
  /**
   * Agent identity this chain was issued to, carried forward across rotations.
   *
   * A refresh grant presents no agent_id and proves no key, so the chain's own
   * record is the only trustworthy source for the identity of the token it
   * replaces. Without it a rotation either loses the identity (an agent
   * silently demoted to anonymous) or has to re-read it from the request,
   * which is exactly the impersonation the binding refuses.
   */
  agentId?: string;
  /** Consent carried across rotations (Muse Gap 9). */
  userId?: string;
  grantId?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer' | 'DPoP';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface TokenIntrospection {
  active: boolean;
  clientId?: string;
  scopes?: OAuthScope[];
  agentId?: string;
  expiresAt?: number;
  issuedAt?: number;
  /** Human the token acts for (consent in a Studio session). Never from a header or body. */
  userId?: string;
  grantId?: string;
  /**
   * Set only by http-server's trusted-loopback branch: the TCP peer is this machine. Never parsed
   * from a token, header or body. Lets the local agent name its own disk (host-path-args.ts).
   */
  localCustody?: true;
}

// ── In-Memory Stores (production would use Redis/PostgreSQL) ─────────────────

const clients = new Map<string, RegisteredClient>();
const authCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, AccessToken>();
const refreshTokens = new Map<string, RefreshToken>();
const revokedChains = new Set<string>();

// ── Consent grants (Trust & Consent b) ───────────────────────────────────────
//
// One grant per (human, client). A user-bound code, access token and refresh
// token all carry its grantId; each is honoured only while the grant is live:
// at most GRANT_MAX_AGE_MS since the human last approved, and no longer idle
// than GRANT_IDLE_MS. A revoked grant is kept as a tombstone so a durable
// token row cannot bring it back.
export const GRANT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const GRANT_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ConsentGrant {
  grantId: string;
  userId: string;
  clientId: string;
  scopes: OAuthScope[];
  /** When the human last approved (re-consent restarts the 90-day clock). */
  issuedAt: number;
  lastUsedAt: number;
  revokedAt?: number;
}

const grants = new Map<string, ConsentGrant>(); // grantId -> grant
const grantByUserClient = new Map<string, string>(); // `${userId}\u0000${clientId}` -> grantId

function grantKey(userId: string, clientId: string): string {
  return `${userId}\u0000${clientId}`;
}

/**
 * Muse Gap 9 S1: short-TTL cache of each client's review status as last read
 * from the durable store. Another replica (or an operator writing the store)
 * can suspend a client; this replica learns of it within CLIENT_STATUS_TTL_MS.
 */
export const CLIENT_STATUS_TTL_MS = 30_000;
export type DurableClientStatus = OAuthClientStatus | 'unknown';
const clientStatusCache = new Map<string, { status: DurableClientStatus; at: number }>();

// ── Utility Functions ────────────────────────────────────────────────────────

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Does this secret authenticate this client now? A provisioned client's
 * current secret stops working at secretExpiresAt; after a rotate the previous
 * secret works only until previousSecretValidUntil. Others: plain hash match.
 */
export function clientSecretAccepted(
  client: RegisteredClient,
  secret: string | undefined,
  now: number = Date.now()
): boolean {
  if (!secret) return false;
  const hashed = hashSecret(secret);
  const p = client.provisioning;
  if (safeCompare(hashed, client.clientSecret)) return !p || now < p.secretExpiresAt;
  return (
    !!p?.previousSecretHash &&
    typeof p.previousSecretValidUntil === 'number' &&
    now < p.previousSecretValidUntil &&
    safeCompare(hashed, p.previousSecretHash)
  );
}

function generateToken(): string {
  return `hs_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
}

function verifyS256Challenge(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return computed === challenge;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ── Cleanup Timer ────────────────────────────────────────────────────────────

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, code] of authCodes) {
      if (code.expiresAt < now || code.used) authCodes.delete(key);
    }
    for (const [key, token] of accessTokens) {
      if (token.expiresAt < now) accessTokens.delete(key);
    }
    for (const [key, token] of refreshTokens) {
      if (token.expiresAt < now || token.used) refreshTokens.delete(key);
    }
  }, 60_000); // Clean up every minute
}

// ── OAuth 2.1 Token Service ──────────────────────────────────────────────────

export class OAuth21Service {
  private config: OAuth21Config;

  /**
   * Optional async fallback into a durable token registry (the Postgres-backed
   * OAuth2Provider). Injected by http-server at boot to avoid an import cycle.
   * Consulted by authenticateRequestAsync when the in-memory maps miss — i.e.
   * after a deploy wiped them.
   */
  private durableIntrospector?: (token: string) => Promise<TokenIntrospection | undefined>;

  setDurableIntrospector(fn: (token: string) => Promise<TokenIntrospection | undefined>): void {
    this.durableIntrospector = fn;
  }

  /**
   * Muse Gap 9 S1: read a client's review status from the durable store
   * ('unknown' when the store has no such client). When set, every token whose
   * client is loaded here or that was rehydrated from the store is active only
   * while a status read no older than CLIENT_STATUS_TTL_MS says 'approved'.
   * That is the multi-replica suspend: no instance trusts its own memory for
   * longer than the TTL.
   */
  private clientStatusResolver?: (clientId: string) => Promise<DurableClientStatus>;

  setClientStatusResolver(fn: (clientId: string) => Promise<DurableClientStatus>): void {
    this.clientStatusResolver = fn;
  }

  private freshClientStatus(clientId: string, now = Date.now()): DurableClientStatus | undefined {
    const hit = clientStatusCache.get(clientId);
    if (!hit || now - hit.at > CLIENT_STATUS_TTL_MS) return undefined;
    return hit.status;
  }

  private noteClientStatus(clientId: string, status: DurableClientStatus): void {
    if (clientStatusCache.size >= 50_000) clientStatusCache.clear();
    clientStatusCache.set(clientId, { status, at: Date.now() });
  }

  /**
   * Re-read a client's status from the durable store and cache it. A store
   * error keeps the client usable only if it is loaded here and approved in
   * memory (a DB blip must not log everyone out); a rehydrated token's client
   * that cannot be read is treated as unknown (fail closed).
   */
  private async refreshClientStatus(clientId: string): Promise<DurableClientStatus> {
    if (!this.clientStatusResolver) {
      const owner = clients.get(clientId);
      return owner
        ? clientIsApproved(owner)
          ? 'approved'
          : (owner.status ?? 'suspended')
        : 'unknown';
    }
    try {
      const status = await this.clientStatusResolver(clientId);
      this.noteClientStatus(clientId, status);
      const owner = clients.get(clientId);
      if (owner && status !== 'unknown') owner.status = status;
      if (status !== 'approved') this.dropClientTokens(clientId);
      return status;
    } catch {
      const owner = clients.get(clientId);
      if (owner && clientIsApproved(owner)) return 'approved';
      return 'unknown';
    }
  }

  /** Does introspect need a fresh durable status for this token's client before it can answer? */
  private needsStatusRefresh(stored: AccessToken | undefined): boolean {
    if (!stored || stored.expiresAt < Date.now()) return false;
    if (!this.clientStatusResolver) return false;
    if (!stored.rehydrated && !clients.has(stored.clientId)) return false;
    return this.freshClientStatus(stored.clientId) === undefined;
  }

  constructor(config: Partial<OAuth21Config> = {}) {
    this.config = { ...DEFAULT_OAUTH_CONFIG, ...config };

    if (!this.config.tokenSecret) {
      // Generate ephemeral secret for dev mode (not for production!)
      this.config.tokenSecret = randomUUID() + randomUUID();
      console.warn(
        '[OAuth2.1] WARNING: No OAUTH_TOKEN_SECRET set. Using ephemeral secret. Set this in production!'
      );
    }

    startCleanupTimer();
  }

  // ── Client Registration ──────────────────────────────────────────────────

  registerClient(params: {
    clientName: string;
    redirectUris: string[];
    scopes: OAuthScope[];
    clientType?: 'confidential' | 'public';
    rateLimit?: number;
    /** Only set by a caller that proved this agent's own key (see http-server). */
    agentId?: string;
    /** The registration proved nothing (see http-server, /oauth/register). */
    registeredUnproven?: boolean;
    status?: OAuthClientStatus;
    selfRegistered?: boolean;
    /** Registered without the client_credentials grant (Trust & Consent A1). Absent = legacy, allowed. */
    noClientCredentials?: boolean;
    provisioning?: ClientProvisioning;
  }): { clientId: string; clientSecret: string } {
    if (clients.size >= this.config.maxClients) {
      throw new ClientStoreFullError({
        store: 'memory',
        count: clients.size,
        maxClients: this.config.maxClients,
      });
    }

    const clientId = `hsc_${randomUUID().replace(/-/g, '')}`;
    const clientSecret = generateToken();

    const client: RegisteredClient = {
      clientId,
      clientSecret: hashSecret(clientSecret),
      clientName: params.clientName,
      redirectUris: params.redirectUris,
      scopes: params.scopes,
      createdAt: Date.now(),
      clientType: params.clientType || 'confidential',
      rateLimit: params.rateLimit || 60,
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.registeredUnproven ? { registeredUnproven: true } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.selfRegistered ? { selfRegistered: true } : {}),
      ...(params.noClientCredentials ? { noClientCredentials: true } : {}),
      ...(params.provisioning ? { provisioning: params.provisioning } : {}),
    };

    clients.set(clientId, client);

    return { clientId, clientSecret };
  }

  getClient(clientId: string): RegisteredClient | undefined {
    return clients.get(clientId);
  }

  /**
   * Rehydrate a client from a durable registry (e.g. the Postgres-backed
   * OAuth2Provider store). `clientSecret` must already be the SHA-256 hash.
   * The module-level maps here are wiped on every deploy; without rehydration
   * every cached client_id strands with "Unknown client_id" — which surfaced
   * as raw invalid_client JSON tabs in the founder's browser on every Claude
   * instance start (task_1781078719152_ym9w).
   */
  importClient(client: RegisteredClient): void {
    clients.set(client.clientId, client);
  }

  /** Rehydrate an access token from a durable registry. */
  importAccessToken(token: AccessToken): void {
    accessTokens.set(token.token, token);
  }

  /** Rehydrate a refresh token from a durable registry. */
  importRefreshToken(token: RefreshToken): void {
    refreshTokens.set(token.token, token);
  }

  /** Does this secret authenticate this (loaded, confidential) client? */
  verifyClientSecret(clientId: string, secret: string): boolean {
    const client = clients.get(clientId);
    if (!client || client.clientType !== 'confidential' || !secret) return false;
    return clientSecretAccepted(client, secret);
  }

  /**
   * Admin rotate of a provisioned client: a new secret valid for ttlMs; the old
   * one keeps working for overlapMs (never past its own expiry). Memory only;
   * the caller writes the durable copy and restores `previous` if that fails.
   */
  rotateProvisionedSecret(
    clientId: string,
    opts: { overlapMs: number; ttlMs: number; rotatedBy: string; now?: number }
  ): {
    clientSecret: string;
    clientSecretHash: string;
    provisioning: ClientProvisioning;
    previous: RegisteredClient;
  } | null {
    const client = clients.get(clientId);
    if (!client?.provisioning) return null;
    const now = opts.now ?? Date.now();
    const clientSecret = generateToken();
    const clientSecretHash = hashSecret(clientSecret);
    const provisioning: ClientProvisioning = {
      ...client.provisioning,
      secretExpiresAt: now + opts.ttlMs,
      previousSecretHash: client.clientSecret,
      previousSecretValidUntil: Math.min(now + opts.overlapMs, client.provisioning.secretExpiresAt),
      rotatedAt: now,
      rotatedBy: opts.rotatedBy,
    };
    clients.set(clientId, { ...client, clientSecret: clientSecretHash, provisioning });
    return { clientSecret, clientSecretHash, provisioning, previous: client };
  }

  /** Read the full refresh-token record (for durable write-through after issuance). */
  getRefreshTokenRecord(token: string): RefreshToken | undefined {
    return refreshTokens.get(token);
  }

  /**
   * Set a client's review state in this registry (Muse Gap 9). Suspending or
   * returning to pending drops every token the client holds here and revokes
   * its refresh chains; the client record stays. Returns whether the client was
   * loaded here.
   *
   * Muse Gap 9 S1: tokens are dropped and the status cache updated even when
   * the client is NOT loaded here: a token rehydrated from the durable store
   * can be cached without its client, and returning early left it working
   * until its TTL. The durable row is updated by the caller (OAuth2Provider).
   */
  setClientStatus(clientId: string, status: OAuthClientStatus): boolean {
    const client = clients.get(clientId);
    if (client) client.status = status;
    this.noteClientStatus(clientId, status);
    if (status !== 'approved') this.dropClientTokens(clientId);
    return client !== undefined;
  }

  private dropClientTokens(clientId: string): void {
    for (const [key, token] of accessTokens) {
      if (token.clientId === clientId) accessTokens.delete(key);
    }
    for (const [key, token] of refreshTokens) {
      if (token.clientId === clientId) {
        revokedChains.add(token.chainId);
        refreshTokens.delete(key);
      }
    }
  }

  /**
   * Revoke a client and everything it holds in this registry: access tokens,
   * refresh chains, unredeemed authorization codes and consent grants.
   * Returns whether the client was loaded here.
   */
  revokeClient(clientId: string): boolean {
    for (const [key, token] of accessTokens) {
      if (token.clientId === clientId) accessTokens.delete(key);
    }
    for (const [key, token] of refreshTokens) {
      if (token.clientId === clientId) {
        revokedChains.add(token.chainId);
        refreshTokens.delete(key);
      }
    }
    for (const [key, code] of authCodes) {
      if (code.clientId === clientId) authCodes.delete(key);
    }
    this.revokeGrantsForClient(clientId);
    this.noteClientStatus(clientId, 'unknown');
    return clients.delete(clientId);
  }

  // ── Consent grants ───────────────────────────────────────────────────────

  /**
   * Record (or renew) the grant for this human and client. Re-consent keeps
   * the grantId, restarts the 90-day clock and replaces the scopes.
   */
  upsertGrant(params: {
    userId: string;
    clientId: string;
    scopes: OAuthScope[];
    grantId?: string;
    now?: number;
  }): ConsentGrant {
    const now = params.now ?? Date.now();
    const key = grantKey(params.userId, params.clientId);
    const existingId = grantByUserClient.get(key);
    const existing = existingId ? grants.get(existingId) : undefined;
    if (existing && !existing.revokedAt) {
      existing.scopes = [...params.scopes];
      existing.issuedAt = now;
      existing.lastUsedAt = now;
      return existing;
    }
    let grantId = params.grantId || `grant_${randomUUID().replace(/-/g, '')}`;
    // Never reuse a revoked grant's id, nor one belonging to another pair.
    const clash = grants.get(grantId);
    if (clash && (clash.revokedAt || grantKey(clash.userId, clash.clientId) !== key)) {
      grantId = `grant_${randomUUID().replace(/-/g, '')}`;
    }
    const grant: ConsentGrant = {
      grantId,
      userId: params.userId,
      clientId: params.clientId,
      scopes: [...params.scopes],
      issuedAt: now,
      lastUsedAt: now,
    };
    grants.set(grantId, grant);
    grantByUserClient.set(key, grantId);
    return grant;
  }

  getGrant(grantId: string): ConsentGrant | undefined {
    return grants.get(grantId);
  }

  /**
   * A human's own live grants (Connected apps in Studio). Revoked, idle and
   * over-age grants are left out; newest approval first. Copies, so a caller
   * cannot mutate the ledger.
   */
  listGrantsForUser(userId: string, now: number = Date.now()): ConsentGrant[] {
    if (!userId) return [];
    const out: ConsentGrant[] = [];
    for (const grant of grants.values()) {
      if (grant.userId !== userId || grant.revokedAt) continue;
      if (now - grant.issuedAt > GRANT_MAX_AGE_MS) continue;
      if (now - grant.lastUsedAt > GRANT_IDLE_MS) continue;
      out.push({ ...grant, scopes: [...grant.scopes] });
    }
    return out.sort((a, b) => b.issuedAt - a.issuedAt);
  }
  /**
   * Is this grant live? Unknown (never recorded here), revoked, idle or
   * over-age: not live.
   */
  grantIsLive(
    ref: { grantId?: string; userId?: string; clientId: string; scopes?: OAuthScope[]; issuedAt?: number },
    now: number = Date.now(),
    touch = false
  ): boolean {
    if (!ref.grantId) return true;
    // Trust & Consent C3: fail closed. A grant this instance never recorded
    // (e.g. after a deploy wiped the ledger, tombstones included) is NOT live;
    // the user re-consents. Rebuilding it from the token's own claims would
    // revive a revoked grant.
    const grant = grants.get(ref.grantId);
    if (!grant) return false;
    if (grant.revokedAt) return false;
    if (grant.clientId !== ref.clientId) return false;
    if (ref.userId && grant.userId !== ref.userId) return false;
    if (now - grant.issuedAt > GRANT_MAX_AGE_MS) return false;
    if (now - grant.lastUsedAt > GRANT_IDLE_MS) return false;
    if (touch) grant.lastUsedAt = now;
    return true;
  }

  /** Revoke one grant and every code and token issued under it. */
  revokeGrant(grantId: string, now: number = Date.now()): boolean {
    const grant = grants.get(grantId);
    if (!grant) return false;
    grant.revokedAt = grant.revokedAt ?? now;
    for (const [key, code] of authCodes) if (code.grantId === grantId) authCodes.delete(key);
    for (const [key, token] of accessTokens) if (token.grantId === grantId) accessTokens.delete(key);
    for (const [key, token] of refreshTokens) {
      if (token.grantId === grantId) {
        revokedChains.add(token.chainId);
        refreshTokens.delete(key);
      }
    }
    return true;
  }

  /** Revoke every grant held for a client. Returns how many were live. */
  revokeGrantsForClient(clientId: string, now: number = Date.now()): number {
    let n = 0;
    for (const grant of grants.values()) {
      if (grant.clientId === clientId && !grant.revokedAt) {
        this.revokeGrant(grant.grantId, now);
        n++;
      }
    }
    return n;
  }

  // ── Authorization Code Flow (with PKCE) ──────────────────────────────────

  createAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scopes: OAuthScope[];
    codeChallenge: string;
    codeChallengeMethod: 'S256';
    /** Verified Studio-session consent (security/studio-consent.ts), if any. */
    consent?: { userId: string; grantId: string; scopes?: string[] };
  }): string {
    const client = clients.get(params.clientId);
    if (!client)
      throw new Error(
        `Invalid client_id: '${String(params.clientId).slice(0, 12)}...' is not registered. Register at POST /oauth/register.`
      );
    assertClientApproved(client);
    if (client.provisioning) throw new Error(PROVISIONED_NO_BROWSER_ERROR);

    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new Error('Invalid redirect_uri');
    }

    // Validate requested scopes against client's allowed scopes
    const invalidScopes = params.scopes.filter(
      (s) =>
        !client.scopes.includes(s) &&
        !client.scopes.includes('admin') &&
        !client.scopes.includes('admin:*')
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Scopes not authorized for client: ${invalidScopes.join(', ')}`);
    }

    if (params.codeChallengeMethod !== 'S256') {
      throw new Error('Only S256 code challenge method is supported (OAuth 2.1)');
    }

    // Muse Gap 9: without a human's consent a self-registered client is granted
    // public social scopes only; with consent, only what the human approved.
    let grantedScopes = consentFreeScopes(client, params.scopes, params.consent);
    if (params.consent?.scopes) {
      const approved = params.consent.scopes;
      grantedScopes = grantedScopes.filter((s) => approved.includes(s));
    }
    if (grantedScopes.length === 0) {
      throw new Error(CONSENT_REQUIRED_ERROR);
    }

    // Trust & Consent (b): one grant per human and client; the code carries it.
    const grant = params.consent
      ? this.upsertGrant({
          userId: params.consent.userId,
          clientId: params.clientId,
          scopes: grantedScopes,
          grantId: params.consent.grantId,
        })
      : undefined;

    const code = generateToken();
    const authCode: AuthorizationCode = {
      code,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scopes: grantedScopes,
      ...(grant ? { userId: grant.userId, grantId: grant.grantId } : {}),
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: Date.now() + this.config.authCodeTTL * 1000,
      used: false,
    };

    authCodes.set(code, authCode);
    return code;
  }

  // ── Token Exchange ───────────────────────────────────────────────────────

  exchangeAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    codeVerifier: string;
    agentId?: string;
    dpopThumbprint?: string;
    /** Agent identity proven by a key presented on this request, if any. */
    provenAgentId?: string;
  }): TokenResponse {
    const authCode = authCodes.get(params.code);
    if (!authCode)
      throw new Error(
        'Authorization code not found — may have been used already or never issued. Request a new one via GET /oauth/authorize.'
      );
    if (authCode.used)
      throw new Error(
        'Authorization code already used — each code is single-use. Request a new one.'
      );
    if (authCode.expiresAt < Date.now())
      throw new Error('Authorization code expired. Codes are valid for 60s. Request a new one.');
    if (authCode.clientId !== params.clientId) throw new Error('Client mismatch');
    if (authCode.redirectUri !== params.redirectUri) throw new Error('Redirect URI mismatch');

    // Verify client credentials
    const client = clients.get(params.clientId);
    if (!client) throw new Error('Invalid client');
    assertClientApproved(client);
    if (
      client.clientType === 'confidential' &&
      !clientSecretAccepted(client, params.clientSecret)
    ) {
      throw new Error('Invalid client credentials');
    }

    // Verify PKCE (mandatory in OAuth 2.1)
    if (!verifyS256Challenge(params.codeVerifier, authCode.codeChallenge)) {
      throw new Error('PKCE verification failed');
    }

    // An agent identity must be bound or proven before it can be stamped on
    // the token — the stamp becomes the trusted principal downstream.
    if (
      !agentIdBindingAllowed({
        requestedAgentId: params.agentId,
        clientAgentId: client.agentId,
        provenAgentId: params.provenAgentId,
      })
    ) {
      throw new Error(AGENT_ID_NOT_BOUND_ERROR);
    }

    if (
      authCode.grantId &&
      !this.grantIsLive({
        grantId: authCode.grantId,
        userId: authCode.userId,
        clientId: authCode.clientId,
      })
    ) {
      throw new Error('Consent grant revoked or expired. Ask the user to approve again.');
    }

    // Mark code as used (one-time use)
    authCode.used = true;

    // Stamp the canonical identity, never the caller's spelling of it.
    return this.issueTokenPair(
      params.clientId,
      authCode.scopes,
      canonicalAgentIdFor({
        requestedAgentId: params.agentId,
        clientAgentId: client.agentId,
        provenAgentId: params.provenAgentId,
      }),
      params.dpopThumbprint,
      undefined,
      authCode.userId ? { userId: authCode.userId, grantId: authCode.grantId } : undefined
    );
  }

  exchangeClientCredentials(params: {
    clientId: string;
    clientSecret: string;
    scopes?: OAuthScope[];
    agentId?: string;
    dpopThumbprint?: string;
    /** Agent identity proven by a key presented on this request, if any. */
    provenAgentId?: string;
  }): TokenResponse {
    const client = clients.get(params.clientId);
    if (!client)
      throw new Error(
        `Invalid client_id: '${String(params.clientId).slice(0, 12)}...' is not registered. Register at POST /oauth/register.`
      );
    assertClientApproved(client);
    if (client.clientType !== 'confidential') {
      throw new Error('Client credentials grant requires confidential client');
    }
    if (client.noClientCredentials) {
      throw new Error(CLIENT_CREDENTIALS_NOT_REGISTERED_ERROR);
    }
    if (!clientSecretAccepted(client, params.clientSecret)) {
      if (client.provisioning && params.clientSecret && safeCompare(hashSecret(params.clientSecret), client.clientSecret)) {
        throw new Error(PROVISIONED_SECRET_EXPIRED_ERROR);
      }
      throw new Error('Invalid client credentials');
    }

    // Trust & Consent (a): user-bound scopes never issue on client_credentials,
    // and a self-registered client's cc grant is capped to the public and
    // social scopes (issueTokenPair narrows further to social without consent).
    if (params.scopes?.some((s) => USER_BOUND_SCOPES.includes(s))) {
      throw new Error(USER_BOUND_SCOPE_CC_ERROR);
    }
    let requestedScopes = (params.scopes || client.scopes).filter((s) => !USER_BOUND_SCOPES.includes(s));
    if (client.selfRegistered) {
      requestedScopes = requestedScopes.filter((s) => CLIENT_CREDENTIALS_MAX_SCOPES.includes(s));
    }
    const invalidScopes = requestedScopes.filter(
      (s) =>
        !client.scopes.includes(s) &&
        !client.scopes.includes('admin') &&
        !client.scopes.includes('admin:*')
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Scopes not authorized: ${invalidScopes.join(', ')}`);
    }

    // An agent identity must be bound or proven before it can be stamped on
    // the token — the stamp becomes the trusted principal downstream.
    if (
      !agentIdBindingAllowed({
        requestedAgentId: params.agentId,
        clientAgentId: client.agentId,
        provenAgentId: params.provenAgentId,
      })
    ) {
      throw new Error(AGENT_ID_NOT_BOUND_ERROR);
    }

    // Stamp the canonical identity, never the caller's spelling of it.
    return this.issueTokenPair(
      params.clientId,
      requestedScopes,
      canonicalAgentIdFor({
        requestedAgentId: params.agentId,
        clientAgentId: client.agentId,
        provenAgentId: params.provenAgentId,
      }),
      params.dpopThumbprint
    );
  }

  refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
    clientSecret?: string;
    dpopThumbprint?: string;
  }): TokenResponse {
    const stored = refreshTokens.get(params.refreshToken);
    if (!stored)
      throw new Error(
        'Refresh token not found — may have been revoked or expired. Re-authenticate via the full OAuth flow.'
      );
    if (stored.used) {
      // Token replay detected -- revoke entire chain
      revokedChains.add(stored.chainId);
      throw new Error('Refresh token replay detected. Token chain revoked.');
    }
    if (stored.expiresAt < Date.now()) throw new Error('Refresh token expired');
    if (stored.clientId !== params.clientId) throw new Error('Client mismatch');

    // Check if chain is revoked
    if (revokedChains.has(stored.chainId)) {
      throw new Error('Token chain has been revoked');
    }

    // Verify client
    const client = clients.get(params.clientId);
    if (!client) throw new Error('Invalid client');
    assertClientApproved(client);
    if (
      client.clientType === 'confidential' &&
      !clientSecretAccepted(client, params.clientSecret)
    ) {
      throw new Error('Invalid client credentials');
    }

    if (
      stored.grantId &&
      !this.grantIsLive(
        {
          grantId: stored.grantId,
          userId: stored.userId,
          clientId: stored.clientId,
          scopes: stored.scopes,
          issuedAt: stored.issuedAt,
        },
        Date.now(),
        true
      )
    ) {
      revokedChains.add(stored.chainId);
      throw new Error('Consent grant revoked or expired. Ask the user to approve again.');
    }
    // A user-bound refresh token must still name its human.
    if (stored.scopes.some((s) => USER_BOUND_SCOPES.includes(s)) && !stored.userId) {
      throw new Error('Refresh token carries a user-bound scope without a user.');
    }

    // Mark old refresh token as used (rotation)
    stored.used = true;

    // Issue new token pair with the same chain, carrying the identity this
    // chain already holds. A refresh names no agent_id and presents no key, so
    // the stored record is the only source that is neither a loss of identity
    // nor a caller-supplied claim.
    return this.issueTokenPair(
      params.clientId,
      stored.scopes,
      stored.agentId,
      params.dpopThumbprint,
      stored.chainId,
      stored.userId ? { userId: stored.userId, grantId: stored.grantId } : undefined
    );
  }

  // ── Token Introspection ──────────────────────────────────────────────────

  introspect(token: string): TokenIntrospection {
    const stored = accessTokens.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      return { active: false };
    }
    // Muse Gap 9: a pending or suspended client's tokens are never active.
    const owner = clients.get(stored.clientId);
    if (owner && !clientIsApproved(owner)) {
      return { active: false };
    }
    // Muse Gap 9 S1: another replica may have suspended the client. With a
    // durable status source, a loaded or rehydrated client's token is active
    // only on a fresh 'approved' read; stale means inactive here, and
    // authenticateRequestAsync refreshes and retries. A rehydrated token whose
    // client is unknown or not approved is never active.
    if (owner || stored.rehydrated) {
      const fresh = this.freshClientStatus(stored.clientId);
      if (this.clientStatusResolver || stored.rehydrated) {
        if (fresh !== 'approved') return { active: false };
      } else if (fresh !== undefined && fresh !== 'approved') {
        return { active: false };
      }
    }

    if (
      stored.grantId &&
      !this.grantIsLive(
        {
          grantId: stored.grantId,
          userId: stored.userId,
          clientId: stored.clientId,
          scopes: stored.scopes,
          issuedAt: stored.issuedAt,
        },
        Date.now(),
        true
      )
    ) {
      accessTokens.delete(token);
      return { active: false };
    }
    // A user-bound scope without its human is never honoured.
    if (stored.scopes.some((s) => USER_BOUND_SCOPES.includes(s)) && !stored.userId) {
      return { active: false };
    }

    return {
      active: true,
      clientId: stored.clientId,
      scopes: stored.scopes,
      agentId: stored.agentId,
      expiresAt: stored.expiresAt,
      issuedAt: stored.issuedAt,
      ...(stored.userId ? { userId: stored.userId } : {}),
      ...(stored.grantId ? { grantId: stored.grantId } : {}),
    };
  }

  // ── Token Revocation ─────────────────────────────────────────────────────

  revokeToken(token: string): boolean {
    // Check access tokens
    if (accessTokens.has(token)) {
      accessTokens.delete(token);
      return true;
    }

    // Check refresh tokens -- revoke entire chain
    const refresh = refreshTokens.get(token);
    if (refresh) {
      revokedChains.add(refresh.chainId);
      refreshTokens.delete(token);
      return true;
    }

    return false;
  }

  // ── Legacy API Key Validation (migration period) ─────────────────────────

  validateLegacyKey(key: string): TokenIntrospection {
    if (this.config.migrationMode === 'strict') {
      return { active: false };
    }

    if (!hasConfiguredLegacyKey(this.config.legacyApiKey)) {
      // No key configured: local open dev mode only. In production, refuse —
      // any key a caller sends must never become an admin:* identity.
      if (isProductionRuntime()) return { active: false };
      return { active: true, scopes: ['admin:*'], agentId: 'legacy-open-dev' };
    }

    if (safeCompare(key, this.config.legacyApiKey)) {
      return {
        active: true,
        scopes: ['admin:*'],
        agentId: 'legacy-api-key',
        clientId: 'legacy',
      };
    }

    return { active: false };
  }

  // ── HTTP Request Authentication ──────────────────────────────────────────

  /**
   * Authenticate an HTTP request. Returns token introspection.
   * Supports: Bearer token (OAuth 2.1), DPoP token, legacy API key.
   */
  authenticateRequest(headers: Record<string, string | string[] | undefined>): TokenIntrospection {
    const authHeader =
      (typeof headers['authorization'] === 'string' ? headers['authorization'] : '') || '';
    const apiKey = (typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : '') || '';
    const mcpApiKey =
      (typeof headers['x-mcp-api-key'] === 'string' ? headers['x-mcp-api-key'] : '') || '';
    const dpopHeader = (typeof headers['dpop'] === 'string' ? headers['dpop'] : '') || '';

    // Try OAuth 2.1 Bearer token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const introspection = this.introspect(token);

      if (introspection.active) {
        // Verify DPoP if required
        if (this.config.requireDPoP) {
          const stored = accessTokens.get(token);
          if (stored?.dpopThumbprint && !dpopHeader) {
            return { active: false };
          }
        }
        // Expand OAuth2 scopes to internal Gate 2 scopes
        introspection.scopes = expandScopes(introspection.scopes || []);
        return introspection;
      }

      // Fall through to legacy check
    }

    // Try DPoP token
    if (authHeader.startsWith('DPoP ')) {
      const token = authHeader.slice(5);
      const introspection = this.introspect(token);
      if (introspection.active) {
        introspection.scopes = expandScopes(introspection.scopes || []);
        return introspection;
      }
    }

    // Try legacy API key (migration period)
    if (apiKey) {
      return this.validateLegacyKey(apiKey);
    }
    if (mcpApiKey) {
      return this.validateLegacyKey(mcpApiKey);
    }

    // Try legacy Bearer that's actually an API key
    if (authHeader.startsWith('Bearer ') && hasConfiguredLegacyKey(this.config.legacyApiKey)) {
      const key = authHeader.slice(7);
      return this.validateLegacyKey(key);
    }

    // No auth provided -- open dev mode only outside production (fails closed in prod)
    if (openDevModeAllowed(this.config)) {
      return { active: true, scopes: ['admin:*'], agentId: 'open-dev-mode' };
    }

    return { active: false };
  }

  // ── Async Request Authentication (with GitHub token fallback) ────────────

  /**
   * Async variant of authenticateRequest that additionally resolves GitHub tokens.
   * Tries sync OAuth/legacy paths first, then falls back to GitHub API validation.
   */
  async authenticateRequestAsync(
    headers: Record<string, string | string[] | undefined>
  ): Promise<TokenIntrospection> {
    // Muse Gap 9 S1: a cached token whose client status is stale gets a
    // durable re-check before the sync path answers for it.
    {
      const h =
        (typeof headers['authorization'] === 'string' ? headers['authorization'] : '') || '';
      const t = h.startsWith('Bearer ') ? h.slice(7) : h.startsWith('DPoP ') ? h.slice(5) : '';
      const cached = t ? accessTokens.get(t) : undefined;
      if (cached && this.needsStatusRefresh(cached)) {
        await this.refreshClientStatus(cached.clientId);
      }
    }

    const syncResult = this.authenticateRequest(headers);
    if (syncResult.active) return syncResult;

    // 1. Try Dynamic Tenant Lookup (PostgreSQL/Upstash)
    const authHeader =
      (typeof headers['authorization'] === 'string' ? headers['authorization'] : '') || '';
    const apiKey = (typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : '') || '';
    const mcpApiKey =
      (typeof headers['x-mcp-api-key'] === 'string' ? headers['x-mcp-api-key'] : '') || '';

    // 0.5 Try the durable token registry (Postgres-backed OAuth2Provider).
    // The in-memory maps above are wiped on every deploy; tokens written
    // through to the durable store stay valid, so rehydrate and accept them.
    if (authHeader.startsWith('Bearer ') && this.durableIntrospector) {
      const token = authHeader.slice(7);
      try {
        const durable = await this.durableIntrospector(token);
        if (durable?.active) {
          // Muse Gap 9 S1: never cache (or accept) a durable token without a
          // status read of its client. Unknown or not approved: inactive.
          if (!durable.clientId) return { active: false };
          if (
            durable.grantId &&
            !this.grantIsLive({
              grantId: durable.grantId,
              userId: durable.userId,
              clientId: durable.clientId,
              scopes: (durable.scopes || []) as OAuthScope[],
              issuedAt: durable.issuedAt,
            })
          ) {
            return { active: false };
          }
          if (
            (durable.scopes || []).some((s) => USER_BOUND_SCOPES.includes(s)) &&
            !durable.userId
          ) {
            return { active: false };
          }
          const status = await this.refreshClientStatus(durable.clientId);
          if (status !== 'approved') return { active: false };
          this.noteClientStatus(durable.clientId, 'approved');
          accessTokens.set(token, {
            rehydrated: true,
            token,
            clientId: durable.clientId,
            scopes: (durable.scopes || []) as OAuthScope[],
            issuedAt: durable.issuedAt || Date.now(),
            expiresAt: durable.expiresAt || Date.now() + this.config.accessTokenTTL * 1000,
            agentId: durable.agentId,
            ...(durable.userId ? { userId: durable.userId } : {}),
            ...(durable.grantId ? { grantId: durable.grantId } : {}),
          });
          return {
            ...durable,
            scopes: expandScopes((durable.scopes || []) as OAuthScope[]),
          };
        }
      } catch {
        // Durable registry unavailable — fall through to other strategies.
      }
    }

    let keyToValidate = apiKey || mcpApiKey;
    if (!keyToValidate && authHeader.startsWith('Bearer ')) {
      keyToValidate = authHeader.slice(7);
    }

    if (keyToValidate) {
      try {
        const { validateTenantKey } = await import('./tenant-auth');
        const tenantResult = await validateTenantKey(keyToValidate);
        if (tenantResult && tenantResult.active) return tenantResult;
      } catch (_err) {
        // Fall through
      }
    }

    // 2. Try GitHub token resolution as last-resort fallback
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const { resolveGitHubTokenForMcp } = await import('./github-auth.js');
        const ghResult = await resolveGitHubTokenForMcp(token);
        if (ghResult) return ghResult;
      } catch {
        // GitHub auth module not available — skip
      }
    }

    return syncResult;
  }

  // ── OpenID Configuration ─────────────────────────────────────────────────

  getOpenIDConfiguration(): Record<string, unknown> {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.issuer}/oauth/authorize`,
      token_endpoint: `${this.config.issuer}/oauth/token`,
      device_authorization_endpoint: `${this.config.issuer}/oauth/github/device`,
      revocation_endpoint: `${this.config.issuer}/oauth/revoke`,
      introspection_endpoint: `${this.config.issuer}/oauth/introspect`,
      registration_endpoint: `${this.config.issuer}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'client_credentials',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
      ],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: OAUTH2_PUBLIC_SCOPE_NAMES,
      dpop_signing_alg_values_supported: ['ES256', 'RS256'],
      service_documentation: 'https://github.com/buildwithholoscript/HoloScript',
    };
  }

  // ── Stats (for health endpoint) ──────────────────────────────────────────

  getStats(): Record<string, number> {
    return {
      registeredClients: clients.size,
      activeAccessTokens: accessTokens.size,
      activeRefreshTokens: refreshTokens.size,
      pendingAuthCodes: authCodes.size,
      revokedChains: revokedChains.size,
    };
  }

  // ── Convenience ─────────────────────────────────────────────────────────

  /** Issue a standalone access token for a pre-authenticated agent (e.g. from GitHub device flow). */
  issueAccessToken(opts: { clientId: string; agentId?: string; scopes: OAuthScope[] }): {
    accessToken: string;
    expiresIn: number;
  } {
    const pair = this.issueTokenPair(opts.clientId, opts.scopes, opts.agentId);
    return { accessToken: pair.access_token, expiresIn: pair.expires_in };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private issueTokenPair(
    clientId: string,
    scopes: OAuthScope[],
    agentId?: string,
    dpopThumbprint?: string,
    chainId?: string,
    consent?: { userId: string; grantId?: string }
  ): TokenResponse {
    // Every grant issues here, so this is where an unproven client's
    // tools:execute narrows to tools:write (board task zkdg), and where a
    // self-registered client with no human's consent narrows to public social
    // scopes (Muse Gap 9) — client_credentials never carries consent.
    const issuedClient = clients.get(clientId);
    // The grant paths above refused a non-approved client just now.
    if (issuedClient && clientIsApproved(issuedClient)) this.noteClientStatus(clientId, 'approved');
    scopes = consentFreeScopes(issuedClient, scopes, consent);
    if (issuedClient?.selfRegistered && scopes.length === 0) {
      throw new Error(CONSENT_REQUIRED_ERROR);
    }
    scopes = scopesIssuedTo(issuedClient, scopes) as OAuthScope[];
    const human = consent
      ? { userId: consent.userId, ...(consent.grantId ? { grantId: consent.grantId } : {}) }
      : {};
    const now = Date.now();
    const accessTokenValue = generateToken();
    const refreshTokenValue = generateToken();
    const chain = chainId || randomUUID();

    const access: AccessToken = {
      token: accessTokenValue,
      clientId,
      scopes,
      issuedAt: now,
      expiresAt: now + this.config.accessTokenTTL * 1000,
      agentId,
      dpopThumbprint,
      ...human,
    };

    const refresh: RefreshToken = {
      token: refreshTokenValue,
      clientId,
      scopes,
      issuedAt: now,
      expiresAt: now + this.config.refreshTokenTTL * 1000,
      chainId: chain,
      used: false,
      // The chain remembers who it was issued to, so a rotation neither loses
      // the identity nor has to take the caller's word for it.
      agentId,
      ...human,
    };

    accessTokens.set(accessTokenValue, access);
    refreshTokens.set(refreshTokenValue, refresh);

    return {
      access_token: accessTokenValue,
      token_type: dpopThumbprint ? 'DPoP' : 'Bearer',
      expires_in: this.config.accessTokenTTL,
      refresh_token: refreshTokenValue,
      scope: scopes.join(' '),
    };
  }
}

// ── Singleton instance ───────────────────────────────────────────────────────

let _instance: OAuth21Service | null = null;

export function getOAuth21Service(config?: Partial<OAuth21Config>): OAuth21Service {
  if (!_instance) {
    _instance = new OAuth21Service(config);
  }
  return _instance;
}

export function resetOAuth21Service(): void {
  _instance = null;
  clients.clear();
  authCodes.clear();
  accessTokens.clear();
  refreshTokens.clear();
  revokedChains.clear();
  clientStatusCache.clear();
  grants.clear();
  grantByUserClient.clear();
}
