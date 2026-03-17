/**
 * TokenGated Trait
 *
 * Access control via token ownership.
 * Verifies wallet holds required tokens before granting access.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Chain = 'ethereum' | 'polygon' | 'solana' | 'base' | 'arbitrum' | 'optimism';
type TokenType = 'erc721' | 'erc1155' | 'erc20' | 'spl';
type FallbackBehavior = 'hide' | 'blur' | 'lock' | 'message' | 'redirect';

interface TokenGatedState {
  isVerified: boolean;
  hasAccess: boolean;
  verifiedAddress: string | null;
  tokenBalance: number;
  lastVerifyTime: number;
  verifyAttempts: number;
}

interface TokenGatedConfig {
  chain: Chain;
  contract_address: string;
  token_id: string; // For ERC1155
  min_balance: number;
  token_type: TokenType;
  fallback_behavior: FallbackBehavior;
  gate_message: string;
  redirect_url: string;
  verify_interval: number; // Re-verify every N ms (0 = once)
  allow_list: string[]; // Addresses always allowed
  block_list: string[]; // Addresses always blocked
}

// =============================================================================
// HANDLER
// =============================================================================

export const tokenGatedHandler: TraitHandler<TokenGatedConfig> = {
  name: 'token_gated',

  defaultConfig: {
    chain: 'ethereum',
    contract_address: '',
    token_id: '',
    min_balance: 1,
    token_type: 'erc721',
    fallback_behavior: 'hide',
    gate_message: 'Token required for access',
    redirect_url: '',
    verify_interval: 0,
    allow_list: [],
    block_list: [],
  },

  onAttach(node, config, context) {
    const state: TokenGatedState = {
      isVerified: false,
      hasAccess: false,
      verifiedAddress: null,
      tokenBalance: 0,
      lastVerifyTime: 0,
      verifyAttempts: 0,
    };
    node.__tokenGatedState = state;

    // Apply initial fallback state
    applyFallbackBehavior(node, config, context, false);
  },

  onDetach(node) {
    delete node.__tokenGatedState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__tokenGatedState as TokenGatedState;
    if (!state) return;

    // Re-verify periodically if configured
    if (config.verify_interval > 0 && state.isVerified) {
      const now = Date.now();
      if (now - state.lastVerifyTime >= config.verify_interval) {
        context.emit?.('token_gate_reverify', {
          node,
          address: state.verifiedAddress,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__tokenGatedState as TokenGatedState;
    if (!state) return;

    if (event.type === 'token_gate_verify') {
      const address = event.address as string;
      state.verifyAttempts++;

      // Check block list
      if (config.block_list.includes(address.toLowerCase())) {
        state.hasAccess = false;
        state.isVerified = true;
        state.verifiedAddress = address;

        context.emit?.('on_token_denied', {
          node,
          address,
          reason: 'blocked',
        });
        return;
      }

      // Check allow list
      if (config.allow_list.includes(address.toLowerCase())) {
        grantAccess(node, state, config, context, address, 999);
        return;
      }

      // Request blockchain verification
      context.emit?.('token_gate_check_balance', {
        node,
        chain: config.chain,
        contractAddress: config.contract_address,
        tokenId: config.token_id,
        tokenType: config.token_type,
        address,
      });
    } else if (event.type === 'token_gate_balance_result') {
      const address = event.address as string;
      const balance = event.balance as number;

      state.tokenBalance = balance;
      state.lastVerifyTime = Date.now();
      state.isVerified = true;
      state.verifiedAddress = address;

      if (balance >= config.min_balance) {
        grantAccess(node, state, config, context, address, balance);
      } else {
        state.hasAccess = false;
        applyFallbackBehavior(node, config, context, false);

        context.emit?.('on_token_denied', {
          node,
          address,
          reason: 'insufficient_balance',
          balance,
          required: config.min_balance,
        });
      }
    } else if (event.type === 'token_gate_disconnect') {
      state.isVerified = false;
      state.hasAccess = false;
      state.verifiedAddress = null;
      state.tokenBalance = 0;

      applyFallbackBehavior(node, config, context, false);

      context.emit?.('on_token_access_revoked', { node });
    } else if (event.type === 'token_gate_refresh') {
      if (state.verifiedAddress) {
        context.emit?.('token_gate_verify', {
          node,
          address: state.verifiedAddress,
        });
      }
    } else if (event.type === 'token_gate_query') {
      context.emit?.('token_gate_info', {
        queryId: event.queryId,
        node,
        isVerified: state.isVerified,
        hasAccess: state.hasAccess,
        verifiedAddress: state.verifiedAddress,
        tokenBalance: state.tokenBalance,
        minBalance: config.min_balance,
        chain: config.chain,
        contractAddress: config.contract_address,
        tokenType: config.token_type,
      });
    }
  },
};

function grantAccess(
  node: unknown,
  state: TokenGatedState,
  config: TokenGatedConfig,
  context: { emit?: (event: string, data: unknown) => void },
  address: string,
  balance: number
): void {
  state.hasAccess = true;
  state.verifiedAddress = address;
  state.tokenBalance = balance;

  // Remove fallback behavior
  context.emit?.('token_gate_reveal', { node });

  context.emit?.('on_token_verified', {
    node,
    address,
    balance,
    chain: config.chain,
    contract: config.contract_address,
  });
}

function applyFallbackBehavior(
  node: unknown,
  config: TokenGatedConfig,
  context: { emit?: (event: string, data: unknown) => void },
  hasAccess: boolean
): void {
  if (hasAccess) return;

  switch (config.fallback_behavior) {
    case 'hide':
      context.emit?.('token_gate_hide', { node });
      break;
    case 'blur':
      context.emit?.('token_gate_blur', { node, amount: 10 });
      break;
    case 'lock':
      context.emit?.('token_gate_lock', { node });
      break;
    case 'message':
      context.emit?.('token_gate_show_message', {
        node,
        message: config.gate_message,
      });
      break;
    case 'redirect':
      if (config.redirect_url) {
        context.emit?.('token_gate_redirect', {
          node,
          url: config.redirect_url,
        });
      }
      break;
  }
}

export default tokenGatedHandler;
