/**
 * x402 Payment Protocol Facilitator — RE-EXPORT SHIM
 *
 * Canonical implementation lives in @holoscript/framework/economy.
 * This file re-exports everything so existing consumers of @holoscript/core
 * continue to work unchanged.
 */

import { creditTraitHandler as _creditTraitHandler } from '@holoscript/framework/economy';

export {
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
} from '@holoscript/framework/economy';

export default _creditTraitHandler;
