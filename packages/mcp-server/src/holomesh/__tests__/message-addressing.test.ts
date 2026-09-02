import { describe, expect, it } from 'vitest';
import {
  extractMentions,
  findTeamMember,
  firstMention,
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
