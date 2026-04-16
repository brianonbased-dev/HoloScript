export interface X402HttpVerifierConfig {
  enabled: boolean;
  facilitatorUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface X402VerifyRequest {
  paymentId: string;
  transactionHash: string;
  network: string;
  asset: string;
  amount: number;
  contentId: string;
}

export interface X402VerifyResult {
  verified: boolean;
  reason?: string;
  facilitatorTxHash?: string;
  raw?: unknown;
}

export function createX402HttpVerifierFromEnv(
  env: NodeJS.ProcessEnv = process.env
): X402HttpVerifier {
  const enabled = String(env.X402_VERIFIER_ENABLED || 'false').toLowerCase() === 'true';
  const facilitatorUrl =
    env.X402_FACILITATOR_VERIFY_URL ||
    env.X402_FACILITATOR_URL ||
    'https://cdp.coinbase.com/x402';
  const apiKey = env.X402_FACILITATOR_API_KEY;
  const timeoutMs = Number(env.X402_VERIFIER_TIMEOUT_MS || 5000);

  return new X402HttpVerifier({
    enabled,
    facilitatorUrl,
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
  });
}

export class X402HttpVerifier {
  constructor(private readonly config: X402HttpVerifierConfig) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async verifyPayment(input: X402VerifyRequest): Promise<X402VerifyResult> {
    if (!this.config.enabled) {
      return { verified: true, reason: 'verifier disabled' };
    }

    const base = this.config.facilitatorUrl.replace(/\/+$/, '');
    const url = `${base}/verify`;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          payment_id: input.paymentId,
          transaction_hash: input.transactionHash,
          network: input.network,
          asset: input.asset,
          amount: input.amount,
          content_id: input.contentId,
        }),
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        return {
          verified: false,
          reason: `Facilitator returned ${response.status}`,
          raw: body,
        };
      }

      const payload = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const verified =
        payload.verified === true || payload.status === 'paid' || payload.status === 'confirmed';

      return {
        verified,
        reason: verified ? undefined : String(payload.reason || payload.error || 'Facilitator rejected payment'),
        facilitatorTxHash: typeof payload.transaction_hash === 'string' ? payload.transaction_hash : undefined,
        raw: body,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        verified: false,
        reason: `Facilitator verify failed: ${reason}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
