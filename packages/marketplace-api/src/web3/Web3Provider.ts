/**
 * Web3Provider (Mock)
 *
 * Simulates interactions with Base Network and Zora Protocol.
 * In a real implementation, this would use viem/wagmi.
 */

export interface NFTAsset {
  contractAddress: string;
  tokenId: string;
  chainId: number;
  name: string;
  description?: string;
  imageUrl: string;
  modelUrl?: string; // 3D model if available
  metadataUrl?: string;
}

export class Web3Provider {
  private static instance: Web3Provider;

  public isConnected: boolean = false;
  public walletAddress: string | null = null;
  public chainId: number = 8453; // Base Mainnet

  private constructor() {}

  static getInstance(): Web3Provider {
    if (!Web3Provider.instance) {
      Web3Provider.instance = new Web3Provider();
    }
    return Web3Provider.instance;
  }

  async connect(): Promise<string> {
    // Simulate wallet connection delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.isConnected = true;
    this.walletAddress = '0x123...mock...789';
    return this.walletAddress;
  }

  async disconnect() {
    this.isConnected = false;
    this.walletAddress = null;
  }

  /**
   * Fetch user's NFTs (Mocked for Base)
   */
  async getMyAssets(): Promise<NFTAsset[]> {
    if (!this.isConnected) return [];

    await new Promise((resolve) => setTimeout(resolve, 300));

    return [
      {
        contractAddress: '0xabc...base',
        tokenId: '1',
        chainId: 8453,
        name: 'Base Builder #1',
        imageUrl: 'https://assets.holoscript.org/mock/base_nft_1.png',
        modelUrl: 'https://assets.holoscript.org/primitives/cube.glb', // Use cube as "NFT Model"
        description: 'A dedicated builder on Base.',
      },
      {
        contractAddress: '0xdef...zora',
        tokenId: '42',
        chainId: 8453,
        name: 'Zora Orb',
        imageUrl: 'https://assets.holoscript.org/mock/zora_orb.png',
        modelUrl: 'https://assets.holoscript.org/primitives/sphere.glb',
        description: 'Commemorative Orb.',
      },
    ];
  }

  /**
   * Mint a new NFT on Base (Mock)
   */
  async mint(_metadata: any): Promise<{ transactionHash: string; tokenId: string }> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      transactionHash: '0xdeadbeef...',
      tokenId: Math.floor(Math.random() * 1000).toString(),
    };
  }
}
