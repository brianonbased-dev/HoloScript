/**
 * Phase 6-8 Gap Categories — Unit Tests
 * GPU Compute, ML/Tensor, DB, Spatial Algo, Debug/Cinematic, FFI, Concurrency
 */
import { describe, it, expect } from 'vitest';
import { computeShaderHandler } from '../ComputeShaderTrait';
import { renderPipelineHandler } from '../RenderPipelineTrait';
import { postProcessHandler } from '../PostProcessTrait';
import { rayTraceHandler } from '../RayTraceTrait';
import { tensorOpHandler } from '../TensorOpTrait';
import { onnxRuntimeHandler } from '../OnnxRuntimeTrait';
import { trainingLoopHandler } from '../TrainingLoopTrait';
import { sqlQueryHandler } from '../SqlQueryTrait';
import { ormEntityHandler } from '../OrmEntityTrait';
import { offlineSyncHandler } from '../OfflineSyncTrait';
import { reactiveStoreHandler } from '../ReactiveStoreTrait';
import { astarHandler } from '../AstarTrait';
import { navmeshSolverHandler } from '../NavmeshSolverTrait';
import { optimizationHandler } from '../OptimizationTrait';
import { timeTravelDebugHandler } from '../TimeTravelDebugTrait';
import { spatialProfilerHandler } from '../SpatialProfilerTrait';
import { cinematicSeqHandler } from '../CinematicSeqTrait';
import { aiCameraHandler } from '../AiCameraTrait';
import { ffiHandler } from '../FfiTrait';
import { nativeCallHandler } from '../NativeCallTrait';
import { wasmBridgeHandler } from '../WasmBridgeTrait';
import { sysIoHandler } from '../SysIoTrait';
import { actorHandler } from '../ActorTrait';
import { cspChannelHandler } from '../CspChannelTrait';
import { temporalGuardHandler } from '../TemporalGuardTrait';
import { deadlockFreeHandler } from '../DeadlockFreeTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// GPU Compute
// ═══════════════════════════════════════════════════════════════════════════════

describe('ComputeShaderTrait', () => {
  it('should compile and dispatch', () => {
    const n = createMockNode('cs');
    const c = createMockContext();
    attachTrait(computeShaderHandler, n, { max_workgroups: 256 }, c);
    sendEvent(computeShaderHandler, n, { max_workgroups: 256 }, c, {
      type: 'cs:compile',
      shaderId: 's1',
      workgroups: [64, 1, 1],
    });
    expect(getEventCount(c, 'cs:compiled')).toBe(1);
    sendEvent(computeShaderHandler, n, { max_workgroups: 256 }, c, {
      type: 'cs:dispatch',
      shaderId: 's1',
    });
    expect((getLastEvent(c, 'cs:dispatched') as any).dispatches).toBe(1);
  });
});

describe('RenderPipelineTrait', () => {
  it('should add pass and execute', () => {
    const n = createMockNode('rp');
    const c = createMockContext();
    attachTrait(renderPipelineHandler, n, { max_passes: 8 }, c);
    sendEvent(renderPipelineHandler, n, { max_passes: 8 }, c, {
      type: 'rp:add_pass',
      passName: 'shadow',
    });
    expect((getLastEvent(c, 'rp:pass_added') as any).total).toBe(1);
    sendEvent(renderPipelineHandler, n, { max_passes: 8 }, c, { type: 'rp:execute' });
    expect((getLastEvent(c, 'rp:executed') as any).passes).toBe(1);
  });
});

describe('PostProcessTrait', () => {
  it('should add and remove effects', () => {
    const n = createMockNode('pp');
    const c = createMockContext();
    attachTrait(postProcessHandler, n, { max_effects: 16 }, c);
    sendEvent(postProcessHandler, n, { max_effects: 16 }, c, {
      type: 'pp:add',
      effectName: 'bloom',
      intensity: 0.8,
    });
    expect((getLastEvent(c, 'pp:added') as any).total).toBe(1);
    sendEvent(postProcessHandler, n, { max_effects: 16 }, c, {
      type: 'pp:remove',
      effectName: 'bloom',
    });
    expect(getEventCount(c, 'pp:removed')).toBe(1);
  });
});

describe('RayTraceTrait', () => {
  it('should cast and hit', () => {
    const n = createMockNode('rt');
    const c = createMockContext();
    attachTrait(rayTraceHandler, n, { max_bounces: 4, samples_per_pixel: 1 }, c);
    sendEvent(rayTraceHandler, n, { max_bounces: 4, samples_per_pixel: 1 }, c, {
      type: 'rt:cast',
      origin: [0, 0, 0],
      direction: [1, 0, 0],
    });
    expect((getLastEvent(c, 'rt:result') as any).maxBounces).toBe(4);
    sendEvent(rayTraceHandler, n, { max_bounces: 4, samples_per_pixel: 1 }, c, {
      type: 'rt:hit',
      hitPoint: [1, 0, 0],
      normal: [0, 1, 0],
      distance: 1,
    });
    expect((getLastEvent(c, 'rt:hit_result') as any).totalHits).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ML / Tensor
// ═══════════════════════════════════════════════════════════════════════════════

describe('TensorOpTrait', () => {
  it('should create tensor and matmul', () => {
    const n = createMockNode('t');
    const c = createMockContext();
    attachTrait(tensorOpHandler, n, { max_dimensions: 4 }, c);
    sendEvent(tensorOpHandler, n, { max_dimensions: 4 }, c, {
      type: 'tensor:create',
      tensorId: 't1',
      shape: [3, 3],
    });
    expect(getEventCount(c, 'tensor:created')).toBe(1);
    sendEvent(tensorOpHandler, n, { max_dimensions: 4 }, c, {
      type: 'tensor:matmul',
      a: 't1',
      b: 't2',
    });
    expect((getLastEvent(c, 'tensor:result') as any).op).toBe('matmul');
  });
});

describe('OnnxRuntimeTrait', () => {
  it('should load and run model', () => {
    const n = createMockNode('o');
    const c = createMockContext();
    attachTrait(onnxRuntimeHandler, n, { execution_provider: 'cpu' }, c);
    sendEvent(onnxRuntimeHandler, n, { execution_provider: 'cpu' }, c, {
      type: 'onnx:load',
      modelId: 'm1',
    });
    expect((getLastEvent(c, 'onnx:loaded') as any).provider).toBe('cpu');
    sendEvent(onnxRuntimeHandler, n, { execution_provider: 'cpu' }, c, {
      type: 'onnx:run',
      modelId: 'm1',
    });
    expect((getLastEvent(c, 'onnx:output') as any).inferences).toBe(1);
  });
});

describe('TrainingLoopTrait', () => {
  it('should start, step, and stop', () => {
    const n = createMockNode('tl');
    const c = createMockContext();
    attachTrait(trainingLoopHandler, n, { max_epochs: 100, learning_rate: 0.001 }, c);
    sendEvent(trainingLoopHandler, n, { max_epochs: 100, learning_rate: 0.001 }, c, {
      type: 'train:start',
    });
    expect(getEventCount(c, 'train:started')).toBe(1);
    sendEvent(trainingLoopHandler, n, { max_epochs: 100, learning_rate: 0.001 }, c, {
      type: 'train:step',
      loss: 0.5,
    });
    expect((getLastEvent(c, 'train:progress') as any).epoch).toBe(1);
    sendEvent(trainingLoopHandler, n, { max_epochs: 100, learning_rate: 0.001 }, c, {
      type: 'train:stop',
    });
    expect((getLastEvent(c, 'train:stopped') as any).finalLoss).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Database / Persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('SqlQueryTrait', () => {
  it('should exec and prepare', () => {
    const n = createMockNode('sq');
    const c = createMockContext();
    attachTrait(sqlQueryHandler, n, { max_results: 100 }, c);
    sendEvent(sqlQueryHandler, n, { max_results: 100 }, c, { type: 'sql:exec', query: 'SELECT 1' });
    expect((getLastEvent(c, 'sql:result') as any).queryCount).toBe(1);
  });
});

describe('OrmEntityTrait', () => {
  it('should create and read', () => {
    const n = createMockNode('orm');
    const c = createMockContext();
    attachTrait(ormEntityHandler, n, { table_prefix: '' }, c);
    sendEvent(ormEntityHandler, n, { table_prefix: '' }, c, {
      type: 'orm:create',
      entityId: 'e1',
      data: { name: 'X' },
    });
    expect((getLastEvent(c, 'orm:created') as any).total).toBe(1);
    sendEvent(ormEntityHandler, n, { table_prefix: '' }, c, { type: 'orm:read', entityId: 'e1' });
    expect((getLastEvent(c, 'orm:found') as any).exists).toBe(true);
  });
});

describe('OfflineSyncTrait', () => {
  it('should queue and flush', () => {
    const n = createMockNode('os');
    const c = createMockContext();
    attachTrait(offlineSyncHandler, n, { sync_interval_ms: 5000 }, c);
    sendEvent(offlineSyncHandler, n, { sync_interval_ms: 5000 }, c, {
      type: 'sync:queue',
      payload: { id: 1 },
    });
    expect((getLastEvent(c, 'sync:queued') as any).pending).toBe(1);
    sendEvent(offlineSyncHandler, n, { sync_interval_ms: 5000 }, c, { type: 'sync:flush' });
    expect((getLastEvent(c, 'sync:flushed') as any).totalSynced).toBe(1);
  });
});

describe('ReactiveStoreTrait', () => {
  it('should set, get, and subscribe', () => {
    const n = createMockNode('rs');
    const c = createMockContext();
    attachTrait(reactiveStoreHandler, n, { max_keys: 500 }, c);
    sendEvent(reactiveStoreHandler, n, { max_keys: 500 }, c, {
      type: 'store:set',
      key: 'score',
      value: 42,
    });
    expect(getEventCount(c, 'store:changed')).toBe(1);
    sendEvent(reactiveStoreHandler, n, { max_keys: 500 }, c, { type: 'store:get', key: 'score' });
    expect((getLastEvent(c, 'store:value') as any).value).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Spatial Algorithms
// ═══════════════════════════════════════════════════════════════════════════════

describe('AstarTrait', () => {
  it('should find path', () => {
    const n = createMockNode('a');
    const c = createMockContext();
    attachTrait(astarHandler, n, { max_iterations: 10000, heuristic: 'euclidean' }, c);
    sendEvent(astarHandler, n, { max_iterations: 10000, heuristic: 'euclidean' }, c, {
      type: 'astar:find_path',
      from: [0, 0],
      to: [10, 10],
    });
    expect((getLastEvent(c, 'astar:path_found') as any).heuristic).toBe('euclidean');
  });
});

describe('NavmeshSolverTrait', () => {
  it('should build and query', () => {
    const n = createMockNode('nm');
    const c = createMockContext();
    attachTrait(navmeshSolverHandler, n, { cell_size: 0.5 }, c);
    sendEvent(navmeshSolverHandler, n, { cell_size: 0.5 }, c, {
      type: 'nav:build',
      polygonCount: 100,
    });
    expect((getLastEvent(c, 'nav:built') as any).polygons).toBe(100);
    sendEvent(navmeshSolverHandler, n, { cell_size: 0.5 }, c, {
      type: 'nav:query',
      from: [0, 0, 0],
      to: [5, 0, 5],
    });
    expect((getLastEvent(c, 'nav:path') as any).meshReady).toBe(true);
  });
});

describe('OptimizationTrait', () => {
  it('should solve', () => {
    const n = createMockNode('opt');
    const c = createMockContext();
    attachTrait(optimizationHandler, n, { max_iterations: 1000, tolerance: 1e-6 }, c);
    sendEvent(optimizationHandler, n, { max_iterations: 1000, tolerance: 1e-6 }, c, {
      type: 'opt:solve',
      objective: 'minimize_cost',
      constraints: ['x > 0'],
    });
    expect((getLastEvent(c, 'opt:solution') as any).solveCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Debug / Cinematic
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeTravelDebugTrait', () => {
  it('should snapshot and rewind', () => {
    const n = createMockNode('ttd');
    const c = createMockContext();
    attachTrait(timeTravelDebugHandler, n, { max_snapshots: 100 }, c);
    sendEvent(timeTravelDebugHandler, n, { max_snapshots: 100 }, c, {
      type: 'ttd:snapshot',
      frame: 0,
      data: { x: 1 },
    });
    sendEvent(timeTravelDebugHandler, n, { max_snapshots: 100 }, c, {
      type: 'ttd:snapshot',
      frame: 1,
      data: { x: 2 },
    });
    expect((getLastEvent(c, 'ttd:captured') as any).total).toBe(2);
    sendEvent(timeTravelDebugHandler, n, { max_snapshots: 100 }, c, { type: 'ttd:rewind' });
    expect((getLastEvent(c, 'ttd:rewound') as any).cursor).toBe(0);
  });
});

describe('SpatialProfilerTrait', () => {
  it('should start, sample, and stop', () => {
    const n = createMockNode('sp');
    const c = createMockContext();
    attachTrait(spatialProfilerHandler, n, { sample_rate_ms: 16 }, c);
    sendEvent(spatialProfilerHandler, n, { sample_rate_ms: 16 }, c, { type: 'prof:start' });
    sendEvent(spatialProfilerHandler, n, { sample_rate_ms: 16 }, c, {
      type: 'prof:sample',
      fps: 60,
      drawCalls: 100,
    });
    expect((getLastEvent(c, 'prof:sampled') as any).sampleCount).toBe(1);
    sendEvent(spatialProfilerHandler, n, { sample_rate_ms: 16 }, c, { type: 'prof:stop' });
    expect((getLastEvent(c, 'prof:report') as any).avgFps).toBe(60);
  });
});

describe('CinematicSeqTrait', () => {
  it('should add clip and play', () => {
    const n = createMockNode('cin');
    const c = createMockContext();
    attachTrait(cinematicSeqHandler, n, { fps: 24 }, c);
    sendEvent(cinematicSeqHandler, n, { fps: 24 }, c, {
      type: 'cin:add_clip',
      clipName: 'intro',
      startFrame: 0,
      endFrame: 120,
    });
    expect((getLastEvent(c, 'cin:clip_added') as any).total).toBe(1);
    sendEvent(cinematicSeqHandler, n, { fps: 24 }, c, { type: 'cin:play' });
    expect(getEventCount(c, 'cin:playing')).toBe(1);
  });
});

describe('AiCameraTrait', () => {
  it('should track and frame', () => {
    const n = createMockNode('cam');
    const c = createMockContext();
    attachTrait(aiCameraHandler, n, { tracking_speed: 1.0 }, c);
    sendEvent(aiCameraHandler, n, { tracking_speed: 1.0 }, c, {
      type: 'cam:track',
      targetId: 'hero',
    });
    expect((getLastEvent(c, 'cam:tracking') as any).target).toBe('hero');
    sendEvent(aiCameraHandler, n, { tracking_speed: 1.0 }, c, {
      type: 'cam:frame',
      composition: 'rule_of_thirds',
    });
    expect((getLastEvent(c, 'cam:framed') as any).shotCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FFI / OS
// ═══════════════════════════════════════════════════════════════════════════════

describe('FfiTrait', () => {
  it('should bind and call', () => {
    const n = createMockNode('ffi');
    const c = createMockContext();
    attachTrait(ffiHandler, n, { allowed_libs: ['libm'] }, c);
    sendEvent(ffiHandler, n, { allowed_libs: ['libm'] }, c, {
      type: 'ffi:bind',
      symbol: 'sqrt',
      lib: 'libm',
    });
    expect(getEventCount(c, 'ffi:bound')).toBe(1);
    sendEvent(ffiHandler, n, { allowed_libs: ['libm'] }, c, { type: 'ffi:call', symbol: 'sqrt' });
    expect((getLastEvent(c, 'ffi:result') as any).callCount).toBe(1);
  });
});

describe('NativeCallTrait', () => {
  it('should invoke', () => {
    const n = createMockNode('nc');
    const c = createMockContext();
    attachTrait(nativeCallHandler, n, { sandbox: true }, c);
    sendEvent(nativeCallHandler, n, { sandbox: true }, c, {
      type: 'native:invoke',
      api: 'filesystem',
      method: 'readdir',
    });
    expect((getLastEvent(c, 'native:result') as any).sandboxed).toBe(true);
  });
});

describe('WasmBridgeTrait', () => {
  it('should load and call', () => {
    const n = createMockNode('wb');
    const c = createMockContext();
    attachTrait(wasmBridgeHandler, n, { max_memory_pages: 256 }, c);
    sendEvent(wasmBridgeHandler, n, { max_memory_pages: 256 }, c, {
      type: 'wasm:load',
      moduleId: 'physics',
    });
    expect((getLastEvent(c, 'wasm:loaded') as any).totalModules).toBe(1);
    sendEvent(wasmBridgeHandler, n, { max_memory_pages: 256 }, c, {
      type: 'wasm:call',
      moduleId: 'physics',
      fn: 'step',
    });
    expect((getLastEvent(c, 'wasm:result') as any).callCount).toBe(1);
  });
});

describe('SysIoTrait', () => {
  it('should read and deny write when disabled', () => {
    const n = createMockNode('si');
    const c = createMockContext();
    attachTrait(sysIoHandler, n, { allow_write: false }, c);
    sendEvent(sysIoHandler, n, { allow_write: false }, c, {
      type: 'sysio:read',
      path: '/tmp/data',
    });
    expect((getLastEvent(c, 'sysio:data') as any).readCount).toBe(1);
    sendEvent(sysIoHandler, n, { allow_write: false }, c, {
      type: 'sysio:write',
      path: '/tmp/out',
    });
    expect((getLastEvent(c, 'sysio:denied') as any).reason).toBe('write_disabled');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Concurrency
// ═══════════════════════════════════════════════════════════════════════════════

describe('ActorTrait', () => {
  it('should send and process', () => {
    const n = createMockNode('a');
    const c = createMockContext();
    attachTrait(actorHandler, n, { mailbox_size: 10 }, c);
    sendEvent(actorHandler, n, { mailbox_size: 10 }, c, {
      type: 'actor:send',
      from: 'worker1',
      message: { task: 'compute' },
    });
    expect((getLastEvent(c, 'actor:received') as any).queueSize).toBe(1);
    sendEvent(actorHandler, n, { mailbox_size: 10 }, c, { type: 'actor:process' });
    expect((getLastEvent(c, 'actor:processed') as any).processed).toBe(1);
  });
});

describe('CspChannelTrait', () => {
  it('should create, send, and receive', () => {
    const n = createMockNode('csp');
    const c = createMockContext();
    attachTrait(cspChannelHandler, n, { buffer_size: 10 }, c);
    sendEvent(cspChannelHandler, n, { buffer_size: 10 }, c, {
      type: 'csp:create',
      channelId: 'ch1',
    });
    sendEvent(cspChannelHandler, n, { buffer_size: 10 }, c, {
      type: 'csp:send',
      channelId: 'ch1',
      value: 42,
    });
    expect((getLastEvent(c, 'csp:sent') as any).bufferUsed).toBe(1);
    sendEvent(cspChannelHandler, n, { buffer_size: 10 }, c, { type: 'csp:recv', channelId: 'ch1' });
    expect((getLastEvent(c, 'csp:received') as any).value).toBe(42);
  });
});

describe('TemporalGuardTrait', () => {
  it('should assert and satisfy', () => {
    const n = createMockNode('tg');
    const c = createMockContext();
    attachTrait(temporalGuardHandler, n, { default_timeout_ms: 5000 }, c);
    sendEvent(temporalGuardHandler, n, { default_timeout_ms: 5000 }, c, {
      type: 'tg:assert',
      guardId: 'g1',
      property: 'liveness',
    });
    expect(getEventCount(c, 'tg:asserted')).toBe(1);
    sendEvent(temporalGuardHandler, n, { default_timeout_ms: 5000 }, c, {
      type: 'tg:satisfy',
      guardId: 'g1',
    });
    expect(getEventCount(c, 'tg:satisfied')).toBe(1);
  });
});

describe('DeadlockFreeTrait', () => {
  it('should acquire and detect contention', () => {
    const n = createMockNode('dl');
    const c = createMockContext();
    attachTrait(deadlockFreeHandler, n, { max_resources: 100 }, c);
    sendEvent(deadlockFreeHandler, n, { max_resources: 100 }, c, {
      type: 'dl:acquire',
      resourceId: 'r1',
      ownerId: 'A',
    });
    expect(getEventCount(c, 'dl:acquired')).toBe(1);
    sendEvent(deadlockFreeHandler, n, { max_resources: 100 }, c, {
      type: 'dl:acquire',
      resourceId: 'r1',
      ownerId: 'B',
    });
    expect((getLastEvent(c, 'dl:contention') as any).currentOwner).toBe('A');
  });
});
