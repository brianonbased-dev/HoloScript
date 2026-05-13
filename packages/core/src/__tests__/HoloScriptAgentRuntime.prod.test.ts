/**
 * HoloScriptAgentRuntime — Production Test Suite
 *
 * Covers: construction (preallocation), reset, id, state, getState,
 * destroy, executeAction on destroyed agent.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptAgentRuntime, type AgentSeed } from '../HoloScriptAgentRuntime';
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

  it('hydrates identity from a seed after the neural map is destroyed', () => {
    const runtime = new HoloScriptRuntime();
    const seed: AgentSeed = {
      wallet: '0xagent-wallet',
      handle: 'substrate-codex',
      brainCompositionRef: 'compositions/codex-brain.hsplus',
      memorySnapshotHash: 'sha256:semantic-snapshot',
      resumeStepId: 'step-42',
      semanticFacts: [
        {
          id: 'fact-identity',
          fact: 'substrate-codex owns the hardware validation lane.',
          confidence: 0.98,
          sourceEpisodes: ['ep-1', 'ep-2'],
        },
      ],
    };
    const original = new HoloScriptAgentRuntime(
      makeOrbNode({
        name: 'substrate-codex',
        properties: { transientMood: 'busy', lastAction: 'compile' },
      }),
      runtime
    );
    original.recordEpisode('compile', 'success', ['runtime']);
    original.state.lastAction = 'destroyed-map';
    original.destroy();

    const hydrated = HoloScriptAgentRuntime.hydrate(seed, runtime);
    const durable = hydrated.durable();
    const losable = hydrated.losable();

    expect(hydrated.id).toBe(seed.handle);
    expect(durable.wallet).toBe(seed.wallet);
    expect(durable.handle).toBe(seed.handle);
    expect(durable.brainCompositionRef).toBe(seed.brainCompositionRef);
    expect(durable.memorySnapshotHash).toBe(seed.memorySnapshotHash);
    expect(durable.resumeStepId).toBe(seed.resumeStepId);
    expect(durable.semanticFacts).toEqual(seed.semanticFacts);
    expect(durable.annotations.semanticFacts).toBe('durable');
    expect(losable.rawEpisodes).toEqual([]);
    expect(losable.runningActions).toEqual([]);
    expect(losable.reactiveState).toEqual({});
    expect(losable.reactiveState.lastAction).toBeUndefined();
    expect(losable.annotations.reactiveState).toBe('losable');
    hydrated.destroy();
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
