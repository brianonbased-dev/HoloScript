/**
 * NeuralStreamingService - Phase 14: Neural Streaming
 *
 * Orchestrates the high-speed relay of cognitive signals (uAAL) to the visual substrate.
 * Enables real-time feedback loops between agent reasoning and avatar expression.
 *
 * Pattern: P.SIGNAL.NEURAL.01
 */

import { logger } from '../../../utils/logger';
import { BaseService } from '../core/BaseService';
import { UAALOpCode } from './UAALInstructionSet';
export { UAALOpCode };

export interface NeuralPacket {
  packetId: string;
  personaId: string;
  intent: string;
  opCode: UAALOpCode;
  emotionalTone: 'neutral' | 'curious' | 'focused' | 'analytical' | 'excited' | 'troubled';
  confidence: number;
  timestamp: number;
  instructionPointer: number;
  spatialData?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    focusTargetId?: string;
  };
}

let neuralStreamingInstance: NeuralStreamingService | null = null;

export class NeuralStreamingService extends BaseService {
  private activeStreams: Set<(packet: NeuralPacket) => void> = new Set();

  constructor() {
    super({
      name: 'NeuralStreamingService',
      version: '1.0.0',
      description: 'High-concurrency cognitive-to-visual signal relay',
    });
  }

  /**
   * Export a cognitive packet to the neural stream.
   * Optimized for sub-10ms delivery to visual consumers.
   */
  public exportCognition(packet: NeuralPacket): void {
    logger.debug(
      `[NeuralStream] Ôöì Exporting Packet ${packet.packetId} (${UAALOpCode[packet.opCode]}) from ${packet.personaId}`
    );

    // Relay to all active listeners (e.g. WebSocket handlers, Avatar Managers)
    this.activeStreams.forEach((listener) => listener(packet));
  }

  /**
   * Subscribe to the neural stream.
   */
  public subscribe(listener: (packet: NeuralPacket) => void): () => void {
    this.activeStreams.add(listener);
    return () => this.activeStreams.delete(listener);
  }

  /**
   * Helper to derive emotional tone from intent and opCode
   */
  public deriveTone(intent: string, opCode: UAALOpCode): NeuralPacket['emotionalTone'] {
    if (opCode === UAALOpCode.REFLECT) return 'analytical';
    if (opCode === UAALOpCode.INTAKE) return 'curious';
    if (opCode === UAALOpCode.EXEC) return 'focused';
    if (intent.toLowerCase().includes('error') || intent.toLowerCase().includes('fail'))
      return 'troubled';
    if (intent.toLowerCase().includes('success') || intent.toLowerCase().includes('achieved'))
      return 'excited';

    return 'neutral';
  }
}

export function getNeuralStreamingService(): NeuralStreamingService {
  if (!neuralStreamingInstance) {
    neuralStreamingInstance = new NeuralStreamingService();
  }
  return neuralStreamingInstance;
}
