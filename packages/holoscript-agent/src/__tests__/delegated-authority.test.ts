import { describe, it, expect, vi } from 'vitest';
import {
  classifyAuthorityRoute,
  DelegatedAuthorityHandler,
  type TeamMessage,
  type AuthorityRequest,
} from '../delegated-authority.js';
import type { HolomeshClient } from '../holomesh-client.js';
import type { ILLMProvider } from '@holoscript/llm-provider';

function makeMessage(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: 'msg_1',
    fromAgentId: 'agent_a',
    fromAgentName: 'claude1',
    content: 'hello',
    messageType: 'dm',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHandler(
  opts: {
    messages?: TeamMessage[];
    allowList?: Set<string>;
    permittedActions?: Set<string>;
    provider?: ILLMProvider;
    systemPrompt?: string;
    processedMessageIds?: Set<string>;
    maxProcessedIds?: number;
  } = {}
) {
  const mesh = {
    getTeamMessages: vi.fn(async () => opts.messages ?? []),
    sendTeamMessage: vi.fn(async () => {}),
    setTeamMode: vi.fn(async (mode: string) => ({ mode, unchanged: false })),
    patchRoomPrefs: vi.fn(async (prefs) => ({
      communicationStyle: prefs.communicationStyle ?? 'task_first',
      objective: prefs.objective ?? '',
    })),
    updateTask: vi.fn(async () => ({ success: true })),
    deleteTask: vi.fn(async () => ({ success: true })),
    delegateTask: vi.fn(async () => ({ success: true })),
  } as unknown as HolomeshClient;

  const handler = new DelegatedAuthorityHandler({
    mesh,
    provider: opts.provider,
    systemPrompt: opts.systemPrompt,
    allowList: opts.allowList,
    permittedActions: opts.permittedActions,
    processedMessageIds: opts.processedMessageIds,
    maxProcessedIds: opts.maxProcessedIds,
  });

  return { handler, mesh };
}

describe('DelegatedAuthorityHandler.parseRequest', () => {
  it('parses structured JSON envelope', () => {
    const { handler } = makeHandler();
    const envelope = {
      protocol: 'delegated-authority/v1',
      requestType: 'owner-op',
      action: 'set-team-mode',
      payload: { mode: 'audit' },
    };
    const msg = makeMessage({ content: JSON.stringify(envelope) });
    const req = handler.parseRequest(msg);
    expect(req).toBeTruthy();
    expect(req!.requestType).toBe('owner-op');
    expect(req!.action).toBe('set-team-mode');
    expect(req!.payload).toEqual({ mode: 'audit' });
  });

  it('parses plain-text shorthand @brittney owner-op', () => {
    const { handler } = makeHandler();
    const msg = makeMessage({ content: '@brittney owner-op: set-team-mode {mode: "audit"}' });
    const req = handler.parseRequest(msg);
    expect(req).toBeTruthy();
    expect(req!.requestType).toBe('owner-op');
    expect(req!.action).toBe('set-team-mode');
    expect(req!.payload).toEqual({ mode: 'audit' });
  });

  it('parses plain-text shorthand @brittney founder-gated', () => {
    const { handler } = makeHandler();
    const msg = makeMessage({
      content: '@brittney founder-gated: should we descope the SNN package?',
    });
    const req = handler.parseRequest(msg);
    expect(req).toBeTruthy();
    expect(req!.requestType).toBe('founder-gated');
    expect(req!.action).toBe('should we descope the SNN package?');
  });

  it('returns null for non-authority messages', () => {
    const { handler } = makeHandler();
    const msg = makeMessage({ content: 'hey brittney, lunch?' });
    expect(handler.parseRequest(msg)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// task_1787108819456_41on (review Q-02): msg.content is untrusted -- any team
// member can send it -- and the structured-envelope regex in parseRequest()
// runs against it with no length cap. Empirically, this regex shows clean
// O(n^2) backtracking on adversarial input that never satisfies the trailing
// "}" (e.g. all-"{" content): 8KB takes ~55ms, 200KB takes ~33s. A message a
// little over 200KB would block the agent's async tick for tens of seconds.
// The fix rejects anything over a fixed cap BEFORE any regex ever sees it.
// ---------------------------------------------------------------------------
describe('DelegatedAuthorityHandler.parseRequest — content length cap (task_1787108819456_41on, review Q-02)', () => {
  it('rejects a structured envelope once msg.content exceeds the length cap, even though it would otherwise parse', () => {
    const { handler } = makeHandler();
    const oversizedEnvelope = {
      protocol: 'delegated-authority/v1',
      requestType: 'owner-op',
      action: 'set-team-mode',
      payload: { mode: 'audit', filler: 'x'.repeat(9000) },
    };
    const content = JSON.stringify(oversizedEnvelope);
    expect(content.length).toBeGreaterThan(8 * 1024); // confirms the fixture actually exceeds the cap

    const msg = makeMessage({ content });
    expect(handler.parseRequest(msg)).toBeNull();
  });

  it('still parses a structured envelope comfortably under the cap', () => {
    const { handler } = makeHandler();
    const envelope = {
      protocol: 'delegated-authority/v1',
      requestType: 'owner-op',
      action: 'set-team-mode',
      payload: { mode: 'audit' },
    };
    const msg = makeMessage({ content: JSON.stringify(envelope) });
    expect(handler.parseRequest(msg)).toBeTruthy();
  });

  it('returns quickly instead of hanging on a large adversarial payload that never closes', () => {
    const { handler } = makeHandler();
    // No "}" anywhere -- the shape that empirically drives the pre-fix regex
    // into ~O(n^2) backtracking (measured: 50KB of this shape takes multiple
    // seconds pre-fix; 8KB takes ~55ms). Comfortably over the 8KB cap.
    const adversarial = '{'.repeat(50 * 1024);
    const msg = makeMessage({ content: adversarial });

    const start = Date.now();
    const result = handler.parseRequest(msg);
    const elapsedMs = Date.now() - start;

    expect(result).toBeNull();
    expect(elapsedMs).toBeLessThan(500);
  });
});

describe('DelegatedAuthorityHandler.handleRequest — owner-op', () => {
  it('executes set-team-mode', async () => {
    const { handler, mesh } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'owner-op',
      action: 'set-team-mode',
      payload: { mode: 'audit', reason: 'security gap' },
      rawContent: '@brittney owner-op: set-team-mode {mode: "audit"}',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('executed');
    expect(receipt.action).toBe('set-team-mode');
    expect(mesh.setTeamMode).toHaveBeenCalledWith('audit', 'security gap');
  });

  it('executes set-room-prefs', async () => {
    const { handler, mesh } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'owner-op',
      action: 'set-room-prefs',
      payload: { communicationStyle: 'balanced', objective: 'close blockers' },
      rawContent: '@brittney owner-op: set-room-prefs',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('executed');
    expect(mesh.patchRoomPrefs).toHaveBeenCalledWith({
      communicationStyle: 'balanced',
      objective: 'close blockers',
    });
  });

  it('rejects unknown owner-op action', async () => {
    const { handler } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'owner-op',
      action: 'launch-missiles',
      payload: {},
      rawContent: '@brittney owner-op: launch-missiles',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('rejected');
    expect(receipt.reason).toContain('Unknown owner-op action');
  });

  it('rejects when action is not in permittedActions', async () => {
    const { handler } = makeHandler({ permittedActions: new Set(['set-team-mode']) });
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'owner-op',
      action: 'delete-task',
      payload: { taskId: 't1' },
      rawContent: '@brittney owner-op: delete-task {taskId: "t1"}',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('rejected');
    expect(receipt.reason).toContain('not in the permitted-actions set');
  });

  it('rejects when agent is not on allowList', async () => {
    const { handler } = makeHandler({ allowList: new Set(['agent_b']) });
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'owner-op',
      action: 'set-team-mode',
      payload: { mode: 'audit' },
      rawContent: '@brittney owner-op: set-team-mode {mode: "audit"}',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('rejected');
    expect(receipt.reason).toContain('not on the allow-list');
  });
});

describe('DelegatedAuthorityHandler.handleRequest — founder-gated', () => {
  it('rules ordinary agent-decidable questions autonomous without a provider', async () => {
    const { handler } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action: 'should-we-descope',
      payload: {},
      rawContent: '@brittney founder-gated: should we descope the SNN package?',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('ruled');
    expect(receipt.authorityRoute).toBe('autonomous');
    expect(receipt.ruling).toMatch(/Proceed autonomously/i);
  });

  it('pre-vets exact-four context via LLM but always escalates for Joseph decision', async () => {
    const provider = {
      complete: vi.fn(async () => ({
        content:
          'RULING: Active rail would be exceeded.\nREASON: Projected spend is above the configured rail.\nESCALATE: yes',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })),
    } as unknown as ILLMProvider;

    const { handler } = makeHandler({ provider, systemPrompt: 'Pre-vet exact-four evidence.' });
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action: 'launch-paid-training',
      payload: { projectedSpendUsd: 12, activeRailCapUsd: 10 },
      rawContent: '@brittney founder-gated: launch paid training beyond the active rail',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('escalated');
    expect(receipt.authorityRoute).toBe('joseph-exact-four');
    expect(receipt.ruling).toBe('Active rail would be exceeded.');
    expect(receipt.reason).toContain('Projected spend');
  });

  it('escalates exact-four context even when no pre-vetting provider is wired', async () => {
    const { handler } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action: 'change-treasury-master-wallet',
      payload: { touchesTreasuryOrCustody: true },
      rawContent: '@brittney founder-gated: change the treasury master wallet',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('escalated');
    expect(receipt.authorityRoute).toBe('joseph-exact-four');
  });

  it('routes specialist review separately from Joseph', async () => {
    const { handler } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action: 'review-export-control',
      payload: {},
      rawContent: '@brittney founder-gated: review export-control compliance',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('deferred');
    expect(receipt.authorityRoute).toBe('specialist-review');
    expect(receipt.reason).toMatch(/not Joseph approval/i);
  });

  it('rejects force-push as prohibited rather than approvable', async () => {
    const { handler } = makeHandler();
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action: 'force-push-main',
      payload: {},
      rawContent: '@brittney founder-gated: force-push main',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('rejected');
    expect(receipt.authorityRoute).toBe('prohibited-replan');
  });
});

describe('classifyAuthorityRoute', () => {
  const request = (action: string, payload: Record<string, unknown> = {}): AuthorityRequest => ({
    messageId: 'msg_policy',
    fromAgentId: 'agent_a',
    fromAgentName: 'claude1',
    requestType: 'founder-gated',
    action,
    payload,
    rawContent: action,
  });

  it('keeps within-cap wallet sign/broadcast autonomous', () => {
    expect(
      classifyAuthorityRoute(
        request('sign and broadcast wallet transaction', {
          projectedSpendUsd: 4,
          activeRailCapUsd: 5,
        })
      )
    ).toBe('autonomous');
  });

  it('uses typed projected spend to detect the exact-four cap boundary', () => {
    expect(
      classifyAuthorityRoute(
        request('launch paid job', { projectedSpendUsd: 6, activeRailCapUsd: 5 })
      )
    ).toBe('joseph-exact-four');
  });

  it('routes a missing credential to platform control', () => {
    expect(classifyAuthorityRoute(request('API key is missing for the deploy tool'))).toBe(
      'platform-control'
    );
  });

  // --- False-positive regression: task_1785317871554_46k9 -----------------
  // A passive "do not perform: force-push, hard-reset, ..." prohibition-list
  // mention living in rawContent/payload (peer-agent DATA) must never steer
  // the route — only the declared `action` may. Both directions are proven:
  // a genuine attempt still blocks, and a passive mention no longer does.
  describe('prohibited-operation classification uses the declared action only', () => {
    const requestWith = (
      action: string,
      rawContent: string,
      payload: Record<string, unknown> = {}
    ): AuthorityRequest => ({
      messageId: 'msg_policy',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action,
      payload,
      rawContent,
    });

    it('still blocks a genuine attempted hard-reset carried in the action', () => {
      expect(
        classifyAuthorityRoute(
          requestWith('hard-reset the shared tree', 'hard-reset the shared tree')
        )
      ).toBe('prohibited-replan');
    });

    it('still blocks a genuine attempted force-push carried in the action', () => {
      expect(
        classifyAuthorityRoute(requestWith('force-push main', 'force-push main'))
      ).toBe('prohibited-replan');
    });

    it('does not prohibit an unrelated action merely because rawContent also carries a passive do-not-do reminder', () => {
      const rawContent =
        '@brittney owner-op: set-team-mode {mode: "audit"}\n' +
        'Reminder to the team: do not perform: force-push, hard-reset, or delete-branch on shared repos.';
      expect(classifyAuthorityRoute(requestWith('set-team-mode', rawContent))).toBe('autonomous');
    });

    it('does not escalate to exact-four merely because a payload string field mentions a protected term', () => {
      const rawContent = '@brittney owner-op: update-task {taskId: "t1"}';
      const payload = {
        taskId: 't1',
        description: 'Update the doc that explains the treasury master wallet policy.',
      };
      expect(classifyAuthorityRoute(requestWith('update-task', rawContent, payload))).toBe(
        'autonomous'
      );
    });
  });
});

describe('DelegatedAuthorityHandler — prohibited-operation false positive (task_1785317871554_46k9)', () => {
  it('executes an owner-op end-to-end even when the same message also carries a passive force-push/hard-reset reminder', async () => {
    const { handler, mesh } = makeHandler();
    const content =
      JSON.stringify({
        protocol: 'delegated-authority/v1',
        requestType: 'owner-op',
        action: 'set-team-mode',
        payload: { mode: 'audit' },
      }) + '\nReminder: do not perform: force-push, hard-reset, or delete-branch on shared repos.';
    const msg = makeMessage({ content });

    const req = handler.parseRequest(msg);
    expect(req).toBeTruthy();
    expect(req!.action).toBe('set-team-mode');

    const receipt = await handler.handleRequest(req!);
    expect(receipt.status).toBe('executed');
    expect(receipt.authorityRoute).toBe('autonomous');
    expect(mesh.setTeamMode).toHaveBeenCalledWith('audit', '');
  });

  it('still rejects a genuine end-to-end attempt to hard-reset shared state', async () => {
    const { handler } = makeHandler();
    const msg = makeMessage({
      content: '@brittney founder-gated: hard-reset the shared board state',
    });

    const req = handler.parseRequest(msg);
    expect(req).toBeTruthy();

    const receipt = await handler.handleRequest(req!);
    expect(receipt.status).toBe('rejected');
    expect(receipt.authorityRoute).toBe('prohibited-replan');
  });
});

describe('DelegatedAuthorityHandler.processMessages', () => {
  it('processes messages and sends receipts to team feed', async () => {
    const msg = makeMessage({
      content: JSON.stringify({
        protocol: 'delegated-authority/v1',
        requestType: 'owner-op',
        action: 'set-team-mode',
        payload: { mode: 'audit' },
      }),
    });
    const { handler, mesh } = makeHandler({ messages: [msg] });
    const receipts = await handler.processMessages();

    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('executed');
    expect(mesh.sendTeamMessage).toHaveBeenCalled();
  });

  it('skips already-processed message ids', async () => {
    const msg = makeMessage({
      id: 'msg_dup',
      content: JSON.stringify({
        protocol: 'delegated-authority/v1',
        requestType: 'owner-op',
        action: 'set-team-mode',
        payload: { mode: 'audit' },
      }),
    });
    const { handler, mesh } = makeHandler({ messages: [msg] });

    // First tick
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(1);

    // Second tick with same message still in feed
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(1); // not called again
  });
});

// ---------------------------------------------------------------------------
// task_1787108819456_41on (review Q-02): the processed-id set has no
// eviction policy and grows unboundedly across a long-running session. Ids
// are only ever checked for membership, never "touched" again once seen, so
// eviction by insertion order is equivalent to true LRU here.
// ---------------------------------------------------------------------------
describe('DelegatedAuthorityHandler — bounded processed-id eviction (task_1787108819456_41on, review Q-02)', () => {
  function makeEnvelopeMsg(id: string): TeamMessage {
    return makeMessage({
      id,
      content: JSON.stringify({
        protocol: 'delegated-authority/v1',
        requestType: 'owner-op',
        action: 'set-team-mode',
        payload: { mode: 'audit' },
      }),
    });
  }

  it('evicts the oldest processed ids once the bounded cap is exceeded, allowing them to be reprocessed', async () => {
    const cap = 3;
    const { handler, mesh } = makeHandler({ maxProcessedIds: cap });
    const getMessages = vi.mocked(mesh.getTeamMessages);

    for (const id of ['m1', 'm2', 'm3', 'm4']) {
      getMessages.mockResolvedValueOnce([makeEnvelopeMsg(id)]);
      await handler.processMessages();
    }
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(4);

    // m1 was the first-seen id. With a cap of 3, adding m4 must have evicted
    // it, so it is treated as new again instead of silently skipped.
    getMessages.mockResolvedValueOnce([makeEnvelopeMsg('m1')]);
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(5);

    // m4 is within the most-recent 3 ids and must still be remembered.
    getMessages.mockResolvedValueOnce([makeEnvelopeMsg('m4')]);
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(5); // not called again
  });

  it('does not evict anything while the set is under the cap', async () => {
    const { handler, mesh } = makeHandler({ maxProcessedIds: 10_000 });
    const getMessages = vi.mocked(mesh.getTeamMessages);

    for (const id of ['a', 'b', 'c']) {
      getMessages.mockResolvedValueOnce([makeEnvelopeMsg(id)]);
      await handler.processMessages();
    }
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(3);

    getMessages.mockResolvedValueOnce([makeEnvelopeMsg('a')]);
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(3); // still remembered, not reprocessed
  });

  it('trims an oversized injected processedMessageIds set down to the cap at construction', async () => {
    // A caller can persist processedMessageIds across ticks/sessions
    // (DelegatedAuthorityOptions.processedMessageIds). If it is seeded above
    // the cap, the bound must apply immediately rather than only once the
    // set grows past it locally.
    const seeded = new Set(['old1', 'old2', 'old3', 'old4', 'old5']);
    const { handler, mesh } = makeHandler({ processedMessageIds: seeded, maxProcessedIds: 3 });
    const getMessages = vi.mocked(mesh.getTeamMessages);

    // Insertion order was old1..old5; a cap of 3 must keep only the last 3
    // (old3, old4, old5) and evict old1/old2 immediately at construction.
    getMessages.mockResolvedValueOnce([makeEnvelopeMsg('old1')]);
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(1); // old1 was evicted, so it's reprocessed

    getMessages.mockResolvedValueOnce([makeEnvelopeMsg('old5')]);
    await handler.processMessages();
    expect(mesh.setTeamMode).toHaveBeenCalledTimes(1); // old5 survived the trim, still skipped
  });
});
