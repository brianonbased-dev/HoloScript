import { WebRTCTransport } from '../network/WebRTCTransport';
import { SocialGraph, SocialUser } from './SocialGraph';

export interface PartyMember {
  id: string;
  isLeader: boolean;
  ready: boolean;
}

export interface Party {
  id: string;
  members: PartyMember[];
  maxSize: number;
}

export class PartyManager {
  private currentParty: Party | null = null;
  private listeners: Set<(event: string, data: unknown) => void> = new Set();

  constructor(
    private graph: SocialGraph,
    private transport: WebRTCTransport
  ) {
    this.transport.onSocialMessage(this.handleNetworkMessage.bind(this));
  }

  private handleNetworkMessage(packet: unknown) {
    switch (packet.type) {
      case 'PARTY_INVITE':
        this.emit('party_invite', packet.payload);
        break;
      case 'PARTY_UPDATE':
        if (this.currentParty && this.currentParty.id === packet.payload.partyId) {
          this.currentParty.members = packet.payload.members;
          this.emit('party_updated', this.currentParty);
        }
        break;
    }
  }

  createParty(): void {
    const localId = this.graph['localUserId'];
    this.currentParty = {
      id: crypto.randomUUID(),
      members: [{ id: localId, isLeader: true, ready: true }],
      maxSize: 4,
    };
    this.emit('party_created', this.currentParty);
  }

  inviteUser(targetUserId: string): void {
    if (!this.currentParty) return;

    // Only leader can invite (simplified rule)
    const me = this.currentParty.members.find((m) => m.id === this.graph['localUserId']);
    if (!me?.isLeader) return;

    this.transport.sendSocialMessage(
      {
        type: 'PARTY_INVITE',
        payload: {
          partyId: this.currentParty.id,
          from: this.graph['localUserId'],
        },
      },
      targetUserId
    );
  }

  joinParty(partyId: string, leaderId: string): void {
    // Send join request to leader
    this.transport.sendSocialMessage(
      {
        type: 'PARTY_JOIN',
        payload: {
          partyId,
          userId: this.graph['localUserId'],
        },
      },
      leaderId
    );
  }

  leaveParty(): void {
    if (!this.currentParty) return;

    this.transport.sendSocialMessage({
      type: 'PARTY_LEAVE',
      payload: {
        partyId: this.currentParty.id,
        userId: this.graph['localUserId'],
      },
    }); // Broadcast leave

    this.currentParty = null;
    this.emit('party_left', {});
  }

  onEvent(listener: (event: string, data: unknown) => void) {
    this.listeners.add(listener);
  }

  private emit(event: string, data: unknown) {
    this.listeners.forEach((l) => l(event, data));
  }
}
