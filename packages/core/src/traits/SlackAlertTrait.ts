/**
 * SlackAlertTrait — v5.1
 * Slack channel alerting.
 */
import type { TraitHandler } from './TraitTypes';
export interface SlackAlertConfig {
  default_channel: string;
}
export const slackAlertHandler: TraitHandler<SlackAlertConfig> = {
  name: 'slack_alert',
  defaultConfig: { default_channel: '#alerts' },
  onAttach(node: any): void {
    node.__slackAlertState = { sent: 0 };
  },
  onDetach(node: any): void {
    delete node.__slackAlertState;
  },
  onUpdate(): void {},
  onEvent(node: any, config: SlackAlertConfig, context: any, event: any): void {
    const state = node.__slackAlertState as { sent: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'slack_alert:send') {
      state.sent++;
      context.emit?.('slack_alert:sent', {
        channel: (event.channel as string) ?? config.default_channel,
        message: event.message,
        count: state.sent,
      });
    }
  },
};
export default slackAlertHandler;
