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

// ── Protocol commercialization integration ────────────────────────────────────
// Lazy-loaded to avoid circular deps / startup cost
async function getProtocolUtils() {
  const {
    generateProvenance,
    calculateRevenueDistribution,
    formatRevenueDistribution,
    ethToWei,
    PROTOCOL_CONSTANTS,
  } = await import('@holoscript/core');
  return {
    generateProvenance,
    calculateRevenueDistribution,
    formatRevenueDistribution,
    ethToWei,
    PROTOCOL_CONSTANTS,
  };
}

async function getProtocolServerUrl(): Promise<string> {
  return process.env.HOLOSCRIPT_SERVER_URL || 'https://mcp.holoscript.net';
}

async function getProtocolAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = process.env.HOLOSCRIPT_API_KEY || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (apiKey) headers['x-mcp-api-key'] = apiKey;
  return headers;
}

// In-memory protocol registry for capability tokens (Phase 1)
interface PublishedCapabilityToken {
  contentHash: string;
  tokenId: string;
  author: string;
  price: string;
  license: string;
  capabilities: Capability[];
  surface: SurfaceKind;
  createdAt: string;
  collectCount: number;
  revenueWei: string;
}
const protocolTokenStore = new Map<string, PublishedCapabilityToken>();

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

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTOCOL COMMERCIALIZATION LAYER (D.013)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /api/holomesh/team/:id/protocol/secrets/publish ─────────────────────
  // Publish a capability token to the HoloScript Protocol so others can collect it.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/protocol\/secrets\/publish$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const tokenId = (body.token_id as string | undefined)?.trim();
    const price = (body.price as string) || '0';
    const license = (body.license as string) || 'free';
    const mintAsNFT = (body.mint_as_nft as boolean) || false;

    if (!tokenId) {
      json(res, 400, { success: false, error: 'token_id required' });
      return true;
    }

    const stored = capRegistry.get(tokenId);
    if (!stored) {
      json(res, 404, { success: false, error: 'Token not found in registry' });
      return true;
    }

    // Ownership check: only the token issuer or a team founder can publish
    if (stored.handle !== caller.name && !caller.isFounder) {
      json(res, 403, { success: false, error: 'Only the token issuer can publish to protocol' });
      return true;
    }

    try {
      const { calculateRevenueDistribution, ethToWei, PROTOCOL_CONSTANTS } = await getProtocolUtils();
      const priceWei = ethToWei(price);
      const revenuePreview = calculateRevenueDistribution(priceWei, caller.name, []);

      // Register on protocol server
      const serverUrl = await getProtocolServerUrl();
      const authHeaders = await getProtocolAuthHeaders();

      const protocolRecord: PublishedCapabilityToken = {
        contentHash: stored.receiptHash,
        tokenId: stored.tokenId,
        author: caller.name,
        price,
        license,
        capabilities: [...stored.capabilities],
        surface: stored.surface,
        createdAt: new Date().toISOString(),
        collectCount: 0,
        revenueWei: '0',
      };

      // Store metadata endpoint
      await fetch(`${serverUrl}/api/protocol/metadata`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          contentHash: stored.receiptHash,
          provenance: {
            hash: stored.receiptHash,
            author: caller.name,
            license,
            publishMode: 'capability_token',
            imports: [],
            created: protocolRecord.createdAt,
          },
        }),
      });

      // Register protocol record
      const regRes = await fetch(`${serverUrl}/api/protocol`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          contentHash: stored.receiptHash,
          author: caller.name,
          importHashes: [],
          license,
          publishMode: 'capability_token',
          price,
          referralBps: PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS,
          metadataURI: `${serverUrl}/metadata/${stored.receiptHash}`,
          mintAsNFT,
          code: JSON.stringify({
            tokenId: stored.tokenId,
            capabilities: [...stored.capabilities],
            surface: stored.surface,
            handle: stored.handle,
          }),
          title: `Capability Token: ${stored.handle}`,
          description: `Published capability token granting [${stored.capabilities.join(', ')}]`,
        }),
      });

      if (!regRes.ok) {
        const text = await regRes.text();
        json(res, 502, { status: 'error', error: 'PROTOCOL_REGISTER_FAILED', message: text });
        return true;
      }

      protocolTokenStore.set(stored.receiptHash, protocolRecord);

      const regJson = await regRes.json();
      json(res, 201, {
        status: 'success',
        ...regJson,
        capabilityToken: {
          token_id: stored.tokenId,
          handle: stored.handle,
          capabilities: [...stored.capabilities],
          surface: stored.surface,
        },
        revenuePreview: {
          totalPrice: price,
          creatorShare: `${(parseFloat(price) * 0.8).toFixed(4)} ETH`,
          platformShare: `${(parseFloat(price) * 0.025).toFixed(4)} ETH`,
          referralShare: `${(parseFloat(price) * 0.02).toFixed(4)} ETH`,
        },
      });
    } catch (err) {
      json(res, 500, {
        status: 'error',
        error: 'PUBLISH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // ── POST /api/holomesh/team/:id/protocol/secrets/collect ─────────────────────
  // Collect (purchase) a published capability token.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/protocol\/secrets\/collect$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const contentHash = (body.content_hash as string | undefined)?.trim();
    const referrer = (body.referrer as string | undefined)?.trim();
    const quantity = (body.quantity as number) || 1;

    if (!contentHash) {
      json(res, 400, { success: false, error: 'content_hash required' });
      return true;
    }

    const published = protocolTokenStore.get(contentHash);
    if (!published) {
      json(res, 404, { success: false, error: 'Published capability token not found' });
      return true;
    }

    try {
      const serverUrl = await getProtocolServerUrl();
      const authHeaders = await getProtocolAuthHeaders();

      const collectRes = await fetch(`${serverUrl}/api/collect/${contentHash}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ referrer, quantity }),
      });

      if (!collectRes.ok) {
        const text = await collectRes.text();
        json(res, 502, { status: 'error', error: 'COLLECT_FAILED', message: text });
        return true;
      }

      // Update local stats
      published.collectCount += quantity;

      const collectJson = await collectRes.json();
      json(res, 200, {
        status: 'success',
        ...collectJson,
        capabilityToken: {
          token_id: published.tokenId,
          handle: published.author,
          capabilities: published.capabilities,
          surface: published.surface,
        },
      });
    } catch (err) {
      json(res, 500, {
        status: 'error',
        error: 'COLLECT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // ── GET /api/holomesh/team/:id/protocol/secrets/revenue ──────────────────────
  // Preview revenue distribution for a capability token at a given price.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/protocol\/secrets\/revenue$/) && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const urlObj = new URL(url, 'http://localhost');
    const price = urlObj.searchParams.get('price') || '0';
    const author = urlObj.searchParams.get('author') || caller.name;

    try {
      const { calculateRevenueDistribution, formatRevenueDistribution, ethToWei } =
        await getProtocolUtils();
      const priceWei = ethToWei(price);
      const dist = calculateRevenueDistribution(priceWei, author, []);

      json(res, 200, {
        status: 'success',
        totalPrice: price,
        flows: dist.flows.map((f: any) => ({
          recipient: f.recipient,
          amount: f.amount.toString(),
          reason: f.reason,
          depth: f.depth,
          percentage: `${(f.bps / 100).toFixed(1)}%`,
        })),
        formatted: formatRevenueDistribution(dist),
      });
    } catch (err) {
      json(res, 500, {
        status: 'error',
        error: 'REVENUE_CALC_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // ── GET /api/holomesh/team/:id/protocol/secrets/lookup ─────────────────────
  // Look up published capability tokens by content hash or author.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/protocol\/secrets\/lookup$/) && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const urlObj = new URL(url, 'http://localhost');
    const contentHash = urlObj.searchParams.get('content_hash')?.trim();
    const author = urlObj.searchParams.get('author')?.trim();

    if (!contentHash && !author) {
      json(res, 400, { status: 'error', error: 'MISSING_PARAMS', message: 'Provide content_hash or author' });
      return true;
    }

    try {
      if (contentHash) {
        const published = protocolTokenStore.get(contentHash);
        if (!published) {
          json(res, 404, { status: 'not_found', message: `No record for hash ${contentHash}` });
          return true;
        }
        json(res, 200, {
          status: 'success',
          record: {
            ...published,
            revenue_eth: (parseFloat(published.revenueWei) / 1e18).toFixed(6),
          },
        });
        return true;
      }

      // Author lookup
      const results = Array.from(protocolTokenStore.values()).filter(
        (p) => p.author === author
      );
      json(res, 200, {
        status: 'success',
        author,
        count: results.length,
        records: results.map((p) => ({
          ...p,
          revenue_eth: (parseFloat(p.revenueWei) / 1e18).toFixed(6),
        })),
      });
    } catch (err) {
      json(res, 500, {
        status: 'error',
        error: 'LOOKUP_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  return false;
}
