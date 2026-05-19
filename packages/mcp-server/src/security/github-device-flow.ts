/**
 * GitHub OAuth 2.0 Device Authorization Grant (RFC 8628)
 *
 * Allows agents on headless / mobile / TV / CLI surfaces to authenticate
 * with GitHub without a browser on the same device. The user completes
 * authorization on a secondary device (phone / laptop) while the agent
 * polls for the access token.
 *
 * Endpoints consumed:
 *   POST https://github.com/login/device/code
 *   POST https://github.com/login/oauth/access_token
 *
 * Env vars:
 *   GITHUB_DEVICE_FLOW_CLIENT_ID — GitHub OAuth app client ID (required)
 *   GITHUB_DEVICE_FLOW_CLIENT_SECRET — GitHub OAuth app client secret (optional,
 *     but required for the access_token exchange step)
 */

import { randomUUID } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────

export interface GitHubDeviceCodeRequest {
  clientId: string;
  scope?: string;
}

export interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface GitHubPollRequest {
  deviceCode: string;
  clientId: string;
  clientSecret?: string;
}

export interface GitHubPollSuccess {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubPollPending {
  error: 'authorization_pending' | 'slow_down' | 'expired_token';
  error_description: string;
  interval?: number;
}

export type GitHubPollResult = GitHubPollSuccess | GitHubPollPending;

interface DeviceFlowSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
  clientId: string;
  scope?: string;
  status: 'pending' | 'complete' | 'expired';
  accessToken?: string;
  tokenType?: string;
  scopes?: string;
}

// ── In-memory store (swap for Redis/Postgres in production) ───────────────

const sessions = new Map<string, DeviceFlowSession>();
const USER_CODE_SET = new Set<string>();

const SESSION_TTL_MS = 900_000; // 15 min (GitHub default)
const CLEANUP_INTERVAL_MS = 60_000;

function nowMs() {
  return Date.now();
}

function cleanupExpiredSessions() {
  const cutoff = nowMs();
  for (const [id, session] of sessions) {
    if (cutoff > session.expiresAt || session.status === 'expired') {
      sessions.delete(id);
      if (session.userCode) USER_CODE_SET.delete(session.userCode);
    }
  }
}

setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);

// ── Helpers ───────────────────────────────────────────────────────────────

function getClientId(): string {
  const id = process.env.GITHUB_DEVICE_FLOW_CLIENT_ID;
  if (!id) throw new GitHubDeviceFlowError('GITHUB_DEVICE_FLOW_CLIENT_ID not configured');
  return id;
}

function getClientSecret(): string | undefined {
  return process.env.GITHUB_DEVICE_FLOW_CLIENT_SECRET || undefined;
}

class GitHubDeviceFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubDeviceFlowError';
  }
}

// ── GitHub API wrappers ───────────────────────────────────────────────────

async function fetchGitHubDeviceCode(
  clientId: string,
  scope?: string
): Promise<GitHubDeviceCodeResponse> {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  if (scope) params.append('scope', scope);

  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GitHubDeviceFlowError(`GitHub device/code failed (${res.status}): ${text}`);
  }

  return (await res.json()) as GitHubDeviceCodeResponse;
}

async function fetchGitHubAccessToken(
  deviceCode: string,
  clientId: string,
  clientSecret?: string
): Promise<GitHubPollResult> {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('device_code', deviceCode);
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  if (clientSecret) params.append('client_secret', clientSecret);

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (data.error) {
    return {
      error: String(data.error) as GitHubPollPending['error'],
      error_description: String(data.error_description || 'Unknown error'),
      interval: data.interval ? Number(data.interval) : undefined,
    };
  }

  return {
    access_token: String(data.access_token),
    token_type: String(data.token_type || 'bearer'),
    scope: String(data.scope || ''),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initiate a GitHub device flow session.
 * Returns the user_code and verification URI for display to the user.
 */
export async function initiateDeviceFlow(scope?: string): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}> {
  const clientId = getClientId();

  // Call GitHub to get the device code
  const gh = await fetchGitHubDeviceCode(clientId, scope);

  // Track locally so we can poll on behalf of the client
  const session: DeviceFlowSession = {
    deviceCode: gh.device_code,
    userCode: gh.user_code,
    verificationUri: gh.verification_uri,
    expiresAt: nowMs() + gh.expires_in * 1000,
    interval: gh.interval,
    clientId,
    scope,
    status: 'pending',
  };

  sessions.set(gh.device_code, session);
  USER_CODE_SET.add(gh.user_code);

  return {
    deviceCode: gh.device_code,
    userCode: gh.user_code,
    verificationUri: gh.verification_uri,
    expiresIn: gh.expires_in,
    interval: gh.interval,
  };
}

/**
 * Poll GitHub for the access token on behalf of a device code.
 * Returns the token if available, or a pending/error state.
 */
export async function pollDeviceFlow(deviceCode: string): Promise<GitHubPollResult> {
  const session = sessions.get(deviceCode);
  if (!session) {
    return {
      error: 'expired_token',
      error_description: 'Device code not found or expired. Start a new flow.',
    };
  }

  if (session.status === 'complete' && session.accessToken) {
    return {
      access_token: session.accessToken,
      token_type: session.tokenType || 'bearer',
      scope: session.scopes || '',
    };
  }

  if (session.status === 'expired' || nowMs() > session.expiresAt) {
    session.status = 'expired';
    return {
      error: 'expired_token',
      error_description: 'The device code has expired. Start a new flow.',
    };
  }

  // Poll GitHub
  const result = await fetchGitHubAccessToken(
    session.deviceCode,
    session.clientId,
    getClientSecret()
  );

  if ('access_token' in result) {
    session.status = 'complete';
    session.accessToken = result.access_token;
    session.tokenType = result.token_type;
    session.scopes = result.scope;
  } else if (result.error === 'expired_token') {
    session.status = 'expired';
  }

  return result;
}

/**
 * Convert a completed GitHub device-flow token into a HoloMesh bearer token.
 * Requires the `resolveGitHubTokenForMcp` path from `github-auth.ts`.
 */
export async function exchangeForHoloMeshToken(
  deviceCode: string
): Promise<{ holoMeshToken: string; expiresIn: number } | null> {
  const session = sessions.get(deviceCode);
  if (!session || session.status !== 'complete' || !session.accessToken) {
    return null;
  }

  // Delegate to existing github-auth resolver for identity + scope mapping
  const { resolveGitHubTokenForMcp } = await import('./github-auth.js');
  const introspection = await resolveGitHubTokenForMcp(session.accessToken);
  if (!introspection) return null;

  // Mint a HoloMesh access token via the OAuth21 service
  const { getOAuth21Service } = await import('./oauth21.js');
  const oauth = getOAuth21Service();
  const token = oauth.issueAccessToken({
    clientId: introspection.clientId ?? 'github',
    agentId: introspection.agentId,
    scopes: (introspection.scopes ?? []) as import('./oauth21.js').OAuthScope[],
  });

  return { holoMeshToken: token.accessToken, expiresIn: token.expiresIn };
}

/**
 * Diagnostic: list active device flow sessions (admin only).
 */
export function getDeviceFlowStats(): {
  pending: number;
  complete: number;
  expired: number;
} {
  let pending = 0;
  let complete = 0;
  let expired = 0;
  for (const s of sessions.values()) {
    if (s.status === 'pending') pending++;
    else if (s.status === 'complete') complete++;
    else if (s.status === 'expired') expired++;
  }
  return { pending, complete, expired };
}
