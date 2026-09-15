/**
 * A team message must not be addressed to a name nobody owns.
 *
 * The recipient of a handoff was taken from the first `@word` in the body, with
 * no check that the word named anyone. Package scopes and protocol names look
 * exactly like handles, so two handoffs on 2026-09-15 were filed to agents
 * called "coinbase" and "holoscript" (msg_1789509221626_o5yvn0 and
 * msg_1789509710435_ktg570). No seat's inbox flagged them, because the messages
 * were addressed to seats that do not exist.
 *
 * A body mention now addresses a message only when it resolves to a real member
 * of the team. An explicit recipient field is the sender's stated intent and is
 * left exactly as it was.
 */
import { describe, expect, it } from 'vitest';
import {
  INBOX_MESSAGE_TYPE_SET,
  findTeamMember,
  firstMention,
  resolveMessageRecipient,
} from '../message-addressing';

const MEMBERS = [
  { agentId: 'agent_claude4', agentName: 'claude4-x402' },
  { agentId: 'agent_jetson', agentName: 'jetson-orin-super' },
];

describe('watched fail: the mention-as-recipient rule that produced the bad handoffs', () => {
  it('turned an npm scope into a recipient because nothing checked it existed', () => {
    const content = '@coinbase x402 middleware is wired, handing off';
    const messageType = 'handoff';

    // The exact composition the board message route used.
    const toNeedle = INBOX_MESSAGE_TYPE_SET.has(messageType) ? firstMention(content) : '';
    const member = findTeamMember(MEMBERS, toNeedle);
    const toAgentName = member?.agentName || toNeedle;

    expect(toNeedle).toBe('coinbase');
    expect(member).toBeUndefined();
    // Recorded as mail for a seat that does not exist.
    expect(toAgentName).toBe('coinbase');
  });
});

describe('resolveMessageRecipient', () => {
  it('does not address a handoff to a mention that names no team member', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      content: '@coinbase x402 middleware is wired, handing off',
      messageType: 'handoff',
    });

    expect(result.toAgentId).toBeUndefined();
    expect(result.toAgentName).toBeUndefined();
  });

  it('does not address a handoff to a protocol name that looks like a handle', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      content: '@holoscript absorb finished, see the receipt',
      messageType: 'handoff',
    });

    expect(result.toAgentName).toBeUndefined();
  });

  it('still addresses a mention that names a real member, suffix and case included', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      content: '@claude4 please land this',
      messageType: 'handoff',
    });

    expect(result.toAgentId).toBe('agent_claude4');
    expect(result.toAgentName).toBe('claude4-x402');
  });

  it('leaves an explicit recipient alone even when it names no current member', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      explicitTo: 'codex-seat',
      content: 'no mention in this body',
      messageType: 'handoff',
    });

    expect(result.toAgentName).toBe('codex-seat');
  });

  it('prefers the explicit recipient over a mention in the body', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      explicitTo: 'jetson-orin-super',
      content: '@coinbase mentioned only in passing',
      messageType: 'handoff',
    });

    expect(result.toAgentId).toBe('agent_jetson');
    expect(result.toAgentName).toBe('jetson-orin-super');
  });

  it('ignores mentions entirely on message types that are not inbox mail', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      content: '@claude4 just chatting on the team feed',
      messageType: 'text',
    });

    expect(result.toAgentId).toBeUndefined();
    expect(result.toAgentName).toBeUndefined();
  });

  it('addresses no one when there is neither an explicit field nor a mention', () => {
    const result = resolveMessageRecipient({
      members: MEMBERS,
      content: 'status update for the room',
      messageType: 'handoff',
    });

    expect(result).toEqual({});
  });
});
