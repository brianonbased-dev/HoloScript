import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  resolveMessageRecipient,
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
    expect(messageAddressedTo({ content: '@claude6-x402 please land 2d8945e29' }, 'claude6')).toBe(
      true
    );
    expect(firstMention('@jetson and @claude6')).toBe('jetson');
  });

  it('reads a handle only where a handle can stand (2026-09-29)', () => {
    // An npm scope, an email address and a code span are not readers. Each of these once
    // addressed a room-wide review request to one member, or to no one.
    expect(extractMentions('rebuild: pnpm --filter @holoscript/wasm run rebuild')).toEqual([]);
    expect(extractMentions('write to josep@example.com')).toEqual([]);
    expect(extractMentions('the `@unknown` read rule')).toEqual([]);
    expect(extractMentions('```hs\n@trait Config { }\n```')).toEqual([]);
    // Handles still count, at the end of a sentence, in parentheses, after a code span.
    expect(extractMentions('thanks @claude6-x402.')).toEqual(['claude6']);
    expect(extractMentions('(ask @grok1-x402)')).toEqual(['grok1']);
    expect(firstMention('see `@unknown`, then @jetson')).toBe('jetson');
    // A room-wide request that only names code stays room-wide.
    expect(
      resolveMessageRecipient({
        members: [{ agentId: 'agent_hs', agentName: 'holoscript' }],
        content: 'review: the `@unknown` rule; pnpm --filter @holoscript/wasm run rebuild',
        messageType: 'review-request',
      })
    ).toEqual({});
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

// The case table is shared with ai-ecosystem (hooks/lib/__tests__/mention-cases.json is a
// byte-identical copy that its own copy of this rule runs), so a sender and this server cannot
// disagree about who a message is for without one of the two suites going red. It holds all 74
// rows of claude3's review table for #455 plus one row for each planted fault those rows missed.
type MentionCase = { why: string; text: string; mentions: string[] };
const MENTION_TABLE = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mention-cases.json'), 'utf8')
) as { cases: MentionCase[] };

describe('which @name is a reader: the case table shared with ai-ecosystem', () => {
  it('carries every row of the review table and says why each row is there', () => {
    const rows = MENTION_TABLE.cases.map((row) => row.why);
    for (let n = 1; n <= 74; n += 1) {
      expect(rows.some((why) => why.startsWith(`claude3 row ${n}:`))).toBe(true);
    }
    expect(new Set(rows).size).toBe(rows.length);
  });

  it.each(MENTION_TABLE.cases)('$why', ({ text, mentions }) => {
    expect(extractMentions(text)).toEqual(mentions);
    expect(firstMention(text)).toBe(mentions[0] ?? '');
  });
});

// claude3's review of #455, P2: real mentions lost their reader, or went to someone else. These
// go through the functions the routes call (resolveMessageRecipient on POST, messageAddressedTo
// for the inbox and ?for=), not only through extractMentions.
describe('a real mention keeps its reader (claude3 review of #455)', () => {
  const members = [
    { agentId: 'agent_c2', agentName: 'claude2-x402' },
    { agentId: 'agent_c3', agentName: 'claude3-x402' },
    { agentId: 'agent_g1', agentName: 'grok1-x402' },
  ];
  const readerOf = (content: string) =>
    resolveMessageRecipient({ members, content, messageType: 'review-request' });
  const claude2 = { toAgentId: 'agent_c2', toAgentName: 'claude2-x402' };
  const claude3 = { toAgentId: 'agent_c3', toAgentName: 'claude3-x402' };

  it('reads a handle glued after a full stop, an ellipsis, a hyphen or a slash', () => {
    for (const content of [
      'Done.@claude3 look',
      'wait...@claude3 look',
      'one more thing--@claude3 can you look',
      'see/@claude3',
    ]) {
      expect(readerOf(content)).toEqual(claude3);
    }
  });

  it('gives "@a/@b and @c" to the first handle, and "@a/@b" to a rather than to the room', () => {
    expect(readerOf('@claude2/@claude3 and @grok1')).toEqual(claude2);
    expect(readerOf('@claude2/@claude3 please review')).toEqual(claude2);
  });

  it('does not let a lone backtick pair with a later code span', () => {
    expect(readerOf('I use ` here, @claude3 please review `foo`')).toEqual(claude3);
    expect(readerOf('don`t forget @claude3 to run `pnpm test`')).toEqual(claude3);
    expect(readerOf('I use ` here, @claude3 please review (`foo`)')).toEqual(claude3);
  });

  it('still keeps a package, an email address and code out of the reader slot', () => {
    expect(readerOf('pnpm --filter @holoscript/wasm run rebuild, then @claude3')).toEqual(claude3);
    expect(readerOf('mail josep@example.com, then @claude3')).toEqual(claude3);
    expect(readerOf('the `@unknown` rule, then @claude3')).toEqual(claude3);
    expect(readerOf('pnpm --filter "@holoscript/*" build')).toEqual({});
  });

  it('keeps a legacy post with a glued mention in its reader inbox and ?for= slice', () => {
    const legacy = { content: 'Done.@claude3 please land 2d8945e29' };
    expect(messageAddressedTo(legacy, 'claude3-x402')).toBe(true);
    expect(messageAddressedToAny(legacy, ['grok1'])).toBe(false);
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

  const roomPost = {
    id: 'm1',
    fromAgentId: 'alice',
    fromAgentName: 'Alice',
    content: 'standup in 5',
  };
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
      {
        id: 'b1',
        messageType: 'dm',
        fromAgentName: 'Alice',
        toAgentName: 'Bob',
        content: 'for bob',
      },
      {
        id: 'b2',
        messageType: 'dm',
        fromAgentName: 'Alice',
        toAgentName: 'Carol',
        content: 'for carol',
      },
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
    const toSeat = [
      { id: 'm5', fromAgentName: 'Alice', toAgentName: 'claudecode-claude', content: 'yours' },
    ];
    expect(visibleTeamMessagesFor(toSeat, seat).map((m) => m.id)).toEqual(['m5']);
  });
});
