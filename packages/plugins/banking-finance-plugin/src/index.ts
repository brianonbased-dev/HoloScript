export { createAccountHandler, type AccountConfig, type AccountType } from './traits/AccountTrait';
export { createTransactionHandler, type TransactionConfig, type TransactionType, type TransactionStatus } from './traits/TransactionTrait';
export { createKYCHandler, type KYCConfig, type KYCLevel, type KYCStatus } from './traits/KYCTrait';
export { createPortfolioHandler, type PortfolioConfig, type Holding } from './traits/PortfolioTrait';
export { createRiskModelHandler, type RiskModelConfig, type RiskCategory } from './traits/RiskModelTrait';
export * from './traits/types';

import { createAccountHandler } from './traits/AccountTrait';
import { createTransactionHandler } from './traits/TransactionTrait';
import { createKYCHandler } from './traits/KYCTrait';
import { createPortfolioHandler } from './traits/PortfolioTrait';
import { createRiskModelHandler } from './traits/RiskModelTrait';

export * from './fixedincome';

export const pluginMeta = { name: '@holoscript/plugin-banking-finance', version: '1.0.0', traits: ['account', 'transaction', 'kyc', 'portfolio', 'risk_model', 'fixed_income_solver'] };
export const traitHandlers = [createAccountHandler(), createTransactionHandler(), createKYCHandler(), createPortfolioHandler(), createRiskModelHandler()];

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic bond-pricing solver into HoloScriptRuntime's dispatch. Closes
// the built-but-dead-wired gap for `fixed_income_solver`, mirroring
// government-civic's `civic_decision` reference integration.
export {
  BANKING_FINANCE_PLUGIN_ID,
  fixedIncomeSolverHandler,
  registerBankingFinanceTraitHandlers,
  type FixedIncomeSolverTraitConfig,
  type FixedIncomeSolverSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';
