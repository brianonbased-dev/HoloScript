'use client';

/**
 * useMCPSceneGen — MCP-backed scene generation hook
 *
 * Connects to the HoloScript MCP server via HTTP (Next.js route proxy
 * to avoid CORS and process-spawning issues in the browser). Falls back
 * to a stub response when the server is offline.
 *
 * MCP Tools used:
 *   suggest_traits  — NL → trait chip suggestions
 *   generate_scene  — NL → .holo code
 *   validate_holoscript — .holo code → { valid, errors }
 *
 * The MCP server is started separately:
 *   npx tsx packages/mcp-server/src/index.ts
 * or via the holoscript-mcp workflow.
 */

import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MCPSceneGenState {
  /** Current status */
  status: 'idle' | 'suggesting' | 'generating' | 'validating' | 'done' | 'offline' | 'error';
  /** Trait chips from suggest_traits */
  suggestedTraits: string[];
  /** Generated .holo code from generate_scene */
  generatedCode: string | null;
  /** Validation errors from validate_holoscript */
  validationErrors: string[];
  /** True when the MCP server responded correctly */
  isConnected: boolean;
  /** Last error message */
  lastError: string | null;
}

export interface MCPSceneGenActions {
  suggestTraits: (description: string) => Promise<string[]>;
  generateScene: (description: string) => Promise<string | null>;
  validateCode: (code: string) => Promise<boolean>;
  reset: () => void;
}

const INITIAL_STATE: MCPSceneGenState = {
  status: 'idle',
  suggestedTraits: [],
  generatedCode: null,
  validationErrors: [],
  isConnected: false,
  lastError: null,
};

// ─── MCP proxy call ───────────────────────────────────────────────────────────

async function callMCPTool(tool: string, input: Record<string, string>): Promise<unknown> {
  // Use internal Next.js API route to proxy MCP calls (avoids CORS)
  const res = await fetch('/api/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  const json = (await res.json()) as { result?: unknown; error?: string; offline?: boolean };
  if (!res.ok || json.error) {
    const msg = json.error ?? `MCP proxy error: ${res.status}`;
    throw Object.assign(new Error(msg), { offline: json.offline });
  }
  // Unwrap the {result} wrapper returned by the route
  return json.result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMCPSceneGen(): [MCPSceneGenState, MCPSceneGenActions] {
  const [state, setState] = useState<MCPSceneGenState>(INITIAL_STATE);

  const suggestTraits = useCallback(async (description: string): Promise<string[]> => {
    setState((s) => ({ ...s, status: 'suggesting', lastError: null }));
    try {
      const result = await callMCPTool('suggest_traits', { description, format: 'hsplus' });
      const traits = (result as { traits?: string[] }).traits ?? [];
      setState((s) => ({ ...s, suggestedTraits: traits, isConnected: true, status: 'idle' }));
      return traits;
    } catch (err) {
      setState((s) => ({ ...s, status: 'offline', isConnected: false, lastError: String(err) }));
      return [];
    }
  }, []);

  const generateScene = useCallback(async (description: string): Promise<string | null> => {
    setState((s) => ({ ...s, status: 'generating', lastError: null }));
    try {
      const result = await callMCPTool('generate_scene', { description, format: 'holo' });
      const code = (result as { code?: string }).code ?? null;
      setState((s) => ({ ...s, generatedCode: code, isConnected: true, status: 'validating' }));
      return code;
    } catch (err) {
      setState((s) => ({ ...s, status: 'offline', isConnected: false, lastError: String(err) }));
      return null;
    }
  }, []);

  const validateCode = useCallback(async (code: string): Promise<boolean> => {
    try {
      const result = await callMCPTool('validate_holoscript', { code });
      const r = result as { valid?: boolean; errors?: string[] };
      const errors = r.errors ?? [];
      setState((s) => ({
        ...s,
        validationErrors: errors,
        status: errors.length === 0 ? 'done' : 'error',
        isConnected: true,
      }));
      return errors.length === 0;
    } catch (err) {
      setState((s) => ({ ...s, status: 'offline', isConnected: false, lastError: String(err) }));
      return false;
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return [state, { suggestTraits, generateScene, validateCode, reset }];
}
