import type http from 'http';
import {
  CapabilityTokenRegistry,
  mintCapabilityToken,
  storeCapabilityToken,
  validateCapabilityToken,
  revokeCapabilityToken,
  createDeviceFlowChallenge,
  type CapabilityToken,
  type StoredCapabilityToken,
  type Capability,
  type SurfaceKind,
  type Handle,
  type SurfaceTrust,
  type DeviceFlowChallenge,
  CapabilityTokenError,
  MIN_TTL_SECONDS,
  MAX_TTL_SECONDS,
  DEFAULT_TTL_SECONDS,
} from '@holoscript/secrets-broker';
import {
  json,
  parseJsonBody,
  extractParam,
  getTeamMember,
  hasTeamPermission,
} from '../utils';
import { requireAuth } from '../auth-utils';

// ── Phase-1 in-memory stores (persistence in follow-up task) ───────────────────

const capRegistry = new CapabilityTokenRegistry();

interface DeviceFlowResolution {
  token?: CapabilityToken;
  approvedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

const deviceFlowStore = new Map<string, { challenge: DeviceFlowChallenge; resolution?: DeviceFlowResolution }>();

function pruneExpiredDeviceFlows(now: Date = new Date()): number {
  let removed = 0;
  for (const [code, entry] of deviceFlowStore) {
    if (new Date(entry.challenge.expiresAt).getTime() <= now.getTime()) {
      deviceFlowStore.delete(code);
      removed++;
    }
  }
  return removed;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

/**
 * Handle secrets-broker routes: mint, verify, revoke, delegate, device-flow.
 *
 * Phase 1: in-memory registry. Persistence follows the keyRegistry pattern in
 * `../state.ts` (task filed for Phase 2).
 */
export async function handleSecretsBrokerRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {

  // ── POST /api/holomesh/team/:id/secrets/mint ─────────────────────────────
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/mint$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/secrets/mint', '');
    // Team membership check is optional for Phase 1 if the caller is authenticated;
    // in Phase 2 we may gate on team-specific namespaces.

    const body = await parseJsonBody(req);

    const handle = (body.handle as string | undefined)?.trim() || caller.name;
    const surface = (body.surface as SurfaceKind | undefined) || 'headless';
    const trust = (body.trust as SurfaceTrust | undefined) || undefined;
    const capabilities = Array.isArray(body.capabilities)
      ? (body.capabilities as string[]).filter((c): c is Capability => typeof c === 'string')
      : undefined;
    const ttlSeconds = typeof body.ttl_seconds === 'number' ? body.ttl_seconds : DEFAULT_TTL_SECONDS;

    try {
      const token = mintCapabilityToken({
        handle: handle as Handle,
        surface,
        trust,
        capabilities,
        ttlSeconds,
      });
      capRegistry.put(storeCapabilityToken(token));
      json(res, 201, {
        success: true,
        token: {
          token_id: token.tokenId,
          handle: token.handle,
          surface: token.surface,
          trust: token.trust,
          capabilities: token.capabilities,
          issued_at: token.issuedAt,
          expires_at: token.expiresAt,
          receipt_hash: token.receiptHash,
          // NEVER return tokenSecret in a production response outside of the
          // initial mint. Here we return it once so the caller can store it.
          token_secret: token.tokenSecret,
        },
        warning: 'Store token_secret securely — it is shown only once.',
      });
    } catch (err) {
      const msg = err instanceof CapabilityTokenError ? err.message : 'Mint failed';
      const code = err instanceof CapabilityTokenError ? err.code : 'INVALID_HANDLE';
      json(res, 400, { success: false, error: msg, code });
    }
    return true;
  }

  // ── POST /api/holomesh/team/:id/secrets/verify ───────────────────────────
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/verify$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const tokenId = (body.token_id as string | undefined)?.trim();
    const tokenSecret = (body.token_secret as string | undefined)?.trim();
    const needsCapability = (body.needs_capability as Capability | undefined) || 'mesh:read';

    if (!tokenId || !tokenSecret) {
      json(res, 400, { success: false, error: 'token_id and token_secret required' });
      return true;
    }

    try {
      capRegistry.validateById(tokenId, tokenSecret, needsCapability);
      json(res, 200, { success: true, valid: true, token_id: tokenId, capability: needsCapability });
    } catch (err) {
      const msg = err instanceof CapabilityTokenError ? err.message : 'Verification failed';
      const code = err instanceof CapabilityTokenError ? err.code : 'TOKEN_INVALID_SECRET';
      json(res, 401, { success: false, valid: false, error: msg, code });
    }
    return true;
  }

  // ── POST /api/holomesh/team/:id/secrets/revoke ───────────────────────────
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/revoke$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/secrets/revoke', '');
    const team = (await import('../state')).teamStore.get(teamId);
    if (team && !getTeamMember(team, caller.id)) {
      json(res, 403, { success: false, error: 'Not a member' });
      return true;
    }

    const body = await parseJsonBody(req);
    const tokenId = (body.token_id as string | undefined)?.trim();
    const reason = (body.reason as string | undefined)?.trim() || 'revoked via API';

    if (!tokenId) {
      json(res, 400, { success: false, error: 'token_id required' });
      return true;
    }

    const revoked = capRegistry.revoke(tokenId, reason);
    if (!revoked) {
      json(res, 404, { success: false, error: 'Token not found' });
      return true;
    }

    json(res, 200, {
      success: true,
      token_id: tokenId,
      revoked_at: revoked.revokedAt,
      reason: revoked.revokeReason,
    });
    return true;
  }

  // ── POST /api/holomesh/team/:id/secrets/delegate ─────────────────────────
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/delegate$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const parentTokenId = (body.parent_token_id as string | undefined)?.trim();
    const parentTokenSecret = (body.parent_token_secret as string | undefined)?.trim();
    const delegateHandle = (body.delegate_handle as string | undefined)?.trim();
    const delegateSurface = (body.delegate_surface as SurfaceKind | undefined) || 'headless';
    const requestedCaps = Array.isArray(body.capabilities)
      ? (body.capabilities as string[]).filter((c): c is Capability => typeof c === 'string')
      : undefined;
    const ttlSeconds = typeof body.ttl_seconds === 'number' ? body.ttl_seconds : DEFAULT_TTL_SECONDS;

    if (!parentTokenId || !parentTokenSecret || !delegateHandle) {
      json(res, 400, { success: false, error: 'parent_token_id, parent_token_secret, and delegate_handle required' });
      return true;
    }

    try {
      // Verify parent token grants delegation capability
      capRegistry.validateById(parentTokenId, parentTokenSecret, 'mesh:claim');

      // Look up parent to intersect capabilities
      const parent = capRegistry.get(parentTokenId);
      if (!parent) {
        json(res, 404, { success: false, error: 'Parent token not found' });
        return true;
      }

      const allowedCaps = requestedCaps
        ? requestedCaps.filter((c) => parent.capabilities.includes(c))
        : parent.capabilities;

      if (allowedCaps.length === 0) {
        json(res, 400, { success: false, error: 'No delegatable capabilities remain' });
        return true;
      }

      const token = mintCapabilityToken({
        handle: delegateHandle as Handle,
        surface: delegateSurface,
        capabilities: allowedCaps,
        ttlSeconds,
      });
      capRegistry.put(storeCapabilityToken(token));

      json(res, 201, {
        success: true,
        delegation: {
          parent_token_id: parentTokenId,
          child_token_id: token.tokenId,
          handle: token.handle,
          surface: token.surface,
          capabilities: token.capabilities,
          issued_at: token.issuedAt,
          expires_at: token.expiresAt,
          receipt_hash: token.receiptHash,
          token_secret: token.tokenSecret,
        },
        warning: 'Store token_secret securely — shown only once.',
      });
    } catch (err) {
      const msg = err instanceof CapabilityTokenError ? err.message : 'Delegation failed';
      const code = err instanceof CapabilityTokenError ? err.code : 'INVALID_HANDLE';
      json(res, 400, { success: false, error: msg, code });
    }
    return true;
  }

  // ── POST /api/holomesh/team/:id/secrets/device-flow ────────────────────────
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/device-flow$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    pruneExpiredDeviceFlows();

    const body = await parseJsonBody(req);
    const verificationUri = (body.verification_uri as string | undefined)?.trim()
      || 'https://holoscript.studio/verify';
    const ttlSeconds = typeof body.ttl_seconds === 'number' ? body.ttl_seconds : 10 * 60;
    const intervalSeconds = typeof body.interval_seconds === 'number' ? body.interval_seconds : 5;

    try {
      const challenge = createDeviceFlowChallenge({
        verificationUri,
        ttlSeconds,
        intervalSeconds,
      });
      deviceFlowStore.set(challenge.deviceCode, { challenge });
      json(res, 201, {
        success: true,
        device_code: challenge.deviceCode,
        user_code: challenge.userCode,
        verification_uri: challenge.verificationUri,
        expires_at: challenge.expiresAt,
        interval_seconds: challenge.intervalSeconds,
        receipt_hash: challenge.receiptHash,
      });
    } catch (err) {
      const msg = err instanceof CapabilityTokenError ? err.message : 'Device-flow creation failed';
      json(res, 400, { success: false, error: msg });
    }
    return true;
  }

  // ── POST /api/holomesh/team/:id/secrets/device-flow/verify ────────────────
  // Operator (desktop/founder) verifies a user-code and approves issuance.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/device-flow\/verify$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const userCode = ((body.user_code as string | undefined) || '').trim().toUpperCase();
    const handle = (body.handle as string | undefined)?.trim() || caller.name;
    const surface = (body.surface as SurfaceKind | undefined) || 'mobile';
    const trust = (body.trust as SurfaceTrust | undefined) || undefined;
    const capabilities = Array.isArray(body.capabilities)
      ? (body.capabilities as string[]).filter((c): c is Capability => typeof c === 'string')
      : undefined;
    const ttlSeconds = typeof body.ttl_seconds === 'number' ? body.ttl_seconds : DEFAULT_TTL_SECONDS;

    if (!userCode) {
      json(res, 400, { success: false, error: 'user_code required' });
      return true;
    }

    pruneExpiredDeviceFlows();

    const entry = Array.from(deviceFlowStore.values()).find(
      (e) => e.challenge.userCode === userCode
    );
    if (!entry) {
      json(res, 404, { success: false, error: 'User code not found or expired' });
      return true;
    }

    if (entry.resolution) {
      json(res, 409, { success: false, error: 'User code already resolved' });
      return true;
    }

    try {
      const token = mintCapabilityToken({
        handle: handle as Handle,
        surface,
        trust,
        capabilities,
        ttlSeconds,
      });
      capRegistry.put(storeCapabilityToken(token));
      entry.resolution = {
        token,
        approvedAt: new Date().toISOString(),
      };
      json(res, 200, {
        success: true,
        device_code: entry.challenge.deviceCode,
        token_id: token.tokenId,
        approved_at: entry.resolution.approvedAt,
      });
    } catch (err) {
      entry.resolution = { rejectedAt: new Date().toISOString(), rejectReason: String(err) };
      const msg = err instanceof CapabilityTokenError ? err.message : 'Token mint failed';
      json(res, 400, { success: false, error: msg });
    }
    return true;
  }

  // ── GET /api/holomesh/team/:id/secrets/device-flow/:deviceCode ────────────
  // Device polls this endpoint to see if the operator has approved.
  {
    const pollMatch = pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/device-flow\/([^/]+)$/);
    if (pollMatch && method === 'GET') {
      const deviceCode = pollMatch[1];
      pruneExpiredDeviceFlows();

      const entry = deviceFlowStore.get(deviceCode);
      if (!entry) {
        json(res, 404, { success: false, error: 'Device code not found or expired' });
        return true;
      }

      const resBody: Record<string, unknown> = {
        success: true,
        device_code: deviceCode,
        user_code: entry.challenge.userCode,
        expires_at: entry.challenge.expiresAt,
        status: 'pending',
      };

      if (entry.resolution) {
        if (entry.resolution.token) {
          resBody.status = 'approved';
          resBody.token = {
            token_id: entry.resolution.token.tokenId,
            handle: entry.resolution.token.handle,
            surface: entry.resolution.token.surface,
            trust: entry.resolution.token.trust,
            capabilities: entry.resolution.token.capabilities,
            issued_at: entry.resolution.token.issuedAt,
            expires_at: entry.resolution.token.expiresAt,
            receipt_hash: entry.resolution.token.receiptHash,
            token_secret: entry.resolution.token.tokenSecret,
          };
        } else if (entry.resolution.rejectedAt) {
          resBody.status = 'rejected';
          resBody.rejected_at = entry.resolution.rejectedAt;
          resBody.reason = entry.resolution.rejectReason;
        }
      }

      json(res, 200, resBody);
      return true;
    }
  }

  // ── GET /api/holomesh/team/:id/secrets/list ────────────────────────────────
  // List capability tokens for the authenticated caller (by handle match).
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/secrets\/list$/) && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const tokens = capRegistry.list().filter(
      (t) => t.handle.startsWith(caller.name) || t.handle === caller.name
    );
    json(res, 200, {
      success: true,
      count: tokens.length,
      tokens: tokens.map((t) => ({
        token_id: t.tokenId,
        handle: t.handle,
        surface: t.surface,
        trust: t.trust,
        capabilities: t.capabilities,
        issued_at: t.issuedAt,
        expires_at: t.expiresAt,
        revoked_at: t.revokedAt,
        receipt_hash: t.receiptHash,
      })),
    });
    return true;
  }

  return false;
}
