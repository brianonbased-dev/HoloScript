/**
 * DigitalTwinGateway
 *
 * Sovereign IoT gateway implementation for HoloScript Core.
 * Bridges physical sensors/actuators and the virtual HoloScript runtime.
 * Implements the IotGateway interface so DigitalTwinTrait and HoloTwinTrait
 * can use it without external service dependencies.
 *
 * Pattern: P.IND.TWIN.01 — Industrial Bidirectional Synchronization
 */

import type { IotGateway } from './GatewayAdapter';
import { digitalTwinHandler } from '../traits/DigitalTwinTrait';
import { holoTwinHandler } from '../traits/HoloTwinTrait';

// =============================================================================
// TYPES
// =============================================================================

export interface TwinPayload {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type TwinProtocol = 'mqtt' | 'rest' | 'opc-ua';

export interface TwinConnection {
  status: 'connected' | 'disconnected' | 'error';
  protocol: TwinProtocol;
}

export type TwinEvent = 'telemetry' | 'connected' | 'disconnected' | 'error';

export type TwinListener = (data: unknown) => void;

// =============================================================================
// GATEWAY
// =============================================================================

export class DigitalTwinGateway implements IotGateway {
  private static instance: DigitalTwinGateway | undefined;
  private connections: Map<string, TwinConnection> = new Map();
  private listeners: Map<string, Set<TwinListener>> = new Map();

  private constructor() {}

  public static getInstance(): DigitalTwinGateway {
    if (!DigitalTwinGateway.instance) {
      DigitalTwinGateway.instance = new DigitalTwinGateway();
    }
    return DigitalTwinGateway.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  public static resetInstance(): void {
    if (DigitalTwinGateway.instance) {
      DigitalTwinGateway.instance.connections.clear();
      DigitalTwinGateway.instance.listeners.clear();
    }
    DigitalTwinGateway.instance = undefined;
  }

  // ---------------------------------------------------------------------------
  // IotGateway contract
  // ---------------------------------------------------------------------------

  connect(deviceId: string, connectionString: string): void {
    const protocol = parseProtocol(connectionString);
    console.info(`[DigitalTwinGateway] Connecting to ${protocol} source: ${deviceId}`);

    this.connections.set(deviceId, { status: 'connected', protocol });
    this.emit('connected', { deviceId, connectionString, protocol });

    // Simulate initial telemetry so traits receive a first data packet
    this.handleIncomingData({
      id: `twin-${Date.now()}`,
      topic: deviceId,
      payload: { status: 'alive', load: Math.random() },
      timestamp: Date.now(),
    });
  }

  disconnect(deviceId: string): void {
    this.connections.delete(deviceId);
    this.emit('disconnected', { deviceId });
  }

  sendUpdate(deviceId: string, property: string, value: unknown): void {
    this.pushToPhysical(deviceId, property, value);
  }

  on(event: TwinEvent, listener: TwinListener): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off(event: string, listener: TwinListener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  // ---------------------------------------------------------------------------
  // Native API (preserved from uaa2-service)
  // ---------------------------------------------------------------------------

  /**
   * Connect to a real-world sensor/actuator with explicit protocol.
   */
  async connectTwin(topic: string, protocol: TwinProtocol = 'mqtt'): Promise<boolean> {
    console.info(`[DigitalTwinGateway] Connecting to ${protocol} source: ${topic}`);

    this.connections.set(topic, { status: 'connected', protocol });

    this.handleIncomingData({
      id: `twin-${Date.now()}`,
      topic,
      payload: { status: 'alive', load: Math.random() },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Handle data coming from the physical twin.
   */
  handleIncomingData(data: TwinPayload): void {
    console.debug(`[DigitalTwinGateway] Received data from ${data.topic}`, data.payload);
    this.emit('telemetry', {
      deviceId: data.topic,
      readings: data.payload,
      timestamp: data.timestamp,
    });
  }

  /**
   * Push state from virtual HoloScript back to the physical body (actuator).
   */
  async pushToPhysical(topic: string, action: string, data: unknown): Promise<void> {
    console.info(`[DigitalTwinGateway] Pushing action to physical twin: ${topic} -> ${action}`);
    // In production this would dispatch MQTT/REST/OPC-UA commands.
    void data;
  }

  /**
   * Specifically handle @twin_actuator logic: Virtual interaction → Physical trigger.
   */
  async pushToActuator(actuatorId: string, action: string, value: unknown): Promise<void> {
    console.info(`[DigitalTwinGateway] Executing Actuator ${actuatorId}: ${action}(${JSON.stringify(value)})`);
    const topic = `actuators/${actuatorId}`;
    await this.pushToPhysical(topic, action, value);
  }

  getStatus(topic: string): 'connected' | 'disconnected' | 'error' {
    return this.connections.has(topic) ? 'connected' : 'disconnected';
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private emit(event: string, data: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (err) {
          console.error(`[DigitalTwinGateway] Listener error on ${event}:`, err);
        }
      }
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function parseProtocol(connectionString: string): TwinProtocol {
  const lower = connectionString.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'rest';
  if (lower.startsWith('opc.tcp://')) return 'opc-ua';
  return 'mqtt';
}

// =============================================================================
// SETUP
// =============================================================================

export const digitalTwinGateway = DigitalTwinGateway.getInstance();

/**
 * Wire a gateway instance into the trait handlers so that
 * DigitalTwinTrait and HoloTwinTrait can communicate with physical devices.
 *
 * Usage:
 *   import { digitalTwinGateway, setGateway } from '@holoscript/core/services/DigitalTwinGateway';
 *   setGateway(digitalTwinGateway);
 */
export function setGateway(gateway: IotGateway): void {
  (digitalTwinHandler as Record<string, unknown>).gateway = gateway;
  (holoTwinHandler as Record<string, unknown>).gateway = gateway;
}
