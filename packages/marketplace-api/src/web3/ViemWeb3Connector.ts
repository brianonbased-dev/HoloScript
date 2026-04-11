/**
 * ViemWeb3Connector
 *
 * Production Web3Connector implementation backed by viem + WalletConnection.
 * Implements the Web3Connector interface from @holoscript/core so that
 * core traits (WalletTrait, NFTTrait, TokenGatedTrait) can interact with
 * real blockchains without importing viem directly.
 *
 * @module @holoscript/marketplace-api
 */

import type { Web3Connector, Web3ConnectorConfig } from '@holoscript/core';
import { createPublicClient, http, type Address, formatEther } from 'viem';
import { base, baseGoerli, mainnet } from 'viem/chains';

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

const CHAINS: Record<string, typeof base> = {
  base,
  'base-testnet': baseGoerli,
  ethereum: mainnet,
};

function getChain(name: string) {
  return CHAINS[name] ?? base;
}

function getChainById(id: number) {
  switch (id) {
    case 8453:
      return base;
    case 84531:
      return baseGoerli;
    case 1:
      return mainnet;
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Minimal ABIs for on-chain reads
// ---------------------------------------------------------------------------

const ERC721_OWNER_OF_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const ERC1155_BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const ERC20_BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ---------------------------------------------------------------------------
// ViemWeb3Connector
// ---------------------------------------------------------------------------

export class ViemWeb3Connector implements Web3Connector {
  readonly name = 'viem';
  private config: Web3ConnectorConfig;

  constructor(config: Web3ConnectorConfig = {}) {
    this.config = config;
  }

  private getClient(chainName?: string, rpcUrl?: string) {
    const chain = getChain(chainName ?? this.config.chain ?? 'base');
    return createPublicClient({
      chain,
      transport: http(rpcUrl ?? this.config.rpcUrl ?? undefined),
    });
  }

  async connectWallet(params: { provider: string; chainId: number }) {
    // In a server context, "connecting" means acknowledging readiness on this chain.
    // Real browser wallet connection is handled client-side; this validates the chain.
    const chain = getChainById(params.chainId);
    const client = createPublicClient({ chain, transport: http() });
    const _blockNumber = await client.getBlockNumber();

    return {
      address: '0x' + '0'.repeat(40), // placeholder — real address comes from wallet provider
      chainId: params.chainId,
    };
  }

  async verifyNFTOwnership(params: {
    chain: string;
    contractAddress: string;
    tokenId: string;
    standard?: string;
    rpcEndpoint?: string;
  }) {
    const client = this.getClient(params.chain, params.rpcEndpoint);
    const standard = params.standard ?? 'ERC721';

    if (standard === 'ERC721') {
      const owner = await client.readContract({
        address: params.contractAddress as Address,
        abi: ERC721_OWNER_OF_ABI,
        functionName: 'ownerOf',
        args: [BigInt(params.tokenId)],
      });

      return { ownerAddress: owner as string, standard: 'ERC721' };
    }

    // ERC1155 — we can't determine a single "owner", so return the zero address
    // and let the caller check balance instead
    return { ownerAddress: '0x' + '0'.repeat(40), standard };
  }

  async checkTokenBalance(params: {
    chain: string;
    contractAddress: string;
    tokenId?: string;
    tokenType: string;
    address: string;
  }) {
    const client = this.getClient(params.chain);

    if (params.tokenType === 'ERC20') {
      const balance = await client.readContract({
        address: params.contractAddress as Address,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [params.address as Address],
      });
      return { balance: Number(balance) };
    }

    if (params.tokenType === 'ERC1155' && params.tokenId) {
      const balance = await client.readContract({
        address: params.contractAddress as Address,
        abi: ERC1155_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [params.address as Address, BigInt(params.tokenId)],
      });
      return { balance: Number(balance) };
    }

    // ERC721 — check if address owns the specific tokenId
    if (params.tokenType === 'ERC721' && params.tokenId) {
      const owner = await client.readContract({
        address: params.contractAddress as Address,
        abi: ERC721_OWNER_OF_ABI,
        functionName: 'ownerOf',
        args: [BigInt(params.tokenId)],
      });
      return { balance: (owner as string).toLowerCase() === params.address.toLowerCase() ? 1 : 0 };
    }

    return { balance: 0 };
  }

  async resolveENS(params: { address: string }) {
    // ENS lives on Ethereum mainnet
    const client = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    try {
      const ensName = await client.getEnsName({
        address: params.address as Address,
      });
      let ensAvatar: string | null = null;

      if (ensName) {
        try {
          ensAvatar = await client.getEnsAvatar({ name: ensName });
        } catch {
          // Avatar resolution can fail
        }
      }

      return { ensName, ensAvatar };
    } catch {
      return { ensName: null, ensAvatar: null };
    }
  }

  async getBalance(params: { address: string; chainId: number }) {
    const chain = getChainById(params.chainId);
    const client = createPublicClient({ chain, transport: http() });

    const balance = await client.getBalance({
      address: params.address as Address,
    });

    return { balance: formatEther(balance) };
  }

  async switchChain(_params: { targetChainId: number }) {
    // Server-side: no-op. Chain switching is a browser wallet concern.
  }

  async signMessage(_params: { address: string; message: string }) {
    // Server-side signing requires a private key or wallet provider.
    // This connector is read-only; signing should be delegated to a wallet client.
    throw new Error(
      'ViemWeb3Connector.signMessage requires a wallet client. ' +
        'Use AgentWalletService for server-side signing.'
    );
  }

  async transferNFT(_params: {
    chain: string;
    contract: string;
    tokenId: string;
    from: string;
    to: string;
  }) {
    // Transfer requires a wallet client with signing capability.
    throw new Error(
      'ViemWeb3Connector.transferNFT requires a wallet client. ' +
        'Use AgentWalletService for server-side transfers.'
    );
  }
}
