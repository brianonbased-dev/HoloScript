/**
 * MQTT Sink Trait
 *
 * Publish object state changes to MQTT topics.
 * Supports retained messages, QoS levels, and automatic serialization.
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';
import {
  MQTTClient,
  createMQTTClient,
  getMQTTClient,
  registerMQTTClient,
  type QoS,
// @ts-expect-error During migration
} from '@holoscript/engine/runtime/protocols/MQTTClient';

// =============================================================================
// TYPES
// =============================================================================

export interface MQTTSinkConfig {
  /** MQTT broker URL */
  broker: string;
  /** Topic to publish to (can include {placeholders} for dynamic topics) */
  topic: string;
  /** Retain messages on broker */
  retain: boolean;
  /** QoS level (0, 1, or 2) */
  qos: QoS;
  /** Client ID (optional, auto-generated if not provided) */
  clientId?: string;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** State fields to publish (default: all) */
  fields?: string[];
  /** Throttle interval in ms (min time between publishes) */
  throttle?: number;
  /** Publish only on state change */
  onChangeOnly?: boolean;
  /** Auto-connect on attach */
  autoConnect?: boolean;
  /** Serialize as JSON */
  serializeJson?: boolean;
  /** Include timestamp in payload */
  includeTimestamp?: boolean;
}

export interface MQTTSinkState {
  /** Whether connected to broker */
  connected: boolean;
  /** Total messages published */
  publishCount: number;
  /** Last publish timestamp */
  lastPublished: number;
  /** Connection error if any */
  error: string | null;
  /** MQTT client instance */
  client: MQTTClient | null;
  /** Last published state hash for change detection */
  lastStateHash: string | null;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const defaultConfig: MQTTSinkConfig = {
  broker: 'mqtt://localhost:1883',
  topic: 'holoscript/{nodeId}/state',
  retain: false,
  qos: 0,
  onChangeOnly: true,
  autoConnect: true,
  serializeJson: true,
  includeTimestamp: false,
};

// =============================================================================
// HANDLER
// =============================================================================

export const mqttSinkHandler: TraitHandler<MQTTSinkConfig> = {
  name: 'mqtt_sink',

  defaultConfig,

  onAttach(node, config, context) {
    const state: MQTTSinkState = {
      connected: false,
      publishCount: 0,
      lastPublished: 0,
      error: null,
      client: null,
      lastStateHash: null,
    };
    node.__mqttSinkState = state;

    // Create or get existing client
    const clientKey = `${config.broker}_${config.clientId || 'default'}`;
    let client = getMQTTClient(clientKey);

    if (!client) {
      client = createMQTTClient({
        broker: config.broker,
        clientId: config.clientId,
        username: config.username,
        password: config.password,
      });
      registerMQTTClient(clientKey, client);
    }

    state.client = client;

    // Set up connection handlers
    client.on('connect', () => {
      state.connected = true;
      state.error = null;
      context.emit('mqtt_sink_connected', { broker: config.broker });
    });

    // @ts-expect-error During migration
    client.on('disconnect', (reason) => {
      state.connected = false;
      context.emit('mqtt_sink_disconnected', { broker: config.broker, reason });
    });

    // @ts-expect-error During migration
    client.on('error', (error) => {
      state.error = error.message;
      context.emit('mqtt_sink_error', { broker: config.broker, error: error.message });
    });

    // Auto-connect if configured
    if (config.autoConnect) {
      // @ts-expect-error During migration
      client.connect().catch((error) => {
        state.error = error.message;
      });
    }
  },

  onDetach(node, config, _context) {
    const state = node.__mqttSinkState as MQTTSinkState | undefined;
    if (state?.client) {
      // Publish empty/null with retain to clear retained message
      if (config.retain) {
        const topic = resolveTopic(config.topic, node);
        state.client.publish(topic, '', { retain: true, qos: config.qos });
      }
    }
    delete node.__mqttSinkState;
  },

  onUpdate(node, config, context, _delta) {
    const sinkState = node.__mqttSinkState as MQTTSinkState | undefined;
    if (!sinkState || !sinkState.client || !sinkState.connected) return;

    // Check throttle
    if (config.throttle && config.throttle > 0) {
      const now = Date.now();
      if (now - sinkState.lastPublished < config.throttle) {
        return;
      }
    }

    // Get current state
    const currentState = context.getState();
    const payload = buildPayload(currentState, config, node);

    // Check for change if onChangeOnly
    if (config.onChangeOnly) {
      const stateHash = hashState(payload);
      if (stateHash === sinkState.lastStateHash) {
        return;
      }
      sinkState.lastStateHash = stateHash;
    }

    // Resolve dynamic topic
    const topic = resolveTopic(config.topic, node);

    // Publish
    sinkState.client
      .publish(topic, payload, {
        retain: config.retain,
        qos: config.qos,
      })
      .then(() => {
        sinkState.publishCount++;
        sinkState.lastPublished = Date.now();
        context.emit('mqtt_published', { topic, payload });
      })
      // @ts-expect-error During migration
      .catch((error) => {
        sinkState.error = error.message;
        context.emit('mqtt_publish_error', { topic, error: error.message });
      });
  },

  onEvent(node, config, context, event) {
    const state = node.__mqttSinkState as MQTTSinkState | undefined;
    if (!state) return;

    // Handle manual publish event
    if (event.type === 'mqtt_publish_request' && state.client) {
      const topic = (event as Record<string, unknown>).topic || resolveTopic(config.topic, node);
      const payload = (event as Record<string, unknown>).payload || context.getState();

      state.client
        .publish((topic as string), config.serializeJson ? payload : String(payload), {
          retain: config.retain,
          qos: config.qos,
        })
        .then(() => {
          state.publishCount++;
          state.lastPublished = Date.now();
        })
        // @ts-expect-error During migration
        .catch((error) => {
          state.error = error.message;
        });
    }

    // Handle manual connect/disconnect events
    if (event.type === 'mqtt_sink_connect_request' && state.client) {
      // @ts-expect-error During migration
      state.client.connect().catch((error) => {
        state.error = error.message;
      });
    }

    if (event.type === 'mqtt_sink_disconnect_request' && state.client) {
      state.client.disconnect();
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolve dynamic topic placeholders
 */
function resolveTopic(topicTemplate: string, node: HSPlusNode): string {
  return topicTemplate
    .replace('{nodeId}', node.name || 'unknown')
    .replace('{nodeName}', node.name || 'unknown')
    .replace('{nodeType}', node.type || 'object');
}

/**
 * Build payload from state
 */
function buildPayload(
  state: Record<string, unknown>,
  config: MQTTSinkConfig,
  _node: HSPlusNode
): Record<string, unknown> | string {
  let payload: Record<string, unknown> = {};

  // Filter fields if specified
  if (config.fields && config.fields.length > 0) {
    for (const field of config.fields) {
      if (field in state) {
        payload[field] = state[field];
      }
    }
  } else {
    payload = { ...state };
  }

  // Add timestamp if configured
  if (config.includeTimestamp) {
    payload._timestamp = Date.now();
  }

  // Return as JSON or string
  if (config.serializeJson) {
    return payload;
  }

  // For non-JSON, return first field value as string
  const values = Object.values(payload);
  return values.length > 0 ? String(values[0]) : '';
}

/**
 * Hash state for change detection
 */
function hashState(payload: unknown): string {
  return JSON.stringify(payload);
}

/**
 * Check if a node has the @mqtt_sink trait
 */
export function hasMQTTSinkTrait(node: HSPlusNode): boolean {
  return !!node.__mqttSinkState;
}

/**
 * Get the MQTT sink state from a node
 */
export function getMQTTSinkState(node: HSPlusNode): MQTTSinkState | null {
  return node.__mqttSinkState || null;
}

/**
 * Get the MQTT client from a node with @mqtt_sink trait
 */
export function getMQTTSinkClient(node: HSPlusNode): MQTTClient | null {
  const state = getMQTTSinkState(node);
  return state?.client || null;
}

/**
 * Check if MQTT sink is connected
 */
export function isMQTTSinkConnected(node: HSPlusNode): boolean {
  const state = getMQTTSinkState(node);
  return state?.connected || false;
}

/**
 * Manually trigger a publish
 */
export function publishToMQTTSink(node: HSPlusNode, payload?: unknown, topic?: string): Promise<void> {
  const state = getMQTTSinkState(node);
  if (!state?.client || !state.connected) {
    return Promise.reject(new Error('MQTT sink not connected'));
  }

  const nodeState = node.__mqttSinkConfig as MQTTSinkConfig | undefined;
  const finalTopic = topic || resolveTopic(nodeState?.topic || '', node);
  const finalPayload = payload !== undefined && payload !== null ? payload : '';

  return state.client.publish(
    finalTopic,
    typeof finalPayload === 'string' ? finalPayload : JSON.stringify(finalPayload),
    {
      retain: nodeState?.retain || false,
      qos: nodeState?.qos || 0,
    }
  );
}

export default mqttSinkHandler;
