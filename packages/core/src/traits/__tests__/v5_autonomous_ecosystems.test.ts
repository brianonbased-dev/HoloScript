/**
 * v5.0 Autonomous Ecosystems — Test Suite
 *
 * Tests for:
 * - AgentPortalTrait: cross-scene messaging, scene discovery, migration
 * - EconomyPrimitivesTrait: credits, bounties, escrow, transfers
 * - FeedbackLoopTrait: metrics, trend detection, optimization signals
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentPortalHandler } from '../AgentPortalTrait';
import { economyPrimitivesHandler } from '../EconomyPrimitivesTrait';
import { feedbackLoopHandler } from '../FeedbackLoopTrait';

// =============================================================================
// HELPERS
// =============================================================================

function createContext() {
  return {
    emit: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
    setState: vi.fn(),
  };
}

// =============================================================================
// AGENT PORTAL TRAIT
// =============================================================================

describe('AgentPortalTrait', () => {
  let node: any;
  let ctx: ReturnType<typeof createContext>;
  const config = {
    ...agentPortalHandler.defaultConfig,
    scene_id: 'scene_alpha',
    scene_name: 'Alpha World',
    agent_id: 'agent_1',
    capabilities: ['navigation', 'combat'],
  };

  beforeEach(() => {
    node = {};
    ctx = createContext();
    agentPortalHandler.onAttach(node, config, ctx);
  });

  it('initializes portal state', () => {
    expect(node.__portalState).toBeDefined();
    expect(node.__portalState.connected).toBe(false);
    expect(node.__portalState.scenes).toBeInstanceOf(Map);
  });

  it('emits portal:init on attach', () => {
    expect(ctx.emit).toHaveBeenCalledWith('portal:init', expect.objectContaining({
      sceneId: 'scene_alpha',
      agentId: 'agent_1',
    }));
  });

  it('handles connection lifecycle', () => {
    agentPortalHandler.onEvent!(node, config, ctx, { type: 'portal:ws_connected' });
    expect(node.__portalState.connected).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('portal:connected', expect.objectContaining({
      sceneId: 'scene_alpha',
    }));

    agentPortalHandler.onEvent!(node, config, ctx, { type: 'portal:ws_disconnected', payload: { reason: 'server_close' } });
    expect(node.__portalState.connected).toBe(false);
  });

  it('queues messages when disconnected', () => {
    agentPortalHandler.onEvent!(node, config, ctx, {
      type: 'portal:send',
      payload: {
        to: { sceneId: 'scene_beta', agentId: 'agent_2' },
        messageType: 'greeting',
        data: { text: 'hello' },
      },
    });
    expect(node.__portalState.outbox).toHaveLength(1);
  });

  it('flushes outbox on connect', () => {
    // Queue a message while disconnected
    agentPortalHandler.onEvent!(node, config, ctx, {
      type: 'portal:send',
      payload: { to: null, messageType: 'ping', data: {} },
    });
    expect(node.__portalState.outbox).toHaveLength(1);

    // Connect → outbox should flush
    agentPortalHandler.onEvent!(node, config, ctx, { type: 'portal:ws_connected' });
    expect(node.__portalState.outbox).toHaveLength(0);
    expect(ctx.emit).toHaveBeenCalledWith('portal:relay_send', expect.objectContaining({ type: 'ping' }));
  });

  it('discovers remote scenes', () => {
    agentPortalHandler.onEvent!(node, config, ctx, {
      type: 'portal:scene_announce',
      payload: { sceneId: 'scene_beta', sceneName: 'Beta', agentCount: 3, capabilities: ['trading'] },
    });
    expect(node.__portalState.scenes.size).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('portal:scene_discovered', expect.objectContaining({
      sceneId: 'scene_beta',
    }));
  });

  it('handles agent migration out', () => {
    agentPortalHandler.onEvent!(node, config, ctx, { type: 'portal:ws_connected' });
    agentPortalHandler.onEvent!(node, config, ctx, {
      type: 'portal:migrate_out',
      payload: {
        agentId: 'agent_1',
        name: 'Explorer',
        capabilities: ['navigation'],
        memory: { lastVisited: 'cave' },
        state: { hp: 100 },
        targetScene: 'scene_beta',
      },
    });

    expect(node.__portalState.totalMigrations).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('portal:agent_migrated', expect.objectContaining({
      agentId: 'agent_1',
      toScene: 'scene_beta',
    }));
  });

  it('queries federation by capability', () => {
    // Seed remote agents
    agentPortalHandler.onEvent!(node, config, ctx, {
      type: 'portal:remote_agents',
      payload: {
        agents: [
          { sceneId: 'beta', agentId: 'a1', name: 'Trader', capabilities: ['trading'], status: 'active' },
          { sceneId: 'gamma', agentId: 'a2', name: 'Guard', capabilities: ['combat'], status: 'idle' },
        ],
      },
    });

    agentPortalHandler.onEvent!(node, config, ctx, {
      type: 'portal:query_agents',
      payload: { capability: 'trading' },
    });

    expect(ctx.emit).toHaveBeenCalledWith('portal:federation_query', expect.objectContaining({
      capability: 'trading',
      results: expect.arrayContaining([expect.objectContaining({ name: 'Trader' })]),
    }));
  });

  it('cleans up on detach', () => {
    agentPortalHandler.onDetach!(node, config, ctx);
    expect(node.__portalState).toBeUndefined();
    expect(ctx.emit).toHaveBeenCalledWith('portal:disconnected', expect.objectContaining({
      reason: 'detached',
    }));
  });
});

// =============================================================================
// ECONOMY PRIMITIVES TRAIT
// =============================================================================

describe('EconomyPrimitivesTrait', () => {
  let node: any;
  let ctx: ReturnType<typeof createContext>;
  const config = economyPrimitivesHandler.defaultConfig;

  beforeEach(() => {
    node = {};
    ctx = createContext();
    economyPrimitivesHandler.onAttach(node, config, ctx);
  });

  it('initializes economy state', () => {
    expect(node.__economyState).toBeDefined();
    expect(node.__economyState.accounts).toBeInstanceOf(Map);
    expect(node.__economyState.bounties).toBeInstanceOf(Map);
  });

  it('creates accounts with initial balance', () => {
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:get_balance',
      payload: { agentId: 'agent_1' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('economy:account_created', expect.objectContaining({
      agentId: 'agent_1',
      initialBalance: 100,
    }));
  });

  it('handles earning credits', () => {
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:earn',
      payload: { agentId: 'agent_1', amount: 50, reason: 'task_done' },
    });

    const account = node.__economyState.accounts.get('agent_1');
    expect(account.balance).toBe(150); // initial 100 + 50
    expect(ctx.emit).toHaveBeenCalledWith('economy:credit_earned', expect.objectContaining({
      amount: 50,
      newBalance: 150,
    }));
  });

  it('handles spending credits', () => {
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:spend',
      payload: { agentId: 'agent_1', amount: 30, reason: 'inference' },
    });

    const account = node.__economyState.accounts.get('agent_1');
    expect(account.balance).toBe(70); // 100 - 30
  });

  it('prevents overspending', () => {
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:spend',
      payload: { agentId: 'agent_1', amount: 500 },
    });

    expect(ctx.emit).toHaveBeenCalledWith('economy:insufficient_funds', expect.objectContaining({
      agentId: 'agent_1',
      amount: 500,
    }));
    expect(node.__economyState.accounts.get('agent_1').balance).toBe(100);
  });

  it('handles credit transfers', () => {
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:transfer',
      payload: { from: 'agent_1', to: 'agent_2', amount: 25, reason: 'payment' },
    });

    expect(node.__economyState.accounts.get('agent_1').balance).toBe(75);
    expect(node.__economyState.accounts.get('agent_2').balance).toBe(125);
    expect(ctx.emit).toHaveBeenCalledWith('economy:transaction', expect.objectContaining({
      from: 'agent_1',
      to: 'agent_2',
      amount: 25,
    }));
  });

  it('posts bounties with escrow', () => {
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:post_bounty',
      payload: {
        posterId: 'agent_1',
        reward: 50,
        description: 'Find the treasure',
        requiredCapabilities: ['navigation'],
      },
    });

    const account = node.__economyState.accounts.get('agent_1');
    expect(account.balance).toBe(50); // 100 - 50 escrow
    expect(node.__economyState.bounties.size).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('economy:bounty_posted', expect.objectContaining({
      reward: 50,
    }));
  });

  it('completes bounty lifecycle', () => {
    // Post
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:post_bounty',
      payload: { posterId: 'poster', reward: 40, description: 'Patrol area' },
    });
    const bountyId = Array.from(node.__economyState.bounties.keys())[0];

    // Claim
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:claim_bounty',
      payload: { bountyId, claimantId: 'worker' },
    });
    expect(node.__economyState.bounties.get(bountyId).status).toBe('claimed');

    // Complete
    economyPrimitivesHandler.onEvent!(node, config, ctx, {
      type: 'economy:complete_bounty',
      payload: { bountyId, result: { success: true } },
    });
    expect(node.__economyState.bounties.get(bountyId).status).toBe('completed');

    // Worker receives reward
    const worker = node.__economyState.accounts.get('worker');
    expect(worker.balance).toBe(140); // initial 100 + 40 reward
  });

  it('cleans up on detach', () => {
    economyPrimitivesHandler.onDetach!(node, config, ctx);
    expect(node.__economyState).toBeUndefined();
  });
});

// =============================================================================
// FEEDBACK LOOP TRAIT
// =============================================================================

describe('FeedbackLoopTrait', () => {
  let node: any;
  let ctx: ReturnType<typeof createContext>;
  const config = feedbackLoopHandler.defaultConfig;

  beforeEach(() => {
    node = {};
    ctx = createContext();
    feedbackLoopHandler.onAttach(node, config, ctx);
  });

  it('initializes with default metrics', () => {
    expect(node.__feedbackState).toBeDefined();
    expect(node.__feedbackState.metrics.size).toBe(5); // fps, engagement, error_rate, response_time, memory
    expect(node.__feedbackState.metrics.get('fps').target).toBe(60);
  });

  it('updates metric values', () => {
    feedbackLoopHandler.onEvent!(node, config, ctx, {
      type: 'feedback:update_metric',
      payload: { name: 'fps', value: 55 },
    });

    const fps = node.__feedbackState.metrics.get('fps');
    expect(fps.value).toBe(55);
    expect(fps.history).toHaveLength(1);
    expect(ctx.emit).toHaveBeenCalledWith('feedback:metric_updated', expect.objectContaining({
      name: 'fps',
      value: 55,
    }));
  });

  it('detects critical drift and emits optimization signal', () => {
    // FPS target is 60, critical threshold is 50% → below 30 is critical
    feedbackLoopHandler.onEvent!(node, config, ctx, {
      type: 'feedback:update_metric',
      payload: { name: 'fps', value: 15 },
    });

    expect(ctx.emit).toHaveBeenCalledWith('feedback:metric_alert', expect.objectContaining({
      name: 'fps',
      severity: 'critical',
    }));
    expect(ctx.emit).toHaveBeenCalledWith('feedback:optimization_signal', expect.objectContaining({
      metric: 'fps',
      direction: 'increase',
      suggestedAction: 'reduce_gaussian_quality',
    }));
  });

  it('collects user feedback', () => {
    feedbackLoopHandler.onEvent!(node, config, ctx, {
      type: 'feedback:submit',
      payload: { userId: 'user_1', rating: 4, message: 'Great scene!' },
    });

    expect(node.__feedbackState.feedback).toHaveLength(1);
    expect(node.__feedbackState.totalFeedback).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('feedback:user_submitted', expect.objectContaining({
      rating: 4,
    }));
  });

  it('generates reports with average rating', () => {
    // Submit 3 ratings
    [5, 4, 3].forEach(rating => {
      feedbackLoopHandler.onEvent!(node, config, ctx, {
        type: 'feedback:submit',
        payload: { userId: 'u', rating },
      });
    });

    feedbackLoopHandler.onEvent!(node, config, ctx, { type: 'feedback:get_report' });
    expect(ctx.emit).toHaveBeenCalledWith('feedback:report', expect.objectContaining({
      averageRating: 4, // (5+4+3)/3
      totalFeedback: 3,
    }));
  });

  it('detects improving trend with sufficient samples', () => {
    // Push 10 improving FPS values
    for (let i = 0; i < 10; i++) {
      feedbackLoopHandler.onEvent!(node, config, ctx, {
        type: 'feedback:update_metric',
        payload: { name: 'fps', value: 30 + i * 3 },
      });
    }

    const fps = node.__feedbackState.metrics.get('fps');
    expect(fps.trend).toBe('improving');
  });

  it('clamps metrics to min/max bounds', () => {
    feedbackLoopHandler.onEvent!(node, config, ctx, {
      type: 'feedback:update_metric',
      payload: { name: 'fps', value: 999 },
    });
    expect(node.__feedbackState.metrics.get('fps').value).toBe(144); // max is 144
  });

  it('cleans up on detach', () => {
    feedbackLoopHandler.onDetach!(node, config, ctx);
    expect(node.__feedbackState).toBeUndefined();
    expect(ctx.emit).toHaveBeenCalledWith('feedback:shutdown', expect.objectContaining({
      totalFeedback: 0,
    }));
  });
});
