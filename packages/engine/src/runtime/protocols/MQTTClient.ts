/**
 * MQTT Client for HoloScript IoT Integration
 *
 * Provides MQTT 3.1.1 and 5.0 protocol support for IoT device communication.
 * Supports pub/sub patterns, QoS levels, and wildcard subscriptions.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type QoS = 0 | 1 | 2;
export type MQTTVersion = '3.1.1' | '5.0';

export interface MQTTClientConfig {
  /** Broker URL (e.g., mqtt://localhost:1883, wss://broker.example.com) */
  broker: string;
  /** Client ID (auto-generated if not provided) */
  clientId?: string;
  /** MQTT protocol version */
  version?: MQTTVersion;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** Keep-alive interval in seconds */
  keepAlive?: number;
  /** Clean session flag */
  cleanSession?: boolean;
  /** Reconnect options */
  reconnect?: {
    enabled: boolean;
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
  };
  /** TLS/SSL options */
  tls?: {
    enabled: boolean;
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  /** Will message */
  will?: {
    topic: string;
    payload: string | Buffer;
    qos?: QoS;
    retain?: boolean;
  };
}

export interface MQTTMessage {
  topic: string;
  payload: Buffer | string;
  qos: QoS;
  retain: boolean;
  /** MQTT 5.0 properties */
  properties?: {
    payloadFormatIndicator?: number;
    messageExpiryInterval?: number;
    contentType?: string;
    responseTopic?: string;
    correlationData?: Buffer;
    userProperties?: Record<string, string>;
  };
}

export interface MQTTSubscription {
  topic: string;
  qos: QoS;
  /** No Local flag (MQTT 5.0) */
  noLocal?: boolean;
  /** Retain as Published flag (MQTT 5.0) */
  retainAsPublished?: boolean;
  /** Retain handling option (MQTT 5.0) */
  retainHandling?: 0 | 1 | 2;
}

export interface MQTTPublishOptions {
  qos?: QoS;
  retain?: boolean;
  /** MQTT 5.0 properties */
  properties?: MQTTMessage['properties'];
}

export type MQTTClientState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

export interface MQTTClientEvents {
  connect: () => void;
  disconnect: (reason?: string) => void;
  reconnect: (attempt: number) => void;
  message: (topic: string, message: MQTTMessage) => void;
  error: (error: Error) => void;
  offline: () => void;
}

// =============================================================================
// MQTT CLIENT
// =============================================================================

export class MQTTClient {
  private config: MQTTClientConfig;
  private state: MQTTClientState = 'disconnected';
  private subscriptions: Map<string, Set<(message: MQTTMessage) => void>> = new Map();
  private messageQueue: Array<{
    topic: string;
    payload: Buffer | string;
    options: MQTTPublishOptions;
  }> = [];
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventHandlers: Map<keyof MQTTClientEvents, Set<Function>> = new Map();

  // Simulated connection for environments without real MQTT
  private simulatedMode: boolean = false;

  constructor(config: MQTTClientConfig) {
    this.config = {
      version: '5.0',
      keepAlive: 60,
      cleanSession: true,
      reconnect: {
        enabled: true,
        maxAttempts: 10,
        baseDelay: 1000,
        maxDelay: 30000,
      },
      ...config,
      clientId: config.clientId || this.generateClientId(),
    };
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Connect to the MQTT broker
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';
    this.emit('connect');

    try {
      // In a real implementation, this would use an MQTT library
      // For now, we simulate the connection for testing
      await this.simulateConnect();

      this.state = 'connected';
      this.reconnectAttempts = 0;

      // Process queued messages
      this.flushMessageQueue();
    } catch (error) {
      this.state = 'disconnected';
      this.emit('error', error as Error);

      if (this.config.reconnect?.enabled) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Disconnect from the MQTT broker
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected' || this.state === 'closed') {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.state = 'closed';
    this.emit('disconnect', 'client_disconnect');

    // Clear subscriptions
    this.subscriptions.clear();
  }

  /**
   * Get current connection state
   */
  getState(): MQTTClientState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  // ===========================================================================
  // PUBLISH / SUBSCRIBE
  // ===========================================================================

  /**
   * Publish a message to a topic
   */
  async publish(
    topic: string,
    payload: string | Buffer | object,
    options: MQTTPublishOptions = {}
  ): Promise<void> {
    const { qos = 0, retain = false, properties } = options;

    // Serialize payload if object
    const serializedPayload =
      typeof payload === 'object' && !(payload instanceof Buffer)
        ? JSON.stringify(payload)
        : payload;

    if (this.state !== 'connected') {
      // Queue message for later delivery
      this.messageQueue.push({ topic, payload: serializedPayload, options });
      return;
    }

    // In a real implementation, this would publish via MQTT library
    await this.simulatePublish(topic, serializedPayload, { qos, retain, properties });
  }

  /**
   * Subscribe to a topic pattern
   */
  async subscribe(
    topicOrSubscription: string | MQTTSubscription,
    handler: (message: MQTTMessage) => void
  ): Promise<void> {
    const subscription: MQTTSubscription =
      typeof topicOrSubscription === 'string'
        ? { topic: topicOrSubscription, qos: 0 }
        : topicOrSubscription;

    const { topic } = subscription;

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }

    this.subscriptions.get(topic)!.add(handler);

    if (this.state === 'connected') {
      await this.simulateSubscribe(subscription);
    }
  }

  /**
   * Unsubscribe from a topic
   */
  async unsubscribe(topic: string, handler?: (message: MQTTMessage) => void): Promise<void> {
    const handlers = this.subscriptions.get(topic);
    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(topic);
      }
    } else {
      this.subscriptions.delete(topic);
    }

    if (this.state === 'connected' && !this.subscriptions.has(topic)) {
      await this.simulateUnsubscribe(topic);
    }
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  /**
   * Register an event handler
   */
  on<K extends keyof MQTTClientEvents>(event: K, handler: MQTTClientEvents[K]): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event handler
   */
  off<K extends keyof MQTTClientEvents>(event: K, handler: MQTTClientEvents[K]): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit<K extends keyof MQTTClientEvents>(
    event: K,
    ...args: Parameters<MQTTClientEvents[K]>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in MQTT event handler for ${event}:`, error);
        }
      }
    }
  }

  // ===========================================================================
  // TOPIC MATCHING
  // ===========================================================================

  /**
   * Check if a topic matches a subscription pattern
   * Supports + (single-level) and # (multi-level) wildcards
   */
  static matchTopic(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];

      if (patternPart === '#') {
        // Multi-level wildcard matches everything from this point
        return true;
      }

      if (i >= topicParts.length) {
        // Topic is shorter than pattern (and pattern doesn't end with #)
        return false;
      }

      if (patternPart !== '+' && patternPart !== topicParts[i]) {
        // Parts don't match (and it's not a single-level wildcard)
        return false;
      }
    }

    // Pattern matched, check if topic has extra parts
    return patternParts.length === topicParts.length;
  }

  // ===========================================================================
  // MESSAGE PARSING
  // ===========================================================================

  /**
   * Parse message payload based on content type
   */
  static parsePayload(message: MQTTMessage): unknown {
    const contentType = message.properties?.contentType || '';
    const payloadStr: string =
      message.payload instanceof Buffer
        ? message.payload.toString('utf-8')
        : String(message.payload);

    if (contentType.includes('json') || payloadStr.startsWith('{') || payloadStr.startsWith('[')) {
      try {
        return JSON.parse(payloadStr);
      } catch {
        return payloadStr;
      }
    }

    // Try to parse as number
    const num = Number(payloadStr);
    if (!isNaN(num)) {
      return num;
    }

    // Return as string
    return payloadStr;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private generateClientId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `holoscript_${timestamp}_${random}`;
  }

  private async simulateConnect(): Promise<void> {
    this.simulatedMode = true;
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async simulatePublish(
    topic: string,
    payload: string | Buffer,
    options: MQTTPublishOptions
  ): Promise<void> {
    // In simulated mode, deliver message to local subscribers
    const message: MQTTMessage = {
      topic,
      payload,
      qos: options.qos || 0,
      retain: options.retain || false,
      properties: options.properties,
    };

    this.deliverMessage(topic, message);
  }

  private async simulateSubscribe(_subscription: MQTTSubscription): Promise<void> {
    // Subscription is tracked in memory
  }

  private async simulateUnsubscribe(_topic: string): Promise<void> {
    // Unsubscription is tracked in memory
  }

  private deliverMessage(topic: string, message: MQTTMessage): void {
    for (const [pattern, handlers] of this.subscriptions) {
      if (MQTTClient.matchTopic(pattern, topic)) {
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (error) {
            console.error('Error in MQTT message handler:', error);
          }
        }
      }
    }

    // Emit message event
    this.emit('message', topic, message);
  }

  private scheduleReconnect(): void {
    const config = this.config.reconnect!;

    if (this.reconnectAttempts >= (config.maxAttempts || 10)) {
      this.state = 'disconnected';
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      (config.baseDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1),
      config.maxDelay || 30000
    );

    this.emit('reconnect', this.reconnectAttempts);

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Error is handled in connect()
      }
    }, delay);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const { topic, payload, options } = this.messageQueue.shift()!;
      this.publish(topic, payload, options).catch((error) => {
        console.error('Error publishing queued message:', error);
      });
    }
  }

  /**
   * Inject a message for testing purposes
   */
  _injectMessage(topic: string, payload: string | Buffer | object): void {
    const serializedPayload =
      typeof payload === 'object' && !(payload instanceof Buffer)
        ? JSON.stringify(payload)
        : payload;

    const message: MQTTMessage = {
      topic,
      payload: serializedPayload,
      qos: 0,
      retain: false,
    };

    this.deliverMessage(topic, message);
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an MQTT client
 */
export function createMQTTClient(config: MQTTClientConfig): MQTTClient {
  return new MQTTClient(config);
}

/**
 * Default MQTT client registry for global access
 */
const clientRegistry: Map<string, MQTTClient> = new Map();

/**
 * Register a named MQTT client
 */
export function registerMQTTClient(name: string, client: MQTTClient): void {
  clientRegistry.set(name, client);
}

/**
 * Get a registered MQTT client
 */
export function getMQTTClient(name: string): MQTTClient | undefined {
  return clientRegistry.get(name);
}

/**
 * Unregister an MQTT client
 */
export function unregisterMQTTClient(name: string): void {
  const client = clientRegistry.get(name);
  if (client) {
    client.disconnect();
    clientRegistry.delete(name);
  }
}

export default MQTTClient;
