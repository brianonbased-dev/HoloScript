/**
 * EmailTrait — v5.1
 *
 * SMTP email sending with templates and attachments.
 *
 * Events:
 *  email:send     { to, subject, body, template, attachments }
 *  email:sent     { messageId, to, subject }
 *  email:error    { to, error }
 *  email:status   { queued, sent, failed }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface EmailConfig {
  from: string;
  max_queue: number;
}

export const emailHandler: TraitHandler<EmailConfig> = {
  name: 'email',
  defaultConfig: { from: 'noreply@holoscript.dev', max_queue: 100 },

  onAttach(node: HSPlusNode): void {
    node.__emailState = { queued: 0, sent: 0, failed: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__emailState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: EmailConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__emailState as { queued: number; sent: number; failed: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'email:send': {
        if (state.queued >= config.max_queue) {
          context.emit?.('email:error', { to: event.to, error: 'queue_full' });
          break;
        }
        state.queued++;
        // Simulate async send — in production this would call SMTP
        state.sent++;
        state.queued--;
        context.emit?.('email:sent', {
          messageId: `msg_${Date.now()}`,
          to: event.to,
          subject: event.subject,
          from: config.from,
        });
        break;
      }
      case 'email:get_status': {
        context.emit?.('email:status', {
          queued: state.queued,
          sent: state.sent,
          failed: state.failed,
        });
        break;
      }
    }
  },
};

export default emailHandler;
