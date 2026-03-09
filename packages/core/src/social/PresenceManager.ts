/**
 * PresenceManager.ts
 *
 * Manages presence state (Online, Away, Busy) for the local user
 * and tracks status updates from friends.
 *
 * @module social
 */

import { SocialGraph, UserStatus, SocialUser } from './SocialGraph';
import { WebRTCTransport } from '../network/WebRTCTransport';

export class PresenceManager {
  private localStatus: UserStatus = 'online';
  private heartbeatInterval: any = null;

  constructor(
    private graph: SocialGraph,
    private transport?: WebRTCTransport
  ) {
    if (this.transport) {
      this.transport.onSocialMessage(this.onNetworkMessage.bind(this));
    }
  }

  private onNetworkMessage(packet: any) {
    if (packet.type === 'SOCIAL_STATUS') {
      const { userId, status, activity } = packet.payload;
      this.handlePresenceUpdate(userId, status, activity);
    }
  }

  setLocalStatus(status: UserStatus, activity?: string): void {
    this.localStatus = status;

    if (this.transport) {
      this.transport.sendSocialMessage({
        type: 'SOCIAL_STATUS',
        payload: {
          userId: this.graph['localUserId'], // Accessing private prop via index for now, should expose getter
          status,
          activity,
        },
      });
    }
  }

  getLocalStatus(): UserStatus {
    return this.localStatus;
  }

  /**
   * Called when a presence update is received from the network
   */
  handlePresenceUpdate(userId: string, status: UserStatus, activity?: string): void {
    const user = this.graph.getUser(userId);
    if (user) {
      user.status = status;
      user.lastSeen = Date.now();
      if (activity) user.currentActivity = activity;

      this.graph.updateUser(user);
    }
  }

  startHeartbeat(intervalMs: number = 30000): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      // Re-broadcast current status
      this.setLocalStatus(this.localStatus);
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }
}
