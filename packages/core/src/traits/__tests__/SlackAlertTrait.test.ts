/**
 * SlackAlertTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { slackAlertHandler } from '../SlackAlertTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __slackAlertState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = {
  webhook_url: 'https://hooks.slack.com/services/alerts',
  default_channel: '#alerts',
};

describe('SlackAlertTrait', () => {
  it('has name "slack_alert"', () => {
    expect(slackAlertHandler.name).toBe('slack_alert');
  });

  it('slack_alert:send calls fetch and emits slack_alert:sent on success', async () => {
    const node = makeNode();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    slackAlertHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    slackAlertHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'slack_alert:send',
        message: 'alert!',
      } as never
    );

    await vi.waitFor(() =>
      expect(node.emit).toHaveBeenCalledWith(
        'slack_alert:sent',
        expect.objectContaining({
          channel: '#alerts',
          message: 'alert!',
          status: 200,
        })
      )
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      defaultConfig.webhook_url,
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('alert!') })
    );
    fetchSpy.mockRestore();
  });

  it('slack_alert:send emits slack_alert:error when webhook_url is empty', () => {
    const node = makeNode();
    slackAlertHandler.onAttach!(
      node as never,
      { webhook_url: '', default_channel: '#alerts' },
      makeCtx(node) as never
    );
    slackAlertHandler.onEvent!(
      node as never,
      { webhook_url: '', default_channel: '#alerts' },
      makeCtx(node) as never,
      {
        type: 'slack_alert:send',
        message: 'alert!',
      } as never
    );
    expect(node.emit).toHaveBeenCalledWith(
      'slack_alert:error',
      expect.objectContaining({ error: 'No webhook_url configured' })
    );
  });
});
