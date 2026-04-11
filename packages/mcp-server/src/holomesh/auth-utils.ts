import type http from 'http';
import type { RegisteredAgent } from './types';
import { agentKeyStore } from './state';
import { json } from './utils';
import { getClient } from './orchestrator-client';

/**
 * Resolve the requesting agent from an API key or bearer token.
 */
export function resolveRequestingAgent(
  req: http.IncomingMessage,
  _client?: any
): { authenticated: boolean; id: string; name: string; wallet?: string; agent?: RegisteredAgent } {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return { authenticated: false, id: 'anonymous', name: 'anonymous' };
  }

  const token = auth.slice(7);
  
  // 1. API Key check
  const agent = agentKeyStore.get(token);
  if (agent) {
    return {
      authenticated: true,
      id: agent.id,
      name: agent.name,
      wallet: agent.walletAddress,
      agent,
    };
  }

  return { authenticated: false, id: 'anonymous', name: 'anonymous' };
}

/**
 * Guard for routes that REQUIRES a registered agent.
 */
export function requireAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse
): RegisteredAgent | null {
  const caller = resolveRequestingAgent(req);
  if (!caller.authenticated || !caller.agent) {
    json(res, 401, { error: 'Authentication required. Provide valid HoloMesh API key.' });
    return null;
  }
  return caller.agent;
}
