/**
 * @holoscript/core - Layer 1: Real-Time Communication Layer
 *
 * UDP/WebRTC-based real-time communication for 90fps agent coordination.
 * Features:
 * - <1ms latency for position sync and frame budget updates
 * - Binary protocol for minimal overhead
 * - 90 messages/second per agent capability
 * - Spatial conflict detection and alerts
 */

import { EventEmitter } from 'events';
import { DEFAULT_REALTIME_CONFIG } from './ProtocolTypes';
import type {
  RealTimeMessage,
  RealTimeMessageBody,
  RealTimeProtocolConfig,
  PositionSyncMessage,
  FrameBudgetMessage,
} from './ProtocolTypes';

// ============================================================================
// MESSAGE ENCODING/DECODING (Binary Protocol)
// ============================================================================

/**
 * Binary message header structure (12 bytes)
 * - Message type (1 byte)
 * - Agent ID length (1 byte)
 * - Timestamp (8 bytes, microseconds)
 * - Reserved (2 bytes)
 */
const HEADER_SIZE = 12;

/**
 * Message type enum for binary encoding
 */
enum MessageTypeCode {
  POSITION_SYNC = 0x01,
  FRAME_BUDGET = 0x02,
  SPATIAL_CONFLICT = 0x03,
  PERFORMANCE_METRIC = 0x04,
}

/**
 * Encode real-time message to binary format
 */
export function encodeRealTimeMessage(message: RealTimeMessage): Buffer {
  // For binary encoding, we use a compact format
  // Header: type (1) + agent_id_len (1) + timestamp (8) + reserved (2) = 12 bytes
  // Body: depends on message type

  const agentIdBytes = Buffer.from(message.agent_id, 'utf-8');
  const agentIdLen = agentIdBytes.length;

  // Determine message type code
  let typeCode: number;
  switch (message.type) {
    case 'position_sync':
      typeCode = MessageTypeCode.POSITION_SYNC;
      break;
    case 'frame_budget':
      typeCode = MessageTypeCode.FRAME_BUDGET;
      break;
    case 'spatial_conflict':
      typeCode = MessageTypeCode.SPATIAL_CONFLICT;
      break;
    case 'performance_metric':
      typeCode = MessageTypeCode.PERFORMANCE_METRIC;
      break;
    default:
      throw new Error(
        `Unknown message type: ${(message as unknown as Record<string, unknown>).type}`
      );
  }

  // Encode based on type
  if (message.type === 'position_sync') {
    const msg = message as PositionSyncMessage;
    // Header (12) + agent_id_len + position (12) + rotation (16) + scale (12) = 52 + agent_id_len
    const bodySize = agentIdLen + 12 + 16 + 12 + (msg.velocity ? 12 : 0);
    const buffer = Buffer.allocUnsafe(HEADER_SIZE + bodySize);
    let offset = 0;

    // Header
    buffer.writeUInt8(typeCode, offset);
    offset += 1;
    buffer.writeUInt8(agentIdLen, offset);
    offset += 1;
    buffer.writeBigInt64BE(BigInt(msg.timestamp), offset);
    offset += 8;
    buffer.writeUInt16BE(0, offset);
    offset += 2; // Reserved

    // Agent ID
    agentIdBytes.copy(buffer, offset);
    offset += agentIdLen;

    // Position (3 floats = 12 bytes)
    buffer.writeFloatBE(msg.position[0], offset);
    offset += 4;
    buffer.writeFloatBE(msg.position[1], offset);
    offset += 4;
    buffer.writeFloatBE(msg.position[2], offset);
    offset += 4;

    // Rotation (4 floats = 16 bytes)
    buffer.writeFloatBE(msg.rotation[0], offset);
    offset += 4;
    buffer.writeFloatBE(msg.rotation[1], offset);
    offset += 4;
    buffer.writeFloatBE(msg.rotation[2], offset);
    offset += 4;
    buffer.writeFloatBE(msg.rotation[3], offset);
    offset += 4;

    // Scale (3 floats = 12 bytes)
    buffer.writeFloatBE(msg.scale[0], offset);
    offset += 4;
    buffer.writeFloatBE(msg.scale[1], offset);
    offset += 4;
    buffer.writeFloatBE(msg.scale[2], offset);
    offset += 4;

    // Velocity (optional, 3 floats = 12 bytes)
    if (msg.velocity) {
      buffer.writeFloatBE(msg.velocity[0], offset);
      offset += 4;
      buffer.writeFloatBE(msg.velocity[1], offset);
      offset += 4;
      buffer.writeFloatBE(msg.velocity[2], offset);
      offset += 4;
    }

    return buffer;
  } else if (message.type === 'frame_budget') {
    const msg = message as FrameBudgetMessage;
    // Header (12) + agent_id_len + frame_time (4) + budget_remaining (4) + target_fps (4) + actual_fps (4) + quality (1) = 29 + agent_id_len
    const bodySize = agentIdLen + 17;
    const buffer = Buffer.allocUnsafe(HEADER_SIZE + bodySize);
    let offset = 0;

    // Header
    buffer.writeUInt8(typeCode, offset);
    offset += 1;
    buffer.writeUInt8(agentIdLen, offset);
    offset += 1;
    buffer.writeBigInt64BE(BigInt(msg.timestamp), offset);
    offset += 8;
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    // Agent ID
    agentIdBytes.copy(buffer, offset);
    offset += agentIdLen;

    // Frame budget data
    buffer.writeFloatBE(msg.frame_time_ms, offset);
    offset += 4;
    buffer.writeFloatBE(msg.budget_remaining_ms, offset);
    offset += 4;
    buffer.writeFloatBE(msg.target_fps, offset);
    offset += 4;
    buffer.writeFloatBE(msg.actual_fps, offset);
    offset += 4;

    // Quality level (1 byte)
    const qualityCode = { high: 0, medium: 1, low: 2, minimal: 3 }[msg.quality_level];
    buffer.writeUInt8(qualityCode, offset);
    offset += 1;

    return buffer;
  } else {
    // For other message types, fall back to JSON encoding
    // (These are less frequent and can afford the overhead)
    const json = JSON.stringify(message);
    const jsonBytes = Buffer.from(json, 'utf-8');
    const buffer = Buffer.allocUnsafe(HEADER_SIZE + agentIdLen + jsonBytes.length);
    let offset = 0;

    // Header
    buffer.writeUInt8(typeCode, offset);
    offset += 1;
    buffer.writeUInt8(agentIdLen, offset);
    offset += 1;
    buffer.writeBigInt64BE(BigInt(message.timestamp), offset);
    offset += 8;
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    // Agent ID
    agentIdBytes.copy(buffer, offset);
    offset += agentIdLen;

    // JSON payload
    jsonBytes.copy(buffer, offset);

    return buffer;
  }
}

/**
 * Decode binary message to RealTimeMessage
 */
export function decodeRealTimeMessage(buffer: Buffer): RealTimeMessage {
  let offset = 0;

  // Read header
  const typeCode = buffer.readUInt8(offset);
  offset += 1;
  const agentIdLen = buffer.readUInt8(offset);
  offset += 1;
  const timestamp = Number(buffer.readBigInt64BE(offset));
  offset += 8;
  offset += 2; // Skip reserved

  // Read agent ID
  const agentId = buffer.toString('utf-8', offset, offset + agentIdLen);
  offset += agentIdLen;

  // Decode based on type
  if (typeCode === MessageTypeCode.POSITION_SYNC) {
    const px = buffer.readFloatBE(offset);
    offset += 4;
    const py = buffer.readFloatBE(offset);
    offset += 4;
    const pz = buffer.readFloatBE(offset);
    offset += 4;
    const position: [number, number, number] = [px, py, pz];

    const rx = buffer.readFloatBE(offset);
    offset += 4;
    const ry = buffer.readFloatBE(offset);
    offset += 4;
    const rz = buffer.readFloatBE(offset);
    offset += 4;
    const rw = buffer.readFloatBE(offset);
    offset += 4;
    const rotation: [number, number, number, number] = [rx, ry, rz, rw];

    const sx = buffer.readFloatBE(offset);
    offset += 4;
    const sy = buffer.readFloatBE(offset);
    offset += 4;
    const sz = buffer.readFloatBE(offset);
    offset += 4;
    const scale: [number, number, number] = [sx, sy, sz];

    let velocity: [number, number, number] | undefined;
    if (offset < buffer.length) {
      const vx = buffer.readFloatBE(offset);
      offset += 4;
      const vy = buffer.readFloatBE(offset);
      offset += 4;
      const vz = buffer.readFloatBE(offset);
      offset += 4;
      velocity = [vx, vy, vz];
    }

    return {
      type: 'position_sync',
      agent_id: agentId,
      timestamp,
      position,
      rotation,
      scale,
      velocity,
    };
  } else if (typeCode === MessageTypeCode.FRAME_BUDGET) {
    const frame_time_ms = buffer.readFloatBE(offset);
    offset += 4;
    const budget_remaining_ms = buffer.readFloatBE(offset);
    offset += 4;
    const target_fps = buffer.readFloatBE(offset);
    offset += 4;
    const actual_fps = buffer.readFloatBE(offset);
    offset += 4;
    const qualityCode = buffer.readUInt8(offset);
    offset += 1;
    const qualityLevels: Array<FrameBudgetMessage['quality_level']> = [
      'high',
      'medium',
      'low',
      'minimal',
    ];
    const quality_level = qualityLevels[qualityCode] ?? 'medium';

    return {
      type: 'frame_budget',
      agent_id: agentId,
      timestamp,
      frame_time_ms,
      budget_remaining_ms,
      target_fps,
      actual_fps,
      quality_level,
    };
  } else {
    // JSON-encoded message
    const json = buffer.toString('utf-8', offset);
    return JSON.parse(json) as RealTimeMessage;
  }
}

// ============================================================================
// REAL-TIME TRANSPORT (UDP/WebRTC)
// ============================================================================

/**
 * Real-time transport interface
 */
export interface RealTimeTransport {
  send(buffer: Buffer, targetAgent?: string): Promise<void>;
  broadcast(buffer: Buffer): Promise<void>;
  close(): Promise<void>;
}

/**
 * UDP-based real-time transport (Node.js environment)
 */
export class UDPRealTimeTransport implements RealTimeTransport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dgram.Socket dynamically imported at runtime
  private socket?: any;
  private port: number;
  private targetHost: string = 'localhost';

  constructor(port: number) {
    this.port = port;
  }

  async init(): Promise<void> {
    // Dynamic import for Node.js dgram module
    const dgram = await import('dgram');
    this.socket = dgram.createSocket('udp4');

    return new Promise((resolve, reject) => {
      this.socket.bind(this.port, () => {
        this.socket.setBroadcast(true);
        resolve();
      });

      this.socket.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  async send(buffer: Buffer, _targetAgent?: string): Promise<void> {
    if (!this.socket) throw new Error('Transport not initialized');

    return new Promise((resolve, reject) => {
      // In production, would use agent registry to lookup agent address
      // For now, send to local broadcast
      this.socket.send(buffer, this.port, this.targetHost, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async broadcast(buffer: Buffer): Promise<void> {
    if (!this.socket) throw new Error('Transport not initialized');

    return new Promise((resolve, reject) => {
      this.socket.send(buffer, this.port, '255.255.255.255', (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.socket) {
      return new Promise((resolve) => {
        this.socket.close(() => resolve());
      });
    }
  }

  onMessage(callback: (buffer: Buffer, rinfo: unknown) => void): void {
    if (!this.socket) throw new Error('Transport not initialized');
    this.socket.on('message', callback);
  }
}

/**
 * WebRTC-based real-time transport (Browser environment)
 */
export class WebRTCRealTimeTransport implements RealTimeTransport {
  private dataChannel?: RTCDataChannel;
  private peerConnection?: RTCPeerConnection;

  constructor(private config: RTCConfiguration) {}

  async init(remoteDescription?: RTCSessionDescriptionInit): Promise<void> {
    this.peerConnection = new RTCPeerConnection(this.config);

    // Create data channel for real-time messages
    this.dataChannel = this.peerConnection.createDataChannel('realtime', {
      ordered: false, // Unordered for minimal latency
      maxRetransmits: 0, // No retransmits (UDP-like)
    });

    // Configure for low-latency
    this.dataChannel.bufferedAmountLowThreshold = 0;

    if (remoteDescription) {
      await this.peerConnection.setRemoteDescription(remoteDescription);
    }
  }

  async send(buffer: Buffer, _targetAgent?: string): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    this.dataChannel.send(new Uint8Array(buffer));
  }

  async broadcast(buffer: Buffer): Promise<void> {
    // WebRTC broadcast would require multiple peer connections
    // For now, just send to the connected peer
    return this.send(buffer);
  }

  async close(): Promise<void> {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
  }

  onMessage(callback: (buffer: Buffer) => void): void {
    if (!this.dataChannel) throw new Error('Data channel not initialized');

    this.dataChannel.onmessage = (event: MessageEvent) => {
      // Convert ArrayBuffer to Buffer
      const buffer = Buffer.from(event.data);
      callback(buffer);
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }
}

// ============================================================================
// LAYER 1 CLIENT
// ============================================================================

/**
 * Layer 1 Real-Time Communication Client
 */
export class Layer1RealTimeClient extends EventEmitter {
  private config: RealTimeProtocolConfig;
  private transport?: RealTimeTransport;
  private agentId: string;
  private messageCount = 0;
  private lastMessageTime = 0;
  private readonly _messageBuffer: RealTimeMessage[] = [];

  constructor(agentId: string, config?: Partial<RealTimeProtocolConfig>) {
    super();
    this.agentId = agentId;
    this.config = { ...DEFAULT_REALTIME_CONFIG, ...config } as RealTimeProtocolConfig;
  }

  /**
   * Initialize transport and start listening
   */
  async init(useWebRTC = false): Promise<void> {
    if (useWebRTC) {
      const transport = new WebRTCRealTimeTransport(
        this.config.webrtc?.iceServers ? { iceServers: this.config.webrtc.iceServers } : {}
      );
      await transport.init();
      this.transport = transport;

      transport.onMessage((buffer) => {
        this.handleIncomingMessage(buffer);
      });
    } else {
      const transport = new UDPRealTimeTransport(this.config.udpPort || 9001);
      await transport.init();
      this.transport = transport;

      transport.onMessage((buffer) => {
        this.handleIncomingMessage(buffer);
      });
    }
  }

  /**
   * Send real-time message
   */
  async send(message: RealTimeMessageBody, targetAgent?: string): Promise<void> {
    if (!this.transport) throw new Error('Transport not initialized');

    // Add agent ID and timestamp
    const fullMessage: RealTimeMessage = {
      ...message,
      agent_id: this.agentId,
      timestamp: this.getMicroseconds(),
    } as RealTimeMessage;

    // Encode to binary
    const buffer = this.config.binary
      ? encodeRealTimeMessage(fullMessage)
      : Buffer.from(JSON.stringify(fullMessage), 'utf-8');

    // Check message size
    if (buffer.length > this.config.maxMessageSize) {
      throw new Error(`Message size ${buffer.length} exceeds max ${this.config.maxMessageSize}`);
    }

    // Rate limiting
    await this.enforceRateLimit();

    // Send
    if (targetAgent) {
      await this.transport.send(buffer, targetAgent);
    } else {
      await this.transport.broadcast(buffer);
    }

    this.messageCount++;
    this.lastMessageTime = Date.now();
  }

  /**
   * Send position sync message
   */
  async sendPositionSync(
    position: [number, number, number],
    rotation: [number, number, number, number],
    scale: [number, number, number],
    velocity?: [number, number, number]
  ): Promise<void> {
    await this.send({
      type: 'position_sync',
      position,
      rotation,
      scale,
      velocity,
    });
  }

  /**
   * Send frame budget message
   */
  async sendFrameBudget(
    frameTimeMs: number,
    budgetRemainingMs: number,
    targetFps: number,
    actualFps: number,
    qualityLevel: 'high' | 'medium' | 'low' | 'minimal'
  ): Promise<void> {
    await this.send({
      type: 'frame_budget',
      frame_time_ms: frameTimeMs,
      budget_remaining_ms: budgetRemainingMs,
      target_fps: targetFps,
      actual_fps: actualFps,
      quality_level: qualityLevel,
    });
  }

  /**
   * Close transport
   */
  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
  }

  /**
   * Handle incoming message
   */
  private handleIncomingMessage(buffer: Buffer): void {
    try {
      const message = this.config.binary
        ? decodeRealTimeMessage(buffer)
        : (JSON.parse(buffer.toString('utf-8')) as RealTimeMessage);

      // Emit typed events
      this.emit('message', message);
      this.emit(message.type, message);

      // Calculate latency
      const latency = (this.getMicroseconds() - message.timestamp) / 1000; // ms
      this.emit('latency', latency);

      if (latency > this.config.targetLatency) {
        this.emit('latency_warning', { message, latency });
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    const minInterval = 1000 / this.config.messagesPerSecond;

    if (timeSinceLastMessage < minInterval) {
      const delay = minInterval - timeSinceLastMessage;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Get current time in microseconds
   */
  private getMicroseconds(): number {
    const hrTime = process.hrtime ? process.hrtime() : [Date.now() / 1000, 0];
    return hrTime[0] * 1000000 + Math.floor(hrTime[1] / 1000);
  }
}
