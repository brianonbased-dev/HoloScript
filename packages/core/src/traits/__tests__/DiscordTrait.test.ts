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
  it('discord:send emits discord:sent with channel and bot', () => {
    const node = makeNode();
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    discordHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'discord:send', channel: '#general', content: 'Hello!',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('discord:sent', expect.objectContaining({
      channel: '#general', bot: 'TestBot',
    }));
  });

  it('discord:send increments sent counter', () => {
    const node = makeNode();
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (let i = 0; i < 3; i++) {
      discordHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'discord:send', channel: '#test', content: `msg-${i}`,
      } as never);
    }
    const state = node.__discordState as { sent: number };
    expect(state.sent).toBe(3);
  });

  it('discord:sent includes a messageId', () => {
    const node = makeNode();
    discordHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    discordHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'discord:send', channel: '#alerts', content: 'Alert!',
    } as never);
    const call = node.emit.mock.calls.find(([t]) => t === 'discord:sent');
    expect(call?.[1]).toHaveProperty('messageId');
  });
});
