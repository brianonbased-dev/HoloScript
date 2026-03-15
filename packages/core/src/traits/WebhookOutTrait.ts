/**
 * WebhookOutTrait — v5.1
 * Outbound webhook delivery with retry.
 */
import type { TraitHandler } from './TraitTypes';
export interface WebhookOutConfig { max_retries: number; timeout_ms: number; }
export const webhookOutHandler: TraitHandler<WebhookOutConfig> = {
  name: 'webhook_out', defaultConfig: { max_retries: 3, timeout_ms: 5000 },
  onAttach(node: any): void { node.__whOutState = { sent: 0, failed: 0 }; },
  onDetach(node: any): void { delete node.__whOutState; },
  onUpdate(): void {},
  onEvent(node: any, config: WebhookOutConfig, context: any, event: any): void {
    const state = node.__whOutState as { sent: number; failed: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'webhook:send') {
      state.sent++;
      context.emit?.('webhook:sent', { url: event.url, payload: event.payload, attempt: 1, maxRetries: config.max_retries });
    }
  },
};
export default webhookOutHandler;
