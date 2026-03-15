/**
 * DataBinding Trait
 *
 * Bind entity properties to live data feeds.
 * Supports REST, WebSocket, GraphQL, and custom data sources.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type SourceType = 'rest' | 'websocket' | 'graphql' | 'mqtt' | 'custom';

interface PropertyBinding {
  source_path: string; // JSON path in source data
  target_property: string; // Property on node
  transform?: 'none' | 'scale' | 'normalize' | 'map' | 'custom';
  transform_params?: Record<string, unknown>;
}

interface DataBindingState {
  isConnected: boolean;
  lastRefresh: number;
  currentData: Record<string, unknown>;
  connectionHandle: unknown;
  refreshTimer: unknown;
  errorCount: number;
}

interface DataBindingConfig {
  source: string; // URL or connection string
  source_type: SourceType;
  bindings: PropertyBinding[];
  refresh_rate: number; // ms, 0 = push only
  interpolation: boolean;
  interpolation_speed: number;
  auth_header: string;
  reconnect_interval: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const dataBindingHandler: TraitHandler<DataBindingConfig> = {
  name: 'data_binding',

  defaultConfig: {
    source: '',
    source_type: 'rest',
    bindings: [],
    refresh_rate: 1000,
    interpolation: true,
    interpolation_speed: 5,
    auth_header: '',
    reconnect_interval: 5000,
  },

  onAttach(node, config, context) {
    const state: DataBindingState = {
      isConnected: false,
      lastRefresh: 0,
      currentData: {},
      connectionHandle: null,
      refreshTimer: null,
      errorCount: 0,
    };
    (node as any).__dataBindingState = state;

    if (config.source) {
      connectDataSource(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__dataBindingState as DataBindingState;
    if (state?.connectionHandle) {
      context.emit?.('data_binding_disconnect', { node });
    }
    delete (node as any).__dataBindingState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__dataBindingState as DataBindingState;
    if (!state || !state.isConnected) return;

    // Poll for REST/GraphQL sources
    if (
      (config.source_type === 'rest' || config.source_type === 'graphql') &&
      config.refresh_rate > 0
    ) {
      const now = Date.now();
      if (now - state.lastRefresh >= config.refresh_rate) {
        state.lastRefresh = now;

        context.emit?.('data_binding_fetch', {
          node,
          source: config.source,
          sourceType: config.source_type,
          authHeader: config.auth_header,
        });
      }
    }

    // Apply interpolation to bound properties
    if (config.interpolation && Object.keys(state.currentData).length > 0) {
      for (const binding of config.bindings) {
        const targetValue = getNestedValue(state.currentData, binding.source_path);
        if (targetValue !== undefined && typeof targetValue === 'number') {
          const currentValue = getNodeProperty(node, binding.target_property);
          if (typeof currentValue === 'number') {
            const interpolated =
              currentValue + (targetValue - currentValue) * config.interpolation_speed * delta;
            setNodeProperty(node, binding.target_property, interpolated);
          }
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__dataBindingState as DataBindingState;
    if (!state) return;

    if (event.type === 'data_binding_connected') {
      state.isConnected = true;
      state.connectionHandle = event.handle;
      state.errorCount = 0;

      context.emit?.('on_data_connected', { node });
    } else if (event.type === 'data_binding_data') {
      const data = event.data as Record<string, unknown>;
      state.currentData = data;
      state.lastRefresh = Date.now();

      // Apply bindings immediately for non-interpolated values
      for (const binding of config.bindings) {
        const value = getNestedValue(data, binding.source_path);
        if (value !== undefined) {
          const transformed = applyTransform(value, binding);

          if (!config.interpolation || typeof transformed !== 'number') {
            setNodeProperty(node, binding.target_property, transformed);
          }
        }
      }

      context.emit?.('on_data_change', {
        node,
        data: state.currentData,
      });
    } else if (event.type === 'data_binding_error') {
      state.errorCount++;

      context.emit?.('on_data_error', {
        node,
        error: event.error,
        errorCount: state.errorCount,
      });

      // Attempt reconnect
      if (config.reconnect_interval > 0) {
        setTimeout(() => {
          connectDataSource(node, state, config, context);
        }, config.reconnect_interval);
      }
    } else if (event.type === 'data_binding_disconnect') {
      state.isConnected = false;
      state.connectionHandle = null;
    } else if (event.type === 'data_binding_refresh') {
      // Force immediate refresh
      context.emit?.('data_binding_fetch', {
        node,
        source: config.source,
        sourceType: config.source_type,
        authHeader: config.auth_header,
      });
    } else if (event.type === 'data_binding_set_source') {
      const newSource = event.source as string;

      if (state.connectionHandle) {
        context.emit?.('data_binding_disconnect', { node });
      }

      state.isConnected = false;
      state.currentData = {};

      connectDataSource(node, state, { ...config, source: newSource }, context);
    } else if (event.type === 'data_binding_query') {
      context.emit?.('data_binding_info', {
        queryId: event.queryId,
        node,
        isConnected: state.isConnected,
        lastRefresh: state.lastRefresh,
        errorCount: state.errorCount,
        bindingCount: config.bindings.length,
        currentData: state.currentData,
      });
    }
  },
};

function connectDataSource(
  node: unknown,
  state: DataBindingState,
  config: DataBindingConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  context.emit?.('data_binding_connect', {
    node,
    source: config.source,
    sourceType: config.source_type,
    authHeader: config.auth_header,
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function getNodeProperty(node: unknown, property: string): unknown {
  return (node as Record<string, unknown>)[property];
}

function setNodeProperty(node: unknown, property: string, value: unknown): void {
  (node as Record<string, unknown>)[property] = value;
}

function applyTransform(value: unknown, binding: PropertyBinding): unknown {
  if (!binding.transform || binding.transform === 'none') {
    return value;
  }

  const params = binding.transform_params || {};

  switch (binding.transform) {
    case 'scale':
      if (typeof value === 'number') {
        return value * ((params.factor as number) || 1);
      }
      break;
    case 'normalize':
      if (typeof value === 'number') {
        const min = (params.min as number) || 0;
        const max = (params.max as number) || 1;
        return (value - min) / (max - min);
      }
      break;
    case 'map':
      const mapping = params.mapping as Record<string, unknown>;
      if (mapping && value !== undefined) {
        return mapping[String(value)] ?? value;
      }
      break;
  }

  return value;
}

export default dataBindingHandler;
