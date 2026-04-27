/**
 * SlackTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { slackHandler } from '../SlackTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __slackState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { webhook_url: '', default_channel: '#general' };

describe('SlackTrait', () => {
  it('has name "slack"', () => {
    expect(slackHandler.name).toBe('slack');
  });

  it('slack:send emits slack:sent', () => {
    const node = makeNode();
    slackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    slackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'slack:send', text: 'hello',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('slack:sent', expect.objectContaining({ channel: '#general' }));
  });
});
