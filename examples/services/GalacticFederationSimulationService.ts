import { getGalacticProtocolService } from './GalacticProtocolService';
import {
  getGovernanceOrchestrator,
  GovernanceProposal,
} from '../singularity/GovernanceOrchestrator';
import { logger } from '@/utils/logger';

export interface SimulationEntity {
  id: string;
  type: 'fleet' | 'proposal' | 'singularity' | 'station';
  position: [number, number, number];
  color: string;
  label: string;
  status: string;
  metadata: Record<string, any>;
}

export interface SimulationState {
  timestamp: number;
  entities: SimulationEntity[];
  activeMissions: number;
  unresolvedProposals: number;
  signalStrength: number;
}

export class GalacticFederationSimulationService {
  private static instance: GalacticFederationSimulationService;
  private protocolService = getGalacticProtocolService();
  private governance = getGovernanceOrchestrator();

  private constructor() {}

  public static getInstance(): GalacticFederationSimulationService {
    if (!GalacticFederationSimulationService.instance) {
      GalacticFederationSimulationService.instance = new GalacticFederationSimulationService();
    }
    return GalacticFederationSimulationService.instance;
  }

  /**
   * Generates the current simulation state by merging governance and protocol data
   */
  public async getSimulationState(): Promise<SimulationState> {
    const signals = this.protocolService.getVisualBuffer();
    const proposals = this.governance.getProposals();

    const entities: SimulationEntity[] = [];

    // 1. Map Signals to Fleet/Events
    signals.forEach((sig) => {
      const hash = this.stringToHash(sig.id);
      const angle = (hash % 360) * (Math.PI / 180);
      const radius = 3 + (hash % 20) / 10;

      entities.push({
        id: sig.id,
        type: sig.type === 'SINGULARITY_EVENT' ? 'singularity' : 'fleet',
        position: [Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius],
        color: this.getSignalColor(sig.type),
        label: sig.sourceUniverseId.substring(0, 8),
        status: 'TRANSITING',
        metadata: sig.payload || {},
      });
    });

    // 2. Map Proposals to Strategic Points
    proposals
      .filter((p) => p.status === 'pending')
      .forEach((prop) => {
        const hash = this.stringToHash(prop.id);
        const angle = ((hash + 180) % 360) * (Math.PI / 180); // Opposite side of signals
        const radius = 5 + (hash % 10) / 10;

        entities.push({
          id: prop.id,
          type: 'proposal',
          position: [Math.cos(angle) * radius, 1.0, Math.sin(angle) * radius],
          color: '#FFD700', // Gold for proposals
          label: `PROP-${prop.id.split('-')[1] || prop.id.substring(0, 4)}`,
          status: prop.status.toUpperCase(),
          metadata: {
            description: prop.description,
            proposedBy: prop.proposedBy,
            votes: prop.voteCount,
            sentimentRequired: prop.sentimentRequired,
          },
        });
      });

    return {
      timestamp: Date.now(),
      entities,
      activeMissions: signals.length,
      unresolvedProposals: proposals.filter((p) => p.status === 'pending').length,
      signalStrength: Math.min(100, signals.length * 10),
    };
  }

  private stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  private getSignalColor(type: string): string {
    switch (type) {
      case 'WORK_POST':
        return '#00ff00';
      case 'HELLO_UNIVERSE':
        return '#00ffff';
      case 'SINGULARITY_EVENT':
        return '#ff00ff';
      default:
        return '#ffffff';
    }
  }
}

export const getGalacticFederationSimulationService = () =>
  GalacticFederationSimulationService.getInstance();
