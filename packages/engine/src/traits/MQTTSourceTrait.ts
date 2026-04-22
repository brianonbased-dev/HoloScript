/**
 * MQTT Source Trait
 *
 * Subscribe to MQTT topics and bind incoming messages to object state.
 * Supports wildcard subscriptions, QoS levels, and automatic JSON parsing.
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode } from '@holoscript/core';
import {
  MQTTClient,
  createMQTTClient,
  getMQTTClient,
  registerMQTTClient,
  type MQTTMessage,
  type QoS,
} from '@holoscript/engine/runtime/protocols/MQTTClient';

// =============================================================================
// TYPES
// =============================================================================

export interface MQTTSourceConfig {
  /** MQTT broker URL */
  broker: string;
  /** Topic pattern to subscribe (supports + and # wildcards) */
  topic: string;
  /** QoS level (0, 1, or 2) */
  qos: QoS;
  /** Client ID (optional, auto-generated if not provided) */
  clientId?: string;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** Auto-parse JSON payloads */
  parseJson?: boolean;
  /** Field to store received value (default: 'value') */
  stateField?: string;
  /** Transform function name to apply to incoming messages */
  transform?: string;
  /** Debounce interval in ms */
  debounce?: number;
  /** Auto-connect on attach */
  autoConnect?: boolean;
}

export interface MQTTSourceState {
  /** Whether connected to broker */
  connected: boolean;
  /** Last received message */
  lastMessage: unknown;
  /** Last message timestamp */
  lastReceived: number;
  /** Total messages received */
  messageCount: number;
  /** Connection error if any */
  error: string | null;
  /** MQTT client instance */
  client: MQTTClient | null;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const defaultConfig: MQTTSourceConfig = {
  broker: 'mqtt://localhost:1883',
  topic: '#',
  qos: 0,
  parseJson: true,
  stateField: 'value',
  autoConnect: true,
};

// =============================================================================
// HANDLER
// =============================================================================

export const mqttSourceHandler: TraitHandler<MQTTSourceConfig> = {
  name: 'mqtt_source',

  defaultConfig,

  onAttach(node, config, context) {
    const state: MQTTSourceState = {
      connected: false,
      lastMessage: null,
      lastReceived: 0,
      messageCount: 0,
      error: null,
      client: null,
    };
    node.__mqttSourceState = state;

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
      context.emit('mqtt_connected', { broker: config.broker });
    });

    client.on('disconnect', (reason) => {
      state.connected = false;
      context.emit('mqtt_disconnected', { broker: config.broker, reason });
    });

    client.on('error', (error) => {
      state.error = error.message;
      context.emit('mqtt_error', { broker: config.broker, error: error.message });
    });

    // Set up debouncing if configured
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingMessage: unknown = null;

    const processMessage = (value: unknown) => {
      state.lastMessage = value;
      state.lastReceived = Date.now();
      state.messageCount++;

      // Update node state
      const stateField = config.stateField || 'value';
      context.setState({ [stateField]: value });

      // Emit message event
      context.emit('mqtt_message', {
        topic: config.topic,
        value,
        timestamp: state.lastReceived,
      });
    };

    // Subscribe to topic
    client.subscribe({ topic: config.topic, qos: config.qos }, (message: MQTTMessage) => {
      let value: unknown = message.payload;

      // Parse JSON if configured
      if (config.parseJson) {
        value = MQTTClient.parsePayload(message);
      }

      // Apply debouncing if configured
      if (config.debounce && config.debounce > 0) {
        pendingMessage = value;
        if (!debounceTimeout) {
          debounceTimeout = setTimeout(() => {
            if (pendingMessage !== null) {
              processMessage(pendingMessage);
            }
            debounceTimeout = null;
          }, config.debounce);
        }
      } else {
        processMessage(value);
      }
    });

    // Auto-connect if configured
    if (config.autoConnect) {
      client.connect().catch((error) => {
        state.error = error.message;
      });
    }
  },

  onDetach(node, config, _context) {
    const state = node.__mqttSourceState as MQTTSourceState | undefined;
    if (state?.client) {
      state.client.unsubscribe(config.topic);
    }
    delete node.__mqttSourceState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = node.__mqttSourceState as MQTTSourceState | undefined;
    if (!state) return;

    // Check connection status and reconnect if needed
    if (state.client && !state.connected && config.autoConnect) {
      state.client.connect().catch(() => {
        // Error handled in connect handler
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__mqttSourceState as MQTTSourceState | undefined;
    if (!state) return;

    // Handle manual connect/disconnect events
    if (event.type === 'mqtt_connect_request' && state.client) {
      state.client.connect().catch((error) => {
        state.error = error.message;
      });
    }

    if (event.type === 'mqtt_disconnect_request' && state.client) {
      state.client.disconnect();
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a node has the @mqtt_source trait
 */
export function hasMQTTSourceTrait(node: HSPlusNode): boolean {
  return !!node.__mqttSourceState;
}

/**
 * Get the MQTT source state from a node
 */
export function getMQTTSourceState(node: HSPlusNode): MQTTSourceState | null {
  return node.__mqttSourceState || null;
}

/**
 * Get the MQTT client from a node with @mqtt_source trait
 */
export function getMQTTSourceClient(node: HSPlusNode): MQTTClient | null {
  const state = getMQTTSourceState(node);
  return state?.client || null;
}

/**
 * Check if MQTT source is connected
 */
export function isMQTTSourceConnected(node: HSPlusNode): boolean {
  const state = getMQTTSourceState(node);
  return state?.connected || false;
}

export default mqttSourceHandler;
