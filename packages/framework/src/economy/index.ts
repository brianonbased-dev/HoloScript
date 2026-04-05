/**
 * Economy Module — x402 payments, budgets, subscriptions, revenue.
 *
 * Absorbed from @holoscript/core/economy.
 * Core's economy/ becomes a re-export shim after this migration.
 */

export {
  // x402 Facilitator
  X402_VERSION,
  type SettlementChain,
  type PaymentScheme,
  type SettlementMode,
  USDC_CONTRACTS,
  MICRO_PAYMENT_THRESHOLD,
  type X402PaymentRequired,
  type X402PaymentOption,
  type X402PaymentPayload,
  type X402SettlementResult,
  type X402VerificationResult,
  type LedgerEntry,
  type X402FacilitatorConfig,
  MicroPaymentLedger,
  X402Facilitator,
  type CreditTraitConfig,
  creditTraitHandler,
  CHAIN_IDS,
  CHAIN_ID_TO_NETWORK,
  type SettlementEventType,
  type SettlementEvent,
  type SettlementEventListener,
  type RefundRequest,
  type RefundResult,
  PaymentGateway,
} from './x402-facilitator';

export {
  type RevenueEvent,
  type CreatorEarnings,
  type PluginRevenue,
  type PayoutRecord,
  type RevenuePeriod,
  type RevenueAggregatorConfig,
  CreatorRevenueAggregator,
} from './CreatorRevenueAggregator';

export {
  type WebhookProvider,
  type WebhookEventType,
  type WebhookPayload,
  type WebhookVerificationResult,
  type WebhookProcessingResult,
  type WebhookHandler,
  type WebhookServiceConfig,
  PaymentWebhookService,
} from './PaymentWebhookService';

export * from './SubscriptionManager';
export * from './AgentBudgetEnforcer';
export * from './UnifiedBudgetOptimizer';
export * from './UsageMeter';
