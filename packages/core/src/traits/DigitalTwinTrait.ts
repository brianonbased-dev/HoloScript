/**
 * DigitalTwin Trait
 *
 * Map physical object to virtual representation.
 * Synchronizes state between real-world IoT device and virtual counterpart.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { IotGateway } from '../services/GatewayAdapter';

// =============================================================================
// TYPES
// =============================================================================

type UpdateMode = 'polling' | 'push' | 'hybrid';

interface SyncProperty {
  physical_key: string;
  virtual_property: string;
  direction: 'in' | 'out' | 'bidirectional';
  debounce?: number;
}

interface DigitalTwinState {
  isSynced: boolean;
  lastSyncTime: number;
  divergence: number; // 0-1, how much virtual differs from physical
  physicalState: Record<string, unknown>;
  pendingUpdates: Array<{ property: string; value: unknown; timestamp: number }>;
  connectionHandle: unknown;
  historyBuffer: Array<{ timestamp: number; state: Record<string, unknown> }>;
}

interface DigitalTwinConfig {
  physical_id: string; // IoT device ID
  model_source: string; // 3D model URL
  sync_properties: SyncProperty[];
  update_mode: UpdateMode;
  poll_interval: number; // ms
  history_retention: number; // seconds
  simulation_mode: boolean; // Run without physical device
  connection_string: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const digitalTwinHandler: TraitHandler<DigitalTwinConfig> = {
  name: 'digital_twin',

  defaultConfig: {
    physical_id: '',
    model_source: '',
    sync_properties: [],
    update_mode: 'polling',
    poll_interval: 5000,
    history_retention: 3600,
    simulation_mode: false,
    connection_string: '',
  },

  onAttach(node, config, context) {
    const state: DigitalTwinState = {
      isSynced: false,
      lastSyncTime: 0,
      divergence: 0,
      physicalState: {},
      pendingUpdates: [],
      connectionHandle: null,
      historyBuffer: [],
    };
    node.__digitalTwinState = state;

    if (!config.simulation_mode && config.physical_id) {
      connectToPhysical(node, state, config, context);
    } else if (config.simulation_mode) {
      state.isSynced = true;
      context.emit?.('on_twin_connected', { node, mode: 'simulation' });
    }

    if (config.model_source) {
      context.emit?.('twin_load_model', {
        node,
        source: config.model_source,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__digitalTwinState as DigitalTwinState;
    if (state?.connectionHandle) {
      context.emit?.('twin_disconnect', { node });
    }
    delete node.__digitalTwinState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__digitalTwinState as DigitalTwinState;
    if (!state) return;

    // Poll for updates
    if (config.update_mode !== 'push' && state.isSynced) {
      const now = Date.now();
      if (now - state.lastSyncTime >= config.poll_interval) {
        state.lastSyncTime = now;

        context.emit?.('twin_fetch_state', {
          node,
          physicalId: config.physical_id,
          properties: config.sync_properties.filter((p) => p.direction !== 'out'),
        });
      }
    }

    // Process pending outbound updates
    if (state.pendingUpdates.length > 0) {
      const updates = [...state.pendingUpdates];
      state.pendingUpdates = [];

      const handler = digitalTwinHandler as any;
      const gateway = handler.gateway as IotGateway;

      for (const update of updates) {
        if (gateway) {
          gateway.sendUpdate(config.physical_id, update.property, update.value);
        }

        context.emit?.('twin_send_update', {
          node,
          physicalId: config.physical_id,
          property: update.property,
          value: update.value,
        });
      }
    }

    // Prune old history
    if (state.historyBuffer.length > 0) {
      const cutoff = Date.now() - config.history_retention * 1000;
      state.historyBuffer = state.historyBuffer.filter((h) => h.timestamp > cutoff);
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__digitalTwinState as DigitalTwinState;
    if (!state) return;

    if (event.type === 'twin_connected') {
      state.isSynced = true;
      state.connectionHandle = event.handle;
      state.lastSyncTime = Date.now();

      context.emit?.('on_twin_connected', {
        node,
        physicalId: config.physical_id,
      });
    } else if (event.type === 'twin_state_update') {
      const physicalData = event.state as Record<string, unknown>;
      const _previousState = { ...state.physicalState };
      state.physicalState = physicalData;
      state.lastSyncTime = Date.now();

      // Record history
      state.historyBuffer.push({
        timestamp: Date.now(),
        state: { ...physicalData },
      });

      // Apply inbound properties to virtual
      for (const prop of config.sync_properties) {
        if (prop.direction !== 'out') {
          const value = physicalData[prop.physical_key];
          if (value !== undefined) {
            (node as unknown as Record<string, unknown>)[prop.virtual_property] = value;
          }
        }
      }

      // Calculate divergence
      state.divergence = calculateDivergence(node, state.physicalState, config.sync_properties);

      context.emit?.('on_twin_sync', {
        node,
        state: physicalData,
        divergence: state.divergence,
      });
    } else if (event.type === 'twin_property_changed') {
      const property = event.property as string;
      const value = event.value;

      // Find sync config
      const syncProp = config.sync_properties.find((p) => p.virtual_property === property);
      if (syncProp && syncProp.direction !== 'in') {
        state.pendingUpdates.push({
          property: syncProp.physical_key,
          value,
          timestamp: Date.now(),
        });
      }
    } else if (event.type === 'twin_disconnect') {
      state.isSynced = false;
      state.connectionHandle = null;

      context.emit?.('on_twin_disconnected', { node });
    } else if (event.type === 'twin_connection_error') {
      context.emit?.('on_twin_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'twin_get_history') {
      const startTime = (event.startTime as number) || 0;
      const endTime = (event.endTime as number) || Date.now();

      const history = state.historyBuffer.filter(
        (h) => h.timestamp >= startTime && h.timestamp <= endTime
      );

      context.emit?.('twin_history_result', {
        node,
        history,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'twin_simulate') {
      // Apply simulated state change
      const changes = event.changes as Record<string, unknown>;
      Object.assign(state.physicalState, changes);

      for (const prop of config.sync_properties) {
        if (prop.direction !== 'out' && changes[prop.physical_key] !== undefined) {
          (node as unknown as Record<string, unknown>)[prop.virtual_property] =
            changes[prop.physical_key];
        }
      }
    } else if (event.type === 'twin_query') {
      context.emit?.('twin_info', {
        queryId: event.queryId,
        node,
        isSynced: state.isSynced,
        lastSyncTime: state.lastSyncTime,
        divergence: state.divergence,
        historySize: state.historyBuffer.length,
        physicalState: state.physicalState,
        pendingUpdates: state.pendingUpdates.length,
      });
    }
  },
};

function connectToPhysical(
  node: unknown,
  state: DigitalTwinState,
  config: DigitalTwinConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  const handler = digitalTwinHandler as any;
  if (!handler.gateway) {
    console.warn('[DigitalTwinTrait] No Gateway configured. Call setGateway() first.');
    return;
  }

  const gateway = handler.gateway as IotGateway;

  // Listen for connection
  gateway.on('connected', (data: unknown) => {
    if (data.deviceId === config.physical_id) {
      context.emit?.('twin_connected', { handle: gateway, ...data });
    }
  });

  // Listen for telemetry
  gateway.on('telemetry', (data: unknown) => {
    if (data.deviceId === config.physical_id) {
      context.emit?.('twin_state_update', { state: data });
    }
  });

  // Connect
  gateway.connect(config.physical_id, config.connection_string);

  context.emit?.('twin_connect', {
    node,
    physicalId: config.physical_id,
    connectionString: config.connection_string,
    updateMode: config.update_mode,
  });
}

function calculateDivergence(
  node: unknown,
  physicalState: Record<string, unknown>,
  syncProperties: SyncProperty[]
): number {
  if (syncProperties.length === 0) return 0;

  let totalDiff = 0;
  let count = 0;

  for (const prop of syncProperties) {
    const physicalValue = physicalState[prop.physical_key];
    const virtualValue = (node as Record<string, unknown>)[prop.virtual_property];

    if (typeof physicalValue === 'number' && typeof virtualValue === 'number') {
      totalDiff += Math.abs(physicalValue - virtualValue) / Math.max(Math.abs(physicalValue), 1);
      count++;
    } else if (physicalValue !== virtualValue) {
      totalDiff += 1;
      count++;
    }
  }

  return count > 0 ? Math.min(1, totalDiff / count) : 0;
}

export default digitalTwinHandler;
