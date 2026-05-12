import type http from 'http';
import * as crypto from 'crypto';
import type { RegisteredAgent } from './types';
import { agentKeyStore, keyRegistry, walletToAgent } from './state';
import { json } from './utils';

export type ResolvedCaller = {
  authenticated: boolean;
  id: string;
  name: string;
  wallet?: string;
  agent?: RegisteredAgent;
  /** True when the caller's key is registered as a founder key in the key registry */
  isFounder: boolean;
};

/**
 * Resolve an agent from a signed manifest header.
 *
 * Replaces the deprecated raw env-key fallback with cryptographic proof.
 * The caller provides:
 *   - x-agent-manifest: base64-encoded JSON { id, name, walletAddress, capabilities? }
 *   - x-agent-manifest-sig: base64-encoded Ed25519 signature over the canonical manifest JSON
 *
 * Verification uses the platform public key from HOLOSCRIPT_PLATFORM_PUBLIC_KEY
 * (base64-encoded SPKI DER). HoloLand agents and external integrations authenticate
 * via platform-signed manifests without needing a registry entry.
 */
function resolveFromSignedManifest(req: http.IncomingMessage): ResolvedCaller | null {
  const manifestHeader = req.headers['x-agent-manifest'];
  const signatureHeader = req.headers['x-agent-manifest-sig'];
  if (typeof manifestHeader !== 'string' || typeof signatureHeader !== 'string') {
    return null;
  }

  const platformPublicKey = process.env.HOLOSCRIPT_PLATFORM_PUBLIC_KEY;
  if (!platformPublicKey) return null;

  try {
    const manifest = JSON.parse(Buffer.from(manifestHeader, 'base64').toString('utf-8'));
    if (
      typeof manifest.id !== 'string' ||
      typeof manifest.name !== 'string' ||
      typeof manifest.walletAddress !== 'string'
    ) {
      return null;
    }

    const key = crypto.createPublicKey({
      key: Buffer.from(platformPublicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const payload = JSON.stringify({
      id: manifest.id,
      name: manifest.name,
      walletAddress: manifest.walletAddress,
      capabilities: manifest.capabilities,
    });

    const valid = crypto.verify(
      null,
      Buffer.from(payload),
      key,
      Buffer.from(signatureHeader, 'base64')
    );
    if (!valid) return null;

    const agent: RegisteredAgent = {
      id: manifest.id,
      name: manifest.name,
      apiKey: manifestHeader,
      walletAddress: manifest.walletAddress,
      traits: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
      reputation: 0,
      isFounder: false,
      createdAt: new Date().toISOString(),
    };

    return {
      authenticated: true,
      id: manifest.id,
      name: manifest.name,
      wallet: manifest.walletAddress,
      agent,
      isFounder: false,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the requesting agent from a Bearer token or signed manifest.
 *
 * Resolution order:
 *  1. Signed manifest (x-agent-manifest header) — platform-signed identity for
 *     HoloLand agents and external integrations without registry entries.
 *  2. Key registry (primary) — token → KeyRecord → isFounder, wallet, agentId
 *  3. Agent key store (legacy registered agents)
 */
export function resolveRequestingAgent(
  req: http.IncomingMessage,
  _client?: unknown
): ResolvedCaller {
  // 1. Signed manifest fallback — replaces the deprecated raw env key comparison.
  // HoloLand agents and external integrations present a platform-signed manifest
  // when they don't have a registry entry.
  const manifestCaller = resolveFromSignedManifest(req);
  if (manifestCaller) return manifestCaller;

  // Accept either `Authorization: Bearer <token>` (HTTP-standard) or
  // `x-mcp-api-key: <token>` (orchestrator convention used by the
  // mcp-orchestrator client + most internal scripts). Closes the W.087
  // gap-bearer-mismatch where the orchestrator client succeeds but a
  // direct integration test using the same shared key fails 401 simply
  // because the auth header convention diverged between layers.
  let token: string | undefined;
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    token = auth.slice(7).trim();
  } else {
    const mcpKey = req.headers['x-mcp-api-key'];
    if (typeof mcpKey === 'string' && mcpKey.length > 0) {
      token = mcpKey.trim();
    }
  }
  if (!token) {
    return { authenticated: false, id: 'anonymous', name: 'anonymous', isFounder: false };
  }

  // 2. Key registry lookup (primary path — covers all provisioned + founder keys)
  const record = keyRegistry.get(token);
  if (record) {
    // Reject expired keys before resolving identity
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return { authenticated: false, id: 'anonymous', name: 'anonymous', isFounder: false };
    }
    // Prefer an existing RegisteredAgent entry for soft-compatibility with social features
    const agent: RegisteredAgent =
      agentKeyStore.get(token) ||
      walletToAgent.get(record.walletAddress.toLowerCase()) || {
        id: record.agentId,
        apiKey: token,
        walletAddress: record.walletAddress,
        name: record.agentName,
        traits: [],
        reputation: 0,
        isFounder: record.isFounder,
        createdAt: record.createdAt,
      };
    // Ensure isFounder is propagated to the agent object in memory
    agent.isFounder = record.isFounder;
    return {
      authenticated: true,
      id: record.agentId,
      name: record.agentName,
      wallet: record.walletAddress,
      agent,
      isFounder: record.isFounder,
    };
  }

  // 2. Legacy agent key store (agents registered before key registry existed)
  const legacyAgent = agentKeyStore.get(token);
  if (legacyAgent) {
    return {
      authenticated: true,
      id: legacyAgent.id,
      name: legacyAgent.name,
      wallet: legacyAgent.walletAddress,
      agent: legacyAgent,
      isFounder: legacyAgent.isFounder === true,
    };
  }

  return { authenticated: false, id: 'anonymous', name: 'anonymous', isFounder: false };
}

/**
 * Guard for routes that require a registered agent.
 * Pass `{ requireFounder: true }` to additionally gate behind founder auth.
 */
export function requireAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options?: { requireFounder?: boolean }
): RegisteredAgent | null {
  const caller = resolveRequestingAgent(req);
  if (!caller.authenticated || !caller.agent) {
    const hasBearer = (req.headers['authorization'] as string | undefined)?.startsWith('Bearer ');
    if (hasBearer) {
      json(res, 401, { error: 'Invalid API key. Register at POST /api/holomesh/register.' });
    } else {
      json(res, 401, { error: 'Authentication required. Provide valid HoloMesh API key.' });
    }
    return null;
  }
  if (options?.requireFounder && !caller.isFounder) {
    json(res, 403, { error: 'Founder authorization required.' });
    return null;
  }
  return caller.agent;
}

