/**
 * SlackAlertTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { slackAlertHandler } from '../SlackAlertTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __slackAlertState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_channel: '#alerts' };

describe('SlackAlertTrait', () => {
  it('has name "slack_alert"', () => {
    expect(slackAlertHandler.name).toBe('slack_alert');
  });

  it('slack_alert:send emits slack_alert:sent', () => {
    const node = makeNode();
    slackAlertHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    slackAlertHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'slack_alert:send', message: 'Alert!',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('slack_alert:sent', expect.objectContaining({ channel: '#alerts', count: 1 }));
  });
});
