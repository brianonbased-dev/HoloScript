/**
 * FriendManager.ts
 *
 * Manages friend requests, accept/reject logic, and blocking.
 * Emits events for UI/System integration.
 *
 * @module social
 */

import { SocialGraph, SocialUser, RelationshipType } from './SocialGraph';
import { WebRTCTransport } from '../network/WebRTCTransport';

type SocialEventListener = (event: string, data: unknown) => void;

export class FriendManager {
  private listeners: Set<SocialEventListener> = new Set();

  constructor(
    private graph: SocialGraph,
    private transport?: WebRTCTransport // Optional for testing/offline support
  ) {
    if (this.transport) {
      this.transport.onSocialMessage(this.handleNetworkMessage.bind(this));
    }
  }

  private handleNetworkMessage(packet: unknown) {
    // payload structure depends on packet type
    const { type, payload } = packet;

    switch (type) {
      case 'SOCIAL_REQUEST':
        this.receiveRequest(payload.user);
        break;
      case 'SOCIAL_ACCEPT':
        this.graph.setRelationship(payload.userId, 'friend');
        this.emit('friend_added', { userId: payload.userId });
        break;
      case 'SOCIAL_REJECT':
        this.emit('request_rejected', { userId: payload.userId });
        break;
    }
  }

  onEvent(listener: SocialEventListener): void {
    this.listeners.add(listener);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.forEach((l) => l(event, data));
  }

  /**
   * Send a friend request to a user
   */
  sendRequest(user: SocialUser): void {
    const currentRel = this.graph.getRelationship(user.id);

    if (currentRel === 'friend') {
      throw new Error('User is already a friend');
    }
    if (currentRel === 'blocked') {
      throw new Error('User is blocked');
    }
    if (currentRel === 'pending_outgoing') {
      return; // Already sent
    }

    // In a real system, this would make an API call
    // For now, we update local graph optimistically
    this.graph.updateUser(user);
    this.graph.setRelationship(user.id, 'pending_outgoing');

    if (this.transport) {
      this.transport.sendSocialMessage({
        type: 'SOCIAL_REQUEST',
        payload: { user: this.graph.getUser(this.graph['localUserId']) }, // Send OUR profile to them
      });
    }

    this.emit('request_sent', { userId: user.id });
  }

  /**
   * Simulate receiving a friend request (e.g. from network)
   */
  receiveRequest(user: SocialUser): void {
    const currentRel = this.graph.getRelationship(user.id);
    if (currentRel === 'blocked') return; // Auto-ignore
    if (currentRel === 'friend') return; // Already friends

    this.graph.updateUser(user);
    this.graph.setRelationship(user.id, 'pending_incoming');
    this.emit('request_received', { user });
  }

  /**
   * Accept an incoming friend request
   */
  acceptRequest(userId: string): void {
    const rel = this.graph.getRelationship(userId);
    if (rel !== 'pending_incoming') {
      throw new Error('No pending request from this user');
    }

    this.graph.setRelationship(userId, 'friend');

    if (this.transport) {
      this.transport.sendSocialMessage({
        type: 'SOCIAL_ACCEPT',
        payload: { userId: this.graph['localUserId'] },
      });
    }

    this.emit('friend_added', { userId });
  }

  /**
   * Reject an incoming friend request
   */
  rejectRequest(userId: string): void {
    const rel = this.graph.getRelationship(userId);
    if (rel !== 'pending_incoming') return;

    this.graph.removeRelationship(userId);

    if (this.transport) {
      this.transport.sendSocialMessage({
        type: 'SOCIAL_REJECT',
        payload: { userId: this.graph['localUserId'] },
      });
    }

    this.emit('request_rejected', { userId });
  }

  /**
   * Remove a friend
   */
  removeFriend(userId: string): void {
    this.graph.removeRelationship(userId);
    this.emit('friend_removed', { userId });
  }

  /**
   * Block a user
   */
  blockUser(user: SocialUser): void {
    this.graph.updateUser(user);
    this.graph.setRelationship(user.id, 'blocked');
    this.emit('user_blocked', { userId: user.id });
  }

  unblockUser(userId: string): void {
    this.graph.removeRelationship(userId);
    this.emit('user_unblocked', { userId });
  }

  isBlocked(userId: string): boolean {
    return this.graph.getRelationship(userId) === 'blocked';
  }
}
