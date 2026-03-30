/**
 * Scripting & Automation Traits — Unit Tests
 *
 * Tests PipelineTrait, WatcherTrait, TaskQueueTrait, WebhookTrait,
 * ShellTrait, and RetryTrait handlers using the standard traitTestHelpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { pipelineHandler } from '../PipelineTrait';
import type { PipelineConfig } from '../PipelineTrait';
import { watcherHandler } from '../WatcherTrait';
import type { WatcherConfig } from '../WatcherTrait';
import { taskQueueHandler } from '../TaskQueueTrait';
import type { TaskQueueConfig } from '../TaskQueueTrait';
import { webhookHandler } from '../WebhookTrait';
import type { WebhookConfig } from '../WebhookTrait';
import { shellHandler } from '../ShellTrait';
import type { ShellConfig } from '../ShellTrait';
import { retryHandler } from '../RetryTrait';
import type { RetryConfig } from '../RetryTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// PipelineTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('PipelineTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('pipeline-node');
    ctx = createMockContext();
  });

  it('should attach and initialize pipeline state', () => {
    attachTrait(pipelineHandler, node, {}, ctx);
    expect((node as any).__pipelineState).toBeDefined();
    expect((node as any).__pipelineState.running).toBe(false);
    expect((node as any).__pipelineState.currentStep).toBe(0);
  });

  it('should clean up state on detach', () => {
    attachTrait(pipelineHandler, node, {}, ctx);
    const fullConfig = { ...pipelineHandler.defaultConfig };
    pipelineHandler.onDetach!(node as any, fullConfig, ctx as any);
    expect((node as any).__pipelineState).toBeUndefined();
  });

  it('should start pipeline on pipeline:run event', () => {
    const config: Partial<PipelineConfig> = {
      pipeline_id: 'test-pipe',
      steps: [
        { name: 'step_a', type: 'action', action: 'do_a', params: {}, timeout_ms: 0 },
        { name: 'step_b', type: 'action', action: 'do_b', params: {}, timeout_ms: 0 },
      ],
    };
    attachTrait(pipelineHandler, node, config, ctx);
    sendEvent(pipelineHandler, node, config, ctx, { type: 'pipeline:run' });

    expect((node as any).__pipelineState.running).toBe(true);
    expect(getEventCount(ctx, 'pipeline:start')).toBe(1);
    expect(getEventCount(ctx, 'pipeline:step_start')).toBe(1);
  });

  it('should auto-start when auto_start is true', () => {
    const config: Partial<PipelineConfig> = {
      auto_start: true,
      steps: [{ name: 'only', type: 'action', action: 'do_it', params: {}, timeout_ms: 0 }],
    };
    attachTrait(pipelineHandler, node, config, ctx);
    expect((node as any).__pipelineState.running).toBe(true);
    expect(getEventCount(ctx, 'pipeline:start')).toBe(1);
  });

  it('should advance through sequential steps', () => {
    const config: Partial<PipelineConfig> = {
      pipeline_id: 'seq',
      steps: [
        { name: 's1', type: 'action', action: 'a1', params: {}, timeout_ms: 0 },
        { name: 's2', type: 'action', action: 'a2', params: {}, timeout_ms: 0 },
      ],
    };
    attachTrait(pipelineHandler, node, config, ctx);
    sendEvent(pipelineHandler, node, config, ctx, { type: 'pipeline:run' });

    // Complete step 0
    sendEvent(pipelineHandler, node, config, ctx, {
      type: 'pipeline:step_result',
      stepIndex: 0,
      result: 'ok',
      error: null,
    });

    expect(getEventCount(ctx, 'pipeline:step_complete')).toBe(1);
    expect((node as any).__pipelineState.currentStep).toBe(1);

    // Complete step 1
    sendEvent(pipelineHandler, node, config, ctx, {
      type: 'pipeline:step_result',
      stepIndex: 1,
      result: 'done',
      error: null,
    });

    expect(getEventCount(ctx, 'pipeline:complete')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WatcherTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('WatcherTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('watcher-node');
    ctx = createMockContext();
  });

  it('should attach and auto-start event watcher', () => {
    attachTrait(watcherHandler, node, { auto_start: true, patterns: ['player:*'] }, ctx);
    expect((node as any).__watcherState).toBeDefined();
    expect((node as any).__watcherState.active).toBe(true);
    expect(getEventCount(ctx, 'watcher:ready')).toBe(1);
  });

  it('should clean up on detach', () => {
    attachTrait(watcherHandler, node, {}, ctx);
    const fullConfig = { ...watcherHandler.defaultConfig };
    watcherHandler.onDetach!(node as any, fullConfig, ctx as any);
    expect((node as any).__watcherState).toBeUndefined();
  });

  it('should start and stop watching via events', () => {
    attachTrait(watcherHandler, node, { auto_start: false }, ctx);
    expect((node as any).__watcherState.active).toBe(false);

    sendEvent(watcherHandler, node, { auto_start: false }, ctx, { type: 'watcher:start' });
    expect((node as any).__watcherState.active).toBe(true);

    sendEvent(watcherHandler, node, { auto_start: false }, ctx, { type: 'watcher:stop' });
    expect((node as any).__watcherState.active).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RetryTrait
// ═══════════════════════════════════════════════════════════════════════════════

describe('RetryTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('retry-node');
    ctx = createMockContext();
  });

  it('should attach with circuit breaker closed', () => {
    attachTrait(retryHandler, node, {}, ctx);
    const state = (node as any).__retryState;
    expect(state).toBeDefined();
    expect(state.circuit).toBe('closed');
    expect(state.consecutiveFailures).toBe(0);
  });

  it('should clean up on detach', () => {
    attachTrait(retryHandler, node, {}, ctx);
    const fullConfig = { ...retryHandler.defaultConfig };
    retryHandler.onDetach!(node as any, fullConfig, ctx as any);
    expect((node as any).__retryState).toBeUndefined();
  });

  it('should emit retry:attempt on execute', () => {
    attachTrait(retryHandler, node, {}, ctx);
    sendEvent(retryHandler, node, {}, ctx, {
      type: 'retry:execute',
      action: 'test_action',
      params: {},
    });

    expect(getEventCount(ctx, 'retry:attempt')).toBe(1);
    const attempt = getLastEvent(ctx, 'retry:attempt') as any;
    expect(attempt.actionName).toBe('test_action');
    expect(attempt.attempt).toBe(0);
  });

  it('should reset failures on success result', () => {
    attachTrait(retryHandler, node, {}, ctx);

    // Execute an action
    sendEvent(retryHandler, node, {}, ctx, {
      type: 'retry:execute',
      action: 'test',
      params: {},
    });

    const attempt = getLastEvent(ctx, 'retry:attempt') as any;
    const retryId = attempt.retryId;

    // Report success
    sendEvent(retryHandler, node, {}, ctx, {
      type: 'retry:action_result',
      retryId,
      success: true,
    });

    const state = (node as any).__retryState;
    expect(state.consecutiveFailures).toBe(0);
    expect(state.totalSuccesses).toBe(1);
    expect(getEventCount(ctx, 'retry:success')).toBe(1);
  });

  it('should track consecutive failures', () => {
    attachTrait(retryHandler, node, { max_retries: 0 }, ctx);

    // Execute
    sendEvent(retryHandler, node, { max_retries: 0 }, ctx, {
      type: 'retry:execute',
      action: 'failing_action',
      params: {},
    });

    const attempt = getLastEvent(ctx, 'retry:attempt') as any;

    // Report failure
    sendEvent(retryHandler, node, { max_retries: 0 }, ctx, {
      type: 'retry:action_result',
      retryId: attempt.retryId,
      success: false,
      error: 'timeout',
    });

    const state = (node as any).__retryState;
    expect(state.consecutiveFailures).toBe(1);
    expect(state.totalFailures).toBe(1);
    expect(getEventCount(ctx, 'retry:failure')).toBe(1);
  });

  it('should provide status via retry:get_status', () => {
    attachTrait(retryHandler, node, {}, ctx);
    sendEvent(retryHandler, node, {}, ctx, { type: 'retry:get_status' });

    expect(getEventCount(ctx, 'retry:status')).toBe(1);
    const status = getLastEvent(ctx, 'retry:status') as any;
    expect(status.circuit).toBe('closed');
    expect(status.consecutiveFailures).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TaskQueueTrait (smoke test — verifies lifecycle)
// ═══════════════════════════════════════════════════════════════════════════════

describe('TaskQueueTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('queue-node');
    ctx = createMockContext();
  });

  it('should attach and initialize queue state', () => {
    attachTrait(taskQueueHandler, node, {}, ctx);
    expect((node as any).__taskQueueState).toBeDefined();
  });

  it('should clean up on detach', () => {
    attachTrait(taskQueueHandler, node, {}, ctx);
    const fullConfig = { ...taskQueueHandler.defaultConfig };
    taskQueueHandler.onDetach!(node as any, fullConfig, ctx as any);
    expect((node as any).__taskQueueState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WebhookTrait (smoke test)
// ═══════════════════════════════════════════════════════════════════════════════

describe('WebhookTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('webhook-node');
    ctx = createMockContext();
  });

  it('should attach and initialize webhook state', () => {
    attachTrait(webhookHandler, node, {}, ctx);
    expect((node as any).__webhookState).toBeDefined();
  });

  it('should clean up on detach', () => {
    attachTrait(webhookHandler, node, {}, ctx);
    const fullConfig = { ...webhookHandler.defaultConfig };
    webhookHandler.onDetach!(node as any, fullConfig, ctx as any);
    expect((node as any).__webhookState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ShellTrait (smoke test)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('shell-node');
    ctx = createMockContext();
  });

  it('should attach and initialize shell state', () => {
    attachTrait(shellHandler, node, {}, ctx);
    expect((node as any).__shellState).toBeDefined();
  });

  it('should clean up on detach', () => {
    attachTrait(shellHandler, node, {}, ctx);
    const fullConfig = { ...shellHandler.defaultConfig };
    shellHandler.onDetach!(node as any, fullConfig, ctx as any);
    expect((node as any).__shellState).toBeUndefined();
  });
});
