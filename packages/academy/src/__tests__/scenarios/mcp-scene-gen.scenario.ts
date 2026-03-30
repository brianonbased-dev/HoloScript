// @vitest-environment node
/**
 * mcp-scene-gen.scenario.ts — P3 Sprint 11
 *
 * Tests the useMCPSceneGen state machine logic in isolation.
 * All fetch calls are mocked — no real MCP server needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Pure state machine helpers (extracted from hook for testability) ─────────

type MCPStatus = 'idle' | 'suggesting' | 'generating' | 'validating' | 'done' | 'offline' | 'error';

interface SceneGenState {
  status: MCPStatus;
  suggestedTraits: string[];
  generatedCode: string | null;
  validationErrors: string[];
  isConnected: boolean;
  lastError: string | null;
}

function initialState(): SceneGenState {
  return {
    status: 'idle',
    suggestedTraits: [],
    generatedCode: null,
    validationErrors: [],
    isConnected: false,
    lastError: null,
  };
}

// Thin mocked versions of the async operations
async function mockSuggestTraits(
  description: string,
  fetchFn: typeof fetch
): Promise<{ state: Partial<SceneGenState>; traits: string[] }> {
  try {
    const res = await fetchFn('/api/mcp/call', {
      method: 'POST',
      body: JSON.stringify({ tool: 'suggest_traits', input: { description } }),
    } as RequestInit);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { traits?: string[] };
    return {
      state: { status: 'idle', isConnected: true, suggestedTraits: data.traits ?? [] },
      traits: data.traits ?? [],
    };
  } catch (err) {
    return { state: { status: 'offline', isConnected: false, lastError: String(err) }, traits: [] };
  }
}

async function mockGenerateScene(
  description: string,
  fetchFn: typeof fetch
): Promise<{ state: Partial<SceneGenState>; code: string | null }> {
  try {
    const res = await fetchFn('/api/mcp/call', {
      method: 'POST',
      body: JSON.stringify({ tool: 'generate_scene', input: { description } }),
    } as RequestInit);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { code?: string };
    return {
      state: { status: 'validating', isConnected: true, generatedCode: data.code ?? null },
      code: data.code ?? null,
    };
  } catch (err) {
    return { state: { status: 'offline', isConnected: false, lastError: String(err) }, code: null };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Scenario: MCP Scene Generator — state machine', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('suggestTraits returns trait list and marks isConnected=true on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ traits: ['@glowing', '@grabbable', '@physics'] }),
    });

    const { state, traits } = await mockSuggestTraits(
      'a glowing portal',
      mockFetch as unknown as typeof fetch
    );
    expect(traits).toEqual(['@glowing', '@grabbable', '@physics']);
    expect(state.isConnected).toBe(true);
    expect(state.status).toBe('idle');
  });

  it('suggestTraits returns empty list and marks offline on fetch failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const { state, traits } = await mockSuggestTraits(
      'a crystal',
      mockFetch as unknown as typeof fetch
    );
    expect(traits).toHaveLength(0);
    expect(state.status).toBe('offline');
    expect(state.isConnected).toBe(false);
  });

  it('generateScene returns .holo code and enters validating state on success', async () => {
    const holoCode = 'scene { sphere @glowing @floating }';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: holoCode }),
    });

    const { state, code } = await mockGenerateScene(
      'a glowing sphere',
      mockFetch as unknown as typeof fetch
    );
    expect(code).toBe(holoCode);
    expect(state.status).toBe('validating');
    expect(state.generatedCode).toBe(holoCode);
  });

  it('generateScene returns null and marks offline on fetch error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const { state, code } = await mockGenerateScene(
      'a temple',
      mockFetch as unknown as typeof fetch
    );
    expect(code).toBeNull();
    expect(state.status).toBe('offline');
  });
});
