/**
 * Credit cost of a repo import, read from the real price table
 * (`@/lib/absorb/pricing`, a checked copy of absorb-service's OPERATION_COSTS).
 *
 * Cloning is free. The import's absorb step calls absorb-service, which
 * charges `absorb_shallow` when the request says `shallow: true` and
 * `absorb_deep` otherwise (services/absorb-service/src/routes/absorb.ts).
 * Studio's import never sends `shallow`, so the import is priced as a deep
 * absorb. Both rows are tiered 'unverified' in the price table, and we say so.
 */

import { OPERATION_COSTS } from '@/lib/absorb/pricing';

export interface ImportCreditCost {
  operation: 'absorb_deep' | 'absorb_shallow';
  credits: number;
  tier: string;
  label: string;
}

export function importCreditCost(options: { shallow?: boolean } = {}): ImportCreditCost {
  const operation = options.shallow ? 'absorb_shallow' : 'absorb_deep';
  const row = OPERATION_COSTS[operation];
  const credits: number = row.baseCostCents;
  return {
    operation,
    credits,
    tier: row.tier,
    label: `Import cost: up to ${credits} credit${credits === 1 ? '' : 's'} for the absorb scan (${row.description.toLowerCase()}). Cloning is free.`,
  };
}
