/**
 * NFT Trait
 *
 * Link object to blockchain ownership proof.
 * Verifies ownership and enables transfer functionality.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type BlockchainNetwork = 'ethereum' | 'polygon' | 'solana' | 'arbitrum' | 'base' | 'optimism';

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  animation_url?: string;
  external_url?: string;
}

interface NFTState {
  isVerified: boolean;
  isLoading: boolean;
  ownerAddress: string | null;
  metadata: NFTMetadata | null;
  tokenStandard: 'ERC721' | 'ERC1155' | 'SPL' | null;
  lastVerificationTime: number;
}

interface NFTConfig {
  chain: BlockchainNetwork;
  contract_address: string;
  token_id: string;
  metadata_uri: string;
  display_ownership: boolean;
  transfer_enabled: boolean;
  verification_interval: number; // ms, 0 = once
  rpc_endpoint: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const nftHandler: TraitHandler<NFTConfig> = {
  name: 'nft',

  defaultConfig: {
    chain: 'ethereum',
    contract_address: '',
    token_id: '',
    metadata_uri: '',
    display_ownership: false,
    transfer_enabled: false,
    verification_interval: 0,
    rpc_endpoint: '',
  },

  onAttach(node, config, context) {
    const state: NFTState = {
      isVerified: false,
      isLoading: false,
      ownerAddress: null,
      metadata: null,
      tokenStandard: null,
      lastVerificationTime: 0,
    };
    node.__nftState = state;

    if (config.contract_address && config.token_id) {
      verifyOwnership(node, state, config, context);
      loadMetadata(node, state, config, context);
    }
  },

  onDetach(node) {
    delete node.__nftState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__nftState as NFTState;
    if (!state) return;

    // Periodic re-verification
    if (config.verification_interval > 0 && state.isVerified) {
      const now = Date.now();
      if (now - state.lastVerificationTime > config.verification_interval) {
        verifyOwnership(node, state, config, context);
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__nftState as NFTState;
    if (!state) return;

    if (event.type === 'nft_ownership_verified') {
      state.isLoading = false;
      state.isVerified = true;
      state.ownerAddress = event.ownerAddress as string;
      state.tokenStandard = event.standard as typeof state.tokenStandard;
      state.lastVerificationTime = Date.now();

      context.emit?.('on_nft_verified', {
        node,
        owner: state.ownerAddress,
        standard: state.tokenStandard,
      });

      if (config.display_ownership) {
        context.emit?.('nft_display_badge', {
          node,
          owner: state.ownerAddress,
        });
      }
    } else if (event.type === 'nft_verification_failed') {
      state.isLoading = false;
      state.isVerified = false;

      context.emit?.('on_nft_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'nft_metadata_loaded') {
      state.metadata = event.metadata as NFTMetadata;

      context.emit?.('on_nft_metadata', {
        node,
        metadata: state.metadata,
      });
    } else if (event.type === 'nft_transfer') {
      if (!config.transfer_enabled) {
        context.emit?.('on_nft_error', {
          node,
          error: 'Transfers not enabled',
        });
        return;
      }

      const toAddress = event.toAddress as string;
      const fromAddress = (event.fromAddress as string) || state.ownerAddress;

      context.emit?.('nft_initiate_transfer', {
        node,
        chain: config.chain,
        contract: config.contract_address,
        tokenId: config.token_id,
        from: fromAddress,
        to: toAddress,
      });
    } else if (event.type === 'nft_transfer_complete') {
      const previousOwner = state.ownerAddress;
      state.ownerAddress = event.newOwner as string;

      context.emit?.('on_nft_transferred', {
        node,
        from: previousOwner,
        to: state.ownerAddress,
        transactionHash: event.txHash,
      });
    } else if (event.type === 'nft_verify') {
      verifyOwnership(node, state, config, context);
    } else if (event.type === 'nft_refresh_metadata') {
      loadMetadata(node, state, config, context);
    } else if (event.type === 'nft_check_owner') {
      const addressToCheck = event.address as string;
      const isOwner = state.ownerAddress?.toLowerCase() === addressToCheck.toLowerCase();

      context.emit?.('nft_owner_check_result', {
        node,
        address: addressToCheck,
        isOwner,
        currentOwner: state.ownerAddress,
      });
    } else if (event.type === 'nft_query') {
      context.emit?.('nft_info', {
        queryId: event.queryId,
        node,
        isVerified: state.isVerified,
        ownerAddress: state.ownerAddress,
        metadata: state.metadata,
        tokenStandard: state.tokenStandard,
        chain: config.chain,
        contract: config.contract_address,
        tokenId: config.token_id,
      });
    }
  },
};

function verifyOwnership(
  node: unknown,
  state: NFTState,
  config: NFTConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.isLoading = true;

  context.emit?.('nft_verify_ownership', {
    node,
    chain: config.chain,
    contractAddress: config.contract_address,
    tokenId: config.token_id,
    rpcEndpoint: config.rpc_endpoint,
  });
}

function loadMetadata(
  node: unknown,
  state: NFTState,
  config: NFTConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  if (config.metadata_uri) {
    context.emit?.('nft_load_metadata', {
      node,
      uri: config.metadata_uri,
    });
  } else {
    // Fetch from contract
    context.emit?.('nft_fetch_metadata_uri', {
      node,
      chain: config.chain,
      contractAddress: config.contract_address,
      tokenId: config.token_id,
    });
  }
}

export default nftHandler;
