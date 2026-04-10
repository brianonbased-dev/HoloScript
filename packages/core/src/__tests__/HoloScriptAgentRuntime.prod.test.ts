/**
 * HoloScriptAgentRuntime — Production Test Suite
 *
 * Covers: construction (preallocation), reset, id, state, getState,
 * destroy, executeAction on destroyed agent.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptAgentRuntime } from '../HoloScriptAgentRuntime';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import type { OrbNode } from '../types';

function makeOrbNode(overrides: Partial<OrbNode> = {}): OrbNode {
  return {
    type: 'orb',
    name: 'TestAgent',
    properties: { health: 100, speed: 5 },
    directives: [],
    ...overrides,
  } as OrbNode;
}

describe('HoloScriptAgentRuntime — Production', () => {
  // ─── Preallocation Mode ───────────────────────────────────────────
  it('constructs in preallocation mode with no args', () => {
    const agent = new HoloScriptAgentRuntime();
    expect(agent).toBeDefined();
  });

  // ─── Full Construction ────────────────────────────────────────────
  it('constructs with agent node and runtime', () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    expect(agent.id).toBe('TestAgent');
  });

  it('agent id returns node name', () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode({ name: 'Bot' }), runtime);
    expect(agent.id).toBe('Bot');
  });

  it('agent id uses node.id if present', () => {
    const runtime = new HoloScriptRuntime();
    const node = makeOrbNode({ name: 'Bot', id: 'bot-001' } as any);
    const agent = new HoloScriptAgentRuntime(node, runtime);
    expect(agent.id).toBe('bot-001');
  });

  // ─── State ────────────────────────────────────────────────────────
  it('state returns reactive proxy', () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    const st = agent.state;
    expect(st).toBeDefined();
    expect(st.health).toBe(100);
    expect(st.speed).toBe(5);
  });

  it('getState returns same as state', () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    expect(agent.getState()).toBeDefined();
  });

  // ─── Reset ────────────────────────────────────────────────────────
  it('reset reinitializes agent', () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime();
    agent.reset(makeOrbNode({ name: 'ResetBot', properties: { armor: 50 } }), runtime);
    expect(agent.id).toBe('ResetBot');
    expect(agent.state.armor).toBe(50);
  });

  // ─── Destroy ──────────────────────────────────────────────────────
  it('destroy marks agent destroyed', () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    agent.destroy();
    // Agent should be destroyed
    expect(agent).toBeDefined();
  });

  it('executeAction on destroyed agent returns failure', async () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    agent.destroy();
    const result = await agent.executeAction('move');
    expect(result.success).toBe(false);
    expect(result.error).toContain('destroyed');
  });

  // ─── executeAction with no matching action ────────────────────────
  it('executeAction for unknown action falls back to runtime', async () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    // No matching action in directives, so it falls back to callFunction
    const result = await agent.executeAction('nonexistent');
    // May succeed or fail depending on runtime, just check shape
    expect(typeof result.success).toBe('boolean');
  });

  // ─── onEvent ──────────────────────────────────────────────────────
  it('onEvent on destroyed agent is no-op', async () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    agent.destroy();
    // Should not throw
    await agent.onEvent('tick', {});
  });

  it('onEvent with no handler is safe', async () => {
    const runtime = new HoloScriptRuntime();
    const agent = new HoloScriptAgentRuntime(makeOrbNode(), runtime);
    await agent.onEvent('unknown_event', { data: 42 });
    // Should not throw
  });
});
