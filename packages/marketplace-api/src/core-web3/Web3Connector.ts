/**
 * Web3Connector Protocol
 *
 * Lightweight interface for pluggable web3 implementations.
 * Core traits (WalletTrait, NFTTrait, TokenGatedTrait) emit request events;
 * the connector fulfills them and dispatches responses back via emit().
 *
 * marketplace-api provides the production implementation using viem.
 * Tests can use MockWeb3Connector (zero dependencies).
 */

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface Web3ConnectorConfig {
  /** Default chain identifier (e.g. 'base', 'ethereum', 'polygon') */
  chain?: string;
  /** Optional RPC endpoint override */
  rpcUrl?: string;
}

export interface Web3Connector {
  /** Unique name for this connector implementation */
  readonly name: string;

  /** Connect a wallet */
  connectWallet(params: {
    provider: string;
    chainId: number;
  }): Promise<{ address: string; chainId: number }>;

  /** Verify NFT ownership on-chain */
  verifyNFTOwnership(params: {
    chain: string;
    contractAddress: string;
    tokenId: string;
    standard?: string;
    rpcEndpoint?: string;
  }): Promise<{ ownerAddress: string; standard: string }>;

  /** Check token balance for gating */
  checkTokenBalance(params: {
    chain: string;
    contractAddress: string;
    tokenId?: string;
    tokenType: string;
    address: string;
  }): Promise<{ balance: number }>;

  /** Resolve ENS name and avatar */
  resolveENS?(params: { address: string }): Promise<{
    ensName: string | null;
    ensAvatar: string | null;
  }>;

  /** Get wallet balance */
  getBalance?(params: { address: string; chainId: number }): Promise<{ balance: string }>;

  /** Switch wallet chain */
  switchChain?(params: { targetChainId: number }): Promise<void>;

  /** Sign a message */
  signMessage?(params: { address: string; message: string }): Promise<{ signature: string }>;

  /** Initiate NFT transfer */
  transferNFT?(params: {
    chain: string;
    contract: string;
    tokenId: string;
    from: string;
    to: string;
  }): Promise<{ txHash: string; newOwner: string }>;
}

// ---------------------------------------------------------------------------
// Mock implementation (zero deps, for tests and non-web3 environments)
// ---------------------------------------------------------------------------

export class MockWeb3Connector implements Web3Connector {
  readonly name = 'mock';

  async connectWallet(params: { provider: string; chainId: number }) {
    return {
      address: '0x' + '0'.repeat(40),
      chainId: params.chainId,
    };
  }

  async verifyNFTOwnership(_params: { chain: string; contractAddress: string; tokenId: string }) {
    return {
      ownerAddress: '0x' + '0'.repeat(40),
      standard: 'ERC721',
    };
  }

  async checkTokenBalance() {
    return { balance: 0 };
  }

  async resolveENS() {
    return { ensName: null, ensAvatar: null };
  }

  async getBalance() {
    return { balance: '0' };
  }

  async switchChain() {}

  async signMessage() {
    return { signature: '0x' + '0'.repeat(130) };
  }

  async transferNFT() {
    return { txHash: '0x' + '0'.repeat(64), newOwner: '0x' + '0'.repeat(40) };
  }
}

// ---------------------------------------------------------------------------
// Event bridge — wires trait events to connector methods
// ---------------------------------------------------------------------------

type EmitFn = (event: string, data: Record<string, unknown>) => void;

/**
 * Creates an event bridge that listens for web3 request events from traits
 * and dispatches them to the provided connector, emitting response events.
 *
 * Usage:
 *   const bridge = createWeb3EventBridge(connector, context.emit);
 *   bridge.handle('wallet_request_connect', eventData);
 */
export function createWeb3EventBridge(connector: Web3Connector, emit: EmitFn) {
  const handlers: Record<string, (data: Record<string, unknown>) => Promise<void>> = {
    async wallet_request_connect(data) {
      try {
        const result = await connector.connectWallet({
          provider: data.provider as string,
          chainId: data.chainId as number,
        });
        emit('wallet_connected', result);
      } catch (err) {
        emit('wallet_error', { error: (err as Error).message });
      }
    },

    async wallet_resolve_ens(data) {
      if (!connector.resolveENS) return;
      const result = await connector.resolveENS({ address: data.address as string });
      emit('wallet_ens_resolved', result);
    },

    async wallet_get_balance(data) {
      if (!connector.getBalance) return;
      const result = await connector.getBalance({
        address: data.address as string,
        chainId: data.chainId as number,
      });
      emit('wallet_balance_updated', result);
    },

    async wallet_switch_chain(data) {
      if (!connector.switchChain) return;
      await connector.switchChain({ targetChainId: data.targetChainId as number });
      emit('wallet_chain_changed', { chainId: data.targetChainId });
    },

    async wallet_request_signature(data) {
      if (!connector.signMessage) return;
      const result = await connector.signMessage({
        address: data.address as string,
        message: data.message as string,
      });
      emit('wallet_signature_result', result);
    },

    async nft_verify_ownership(data) {
      try {
        const result = await connector.verifyNFTOwnership({
          chain: data.chain as string,
          contractAddress: data.contractAddress as string,
          tokenId: data.tokenId as string,
          standard: data.standard as string | undefined,
        });
        emit('nft_ownership_verified', result);
      } catch (err) {
        emit('nft_ownership_error', { error: (err as Error).message });
      }
    },

    async nft_initiate_transfer(data) {
      if (!connector.transferNFT) return;
      try {
        const result = await connector.transferNFT({
          chain: data.chain as string,
          contract: data.contract as string,
          tokenId: data.tokenId as string,
          from: data.from as string,
          to: data.to as string,
        });
        emit('nft_transfer_complete', result);
      } catch (err) {
        emit('nft_transfer_error', { error: (err as Error).message });
      }
    },

    async token_gate_check_balance(data) {
      try {
        const result = await connector.checkTokenBalance({
          chain: data.chain as string,
          contractAddress: data.contractAddress as string,
          tokenId: data.tokenId as string | undefined,
          tokenType: data.tokenType as string,
          address: data.address as string,
        });
        emit('token_gate_balance_result', result);
      } catch (err) {
        emit('token_gate_error', { error: (err as Error).message });
      }
    },
  };

  return {
    /** Handle a single web3 event. Returns true if the event was handled. */
    handle(event: string, data: Record<string, unknown>): boolean {
      const handler = handlers[event];
      if (handler) {
        handler(data).catch((err) =>
          emit('web3_connector_error', { event, error: (err as Error).message })
        );
        return true;
      }
      return false;
    },

    /** All event names this bridge can handle */
    get supportedEvents(): string[] {
      return Object.keys(handlers);
    },
  };
}
