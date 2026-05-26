/**
 * DiscordTrait — v5.1
 *
 * Discord webhook / bot message integration.
 *
 * Events:
 *  discord:send    { channel, content, embeds }
 *  discord:sent    { channel, messageId }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface DiscordConfig {
  webhook_url: string;
  bot_name: string;
}

export const discordHandler: TraitHandler<DiscordConfig> = {
  name: 'discord',
  defaultConfig: { webhook_url: '', bot_name: 'HoloBot' },

  onAttach(node: HSPlusNode): void {
    node.__discordState = { sent: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__discordState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: DiscordConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__discordState as { sent: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'discord:send') {
      const payload = {
        content: (event.content as string) ?? '',
        username: config.bot_name,
        embeds: (event.embeds as unknown[]) ?? [],
      };

      if (!config.webhook_url) {
        context.emit?.('discord:error', { error: 'No webhook_url configured' });
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
            context.emit?.('discord:sent', {
              channel: event.channel,
              messageId: `disc_${Date.now()}`,
              bot: config.bot_name,
              status: res.status,
            });
          } else {
            context.emit?.('discord:error', { status: res.status, error: 'HTTP error' });
          }
        })
        .catch((err: unknown) => {
          context.emit?.('discord:error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  },
};

export default discordHandler;
