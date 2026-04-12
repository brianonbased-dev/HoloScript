import type http from 'http';
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
 * Resolve the requesting agent from a Bearer token.
 *
 * Resolution order:
 *  1. Key registry (primary) — token → KeyRecord → isFounder, wallet, agentId
 *  2. Agent key store (legacy registered agents)
 *  3. Raw env key comparison (deprecated system keys — warns and resolves as founder)
 */
export function resolveRequestingAgent(
  req: http.IncomingMessage,
  _client?: unknown
): ResolvedCaller {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return { authenticated: false, id: 'anonymous', name: 'anonymous', isFounder: false };
  }

  const token = auth.slice(7).trim();

  // 1. Key registry lookup (primary path — covers all provisioned + founder keys)
  const record = keyRegistry.get(token);
  if (record) {
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

  // 3. Raw env key comparison (deprecated — legacy system/IDE keys)
  const systemKeys = [
    process.env.HOLOSCRIPT_API_KEY,
    process.env.MCP_API_KEY,
    process.env.HOLOMESH_API_KEY,
    process.env.COPILOT_HOLOMESH_KEY,
    process.env.GEMINI_HOLOMESH_KEY,
  ].filter((k): k is string => Boolean(k && k.trim()));

  if (systemKeys.includes(token)) {
    console.warn(
      '[auth] Deprecated: resolving auth via raw env key comparison. ' +
        'This key is not in the key registry. Run server once to auto-seed, ' +
        'or provision via POST /api/holomesh/admin/provision.'
    );
    const fallbackAgent: RegisteredAgent = {
      id: 'system',
      name: 'Founder',
      apiKey: token,
      walletAddress: process.env.HOLOSCRIPT_FOUNDER_WALLET ||
        '0x0000000000000000000000000000000000000001',
      traits: [],
      reputation: 0,
      isFounder: true,
      createdAt: new Date().toISOString(),
    };
    return {
      authenticated: true,
      id: 'system',
      name: 'Founder',
      wallet: fallbackAgent.walletAddress,
      agent: fallbackAgent,
      isFounder: true,
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

