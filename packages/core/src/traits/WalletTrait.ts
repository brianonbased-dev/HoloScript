/**
 * Wallet Trait
 *
 * Wallet connection and identity management.
 * Supports multiple wallet providers and ENS resolution.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type WalletProvider =
  | 'metamask'
  | 'walletconnect'
  | 'coinbase'
  | 'phantom'
  | 'rainbow'
  | 'injected';
type Network = 'mainnet' | 'goerli' | 'sepolia' | 'polygon' | 'arbitrum' | 'optimism' | 'base';

interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  ensName: string | null;
  ensAvatar: string | null;
  chainId: number | null;
  provider: WalletProvider | null;
  balance: string | null;
}

interface WalletConfig {
  supported_wallets: WalletProvider[];
  auto_connect: boolean;
  display_address: boolean;
  display_ens: boolean;
  sign_message_prompt: string;
  network: Network;
  chain_id: number;
  required_chain: boolean; // Force correct chain
}

// =============================================================================
// HANDLER
// =============================================================================

export const walletHandler: TraitHandler<WalletConfig> = {
  name: 'wallet',

  defaultConfig: {
    supported_wallets: ['metamask', 'walletconnect', 'coinbase'],
    auto_connect: false,
    display_address: false,
    display_ens: true,
    sign_message_prompt: 'Sign to verify your identity',
    network: 'mainnet',
    chain_id: 1,
    required_chain: false,
  },

  onAttach(node, config, context) {
    const state: WalletState = {
      isConnected: false,
      isConnecting: false,
      address: null,
      ensName: null,
      ensAvatar: null,
      chainId: null,
      provider: null,
      balance: null,
    };
    (node as any).__walletState = state;

    // Auto-connect if configured
    if (config.auto_connect) {
      context.emit?.('wallet_auto_connect', {
        node,
        supportedWallets: config.supported_wallets,
      });
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__walletState as WalletState;
    if (state?.isConnected) {
      context.emit?.('wallet_cleanup', { node });
    }
    delete (node as any).__walletState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Wallet state is event-driven, no per-frame updates needed
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__walletState as WalletState;
    if (!state) return;

    if (event.type === 'wallet_connect') {
      const provider = (event.provider as WalletProvider) || config.supported_wallets[0];

      if (!config.supported_wallets.includes(provider)) {
        context.emit?.('wallet_error', {
          node,
          error: `Wallet provider ${provider} not supported`,
        });
        return;
      }

      state.isConnecting = true;

      context.emit?.('wallet_request_connect', {
        node,
        provider,
        chainId: config.chain_id,
      });
    } else if (event.type === 'wallet_connected') {
      const address = event.address as string;
      const chainId = event.chainId as number;
      const provider = event.provider as WalletProvider;

      // Check chain requirement
      if (config.required_chain && chainId !== config.chain_id) {
        context.emit?.('wallet_switch_chain', {
          node,
          targetChainId: config.chain_id,
        });
        return;
      }

      state.isConnected = true;
      state.isConnecting = false;
      state.address = address;
      state.chainId = chainId;
      state.provider = provider;

      // Fetch ENS if enabled
      if (config.display_ens) {
        context.emit?.('wallet_resolve_ens', {
          node,
          address,
        });
      }

      // Fetch balance
      context.emit?.('wallet_get_balance', {
        node,
        address,
        chainId,
      });

      // Update display
      updateWalletDisplay(node, state, config, context);

      context.emit?.('on_wallet_connected', {
        node,
        address,
        provider,
        chainId,
      });
    } else if (event.type === 'wallet_ens_resolved') {
      state.ensName = (event.ensName as string) || null;
      state.ensAvatar = (event.ensAvatar as string) || null;

      updateWalletDisplay(node, state, config, context);

      if (state.ensName) {
        context.emit?.('on_ens_resolved', {
          node,
          ensName: state.ensName,
          ensAvatar: state.ensAvatar,
        });
      }
    } else if (event.type === 'wallet_balance_updated') {
      state.balance = event.balance as string;

      context.emit?.('on_balance_updated', {
        node,
        balance: state.balance,
      });
    } else if (event.type === 'wallet_disconnect') {
      const previousAddress = state.address;

      state.isConnected = false;
      state.isConnecting = false;
      state.address = null;
      state.ensName = null;
      state.ensAvatar = null;
      state.chainId = null;
      state.provider = null;
      state.balance = null;

      context.emit?.('wallet_clear_connection', { node });

      context.emit?.('on_wallet_disconnected', {
        node,
        previousAddress,
      });
    } else if (event.type === 'wallet_chain_changed') {
      const newChainId = event.chainId as number;
      state.chainId = newChainId;

      // Check required chain
      if (config.required_chain && newChainId !== config.chain_id) {
        context.emit?.('wallet_switch_chain', {
          node,
          targetChainId: config.chain_id,
        });
      }

      context.emit?.('on_chain_changed', {
        node,
        chainId: newChainId,
      });
    } else if (event.type === 'wallet_account_changed') {
      const newAddress = event.address as string;
      const previousAddress = state.address;

      state.address = newAddress;
      state.ensName = null;
      state.ensAvatar = null;

      // Re-resolve ENS
      if (config.display_ens) {
        context.emit?.('wallet_resolve_ens', {
          node,
          address: newAddress,
        });
      }

      updateWalletDisplay(node, state, config, context);

      context.emit?.('on_account_changed', {
        node,
        address: newAddress,
        previousAddress,
      });
    } else if (event.type === 'wallet_sign_message') {
      const message = (event.message as string) || config.sign_message_prompt;

      if (!state.isConnected || !state.address) {
        context.emit?.('wallet_error', {
          node,
          error: 'Wallet not connected',
        });
        return;
      }

      context.emit?.('wallet_request_signature', {
        node,
        address: state.address,
        message,
      });
    } else if (event.type === 'wallet_signature_result') {
      const signature = event.signature as string;

      context.emit?.('on_message_signed', {
        node,
        signature,
        address: state.address,
      });
    } else if (event.type === 'wallet_error') {
      state.isConnecting = false;

      context.emit?.('on_wallet_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'wallet_query') {
      context.emit?.('wallet_info', {
        queryId: event.queryId,
        node,
        isConnected: state.isConnected,
        address: state.address,
        ensName: state.ensName,
        ensAvatar: state.ensAvatar,
        chainId: state.chainId,
        provider: state.provider,
        balance: state.balance,
        supportedWallets: config.supported_wallets,
      });
    }
  },
};

function updateWalletDisplay(
  node: unknown,
  state: WalletState,
  config: WalletConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  let displayText = '';

  if (config.display_ens && state.ensName) {
    displayText = state.ensName;
  } else if (config.display_address && state.address) {
    displayText = `${state.address.slice(0, 6)}...${state.address.slice(-4)}`;
  }

  if (displayText) {
    context.emit?.('wallet_update_display', {
      node,
      text: displayText,
      avatar: state.ensAvatar,
    });
  }
}

export default walletHandler;
