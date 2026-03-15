/**
 * GPUBuffer Trait
 *
 * Explicit GPU buffer management for compute and rendering.
 * Supports WebGPU buffer types and data transfer.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type BufferUsage =
  | 'storage'
  | 'uniform'
  | 'vertex'
  | 'index'
  | 'indirect'
  | 'copy_src'
  | 'copy_dst';

interface GPUBufferState {
  isAllocated: boolean;
  gpuBuffer: unknown;
  size: number;
  isMapped: boolean;
  lastWriteTime: number;
  pendingWrites: Array<{ offset: number; data: ArrayBuffer }>;
}

interface GPUBufferConfig {
  size: number; // bytes
  usage: BufferUsage | BufferUsage[];
  initial_data: string | ArrayBuffer;
  shared: boolean; // Shared between shaders
  label: string;
  mapped_at_creation: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const gpuBufferHandler: TraitHandler<GPUBufferConfig> = {
  name: 'gpu_buffer',

  defaultConfig: {
    size: 1024,
    usage: 'storage',
    initial_data: '',
    shared: false,
    label: '',
    mapped_at_creation: false,
  },

  onAttach(node, config, context) {
    const state: GPUBufferState = {
      isAllocated: false,
      gpuBuffer: null,
      size: config.size,
      isMapped: false,
      lastWriteTime: 0,
      pendingWrites: [],
    };
    (node as any).__gpuBufferState = state;

    // Create GPU buffer
    context.emit?.('gpu_buffer_create', {
      node,
      size: config.size,
      usage: config.usage,
      label: config.label || `buffer_${Date.now()}`,
      mappedAtCreation: config.mapped_at_creation,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__gpuBufferState as GPUBufferState;
    if (state?.isAllocated) {
      context.emit?.('gpu_buffer_destroy', { node });
    }
    delete (node as any).__gpuBufferState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__gpuBufferState as GPUBufferState;
    if (!state || !state.isAllocated) return;

    // Process pending writes
    if (state.pendingWrites.length > 0 && !state.isMapped) {
      const writes = [...state.pendingWrites];
      state.pendingWrites = [];

      for (const write of writes) {
        context.emit?.('gpu_buffer_write', {
          node,
          offset: write.offset,
          data: write.data,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__gpuBufferState as GPUBufferState;
    if (!state) return;

    if (event.type === 'gpu_buffer_created') {
      state.isAllocated = true;
      state.gpuBuffer = event.buffer;
      state.size = event.size as number;

      // Write initial data if provided
      if (config.initial_data) {
        const data =
          typeof config.initial_data === 'string'
            ? new TextEncoder().encode(config.initial_data).buffer
            : config.initial_data;

        context.emit?.('gpu_buffer_write', {
          node,
          offset: 0,
          data,
        });
      }

      context.emit?.('on_buffer_ready', {
        node,
        size: state.size,
      });
    } else if (event.type === 'gpu_buffer_error') {
      context.emit?.('on_gpu_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'buffer_write') {
      const offset = (event.offset as number) || 0;
      const data = event.data as ArrayBuffer;

      if (state.isMapped) {
        // Queue for later
        state.pendingWrites.push({ offset, data });
      } else {
        context.emit?.('gpu_buffer_write', {
          node,
          offset,
          data,
        });
        state.lastWriteTime = Date.now();
      }
    } else if (event.type === 'buffer_read') {
      const offset = (event.offset as number) || 0;
      const size = (event.size as number) || state.size;
      const callbackId = event.callbackId as string;

      context.emit?.('gpu_buffer_read', {
        node,
        offset,
        size,
        callbackId,
      });
    } else if (event.type === 'buffer_read_complete') {
      context.emit?.('on_buffer_read', {
        node,
        callbackId: event.callbackId,
        data: event.data,
      });
    } else if (event.type === 'buffer_map') {
      state.isMapped = true;
      context.emit?.('gpu_buffer_map', {
        node,
        mode: (event.mode as string) || 'read',
      });
    } else if (event.type === 'buffer_unmap') {
      state.isMapped = false;
      context.emit?.('gpu_buffer_unmap', { node });
    } else if (event.type === 'buffer_resize') {
      const newSize = event.size as number;
      context.emit?.('gpu_buffer_resize', {
        node,
        size: newSize,
        preserveData: (event.preserveData as boolean) ?? true,
      });
    } else if (event.type === 'buffer_clear') {
      context.emit?.('gpu_buffer_clear', {
        node,
        offset: (event.offset as number) || 0,
        size: (event.size as number) || state.size,
      });
    } else if (event.type === 'buffer_query') {
      context.emit?.('buffer_info', {
        queryId: event.queryId,
        node,
        isAllocated: state.isAllocated,
        size: state.size,
        isMapped: state.isMapped,
        lastWriteTime: state.lastWriteTime,
        pendingWriteCount: state.pendingWrites.length,
      });
    }
  },
};

export default gpuBufferHandler;
