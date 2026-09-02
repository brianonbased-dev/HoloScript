import { describe, expect, it } from 'vitest';
import {
  chooseInboxBriefExclusive,
  extractMentions,
  findTeamMember,
  firstMention,
  mergeInboxBrief,
  messageAddressedTo,
  normalizeAgentRef,
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
