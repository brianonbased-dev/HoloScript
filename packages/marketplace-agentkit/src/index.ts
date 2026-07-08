/**
 * @holoscript/marketplace-agentkit
 *
 * Optional Coinbase custody integration for HoloScript marketplace agents.
 * Isolates wallet/payment dependencies so they don't propagate transitively
 * to packages that don't need them.
 *
 * Import this package only in packages/services that explicitly need Coinbase
 * wallet/payment functionality.
 */

export { AgentWalletService } from './AgentWalletService.js';
export {
  AgentKitIntegration,
  type AgentKitOptions,
  type AgentWallet,
  type AgentTransaction,
} from './AgentKitIntegration.js';

// Re-export local CDP adapter items consumed by studio/withdraw/route.ts.
export { CdpEvmWalletProvider, erc20ActionProvider } from './CdpEvmWalletProvider.js';
