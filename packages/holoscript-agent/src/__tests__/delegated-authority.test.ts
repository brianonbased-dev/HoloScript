import { describe, it, expect, vi } from 'vitest';
import {
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

function makeHandler(opts: {
  messages?: TeamMessage[];
  allowList?: Set<string>;
  permittedActions?: Set<string>;
  provider?: ILLMProvider;
  systemPrompt?: string;
} = {}) {
  const mesh = {
    getTeamMessages: vi.fn(async () => opts.messages ?? []),
    sendTeamMessage: vi.fn(async () => {}),
    setTeamMode: vi.fn(async (mode: string) => ({ mode, unchanged: false })),
    patchRoomPrefs: vi.fn(async (prefs) => ({ communicationStyle: prefs.communicationStyle ?? 'task_first', objective: prefs.objective ?? '' })),
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
    const msg = makeMessage({ content: '@brittney founder-gated: should we descope the SNN package?' });
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
    expect(mesh.patchRoomPrefs).toHaveBeenCalledWith({ communicationStyle: 'balanced', objective: 'close blockers' });
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
  it('defers when no provider is wired', async () => {
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
    expect(receipt.status).toBe('deferred');
    expect(receipt.reason).toContain('E5');
  });

  it('rules via LLM when provider is wired', async () => {
    const provider = {
      complete: vi.fn(async () => ({
        content: 'RULING: Yes, descope it.\nREASON: The SNN package lacks benchmarks.\nESCALATE: no',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })),
    } as unknown as ILLMProvider;

    const { handler } = makeHandler({ provider, systemPrompt: 'You are the founder.' });
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
    expect(receipt.ruling).toBe('Yes, descope it.');
    expect(receipt.reason).toContain('The SNN package lacks benchmarks.');
  });

  it('escalates when LLM says ESCALATE: yes', async () => {
    const provider = {
      complete: vi.fn(async () => ({
        content: 'RULING: Cannot decide.\nREASON: Involves treasury crossing.\nESCALATE: yes',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })),
    } as unknown as ILLMProvider;

    const { handler } = makeHandler({ provider });
    const req: AuthorityRequest = {
      messageId: 'msg_1',
      fromAgentId: 'agent_a',
      fromAgentName: 'claude1',
      requestType: 'founder-gated',
      action: 'treasury-crossing',
      payload: {},
      rawContent: '@brittney founder-gated: should we cross the treasury?',
    };
    const receipt = await handler.handleRequest(req);
    expect(receipt.status).toBe('escalated');
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
