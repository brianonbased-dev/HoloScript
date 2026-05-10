import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HSPlusNode } from '../../types/HoloScriptPlus';
import type { TraitContext } from '../TraitTypes';

// Contract traits
import {
  contractHandler,
  schemaHandler,
  validatorHandler,
  serializerHandler,
} from './ContractTraits';

// Data traits
import { dbHandler, modelHandler, queryHandler, migrationHandler, cacheHandler } from './DataTraits';

// Pipeline traits
import { pipelineHandler, streamHandler, queueHandler, workerHandler, schedulerHandler } from './PipelineTraits';

// Metric traits
import { metricHandler, traceHandler, logHandler, healthCheckHandler } from './MetricTraits';

// Resilience traits
import {
  circuitBreakerHandler,
  retryHandler,
  timeoutHandler,
  fallbackHandler,
  bulkheadHandler,
} from './ResilienceTraits';

// Container traits
import { containerHandler, deploymentHandler, scalingHandler, secretHandler } from './ContainerTraits';

function makeNode(): HSPlusNode {
  return { id: 'test-node', type: 'object', name: 'TestNode' } as HSPlusNode;
}

function makeContext(): TraitContext {
  return {
    emit: vi.fn(),
    getState: vi.fn(() => ({})),
    setState: vi.fn(),
    getScaleMultiplier: vi.fn(() => 1),
    setScaleContext: vi.fn(),
    vr: {
      hands: { left: null, right: null },
      headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
      getPointerRay: () => null,
      getDominantHand: () => null,
    },
    physics: {
      applyVelocity: vi.fn(),
      applyAngularVelocity: vi.fn(),
      setKinematic: vi.fn(),
      raycast: () => null,
      getBodyPosition: () => null,
      getBodyVelocity: () => null,
    },
    audio: {
      playSound: vi.fn(),
    },
    haptics: {
      pulse: vi.fn(),
      rumble: vi.fn(),
    },
  } as unknown as TraitContext;
}

describe('v6 Resilience Trait Adapters', () => {
  it('circuitBreakerHandler attaches breaker state and emits event', () => {
    const node = makeNode();
    const ctx = makeContext();
    circuitBreakerHandler.onAttach!(node, circuitBreakerHandler.defaultConfig as any, ctx);
    expect(node.__circuitBreakerState).toBeDefined();
    expect(node.__circuitBreakerState.breaker).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('circuit_breaker_attached', expect.any(Object));
  });

  it('circuitBreakerHandler detaches and emits metrics', () => {
    const node = makeNode();
    const ctx = makeContext();
    circuitBreakerHandler.onAttach!(node, circuitBreakerHandler.defaultConfig as any, ctx);
    circuitBreakerHandler.onDetach!(node, circuitBreakerHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('circuit_breaker_detached', expect.objectContaining({ metrics: expect.any(Object) }));
    expect(node.__circuitBreakerState).toBeUndefined();
  });

  it('retryHandler attaches execute wrapper', () => {
    const node = makeNode();
    const ctx = makeContext();
    retryHandler.onAttach!(node, retryHandler.defaultConfig as any, ctx);
    expect(node.__retryState).toBeDefined();
    expect(typeof node.__retryState.execute).toBe('function');
    expect(ctx.emit).toHaveBeenCalledWith('retry_attached', expect.any(Object));
  });

  it('retryHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    retryHandler.onAttach!(node, retryHandler.defaultConfig as any, ctx);
    retryHandler.onDetach!(node, retryHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('retry_detached', expect.any(Object));
    expect(node.__retryState).toBeUndefined();
  });

  it('timeoutHandler attaches execute wrapper', () => {
    const node = makeNode();
    const ctx = makeContext();
    timeoutHandler.onAttach!(node, timeoutHandler.defaultConfig as any, ctx);
    expect(node.__timeoutState).toBeDefined();
    expect(typeof node.__timeoutState.execute).toBe('function');
    expect(ctx.emit).toHaveBeenCalledWith('timeout_attached', expect.any(Object));
  });

  it('timeoutHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    timeoutHandler.onAttach!(node, timeoutHandler.defaultConfig as any, ctx);
    timeoutHandler.onDetach!(node, timeoutHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('timeout_detached', expect.any(Object));
    expect(node.__timeoutState).toBeUndefined();
  });

  it('fallbackHandler attaches execute wrapper', () => {
    const node = makeNode();
    const ctx = makeContext();
    fallbackHandler.onAttach!(node, fallbackHandler.defaultConfig as any, ctx);
    expect(node.__fallbackState).toBeDefined();
    expect(typeof node.__fallbackState.execute).toBe('function');
    expect(ctx.emit).toHaveBeenCalledWith('fallback_attached', expect.any(Object));
  });

  it('fallbackHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    fallbackHandler.onAttach!(node, fallbackHandler.defaultConfig as any, ctx);
    fallbackHandler.onDetach!(node, fallbackHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('fallback_detached', expect.any(Object));
    expect(node.__fallbackState).toBeUndefined();
  });

  it('bulkheadHandler attaches bulkhead state and emits event', () => {
    const node = makeNode();
    const ctx = makeContext();
    bulkheadHandler.onAttach!(node, bulkheadHandler.defaultConfig as any, ctx);
    expect(node.__bulkheadState).toBeDefined();
    expect(node.__bulkheadState.bulkhead).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('bulkhead_attached', expect.any(Object));
  });

  it('bulkheadHandler detaches and emits metrics', () => {
    const node = makeNode();
    const ctx = makeContext();
    bulkheadHandler.onAttach!(node, bulkheadHandler.defaultConfig as any, ctx);
    bulkheadHandler.onDetach!(node, bulkheadHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('bulkhead_detached', expect.objectContaining({ metrics: expect.any(Object) }));
    expect(node.__bulkheadState).toBeUndefined();
  });
});

describe('v6 Metric Trait Adapters', () => {
  it('metricHandler attaches adapter and emits event', () => {
    const node = makeNode();
    const ctx = makeContext();
    metricHandler.onAttach!(node, metricHandler.defaultConfig as any, ctx);
    expect(node.__metricState).toBeDefined();
    expect(node.__metricState.adapter).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('metric_attached', expect.any(Object));
  });

  it('metricHandler adapter supports increment, gauge, observe and snapshot', () => {
    const node = makeNode();
    const ctx = makeContext();
    metricHandler.onAttach!(node, metricHandler.defaultConfig as any, ctx);
    const { adapter } = node.__metricState;
    adapter.increment('req_count', 1, { method: 'GET' });
    adapter.gauge('active_users', 42);
    adapter.observe('latency', 120);
    const snap = adapter.snapshot();
    expect(snap.counters.req_count).toBe(1);
    expect(snap.gauges.active_users).toBe(42);
    expect(snap.histograms.latency.count).toBe(1);
  });

  it('metricHandler detaches and emits snapshot', () => {
    const node = makeNode();
    const ctx = makeContext();
    metricHandler.onAttach!(node, metricHandler.defaultConfig as any, ctx);
    metricHandler.onDetach!(node, metricHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('metric_detached', expect.objectContaining({ snapshot: expect.any(Object) }));
    expect(node.__metricState).toBeUndefined();
  });

  it('traceHandler attaches trace state', () => {
    const node = makeNode();
    const ctx = makeContext();
    traceHandler.onAttach!(node, traceHandler.defaultConfig as any, ctx);
    expect(node.__traceState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('trace_attached', expect.any(Object));
  });

  it('traceHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    traceHandler.onAttach!(node, traceHandler.defaultConfig as any, ctx);
    traceHandler.onDetach!(node, traceHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('trace_detached', expect.any(Object));
    expect(node.__traceState).toBeUndefined();
  });

  it('logHandler attaches logger and emits event', () => {
    const node = makeNode();
    const ctx = makeContext();
    logHandler.onAttach!(node, logHandler.defaultConfig as any, ctx);
    expect(node.__logState).toBeDefined();
    expect(typeof node.__logState.log).toBe('function');
    expect(ctx.emit).toHaveBeenCalledWith('log_attached', expect.any(Object));
  });

  it('logHandler log function emits log_entry', () => {
    const node = makeNode();
    const ctx = makeContext();
    logHandler.onAttach!(node, logHandler.defaultConfig as any, ctx);
    node.__logState.log('info', 'hello', { extra: 1 });
    expect(ctx.emit).toHaveBeenCalledWith('log_entry', expect.objectContaining({ level: 'info', message: 'hello' }));
  });

  it('logHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    logHandler.onAttach!(node, logHandler.defaultConfig as any, ctx);
    logHandler.onDetach!(node, logHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('log_detached', expect.any(Object));
    expect(node.__logState).toBeUndefined();
  });

  it('healthCheckHandler attaches health state', () => {
    const node = makeNode();
    const ctx = makeContext();
    healthCheckHandler.onAttach!(node, healthCheckHandler.defaultConfig as any, ctx);
    expect(node.__healthCheckState).toBeDefined();
    expect(node.__healthCheckState.registry).toBeInstanceOf(Map);
    expect(ctx.emit).toHaveBeenCalledWith('health_check_attached', expect.any(Object));
  });

  it('healthCheckHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    healthCheckHandler.onAttach!(node, healthCheckHandler.defaultConfig as any, ctx);
    healthCheckHandler.onDetach!(node, healthCheckHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('health_check_detached', expect.any(Object));
    expect(node.__healthCheckState).toBeUndefined();
  });
});

describe('v6 Pipeline Trait Adapters', () => {
  it('pipelineHandler attaches pipeline state', () => {
    const node = makeNode();
    const ctx = makeContext();
    pipelineHandler.onAttach!(node, pipelineHandler.defaultConfig as any, ctx);
    expect(node.__pipelineState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('pipeline_attached', expect.any(Object));
  });

  it('pipelineHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    pipelineHandler.onAttach!(node, pipelineHandler.defaultConfig as any, ctx);
    pipelineHandler.onDetach!(node, pipelineHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('pipeline_detached', expect.any(Object));
    expect(node.__pipelineState).toBeUndefined();
  });

  it('streamHandler attaches stream state', () => {
    const node = makeNode();
    const ctx = makeContext();
    streamHandler.onAttach!(node, streamHandler.defaultConfig as any, ctx);
    expect(node.__streamState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('stream_attached', expect.any(Object));
  });

  it('streamHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    streamHandler.onAttach!(node, streamHandler.defaultConfig as any, ctx);
    streamHandler.onDetach!(node, streamHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('stream_detached', expect.any(Object));
    expect(node.__streamState).toBeUndefined();
  });

  it('queueHandler attaches queue state', () => {
    const node = makeNode();
    const ctx = makeContext();
    queueHandler.onAttach!(node, queueHandler.defaultConfig as any, ctx);
    expect(node.__queueState).toBeDefined();
    expect(node.__queueState.jobs).toEqual([]);
    expect(ctx.emit).toHaveBeenCalledWith('queue_attached', expect.any(Object));
  });

  it('queueHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    queueHandler.onAttach!(node, queueHandler.defaultConfig as any, ctx);
    queueHandler.onDetach!(node, queueHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('queue_detached', expect.any(Object));
    expect(node.__queueState).toBeUndefined();
  });

  it('workerHandler attaches worker state', () => {
    const node = makeNode();
    const ctx = makeContext();
    workerHandler.onAttach!(node, workerHandler.defaultConfig as any, ctx);
    expect(node.__workerState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('worker_attached', expect.any(Object));
  });

  it('workerHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    workerHandler.onAttach!(node, workerHandler.defaultConfig as any, ctx);
    workerHandler.onDetach!(node, workerHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('worker_detached', expect.any(Object));
    expect(node.__workerState).toBeUndefined();
  });

  it('schedulerHandler attaches scheduler state', () => {
    const node = makeNode();
    const ctx = makeContext();
    schedulerHandler.onAttach!(node, schedulerHandler.defaultConfig as any, ctx);
    expect(node.__schedulerState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('scheduler_attached', expect.any(Object));
  });

  it('schedulerHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    schedulerHandler.onAttach!(node, schedulerHandler.defaultConfig as any, ctx);
    schedulerHandler.onDetach!(node, schedulerHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('scheduler_detached', expect.any(Object));
    expect(node.__schedulerState).toBeUndefined();
  });
});

describe('v6 Data Trait Adapters', () => {
  it('dbHandler attaches database state', () => {
    const node = makeNode();
    const ctx = makeContext();
    dbHandler.onAttach!(node, dbHandler.defaultConfig as any, ctx);
    expect(node.__dbState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('db_attached', expect.any(Object));
  });

  it('dbHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    dbHandler.onAttach!(node, dbHandler.defaultConfig as any, ctx);
    dbHandler.onDetach!(node, dbHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('db_detached', expect.any(Object));
    expect(node.__dbState).toBeUndefined();
  });

  it('modelHandler attaches model state', () => {
    const node = makeNode();
    const ctx = makeContext();
    modelHandler.onAttach!(node, modelHandler.defaultConfig as any, ctx);
    expect(node.__modelState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('model_attached', expect.any(Object));
  });

  it('modelHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    modelHandler.onAttach!(node, modelHandler.defaultConfig as any, ctx);
    modelHandler.onDetach!(node, modelHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('model_detached', expect.any(Object));
    expect(node.__modelState).toBeUndefined();
  });

  it('queryHandler attaches query state', () => {
    const node = makeNode();
    const ctx = makeContext();
    queryHandler.onAttach!(node, queryHandler.defaultConfig as any, ctx);
    expect(node.__queryState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('query_attached', expect.any(Object));
  });

  it('queryHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    queryHandler.onAttach!(node, queryHandler.defaultConfig as any, ctx);
    queryHandler.onDetach!(node, queryHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('query_detached', expect.any(Object));
    expect(node.__queryState).toBeUndefined();
  });

  it('migrationHandler attaches migration state', () => {
    const node = makeNode();
    const ctx = makeContext();
    migrationHandler.onAttach!(node, migrationHandler.defaultConfig as any, ctx);
    expect(node.__migrationState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('migration_attached', expect.any(Object));
  });

  it('migrationHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    migrationHandler.onAttach!(node, migrationHandler.defaultConfig as any, ctx);
    migrationHandler.onDetach!(node, migrationHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('migration_detached', expect.any(Object));
    expect(node.__migrationState).toBeUndefined();
  });

  it('cacheHandler attaches cache adapter', () => {
    const node = makeNode();
    const ctx = makeContext();
    cacheHandler.onAttach!(node, cacheHandler.defaultConfig as any, ctx);
    expect(node.__cacheState).toBeDefined();
    expect(node.__cacheState.adapter).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('cache_attached', expect.any(Object));
  });

  it('cacheHandler adapter supports get, set, invalidate, flush, and stats', () => {
    const node = makeNode();
    const ctx = makeContext();
    cacheHandler.onAttach!(node, cacheHandler.defaultConfig as any, ctx);
    const { adapter } = node.__cacheState;
    adapter.set('a', 1, 10);
    expect(adapter.get('a')).toBe(1);
    adapter.invalidate('a');
    expect(adapter.get('a')).toBeUndefined();
    adapter.set('b', 2);
    adapter.flush();
    expect(adapter.stats().size).toBe(0);
  });

  it('cacheHandler detaches and flushes', () => {
    const node = makeNode();
    const ctx = makeContext();
    cacheHandler.onAttach!(node, cacheHandler.defaultConfig as any, ctx);
    cacheHandler.onDetach!(node, cacheHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('cache_detached', expect.any(Object));
    expect(node.__cacheState).toBeUndefined();
  });
});

describe('v6 Contract Trait Adapters', () => {
  it('contractHandler attaches contract state', () => {
    const node = makeNode();
    const ctx = makeContext();
    contractHandler.onAttach!(node, contractHandler.defaultConfig as any, ctx);
    expect(node.__contractState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('contract_attached', expect.any(Object));
  });

  it('contractHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    contractHandler.onAttach!(node, contractHandler.defaultConfig as any, ctx);
    contractHandler.onDetach!(node, contractHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('contract_detached', expect.any(Object));
    expect(node.__contractState).toBeUndefined();
  });

  it('schemaHandler attaches schema with validate function', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = {
      name: 'User',
      fields: { id: 'uuid', email: 'email' } as Record<string, string>,
      required: ['id', 'email'],
      extends: '',
      additional_properties: false,
      description: '',
    };
    schemaHandler.onAttach!(node, config as any, ctx);
    expect(node.__schemaState).toBeDefined();
    expect(typeof node.__schemaState.validate).toBe('function');
    expect(ctx.emit).toHaveBeenCalledWith('schema_attached', expect.any(Object));
  });

  it('schemaHandler validate rejects missing required fields', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = {
      name: 'User',
      fields: { id: 'uuid', email: 'email' } as Record<string, string>,
      required: ['id', 'email'],
      extends: '',
      additional_properties: false,
      description: '',
    };
    schemaHandler.onAttach!(node, config as any, ctx);
    const result = node.__schemaState.validate({ id: 'abc' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('email'))).toBe(true);
  });

  it('schemaHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    schemaHandler.onAttach!(node, schemaHandler.defaultConfig as any, ctx);
    schemaHandler.onDetach!(node, schemaHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('schema_detached', expect.any(Object));
    expect(node.__schemaState).toBeUndefined();
  });

  it('validatorHandler attaches validator state', () => {
    const node = makeNode();
    const ctx = makeContext();
    validatorHandler.onAttach!(node, validatorHandler.defaultConfig as any, ctx);
    expect(node.__validatorState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('validator_attached', expect.any(Object));
  });

  it('validatorHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    validatorHandler.onAttach!(node, validatorHandler.defaultConfig as any, ctx);
    validatorHandler.onDetach!(node, validatorHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('validator_detached', expect.any(Object));
    expect(node.__validatorState).toBeUndefined();
  });

  it('serializerHandler attaches serializer with serialize function', () => {
    const node = makeNode();
    const ctx = makeContext();
    serializerHandler.onAttach!(node, serializerHandler.defaultConfig as any, ctx);
    expect(node.__serializerState).toBeDefined();
    expect(typeof node.__serializerState.serialize).toBe('function');
    expect(ctx.emit).toHaveBeenCalledWith('serializer_attached', expect.any(Object));
  });

  it('serializerHandler serialize produces JSON with renamed keys', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = {
      target: 'User',
      format: 'json' as const,
      include_nulls: false,
      rename_strategy: 'camelCase' as const,
      field_map: {},
    };
    serializerHandler.onAttach!(node, config as any, ctx);
    const json = node.__serializerState.serialize({ user_name: 'Alice', is_active: true });
    expect(JSON.parse(json as string)).toEqual({ userName: 'Alice', isActive: true });
  });

  it('serializerHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    serializerHandler.onAttach!(node, serializerHandler.defaultConfig as any, ctx);
    serializerHandler.onDetach!(node, serializerHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('serializer_detached', expect.any(Object));
    expect(node.__serializerState).toBeUndefined();
  });
});

describe('v6 Container Trait Adapters', () => {
  it('containerHandler attaches container state', () => {
    const node = makeNode();
    const ctx = makeContext();
    containerHandler.onAttach!(node, containerHandler.defaultConfig as any, ctx);
    expect(node.__containerState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('container_attached', expect.any(Object));
  });

  it('containerHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    containerHandler.onAttach!(node, containerHandler.defaultConfig as any, ctx);
    containerHandler.onDetach!(node, containerHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('container_detached', expect.any(Object));
    expect(node.__containerState).toBeUndefined();
  });

  it('deploymentHandler attaches deployment state', () => {
    const node = makeNode();
    const ctx = makeContext();
    deploymentHandler.onAttach!(node, deploymentHandler.defaultConfig as any, ctx);
    expect(node.__deploymentState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('deployment_attached', expect.any(Object));
  });

  it('deploymentHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    deploymentHandler.onAttach!(node, deploymentHandler.defaultConfig as any, ctx);
    deploymentHandler.onDetach!(node, deploymentHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('deployment_detached', expect.any(Object));
    expect(node.__deploymentState).toBeUndefined();
  });

  it('scalingHandler attaches scaling state', () => {
    const node = makeNode();
    const ctx = makeContext();
    scalingHandler.onAttach!(node, scalingHandler.defaultConfig as any, ctx);
    expect(node.__scalingState).toBeDefined();
    expect(ctx.emit).toHaveBeenCalledWith('scaling_attached', expect.any(Object));
  });

  it('scalingHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    scalingHandler.onAttach!(node, scalingHandler.defaultConfig as any, ctx);
    scalingHandler.onDetach!(node, scalingHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('scaling_detached', expect.any(Object));
    expect(node.__scalingState).toBeUndefined();
  });

  it('secretHandler resolves env source and emits attached', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = {
      name: 'API_KEY',
      source: 'env' as const,
      key: 'PATH',
      mount_as: 'API_KEY',
      rotation_interval: 0,
      required: true,
    };
    secretHandler.onAttach!(node, config as any, ctx);
    expect(node.__secretState).toBeDefined();
    expect(node.__secretState.resolved).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('secret_attached', expect.any(Object));
  });

  it('secretHandler emits missing when required env var absent', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = {
      name: 'MISSING',
      source: 'env' as const,
      key: 'THIS_VAR_DOES_NOT_EXIST_12345',
      mount_as: 'MISSING',
      rotation_interval: 0,
      required: true,
    };
    secretHandler.onAttach!(node, config as any, ctx);
    expect(node.__secretState.resolved).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('secret_missing', expect.any(Object));
  });

  it('secretHandler detaches cleanly', () => {
    const node = makeNode();
    const ctx = makeContext();
    secretHandler.onAttach!(node, secretHandler.defaultConfig as any, ctx);
    secretHandler.onDetach!(node, secretHandler.defaultConfig as any, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('secret_detached', expect.any(Object));
    expect(node.__secretState).toBeUndefined();
  });
});
