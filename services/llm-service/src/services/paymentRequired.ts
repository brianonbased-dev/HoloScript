/**
 * The single 402 body for every caller (Studio, absorb, MCP, any outside agent).
 * Shape from the Gaps 1/2/5/6 proposal:
 *   { error, unit, needed, available, payer, topup_url, can_run_local, message }
 * Field names are provisional until the billing spec lands; keep every 402 on
 * this builder so they change in one place.
 */
export type PaymentRequiredError = 'insufficient_credits' | 'needs_credits_not_enabled';

export interface PaymentRequiredBody {
  error: PaymentRequiredError;
  unit: 'cents';
  needed: number | null;
  available: number | null;
  payer: string | null;
  topup_url: string;
  /** Computed: whether a local (owned) runtime could serve this right now. */
  can_run_local: boolean;
  message: string;
}

export const DEFAULT_TOPUP_URL = '/absorb?tab=credits';

const MESSAGES: Record<PaymentRequiredError, string> = {
  insufficient_credits:
    'Your HoloScript credit balance is too low for this job. Add credits to continue. Nothing was charged.',
  needs_credits_not_enabled:
    "This job needs paid or rented compute, which isn't enabled for this access. Only local runtimes are allowed. Nothing was charged.",
};

export function buildPaymentRequiredBody(p: {
  error: PaymentRequiredError;
  canRunLocal: boolean;
  needed?: number | null;
  available?: number | null;
  payer?: string | null;
  topupUrl?: string;
}): PaymentRequiredBody {
  return {
    error: p.error,
    unit: 'cents',
    needed: p.needed ?? null,
    available: p.available ?? null,
    payer: p.payer ?? null,
    topup_url: p.topupUrl ?? DEFAULT_TOPUP_URL,
    can_run_local: p.canRunLocal,
    message: MESSAGES[p.error],
  };
}

export function isPaymentRequiredBody(x: unknown): x is PaymentRequiredBody {
  return (
    !!x &&
    typeof x === 'object' &&
    ((x as PaymentRequiredBody).error === 'insufficient_credits' ||
      (x as PaymentRequiredBody).error === 'needs_credits_not_enabled') &&
    typeof (x as PaymentRequiredBody).can_run_local === 'boolean'
  );
}
