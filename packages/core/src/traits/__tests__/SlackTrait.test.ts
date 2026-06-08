/**
 * SlackTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { slackHandler } from '../SlackTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __slackState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = {
  webhook_url: 'https://hooks.slack.com/services/test',
  default_channel: '#general',
};

describe('SlackTrait', () => {
  it('has name "slack"', () => {
    expect(slackHandler.name).toBe('slack');
  });

  it('slack:send calls fetch and emits slack:sent on success', async () => {
    const node = makeNode();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    slackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    slackHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'slack:send',
        text: 'hello',
      } as never
    );

    await vi.waitFor(() =>
      expect(node.emit).toHaveBeenCalledWith(
        'slack:sent',
        expect.objectContaining({ channel: '#general', status: 200 })
      )
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      defaultConfig.webhook_url,
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('hello') })
    );
    fetchSpy.mockRestore();
  });

  it('slack:send emits slack:error when webhook_url is empty', () => {
    const node = makeNode();
    slackHandler.onAttach!(
      node as never,
      { webhook_url: '', default_channel: '#general' },
      makeCtx(node) as never
    );
    slackHandler.onEvent!(
      node as never,
      { webhook_url: '', default_channel: '#general' },
      makeCtx(node) as never,
      {
        type: 'slack:send',
        text: 'hello',
      } as never
    );
    expect(node.emit).toHaveBeenCalledWith(
      'slack:error',
      expect.objectContaining({ error: 'No webhook_url configured' })
    );
  });
});
