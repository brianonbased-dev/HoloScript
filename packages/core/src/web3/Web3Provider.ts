/**
 * Web3Provider Stub
 *
 * This file replaces the original Web3Provider which was migrated to
 * @holoscript/marketplace-api. It exists solely to satisfy legacy
 * internal dependencies in MarketplacePanel.ts and the Sprint21 acceptance tests.
 */

export interface NFTAsset {
  id: string;
  name: string;
  contractAddress: string;
  tokenId: string;
  imageUrl: string;
  modelUrl?: string;
  chainId: number;
}

export class Web3Provider {
  private static instance: Web3Provider;
  public isConnected: boolean = false;
  public walletAddress: string | null = null;
  public chainId: number = 8453; // Base Mainnet

  public static getInstance(): Web3Provider {
    if (!Web3Provider.instance) {
      Web3Provider.instance = new Web3Provider();
    }
    return Web3Provider.instance;
  }

  public async connect(): Promise<string> {
    this.isConnected = true;
    this.walletAddress = '0xMockAddress';
    return this.walletAddress;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.walletAddress = null;
  }

  public async getMyAssets(): Promise<NFTAsset[]> {
    if (!this.isConnected) return [];
    return [
      {
        id: '1',
        name: 'Mock NFT 1',
        contractAddress: '0x123',
        tokenId: '1',
        imageUrl: 'mock.png',
        modelUrl: 'mock.glb',
        chainId: this.chainId,
      },
    ];
  }

  public async mint(_params: { name: string }): Promise<{ transactionHash: string; tokenId: string }> {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    return {
      transactionHash: '0xMockHash',
      tokenId: 'mock_token_id',
    };
  }
}
