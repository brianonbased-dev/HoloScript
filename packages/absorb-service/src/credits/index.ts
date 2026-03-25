/**
 * Credits module -- Pricing, credit service, metered LLM, and middleware.
 */

export * from './pricing.js';
export {
  setDbProvider,
  getOrCreateAccount,
  checkBalance,
  deductCredits,
  addCredits,
  getUsageHistory,
} from './creditService.js';
export type {
  CreditAccount,
  CreditTransaction,
  BalanceCheck,
} from './creditService.js';
export { MeteredLLMProvider } from './meteredLLMProvider.js';
export { requireCredits, isCreditError } from './requireCredits.js';
export type { CreditGateResult } from './requireCredits.js';
