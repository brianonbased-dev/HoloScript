/**
 * @holoscript/marketplace-agentkit
 *
 * Optional Coinbase AgentKit integration for HoloScript marketplace agents.
 * Isolates all @coinbase/agentkit dependencies so they don't propagate
 * transitively to packages that don't need them (avoiding CVE-2025-3194 and
 * elliptic advisory exposure in unrelated packages).
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

// Re-export agentkit items consumed by studio/withdraw/route.ts dynamic imports
export { CdpEvmWalletProvider, erc20ActionProvider } from '@coinbase/agentkit';
