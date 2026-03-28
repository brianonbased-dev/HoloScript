import type { TraitHandler } from './TraitTypes';

export interface TelemetryConfig {
  channels: string[];
  aggregation_ms: number;
  batch_size: number;
  include_physics: boolean;
  endpoint?: string;
}

interface TelemetryState {
  buffer: Array<Record<string, unknown>>;
  lastPubTime: number;
}

export const telemetryHandler: TraitHandler<TelemetryConfig> = {
  name: 'telemetry' as never,

  defaultConfig: {
    channels: ['default'],
    aggregation_ms: 1000,
    batch_size: 10,
    include_physics: false,
  },

  onAttach(node, _config, _context) {
    node.__telemetryState = {
      buffer: [],
      lastPubTime: Date.now()
    } as TelemetryState;
  },

  onDetach(node, _config, _context) {
    delete node.__telemetryState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__telemetryState as TelemetryState;
    if (!state) return;

    if (config.include_physics) {
      const pos = context.physics.getBodyPosition?.(node.id || '') || { x:0, y:0, z:0 };
      const vel = context.physics.getBodyVelocity?.(node.id || '') || { x:0, y:0, z:0 };
      
      state.buffer.push({
        type: 'physics',
        nodeId: node.id,
        timestamp: Date.now(),
        position: pos,
        velocity: vel
      });
    }

    const now = Date.now();
    if (now - state.lastPubTime >= config.aggregation_ms || state.buffer.length >= config.batch_size) {
      if (state.buffer.length > 0) {
        context.emit('on_telemetry_batch', {
          node,
          channels: config.channels,
          payload: [...state.buffer],
          endpoint: config.endpoint
        });
        state.buffer = [];
      }
      state.lastPubTime = now;
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__telemetryState as TelemetryState;
    if (!state) return;

    if (event.type === 'telemetry_log') {
      state.buffer.push({
        type: 'custom',
        nodeId: node.id,
        timestamp: Date.now(),
        ...(event.payload as Record<string, unknown>)
      });
    } else if (event.type === 'telemetry_flush') {
      if (state.buffer.length > 0) {
        context.emit('on_telemetry_batch', {
          node,
          channels: config.channels,
          payload: [...state.buffer],
          endpoint: config.endpoint
        });
        state.buffer = [];
      }
      state.lastPubTime = Date.now();
    }
  }
};

export default telemetryHandler;
