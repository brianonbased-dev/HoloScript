/**
 * Compute Trait
 *
 * GPU compute shader execution for parallel processing.
 * Supports WGSL shaders and structured buffer bindings.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type BufferUsage = 'read' | 'write' | 'read_write';
type DataType = 'f32' | 'i32' | 'u32' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'struct';

interface BufferBinding {
  name: string;
  group: number;
  binding: number;
  usage: BufferUsage;
  dataType: DataType;
  size: number;
}

interface ComputeState {
  isReady: boolean;
  shaderModule: unknown;
  pipeline: unknown;
  bindGroups: Map<number, unknown>;
  buffers: Map<string, unknown>;
  lastDispatchTime: number;
  executionCount: number;
}

interface ComputeConfig {
  workgroup_size: [number, number, number];
  dispatch: [number, number, number];
  shader_source: string;
  bindings: Record<string, BufferBinding>;
  auto_dispatch: boolean;
  dispatch_on_update: boolean;
  shared_memory_size: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const computeHandler: TraitHandler<ComputeConfig> = {
  name: 'compute',

  defaultConfig: {
    workgroup_size: [64, 1, 1],
    dispatch: [1, 1, 1],
    shader_source: '',
    bindings: {},
    auto_dispatch: false,
    dispatch_on_update: false,
    shared_memory_size: 0,
  },

  onAttach(node, config, context) {
    const state: ComputeState = {
      isReady: false,
      shaderModule: null,
      pipeline: null,
      bindGroups: new Map(),
      buffers: new Map(),
      lastDispatchTime: 0,
      executionCount: 0,
    };
    (node as any).__computeState = state;

    if (config.shader_source) {
      context.emit?.('compute_init', {
        node,
        shaderSource: config.shader_source,
        workgroupSize: config.workgroup_size,
        bindings: config.bindings,
        sharedMemorySize: config.shared_memory_size,
      });
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__computeState as ComputeState;
    if (state?.isReady) {
      context.emit?.('compute_destroy', {
        node,
        buffers: Array.from(state.buffers.keys()),
      });
    }
    delete (node as any).__computeState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__computeState as ComputeState;
    if (!state || !state.isReady) return;

    if (config.dispatch_on_update) {
      state.lastDispatchTime = Date.now();
      context.emit?.('compute_execute', {
        node,
        pipeline: state.pipeline,
        bindGroups: Array.from(state.bindGroups.values()),
        dispatch: config.dispatch,
        workgroupSize: config.workgroup_size,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__computeState as ComputeState;
    if (!state) return;

    if (event.type === 'compute_initialized') {
      state.isReady = true;
      state.shaderModule = event.shaderModule;
      state.pipeline = event.pipeline;

      context.emit?.('on_compute_ready', { node });
    } else if (event.type === 'compute_dispatch') {
      if (!state.isReady) {
        context.emit?.('on_compute_error', {
          node,
          error: 'Compute not initialized',
        });
        return;
      }

      const dispatch = (event.dispatch as [number, number, number]) || config.dispatch;
      state.lastDispatchTime = Date.now();

      context.emit?.('compute_execute', {
        node,
        pipeline: state.pipeline,
        bindGroups: Array.from(state.bindGroups.values()),
        dispatch,
        workgroupSize: config.workgroup_size,
      });
    } else if (event.type === 'compute_dispatch_indirect') {
      context.emit?.('compute_execute_indirect', {
        node,
        pipeline: state.pipeline,
        bindGroups: Array.from(state.bindGroups.values()),
        indirectBuffer: event.buffer,
        offset: (event.offset as number) || 0,
      });
    } else if (event.type === 'compute_write_buffer') {
      const bufferName = event.buffer as string;
      const bufferHandle = state.buffers.get(bufferName);

      if (!bufferHandle) {
        context.emit?.('on_compute_error', {
          node,
          error: `Buffer not found: ${bufferName}`,
        });
        return;
      }

      context.emit?.('compute_buffer_write', {
        node,
        buffer: bufferHandle,
        data: event.data,
        offset: (event.offset as number) || 0,
      });
    } else if (event.type === 'compute_read_buffer') {
      const bufferName = event.buffer as string;
      const bufferHandle = state.buffers.get(bufferName);

      if (!bufferHandle) {
        context.emit?.('compute_buffer_read_error', {
          node,
          error: `Buffer not found: ${bufferName}`,
          callbackId: event.callbackId,
        });
        return;
      }

      context.emit?.('compute_buffer_read', {
        node,
        buffer: bufferHandle,
        bufferName,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'compute_buffer_data') {
      context.emit?.('on_compute_data', {
        node,
        bufferName: event.bufferName,
        data: event.data,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'compute_create_buffer') {
      const binding = event.binding as BufferBinding;
      const typeSize = getSizeOfType(binding.dataType);

      context.emit?.('compute_allocate_buffer', {
        node,
        name: binding.name,
        size: binding.size * typeSize,
        usage: binding.usage,
        group: binding.group,
        bindingIndex: binding.binding,
      });
    } else if (event.type === 'compute_buffer_created') {
      state.buffers.set(event.name as string, event.handle);

      context.emit?.('compute_update_bind_group', {
        node,
        group: event.group,
        buffers: Array.from(state.buffers.entries()),
      });
    } else if (event.type === 'compute_bind_group_created') {
      state.bindGroups.set(event.group as number, event.handle);
    } else if (event.type === 'compute_set_shader') {
      context.emit?.('compute_compile_shader', {
        node,
        source: event.source,
        workgroupSize: config.workgroup_size,
        bindings: config.bindings,
      });
    } else if (event.type === 'compute_complete') {
      state.executionCount++;

      context.emit?.('on_compute_complete', {
        node,
        executionTime: event.executionTime,
        executionCount: state.executionCount,
      });
    } else if (event.type === 'compute_error') {
      context.emit?.('on_compute_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'compute_query') {
      context.emit?.('compute_info', {
        queryId: event.queryId,
        node,
        isReady: state.isReady,
        executionCount: state.executionCount,
        bufferCount: state.buffers.size,
        lastDispatchTime: state.lastDispatchTime,
        workgroupSize: config.workgroup_size,
        dispatch: config.dispatch,
      });
    }
  },
};

function getSizeOfType(dataType: DataType): number {
  const sizes: Record<DataType, number> = {
    f32: 4,
    i32: 4,
    u32: 4,
    vec2: 8,
    vec3: 12,
    vec4: 16,
    mat4: 64,
    struct: 0,
  };
  return sizes[dataType] || 4;
}

export default computeHandler;
