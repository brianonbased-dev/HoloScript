/**
 * DiscordTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { discordHandler } from '../DiscordTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __discordState: undefined as unknown,
});

const defaultConfig = { webhook_url: 'https://discord.com/api/webhooks/test', bot_name: 'TestBot' };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DiscordTrait — metadata', () => {
  it('has name "discord"', () => {
    expect(discordHandler.name).toBe('discord');
  });

  it('defaultConfig bot_name is "HoloBot"', () => {
    expect(discordHandler.defaultConfig?.bot_name).toBe('HoloBot');
  });
});

describe('DiscordTrait — lifecycle', () => {
  it('onAttach initializes sent counter to 0', () => {
    const node = makeNode();
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__discordState as { sent: number };
    expect(state.sent).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    discordHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__discordState).toBeUndefined();
  });
});

describe('DiscordTrait — onEvent', () => {
  it('discord:send calls fetch and emits discord:sent on success', async () => {
    const node = makeNode();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    discordHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'discord:send',
        channel: '#general',
        content: 'Hello!',
      } as never
    );

    await vi.waitFor(() =>
      expect(node.emit).toHaveBeenCalledWith(
        'discord:sent',
        expect.objectContaining({
          channel: '#general',
          bot: 'TestBot',
          status: 204,
        })
      )
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      defaultConfig.webhook_url,
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('Hello!') })
    );
    fetchSpy.mockRestore();
  });

  it('discord:send increments sent counter', async () => {
    const node = makeNode();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    discordHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'discord:send',
        channel: '#test',
        content: 'msg',
      } as never
    );
    await vi.waitFor(() =>
      expect(node.emit).toHaveBeenCalledWith('discord:sent', expect.anything())
    );
    const state = node.__discordState as { sent: number };
    expect(state.sent).toBe(1);
  });

  it('discord:send emits discord:error when webhook_url is empty', () => {
    const node = makeNode();
    discordHandler.onAttach!(
      node as never,
      { webhook_url: '', bot_name: 'TestBot' },
      makeCtx(node) as never
    );
    discordHandler.onEvent!(
      node as never,
      { webhook_url: '', bot_name: 'TestBot' },
      makeCtx(node) as never,
      {
        type: 'discord:send',
        channel: '#alerts',
        content: 'Alert!',
      } as never
    );
    expect(node.emit).toHaveBeenCalledWith(
      'discord:error',
      expect.objectContaining({ error: 'No webhook_url configured' })
    );
  });
});
