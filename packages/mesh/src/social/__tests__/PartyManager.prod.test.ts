/**
 * PartyManager — Production Test Suite
 *
 * Tests party creation, invite, join, leave, network message handling,
 * party updates, leader permissions, and event emission.
 * Mocks WebRTCTransport and SocialGraph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PartyManager } from '@holoscript/core';
import { SocialGraph } from '@holoscript/core';

function makeTransportMock() {
  const listeners: Array<(packet: any) => void> = [];
  return {
    onSocialMessage: vi.fn((cb: (packet: any) => void) => listeners.push(cb)),
    sendSocialMessage: vi.fn(),
    _deliver: (packet: any) => listeners.forEach((l) => l(packet)),
  };
}

describe('PartyManager — Production', () => {
  let graph: SocialGraph;
  let transport: ReturnType<typeof makeTransportMock>;
  let manager: PartyManager;

  beforeEach(() => {
    graph = new SocialGraph('me');
    transport = makeTransportMock();
    manager = new PartyManager(graph as any, transport as any);
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs and registers network listener', () => {
    expect(manager).toBeDefined();
    expect(transport.onSocialMessage).toHaveBeenCalled();
  });

  // ─── createParty ─────────────────────────────────────────────────────
  it('createParty emits party_created event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.createParty();
    expect(events).toContain('party_created');
  });

  it('createParty event data has id and members', () => {
    let partyData: any;
    manager.onEvent((ev, data) => {
      if (ev === 'party_created') partyData = data;
    });
    manager.createParty();
    expect(partyData).toBeDefined();
    expect(partyData.id).toBeDefined();
    expect(Array.isArray(partyData.members)).toBe(true);
  });

  it('createParty creates party with local user as leader', () => {
    let partyData: any;
    manager.onEvent((ev, data) => {
      if (ev === 'party_created') partyData = data;
    });
    manager.createParty();
    const leader = partyData.members.find((m: any) => m.isLeader);
    expect(leader).toBeDefined();
    expect(leader.id).toBe('me');
  });

  it('createParty sets maxSize to 4 by default', () => {
    let partyData: any;
    manager.onEvent((ev, data) => {
      if (ev === 'party_created') partyData = data;
    });
    manager.createParty();
    expect(partyData.maxSize).toBe(4);
  });

  // ─── inviteUser ──────────────────────────────────────────────────────
  it('inviteUser does nothing if no party exists', () => {
    expect(() => manager.inviteUser('alice')).not.toThrow();
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
  });

  it('inviteUser (as leader) calls transport.sendSocialMessage', () => {
    manager.createParty();
    manager.inviteUser('alice');
    expect(transport.sendSocialMessage).toHaveBeenCalled();
  });

  it('inviteUser sends PARTY_INVITE packet', () => {
    manager.createParty();
    manager.inviteUser('alice');
    const call = transport.sendSocialMessage.mock.calls[0][0];
    expect(call.type).toBe('PARTY_INVITE');
    expect(call.payload.partyId).toBeDefined();
    expect(call.payload.from).toBe('me');
  });

  // ─── joinParty ───────────────────────────────────────────────────────
  it('joinParty sends PARTY_JOIN to leader', () => {
    manager.joinParty('party-123', 'leader-456');
    expect(transport.sendSocialMessage).toHaveBeenCalled();
    const call = transport.sendSocialMessage.mock.calls[0][0];
    expect(call.type).toBe('PARTY_JOIN');
    expect(call.payload.partyId).toBe('party-123');
  });

  // ─── leaveParty ──────────────────────────────────────────────────────
  it('leaveParty does nothing if not in a party', () => {
    expect(() => manager.leaveParty()).not.toThrow();
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
  });

  it('leaveParty emits party_left event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.createParty();
    manager.leaveParty();
    expect(events).toContain('party_left');
  });

  it('leaveParty sends PARTY_LEAVE packet', () => {
    manager.createParty();
    // clear the sendSocialMessage call from createParty (no call expected there)
    transport.sendSocialMessage.mockClear();
    manager.leaveParty();
    expect(transport.sendSocialMessage).toHaveBeenCalled();
    const call = transport.sendSocialMessage.mock.calls[0][0];
    expect(call.type).toBe('PARTY_LEAVE');
  });

  it('leaveParty clears current party', () => {
    let leftEventFired = false;
    manager.onEvent((ev) => {
      if (ev === 'party_left') leftEventFired = true;
    });
    manager.createParty();
    manager.leaveParty();
    // Trying to leave again should still not throw and not fire PARTY_LEAVE again
    transport.sendSocialMessage.mockClear();
    manager.leaveParty();
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
  });

  // ─── Network: PARTY_INVITE ────────────────────────────────────────────
  it('PARTY_INVITE network message emits party_invite event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    transport._deliver({ type: 'PARTY_INVITE', payload: { partyId: 'p1', from: 'alice' } });
    expect(events).toContain('party_invite');
  });

  // ─── Network: PARTY_UPDATE ────────────────────────────────────────────
  it('PARTY_UPDATE for current party emits party_updated event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.createParty();
    // Get the party id from the created event
    let partyId: string;
    manager.onEvent((ev, data) => {
      if (ev === 'party_created') partyId = data.id;
    });
    manager.createParty(); // re-create to capture id
    transport._deliver({
      type: 'PARTY_UPDATE',
      payload: { partyId: partyId!, members: [{ id: 'me', isLeader: true, ready: true }] },
    });
    expect(events).toContain('party_updated');
  });

  it('PARTY_UPDATE for different party is ignored', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.createParty();
    transport._deliver({
      type: 'PARTY_UPDATE',
      payload: { partyId: 'different-party-id', members: [] },
    });
    expect(events).not.toContain('party_updated');
  });

  // ─── onEvent ─────────────────────────────────────────────────────────
  it('multiple listeners all receive events', () => {
    const log1: string[] = [];
    const log2: string[] = [];
    manager.onEvent((ev) => log1.push(ev));
    manager.onEvent((ev) => log2.push(ev));
    manager.createParty();
    expect(log1).toContain('party_created');
    expect(log2).toContain('party_created');
  });
});
