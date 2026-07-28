import { describe, it, expect, beforeEach } from 'vitest';
import { behaviorTreeHandler } from '../BehaviorTreeTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';
import { cognitiveActionsToBehaviorTree } from '../cognitive/CognitiveActions';

/**
 * Cognitive BT nodes — verifies that a `cognitive` behavior-tree node dispatches
 * to the REAL cognitive trait by emitting the exact event that trait consumes,
 * and that `await: true` blocks until the trait's completion event arrives.
 */
describe('BehaviorTreeTrait — cognitive nodes', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('cog-agent');
    ctx = createMockContext();
  });

  it('llm_call node emits llm_prompt with the authored prompt (fire-and-forget → success)', () => {
    const config = {
      root: {
        type: 'cognitive' as const,
        verb: 'llm_call' as const,
        config: { prompt: 'What should I do next?', model: 'qwen3.5:4b' },
      },
      tick_rate: 100,
      restart_on_complete: false,
    };
    attachTrait(behaviorTreeHandler, node, config, ctx);
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

    const prompt = getLastEvent(ctx, 'llm_prompt') as Record<string, unknown>;
    expect(prompt).toBeDefined();
    expect(prompt.message).toBe('What should I do next?');
    expect(getEventCount(ctx, 'cognitive:request')).toBe(1);

    // Fire-and-forget: the tree completed (success) on the same tick.
    expect(getEventCount(ctx, 'bt_complete')).toBe(1);
    const complete = getLastEvent(ctx, 'bt_complete') as Record<string, unknown>;
    expect(complete.status).toBe('success');
  });

  it('recall node emits memory_recall with nested payload', () => {
    const config = {
      root: {
        type: 'cognitive' as const,
        verb: 'recall' as const,
        config: { query: 'prior plans', limit: 3 },
      },
      tick_rate: 100,
      restart_on_complete: false,
    };
    attachTrait(behaviorTreeHandler, node, config, ctx);
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

    const recall = getLastEvent(ctx, 'memory_recall') as Record<string, unknown>;
    expect(recall).toBeDefined();
    const payload = recall.payload as Record<string, unknown>;
    expect(payload.query).toBe('prior plans');
    expect(payload.top_k).toBe(3);
  });

  it('await:true node stays running until the completion event resolves it', () => {
    const config = {
      root: {
        type: 'cognitive' as const,
        verb: 'recall' as const,
        config: { query: 'q' },
        await: true,
        result_key: 'memories',
      },
      tick_rate: 100,
      restart_on_complete: false,
    };
    attachTrait(behaviorTreeHandler, node, config, ctx);

    // First tick: dispatches memory_recall, node is running (no completion yet).
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);
    expect(getEventCount(ctx, 'memory_recall')).toBe(1);
    let state = (node as Record<string, any>).__behaviorTreeState;
    expect(state.status).toBe('running');
    expect(getEventCount(ctx, 'bt_complete')).toBe(0);

    // The real AgentMemoryTrait would emit `memory_recalled` when done.
    sendEvent(behaviorTreeHandler, node, config, ctx, {
      type: 'memory_recalled',
      results: [{ key: 'm1', content: 'a prior plan' }],
    });

    // Next tick resolves the awaiting node → success, result written to blackboard.
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);
    state = (node as Record<string, any>).__behaviorTreeState;
    expect(state.status).toBe('success');
    expect(state.blackboard.memories).toBeDefined();
  });

  it('plan node emits goap_set_state with the belief state', () => {
    const config = {
      root: {
        type: 'cognitive' as const,
        verb: 'plan' as const,
        config: { state: { hasTarget: true } },
      },
      tick_rate: 100,
      restart_on_complete: false,
    };
    attachTrait(behaviorTreeHandler, node, config, ctx);
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

    const plan = getLastEvent(ctx, 'goap_set_state') as Record<string, unknown>;
    expect(plan).toBeDefined();
    expect(plan.state).toEqual({ hasTarget: true });
  });

  it('a sequence of cognitive nodes dispatches each in order', () => {
    const config = {
      root: {
        type: 'sequence' as const,
        children: [
          { type: 'cognitive' as const, verb: 'recall' as const, config: { query: 'context' } },
          { type: 'cognitive' as const, verb: 'llm_call' as const, config: { prompt: 'decide' } },
        ],
      },
      tick_rate: 100,
      restart_on_complete: false,
    };
    attachTrait(behaviorTreeHandler, node, config, ctx);
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

    expect(getEventCount(ctx, 'memory_recall')).toBe(1);
    expect(getEventCount(ctx, 'llm_prompt')).toBe(1);
  });

  // Phase 2.1 end-to-end: the parsed `state { recall {…}; llm_call {…} }` surface
  // (brainState.cognitiveActions — formerly a write-only field reaching no runtime)
  // materializes via cognitiveActionsToBehaviorTree into a tree the engine executes,
  // dispatching each verb to its real trait. Closes the W.712 shell on the engine path.
  it("materializes a brain state's cognitiveActions into an engine-executable cognitive sequence", () => {
    const bt = cognitiveActionsToBehaviorTree([
      { kind: 'cognitive', verb: 'recall', config: { query: 'prior plans', limit: 3 } },
      { kind: 'cognitive', verb: 'llm_call', config: { prompt: 'decide next' } },
    ]);
    expect(bt).toBeDefined();
    expect(bt!.root.type).toBe('sequence');
    expect(bt!.root.children).toHaveLength(2);

    const config = { ...bt!, tick_rate: 100, restart_on_complete: false };
    attachTrait(behaviorTreeHandler, node, config, ctx);
    updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

    // Both authored verbs dispatched to their real trait events — proven, not asserted.
    expect(getEventCount(ctx, 'memory_recall')).toBe(1);
    expect(getEventCount(ctx, 'llm_prompt')).toBe(1);
    const recall = getLastEvent(ctx, 'memory_recall') as Record<string, unknown>;
    expect((recall.payload as Record<string, unknown>).query).toBe('prior plans');
  });

  it('materializes undefined for an empty cognitive sequence (no tree to run)', () => {
    expect(cognitiveActionsToBehaviorTree([])).toBeUndefined();
    expect(cognitiveActionsToBehaviorTree(undefined)).toBeUndefined();
  });
});
