/**
 * Agent Protocol Bridge Interface
 *
 * Defines the contract for external agent protocols (UAA2, etc.) to
 * synchronize with HoloScript messaging.
 */

import { Message } from './MessagingTypes';

/**
 * Generic Agent Message Format
 */
export interface GenericAgentMessage {
  id: string;
  sender: string;
  recipient?: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Interface for Protocol-specific bridges
 */
export interface IAgentProtocolBridge {
  /**
   * Map an external agent message to HoloScript Message schema
   */
  toHoloScript(msg: GenericAgentMessage, channelId: string): Message<any>;

  /**
   * Map a HoloScript message to internal agent schema
   */
  fromHoloScript(holoMsg: Message<any>): GenericAgentMessage;
}

/**
 * Global Bridge Registry for the runtime
 */
export class ProtocolBridgeRegistry {
  private static bridges: Map<string, IAgentProtocolBridge> = new Map();

  static register(protocol: string, bridge: IAgentProtocolBridge) {
    this.bridges.set(protocol, bridge);
  }

  static getBridge(protocol: string): IAgentProtocolBridge | undefined {
    return this.bridges.get(protocol);
  }
}
