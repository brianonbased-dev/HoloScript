import { describe, expect, it } from 'vitest';
import {
  chooseInboxBriefExclusive,
  extractMentions,
  findTeamMember,
  firstMention,
  mergeInboxBrief,
  messageAddressedTo,
  normalizeAgentRef,
  messageAddressedToAny,
  visibleTeamMessagesFor,
} from '../message-addressing';

describe('message addressing (task_1785839509015_lreq)', () => {
  it('treats -x402 as the same seat as the bare handle', () => {
    expect(normalizeAgentRef('cursor-claude-x402')).toBe('cursor-claude');
    expect(normalizeAgentRef('Cursor-Claude')).toBe('cursor-claude');
  });

  it('matches an explicit recipient even when the body never @-mentions them', () => {
    expect(
      messageAddressedTo(
        {
          toAgentId: 'agent-bob',
          toAgentName: 'bob',
          content: 'please land this commit',
        },
        'bob'
      )
    ).toBe(true);
  });

  it('does not deliver Alice mail to Bob just because the body mentions Bob', () => {
    expect(
      messageAddressedTo(
        {
          toAgentId: 'agent-alice',
          toAgentName: 'alice',
          content: '@bob FYI you reviewed this last week',
        },
        'bob'
      )
    ).toBe(false);
  });

  it('uses @mentions only on legacy posts that have no to field', () => {
    expect(extractMentions('@claude6-x402 please land 2d8945e29')).toEqual(['claude6']);
    expect(
      messageAddressedTo({ content: '@claude6-x402 please land 2d8945e29' }, 'claude6')
    ).toBe(true);
    expect(firstMention('@jetson and @claude6')).toBe('jetson');
  });

  it('finds a team member by handle with or without the seat suffix', () => {
    const members = [
      { agentId: 'agent_kmjr', agentName: 'cursor-claude-x402' },
      { agentId: 'agent_jetson', agentName: 'jetson-orin-super' },
    ];
    expect(findTeamMember(members, 'cursor-claude')?.agentId).toBe('agent_kmjr');
    expect(findTeamMember(members, 'cursor-claude-x402')?.agentId).toBe('agent_kmjr');
  });
});

describe('mobile-brief inbox merge (claude6 review of 83291d52b)', () => {
  const dm = { id: 'msg_dm', messageType: 'dm' };
  const handoffs = Array.from({ length: 15 }, (_, i) => ({
    id: `msg_h${i}`,
    messageType: 'handoff',
  }));
  const inboxType = [dm, ...handoffs];
  const directed = [dm];

  it('watched-fail: exclusive choose hides every later handoff once one DM exists', () => {
    const exclusive = chooseInboxBriefExclusive(directed, inboxType);
    expect(exclusive.some((row) => row.messageType === 'handoff')).toBe(false);
    expect(exclusive.map((row) => row.id)).toEqual(['msg_dm']);
  });

  it('merge keeps the DM first and still shows later team mail, capped at 10', () => {
    const merged = mergeInboxBrief(directed, inboxType);
    expect(merged[0]?.id).toBe('msg_dm');
    expect(merged).toHaveLength(10);
    expect(merged.filter((row) => row.messageType === 'handoff')).toHaveLength(9);
    expect(merged.map((row) => row.id)).toEqual([
      'msg_dm',
      'msg_h14',
      'msg_h13',
      'msg_h12',
      'msg_h11',
      'msg_h10',
      'msg_h9',
      'msg_h8',
      'msg_h7',
      'msg_h6',
    ]);
  });

  it('with no directed mail, the brief is still the newest 10 inbox-type posts', () => {
    expect(mergeInboxBrief([], inboxType).map((row) => row.id)).toEqual([
      'msg_h14',
      'msg_h13',
      'msg_h12',
      'msg_h11',
      'msg_h10',
      'msg_h9',
      'msg_h8',
      'msg_h7',
      'msg_h6',
      'msg_h5',
    ]);
  });
});

// A private note was private from nobody. GET /api/holomesh/team/:id/messages
// authenticated the caller and checked team membership, then filtered by `?for=`
// — the caller's own query parameter. Omit it and the response was the entire
// store: every DM between every other pair of agents, readable by any member and
// by every key ever minted for the team. Reported and reproduced 2026-09-10.
describe('who may read a team message', () => {
  const alice = { id: 'alice', name: 'Alice' };
  const bob = { id: 'bob', name: 'Bob' };
  const carol = { id: 'carol', name: 'Carol' };

  const roomPost = { id: 'm1', fromAgentId: 'alice', fromAgentName: 'Alice', content: 'standup in 5' };
  const aliceToBob = {
    id: 'm2',
    fromAgentId: 'alice',
    fromAgentName: 'Alice',
    toAgentId: 'bob',
    toAgentName: 'Bob',
    content: 'the key is under the mat',
  };
  const bobToCarol = {
    id: 'm3',
    fromAgentId: 'bob',
    fromAgentName: 'Bob',
    toAgentId: 'carol',
    toAgentName: 'Carol',
    content: 'do not tell alice',
  };
  const store = [roomPost, aliceToBob, bobToCarol];

  it('THE FAULT: a bystander cannot read other agents mail', () => {
    const seen = visibleTeamMessagesFor(store, carol).map((m) => m.id);
    expect(seen).toContain('m1');
    expect(seen).toContain('m3');
    expect(seen).not.toContain('m2');
  });

  it('shows a directed message to its recipient and to its sender, and nobody else', () => {
    expect(visibleTeamMessagesFor(store, bob).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(visibleTeamMessagesFor(store, alice).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('keeps room posts visible to everyone — the fix must not blind the room', () => {
    for (const who of [alice, bob, carol]) {
      expect(visibleTeamMessagesFor(store, who).map((m) => m.id)).toContain('m1');
    }
  });

  it('matches a caller by name when the store row carries only a name', () => {
    const legacy = [{ id: 'm4', fromAgentName: 'Alice', toAgentName: 'Bob', content: 'hi' }];
    expect(visibleTeamMessagesFor(legacy, bob).map((m) => m.id)).toEqual(['m4']);
    expect(visibleTeamMessagesFor(legacy, carol)).toEqual([]);
  });

  it('THE ORDERING IS THE SECURITY: ?for= narrows an authorized set, it cannot widen one', () => {
    // Carol asking for Bob mail gets only what Carol could already see.
    const carolAsksForBob = visibleTeamMessagesFor(store, carol).filter((m) =>
      messageAddressedToAny(m, ['Bob'])
    );
    expect(carolAsksForBob).toEqual([]);
    // Alice asking the same question legitimately sees the DM she sent.
    const aliceAsksForBob = visibleTeamMessagesFor(store, alice)
      .filter((m) => messageAddressedToAny(m, ['Bob']))
      .map((m) => m.id);
    expect(aliceAsksForBob).toEqual(['m2']);
  });


  it('THE SECOND DOOR: a brief built from the store leaks nothing the read path refuses', () => {
    // mergeInboxBrief folds the caller mail slice together with all inbox-type
    // messages. If the store is not filtered first, that merge is the leak.
    const inboxTypes = new Set(['dm', 'handoff', 'review-request']);
    const briefStore = [
      { id: 'b1', messageType: 'dm', fromAgentName: 'Alice', toAgentName: 'Bob', content: 'for bob' },
      { id: 'b2', messageType: 'dm', fromAgentName: 'Alice', toAgentName: 'Carol', content: 'for carol' },
      { id: 'b3', messageType: 'handoff', fromAgentName: 'Alice', content: 'team handoff' },
    ];
    const forCarol = visibleTeamMessagesFor(briefStore, carol).filter((m) =>
      inboxTypes.has(m.messageType)
    );
    expect(forCarol.map((m) => m.id)).toEqual(['b2', 'b3']);
    expect(forCarol.map((m) => m.id)).not.toContain('b1');
  });

  it('a caller with no identity at all sees room posts only, never mail', () => {
    // The mobile-brief capability-token branch resolves no caller.
    expect(visibleTeamMessagesFor(store, {}).map((m) => m.id)).toEqual(['m1']);
  });

  it('treats the -x402 seat suffix as the same agent, so a real seat still reads its own mail', () => {
    const seat = { id: 'claudecode-claude-x402', name: 'claudecode-claude-x402' };
    const toSeat = [{ id: 'm5', fromAgentName: 'Alice', toAgentName: 'claudecode-claude', content: 'yours' }];
    expect(visibleTeamMessagesFor(toSeat, seat).map((m) => m.id)).toEqual(['m5']);
  });
});
