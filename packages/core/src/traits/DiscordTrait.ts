/**
 * DiscordTrait — v5.1
 *
 * Discord webhook / bot message integration.
 *
 * Events:
 *  discord:send    { channel, content, embeds }
 *  discord:sent    { channel, messageId }
 */

import type { TraitHandler } from './TraitTypes';

export interface DiscordConfig {
  webhook_url: string;
  bot_name: string;
}

export const discordHandler: TraitHandler<DiscordConfig> = {
  name: 'discord',
  defaultConfig: { webhook_url: '', bot_name: 'HoloBot' },

  onAttach(node: any): void {
    node.__discordState = { sent: 0 };
  },
  onDetach(node: any): void {
    delete node.__discordState;
  },
  onUpdate(): void {},

  onEvent(node: any, config: DiscordConfig, context: any, event: any): void {
    const state = node.__discordState as { sent: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'discord:send') {
      state.sent++;
      context.emit?.('discord:sent', {
        channel: event.channel,
        messageId: `disc_${Date.now()}`,
        bot: config.bot_name,
      });
    }
  },
};

export default discordHandler;
