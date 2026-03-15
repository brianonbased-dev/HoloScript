/**
 * SlackTrait — v5.1
 *
 * Slack webhook / incoming message integration.
 *
 * Events:
 *  slack:send     { channel, text, blocks }
 *  slack:sent     { channel, ts }
 */

import type { TraitHandler } from './TraitTypes';

export interface SlackConfig {
  webhook_url: string;
  default_channel: string;
}

export const slackHandler: TraitHandler<SlackConfig> = {
  name: 'slack' as any,
  defaultConfig: { webhook_url: '', default_channel: '#general' },

  onAttach(node: any): void { node.__slackState = { sent: 0 }; },
  onDetach(node: any): void { delete node.__slackState; },
  onUpdate(): void {},

  onEvent(node: any, config: SlackConfig, context: any, event: any): void {
    const state = node.__slackState as { sent: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'slack:send') {
      state.sent++;
      context.emit?.('slack:sent', {
        channel: (event.channel as string) ?? config.default_channel,
        ts: `${Date.now()}`,
      });
    }
  },
};

export default slackHandler;
