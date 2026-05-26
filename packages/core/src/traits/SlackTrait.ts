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
      const channel = (event.channel as string) ?? config.default_channel;
      const text = (event.text as string) ?? '';
      const payload = { channel, text, blocks: (event.blocks as unknown[]) ?? [] };

      if (!config.webhook_url) {
        context.emit?.('slack:error', { error: 'No webhook_url configured' });
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
            context.emit?.('slack:sent', { channel, ts: `${Date.now()}`, status: res.status });
          } else {
            context.emit?.('slack:error', { channel, status: res.status, error: 'HTTP error' });
          }
        })
        .catch((err: unknown) => {
          context.emit?.('slack:error', {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  },
};

export default slackHandler;
