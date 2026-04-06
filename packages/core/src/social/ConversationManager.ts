import { WebRTCTransport } from '../network/WebRTCTransport';
import { FriendManager } from './FriendManager';
import { SocialGraph } from './SocialGraph';

export interface SocialMessage {
  id: string;
  senderId: string;
  timestamp: number;
  text: string;
  read: boolean;
}

export class ConversationManager {
  private conversations: Map<string, SocialMessage[]> = new Map();
  private listeners: Set<(event: string, data: unknown) => void> = new Set();

  constructor(
    private graph: SocialGraph,
    private friendManager: FriendManager,
    private transport: WebRTCTransport
  ) {
    this.transport.onSocialMessage(this.handleNetworkMessage.bind(this));
  }

  private handleNetworkMessage(packet: unknown) {
    if (packet.type === 'SOCIAL_MESSAGE') {
      const { senderId, text, id, timestamp } = packet.payload;

      // Check blocking
      if (this.friendManager.isBlocked(senderId)) {
        this.emit('message_blocked', { senderId });
        return;
      }

      this.receiveMessage(senderId, text, id, timestamp);
    }
  }

  sendMessage(targetUserId: string, text: string): void {
    if (this.friendManager.isBlocked(targetUserId)) {
      throw new Error('Cannot message blocked user');
    }

    const msg: SocialMessage = {
      id: crypto.randomUUID(),
      senderId: this.graph['localUserId'], // Accessing private for now
      timestamp: Date.now(),
      text,
      read: true, // My own messages are read
    };

    // Add to local history
    this.addMessageToHistory(targetUserId, msg);

    // Send over network
    this.transport.sendSocialMessage(
      {
        type: 'SOCIAL_MESSAGE',
        payload: {
          senderId: msg.senderId,
          text: msg.text,
          id: msg.id,
          timestamp: msg.timestamp,
        },
      },
      targetUserId
    ); // Targeted send

    this.emit('message_sent', { targetUserId, message: msg });
  }

  private receiveMessage(senderId: string, text: string, id: string, timestamp: number) {
    const msg: SocialMessage = {
      id,
      senderId,
      timestamp,
      text,
      read: false,
    };

    this.addMessageToHistory(senderId, msg);
    this.emit('message_received', { senderId, message: msg });
  }

  getHistory(userId: string): SocialMessage[] {
    return this.conversations.get(userId) || [];
  }

  markAsRead(userId: string): void {
    const history = this.conversations.get(userId);
    if (history) {
      history.forEach((m) => (m.read = true));
      this.emit('conversation_read', { userId });
    }
  }

  private addMessageToHistory(userId: string, msg: SocialMessage) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    this.conversations.get(userId)!.push(msg);
    // Sort by time just in case
    this.conversations.get(userId)!.sort((a, b) => a.timestamp - b.timestamp);
  }

  onEvent(listener: (event: string, data: unknown) => void) {
    this.listeners.add(listener);
  }

  private emit(event: string, data: unknown) {
    this.listeners.forEach((l) => l(event, data));
  }
}
