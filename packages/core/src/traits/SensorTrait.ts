/**
 * Sensor Trait
 *
 * Bind to IoT data stream for environmental sensing.
 * Supports REST, MQTT, WebSocket, and custom protocols.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Protocol = 'rest' | 'mqtt' | 'websocket' | 'ble' | 'custom';
type DataType = 'number' | 'boolean' | 'string' | 'json';

interface SensorState {
  currentValue: unknown;
  previousValue: unknown;
  lastUpdate: number;
  isConnected: boolean;
  connectionHandle: unknown;
  history: Array<{ timestamp: number; value: unknown }>;
  alertActive: boolean;
}

interface SensorConfig {
  protocol: Protocol;
  endpoint: string;
  topic: string; // For MQTT
  data_type: DataType;
  update_interval: number; // ms
  unit: string;
  range: { min: number; max: number };
  alert_threshold: { low?: number; high?: number };
  history_size: number;
  transform: string; // JS expression to transform value
}

// =============================================================================
// HANDLER
// =============================================================================

export const sensorHandler: TraitHandler<SensorConfig> = {
  name: 'sensor',

  defaultConfig: {
    protocol: 'rest',
    endpoint: '',
    topic: '',
    data_type: 'number',
    update_interval: 1000,
    unit: '',
    range: { min: 0, max: 100 },
    alert_threshold: {},
    history_size: 100,
    transform: '',
  },

  onAttach(node, config, context) {
    const state: SensorState = {
      currentValue: null,
      previousValue: null,
      lastUpdate: 0,
      isConnected: false,
      connectionHandle: null,
      history: [],
      alertActive: false,
    };
    (node as any).__sensorState = state;

    if (config.endpoint) {
      connectSensor(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__sensorState as SensorState;
    if (state?.connectionHandle) {
      context.emit?.('sensor_disconnect', { node });
    }
    delete (node as any).__sensorState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__sensorState as SensorState;
    if (!state || !state.isConnected) return;

    // Poll for REST protocol
    if (config.protocol === 'rest' && config.update_interval > 0) {
      const now = Date.now();
      if (now - state.lastUpdate >= config.update_interval) {
        state.lastUpdate = now;

        context.emit?.('sensor_fetch', {
          node,
          endpoint: config.endpoint,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__sensorState as SensorState;
    if (!state) return;

    if (event.type === 'sensor_connected') {
      state.isConnected = true;
      state.connectionHandle = event.handle;

      context.emit?.('on_sensor_connected', { node });
    } else if (event.type === 'sensor_data') {
      let value = event.value;

      // Apply transform if specified
      if (config.transform) {
        try {
          const transformFn = new Function('value', `return ${config.transform}`);
          value = transformFn(value);
        } catch (_e) {
          // Keep original value on transform error
        }
      }

      state.previousValue = state.currentValue;
      state.currentValue = value;
      state.lastUpdate = Date.now();

      // Record history
      state.history.push({ timestamp: Date.now(), value });
      if (state.history.length > config.history_size) {
        state.history.shift();
      }

      // Check alert thresholds
      if (typeof value === 'number') {
        const wasAlert = state.alertActive;
        state.alertActive =
          (config.alert_threshold.low !== undefined && value < config.alert_threshold.low) ||
          (config.alert_threshold.high !== undefined && value > config.alert_threshold.high);

        if (state.alertActive && !wasAlert) {
          context.emit?.('on_sensor_alert', {
            node,
            value,
            threshold: config.alert_threshold,
          });
        } else if (!state.alertActive && wasAlert) {
          context.emit?.('on_sensor_alert_cleared', { node });
        }
      }

      context.emit?.('on_sensor_update', {
        node,
        value: state.currentValue,
        previousValue: state.previousValue,
        unit: config.unit,
      });
    } else if (event.type === 'sensor_error') {
      context.emit?.('on_sensor_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'sensor_disconnect') {
      state.isConnected = false;
      state.connectionHandle = null;
    } else if (event.type === 'sensor_get_history') {
      const startTime = (event.startTime as number) || 0;
      const endTime = (event.endTime as number) || Date.now();

      const filteredHistory = state.history.filter(
        (h) => h.timestamp >= startTime && h.timestamp <= endTime
      );

      context.emit?.('sensor_history_result', {
        node,
        history: filteredHistory,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'sensor_set_endpoint') {
      const newEndpoint = event.endpoint as string;

      if (state.connectionHandle) {
        context.emit?.('sensor_disconnect', { node });
      }

      state.isConnected = false;
      connectSensor(node, state, { ...config, endpoint: newEndpoint }, context);
    } else if (event.type === 'sensor_query') {
      context.emit?.('sensor_info', {
        queryId: event.queryId,
        node,
        isConnected: state.isConnected,
        currentValue: state.currentValue,
        unit: config.unit,
        range: config.range,
        alertActive: state.alertActive,
        historySize: state.history.length,
        lastUpdate: state.lastUpdate,
      });
    }
  },
};

function connectSensor(
  node: unknown,
  state: SensorState,
  config: SensorConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  context.emit?.('sensor_connect', {
    node,
    protocol: config.protocol,
    endpoint: config.endpoint,
    topic: config.topic,
    dataType: config.data_type,
  });
}

export default sensorHandler;
