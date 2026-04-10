/**
 * SmsTrait — v5.1
 *
 * SMS delivery via provider abstraction.
 *
 * Events:
 *  sms:send       { to, message }
 *  sms:sent       { messageId, to }
 *  sms:error      { to, error }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface SmsConfig {
  provider: string;
  max_length: number;
}

export const smsHandler: TraitHandler<SmsConfig> = {
  name: 'sms',
  defaultConfig: { provider: 'default', max_length: 160 },

  onAttach(node: HSPlusNode): void {
    node.__smsState = { sent: 0, failed: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__smsState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: SmsConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__smsState as { sent: number; failed: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    if (t === 'sms:send') {
      const message = (event.message as string) ?? '';
      if (message.length > config.max_length) {
        state.failed++;
        context.emit?.('sms:error', {
          to: event.to,
          error: `exceeds_max_length_${config.max_length}`,
        });
      } else {
        state.sent++;
        context.emit?.('sms:sent', {
          messageId: `sms_${Date.now()}`,
          to: event.to,
          provider: config.provider,
        });
      }
    }
  },
};

export default smsHandler;
