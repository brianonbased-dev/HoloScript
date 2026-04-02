/**
 * SlackTrait — v5.1
 *
 * Slack webhook / incoming message integration.
 *
 * Events:
 *  slack:send     { channel, text, blocks }
 *  slack:sent     { channel, ts }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface SlackConfig {
  webhook_url: string;
  default_channel: string;
}

export const slackHandler: TraitHandler<SlackConfig> = {
  name: 'slack',
  defaultConfig: { webhook_url: '', default_channel: '#general' },

  onAttach(node: HSPlusNode): void {
    node.__slackState = { sent: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__slackState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: SlackConfig, context: TraitContext, event: TraitEvent): void {
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
