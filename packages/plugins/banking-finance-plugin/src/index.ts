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

export const pluginMeta = { name: '@holoscript/plugin-banking-finance', version: '1.0.0', traits: ['account', 'transaction', 'kyc', 'portfolio', 'risk_model'] };
export const traitHandlers = [createAccountHandler(), createTransactionHandler(), createKYCHandler(), createPortfolioHandler(), createRiskModelHandler()];
