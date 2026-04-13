import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartyManager } from '@holoscript/mesh';
import { SocialGraph } from '@holoscript/mesh';

// =============================================================================
// MOCK TRANSPORT
// =============================================================================

function createMockTransport() {
  const handlers: Array<(packet: any) => void> = [];
  return {
    onSocialMessage: vi.fn((handler: (packet: any) => void) => handlers.push(handler)),
    sendSocialMessage: vi.fn(),
    _receive(packet: any) {
      handlers.forEach((h) => h(packet));
    },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('PartyManager', () => {
  let graph: SocialGraph;
  let transport: ReturnType<typeof createMockTransport>;
  let party: PartyManager;
  let events: Array<[string, any]>;

  beforeEach(() => {
    graph = new SocialGraph('me');
    graph.updateUser({ id: 'alice', name: 'Alice', status: 'online', lastSeen: Date.now() });
    transport = createMockTransport();
    party = new PartyManager(graph, transport as any);
    events = [];
    party.onEvent((evt, data) => events.push([evt, data]));
  });

  it('creates a party with the local user as leader', () => {
    party.createParty();
    expect(events.some(([e]) => e === 'party_created')).toBe(true);
    const created = events.find(([e]) => e === 'party_created')![1];
    expect(created.members.length).toBe(1);
    expect(created.members[0].id).toBe('me');
    expect(created.members[0].isLeader).toBe(true);
  });

  it('invites a user via transport', () => {
    party.createParty();
    party.inviteUser('alice');
    expect(transport.sendSocialMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PARTY_INVITE' }),
      'alice'
    );
  });

  it('does not invite when no party exists', () => {
    party.inviteUser('alice');
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
  });

  it('sends join request to party leader', () => {
    party.joinParty('party-123', 'leader-id');
    expect(transport.sendSocialMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PARTY_JOIN',
        payload: expect.objectContaining({ partyId: 'party-123', userId: 'me' }),
      }),
      'leader-id'
    );
  });

  it('leaves the party and emits event', () => {
    party.createParty();
    party.leaveParty();
    expect(events.some(([e]) => e === 'party_left')).toBe(true);
    expect(transport.sendSocialMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PARTY_LEAVE' })
    );
  });

  it('does nothing on leaveParty with no party', () => {
    party.leaveParty();
    expect(events.length).toBe(0);
    // sendSocialMessage should not be called for leave
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
  });

  it('receives party invite from network', () => {
    transport._receive({
      type: 'PARTY_INVITE',
      payload: { partyId: 'p-1', from: 'alice' },
    });
    expect(events.some(([e]) => e === 'party_invite')).toBe(true);
    const invite = events.find(([e]) => e === 'party_invite')![1];
    expect(invite.from).toBe('alice');
  });

  it('updates party members on PARTY_UPDATE', () => {
    party.createParty();
    const partyId = events.find(([e]) => e === 'party_created')![1].id;

    const newMembers = [
      { id: 'me', isLeader: true, ready: true },
      { id: 'alice', isLeader: false, ready: false },
    ];

    transport._receive({
      type: 'PARTY_UPDATE',
      payload: { partyId, members: newMembers },
    });

    expect(events.some(([e]) => e === 'party_updated')).toBe(true);
    const updated = events.find(([e]) => e === 'party_updated')![1];
    expect(updated.members.length).toBe(2);
  });

  it('ignores PARTY_UPDATE for wrong party', () => {
    party.createParty();
    transport._receive({
      type: 'PARTY_UPDATE',
      payload: { partyId: 'wrong-id', members: [] },
    });
    expect(events.filter(([e]) => e === 'party_updated').length).toBe(0);
  });

  it('non-leader cannot invite', () => {
    // Create party but manipulate to make local user non-leader
    party.createParty();
    const partyEvent = events.find(([e]) => e === 'party_created')![1];
    partyEvent.members[0].isLeader = false;
    transport.sendSocialMessage.mockClear();

    party.inviteUser('alice');
    // Should not send because non-leader
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
  });
});
