/**
 * IoT Gateway Adapter Interface
 *
 * Defines the contract for connecting to Industrial IoT gateways.
 * Decouples Core from specific implementations (like the Sovereign DigitalTwinGateway).
 */

export interface IotGateway {
  /**
   * Connect to a physical device
   */
  connect(deviceId: string, connectionString: string): void;

  /**
   * Disconnect from a device
   */
  disconnect(deviceId: string): void;

  /**
   * Send a command or property update to the device
   */
  sendUpdate(deviceId: string, property: string, value: unknown): void;

  /**
   * Subscribe to gateway events
   */
  on(event: 'telemetry' | 'connected' | 'disconnected' | 'error', listener: (data: unknown) => void): void;

  /**
   * Unsubscribe
   */
  off(event: string, listener: (data: unknown) => void): void;
}
