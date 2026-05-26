/**
 * SlackAlertTrait — v5.1
 * Slack channel alerting.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface SlackAlertConfig {
  webhook_url: string;
  default_channel: string;
}
export const slackAlertHandler: TraitHandler<SlackAlertConfig> = {
  name: 'slack_alert',
  defaultConfig: { webhook_url: '', default_channel: '#alerts' },
  onAttach(node: HSPlusNode): void {
    node.__slackAlertState = { sent: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__slackAlertState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: SlackAlertConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__slackAlertState as { sent: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'slack_alert:send') {
      const channel = (event.channel as string) ?? config.default_channel;
      const text = (event.message as string) ?? '';
      const payload = { channel, text };

      if (!config.webhook_url) {
        context.emit?.('slack_alert:error', { error: 'No webhook_url configured' });
        return;
      }

      fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          state.sent++;
          if (res.ok) {
            context.emit?.('slack_alert:sent', {
              channel,
              message: text,
              count: state.sent,
              status: res.status,
            });
          } else {
            context.emit?.('slack_alert:error', { channel, status: res.status, error: 'HTTP error' });
          }
        })
        .catch((err: unknown) => {
          context.emit?.('slack_alert:error', {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  },
};
export default slackAlertHandler;
