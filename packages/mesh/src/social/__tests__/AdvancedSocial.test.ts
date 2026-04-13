import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialGraph } from '@holoscript/core';
import { FriendManager } from '@holoscript/core';
import { ConversationManager } from '@holoscript/core';
import { PartyManager } from '@holoscript/core';
import { WebRTCTransport } from '../../network/WebRTCTransport';

class MockTransport {
  socialHandlers: Set<(packet: any) => void> = new Set();
  lastSentPacket: any = null;
  lastTarget: string | null = null;

  sendSocialMessage(packet: any, target?: string) {
    this.lastSentPacket = packet;
    this.lastTarget = target || null;
  }

  onSocialMessage(handler: (packet: any) => void) {
    this.socialHandlers.add(handler);
  }

  receiveFake(packet: any) {
    this.socialHandlers.forEach((handler) => handler(packet));
  }
}

describe('Advanced Social Features', () => {
  let graph: SocialGraph;
  let transport: MockTransport;
  let friendManager: FriendManager;
  let conversationManager: ConversationManager;
  let partyManager: PartyManager;

  beforeEach(() => {
    graph = new SocialGraph('alice');
    graph.updateUser({
      id: 'alice',
      username: 'alice',
      displayName: 'Alice',
      status: 'online',
      lastSeen: 0,
    });

    transport = new MockTransport();
    friendManager = new FriendManager(graph, transport as unknown as WebRTCTransport);
    conversationManager = new ConversationManager(
      graph,
      friendManager,
      transport as unknown as WebRTCTransport
    );
    partyManager = new PartyManager(graph, transport as unknown as WebRTCTransport);
  });

  it('should send DMs', () => {
    conversationManager.sendMessage('bob', 'hello');

    expect(transport.lastSentPacket).toMatchObject({
      type: 'SOCIAL_MESSAGE',
      payload: { text: 'hello', senderId: 'alice' },
    });
    expect(transport.lastTarget).toBe('bob');
  });

  it('should block DMs from blocked users', () => {
    // Block bob
    graph.updateUser({
      id: 'bob',
      username: 'bob',
      displayName: 'Bob',
      status: 'online',
      lastSeen: 0,
    });
    friendManager.blockUser({ id: 'bob' } as any);

    // Spy on receive
    const receiveSpy = vi.fn();
    conversationManager.onEvent(receiveSpy);

    // Bob tries to message Alice
    transport.receiveFake({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'bob', text: 'spam', id: '1', timestamp: Date.now() },
    });

    expect(receiveSpy).not.toHaveBeenCalledWith('message_received', expect.anything());
  });

  it('should create and invite to party', () => {
    partyManager.createParty();
    partyManager.inviteUser('bob');

    expect(transport.lastSentPacket).toMatchObject({
      type: 'PARTY_INVITE',
      payload: { from: 'alice' },
    });
    expect(transport.lastTarget).toBe('bob');
  });
});
