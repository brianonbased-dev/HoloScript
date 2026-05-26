/**
 * WebhookOutTrait — v5.1
 * Outbound webhook delivery with retry.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface WebhookOutConfig {
  max_retries: number;
  timeout_ms: number;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  timeoutMs: number
): Promise<Response> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (timer) clearTimeout(timer);
      if (res.ok || attempt === maxRetries) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) throw lastErr;
    }
  }
  throw lastErr ?? new Error('Unknown fetch error');
}

export const webhookOutHandler: TraitHandler<WebhookOutConfig> = {
  name: 'webhook_out',
  defaultConfig: { max_retries: 3, timeout_ms: 5000 },
  onAttach(node: HSPlusNode): void {
    node.__whOutState = { sent: 0, failed: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__whOutState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: WebhookOutConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__whOutState as { sent: number; failed: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'webhook:send') {
      const url = (event.url as string) ?? '';
      const payload = event.payload;
      if (!url) {
        state.failed++;
        context.emit?.('webhook:error', { url: '', error: 'No URL provided' });
        return;
      }

      fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload ? JSON.stringify(payload) : undefined,
        },
        config.max_retries,
        config.timeout_ms
      )
        .then((res) => {
          state.sent++;
          context.emit?.('webhook:sent', {
            url,
            payload,
            status: res.status,
            attempt: state.sent + state.failed,
            maxRetries: config.max_retries,
          });
        })
        .catch((err: unknown) => {
          state.failed++;
          context.emit?.('webhook:error', {
            url,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  },
};
export default webhookOutHandler;
