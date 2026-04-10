/**
 * MessagingTrait.test.ts — v4.0
 * Tests: connect (mocked), message_incoming, command parse, message_send, stats
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { messagingHandler } from '../MessagingTrait';
import type { MessagingConfig, IncomingMessage } from '../MessagingTrait';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter((e) => e.type === type),
  };
}

const BASE_CONFIG: MessagingConfig = {
  platform: 'telegram',
  token: 'fake_telegram_token_12345',
  command_prefix: '/',
  allowed_users: [],
  poll_interval_ms: 99999, // Effectively disable auto-polling
  webhook_url: '',
  auto_reply_unknown: false,
  thinking_message: '',
};

/** Mock successful Telegram getMe call */
function mockTelegramGetMe() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      result: { id: 12345, username: 'holoscript_bot' },
    }),
  } as any);
}

async function attach(extra: Partial<MessagingConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  await messagingHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('MessagingTrait — onAttach (Telegram)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = mockTelegramGetMe();
  });
  afterEach(() => fetchSpy.mockRestore());

  it('emits messaging_connected on attach', async () => {
    const { ctx } = await attach();
    expect(ctx.of('messaging_connected').length).toBe(1);
  });

  it('sets botId and botUsername on connect', async () => {
    const { ctx } = await attach();
    const connected = ctx.of('messaging_connected')[0].payload as any;
    expect(connected.botId).toBe('12345');
    expect(connected.botUsername).toBe('holoscript_bot');
  });

  it('marks state as connected', async () => {
    const { node } = await attach();
    expect(node.__messagingState.isConnected).toBe(true);
  });

  it('emits messaging_error when no token', async () => {
    const node = {} as any;
    const ctx = makeCtx();
    await messagingHandler.onAttach(node, { ...BASE_CONFIG, token: '' }, ctx);
    expect(ctx.of('messaging_error').length).toBe(1);
  });
});

// ─── message_incoming ─────────────────────────────────────────────────────────

describe('MessagingTrait — message_incoming', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = mockTelegramGetMe();
  });
  afterEach(() => fetchSpy.mockRestore());

  it('emits message_received for plain text', async () => {
    const { node, ctx, config } = await attach();
    const msg: IncomingMessage = {
      id: '1',
      platform: 'telegram',
      chatId: '100',
      userId: 'u1',
      username: 'Alice',
      text: 'Hello world',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    expect(ctx.of('message_received').length).toBe(1);
    expect((ctx.of('message_received')[0].payload as any).text).toBe('Hello world');
  });

  it('emits command_parsed for /commands', async () => {
    const { node, ctx, config } = await attach();
    const msg: IncomingMessage = {
      id: '2',
      platform: 'telegram',
      chatId: '100',
      userId: 'u1',
      username: 'Alice',
      text: '/scene neon_city',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    const cmd = ctx.of('command_parsed')[0].payload as any;
    expect(cmd.command).toBe('scene');
    expect(cmd.args).toEqual(['neon_city']);
  });

  it('re-emits command as domain event', async () => {
    const { node, ctx, config } = await attach();
    const msg: IncomingMessage = {
      id: '3',
      platform: 'telegram',
      chatId: '100',
      userId: 'u1',
      username: 'Alice',
      text: '/render high',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    expect(ctx.of('command_render').length).toBe(1);
    expect((ctx.of('command_render')[0].payload as any).args).toEqual(['high']);
  });

  it('respects allowed_users whitelist — blocks unlisted user', async () => {
    const { node, ctx, config } = await attach({ allowed_users: ['allowed_user'] });
    const msg: IncomingMessage = {
      id: '4',
      platform: 'telegram',
      chatId: '100',
      userId: 'blocked_user',
      username: 'Blocked',
      text: '/scene x',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    expect(ctx.of('command_scene').length).toBe(0);
  });

  it('allows listed user through whitelist', async () => {
    const { node, ctx, config } = await attach({ allowed_users: ['u_ok'] });
    const msg: IncomingMessage = {
      id: '5',
      platform: 'telegram',
      chatId: '100',
      userId: 'u_ok',
      username: 'Ok',
      text: '/scene beach',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    expect(ctx.of('command_scene').length).toBe(1);
  });

  it('does not emit command_parsed for non-command text', async () => {
    const { node, ctx, config } = await attach();
    const msg: IncomingMessage = {
      id: '6',
      platform: 'telegram',
      chatId: '100',
      userId: 'u1',
      username: 'Alice',
      text: 'Hey there!',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    expect(ctx.of('command_parsed').length).toBe(0);
  });

  it('sends thinking message when configured', async () => {
    // Override fetch to handle both getMe and sendMessage
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { id: 1, username: 'bot', message_id: 99 } }),
    } as any);
    const { node, ctx, config } = await attach({ thinking_message: '⏳ Processing...' });
    const msg: IncomingMessage = {
      id: '7',
      platform: 'telegram',
      chatId: '100',
      userId: 'u1',
      username: 'Alice',
      text: '/do_thing',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    await new Promise((r) => setTimeout(r, 100));
    // Second fetch call should be sendMessage
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('increments totalReceived', async () => {
    const { node, ctx, config } = await attach();
    const msg: IncomingMessage = {
      id: '8',
      platform: 'telegram',
      chatId: '100',
      userId: 'u1',
      username: 'x',
      text: 'hi',
      timestamp: Date.now(),
    };
    messagingHandler.onEvent(node, config, ctx, { type: 'message_incoming', payload: msg });
    expect(node.__messagingState.totalReceived).toBe(1);
  });
});

// ─── message_send ─────────────────────────────────────────────────────────────

describe('MessagingTrait — message_send', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { id: 1, username: 'bot', message_id: 42 } }),
    } as any);
  });
  afterEach(() => fetchSpy.mockRestore());

  it('emits message_sent after successful send', async () => {
    const { node, ctx, config } = await attach();
    messagingHandler.onEvent(node, config, ctx, {
      type: 'message_send',
      payload: { chatId: '100', text: 'Hello from HoloScript!' },
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.of('message_sent').length).toBe(1);
    expect((ctx.of('message_sent')[0].payload as any).chat).toBe('100');
  });

  it('increments totalSent', async () => {
    const { node, ctx, config } = await attach();
    messagingHandler.onEvent(node, config, ctx, {
      type: 'message_send',
      payload: { chatId: '100', text: 'A' },
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(node.__messagingState.totalSent).toBeGreaterThanOrEqual(1);
  });

  it('ignores send event without chatId', async () => {
    const { node, ctx, config } = await attach();
    messagingHandler.onEvent(node, config, ctx, {
      type: 'message_send',
      payload: { text: 'No chat ID' },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.of('message_sent').length).toBe(0);
  });
});

// ─── messaging_stats ─────────────────────────────────────────────────────────

describe('MessagingTrait — messaging_stats', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = mockTelegramGetMe();
  });
  afterEach(() => fetchSpy.mockRestore());

  it('returns messaging_stats', async () => {
    const { node, ctx, config } = await attach();
    messagingHandler.onEvent(node, config, ctx, { type: 'messaging_stats' });
    const s = ctx.of('messaging_stats')[0].payload as any;
    expect(s.platform).toBe('telegram');
    expect(s.connected).toBe(true);
    expect(s.totalReceived).toBe(0);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('MessagingTrait — onDetach', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = mockTelegramGetMe();
  });
  afterEach(() => fetchSpy.mockRestore());

  it('emits messaging_disconnected and clears state', async () => {
    const { node, ctx, config } = await attach();
    messagingHandler.onDetach(node, config, ctx);
    expect(ctx.of('messaging_disconnected').length).toBe(1);
    expect(node.__messagingState).toBeUndefined();
  });
});
