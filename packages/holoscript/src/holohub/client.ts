import { HoloSmartAsset } from '../schema/smart-asset';

export interface HoloHubConfig {
  apiKey?: string;
  endpoint?: string;
}

export class HoloHubClient {
  private config: HoloHubConfig;
  private mockRegistry: Map<string, HoloSmartAsset>;

  constructor(config: HoloHubConfig = {}) {
    this.config = {
      endpoint: 'https://api.holohub.io/v1',
      ...config,
    };
    this.mockRegistry = new Map();

    // Seed with a mock asset
    this.mockRegistry.set('turret-v1', {
      metadata: {
        name: 'Standard Turret',
        version: '1.0.0',
        author: 'HoloCorp',
        description: 'A standard defense turret.',
      },
      script: "class Turret { fire() { print('Bang!'); } }",
      physics: {
        mass: 100,
        isStatic: true,
        colliderType: 'box',
      },
    });
  }

  async fetchAsset(id: string): Promise<HoloSmartAsset | null> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const asset = this.mockRegistry.get(id);
    if (!asset) {
      console.warn(`[HoloHub] Asset not found: ${id}`);
      return null;
    }

    return asset;
  }

  async publishAsset(asset: HoloSmartAsset): Promise<string> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const id = `${asset.metadata.name.toLowerCase().replace(/\s+/g, '-')}-${asset.metadata.version}`;
    this.mockRegistry.set(id, asset);

    return id;
  }

  async searchAssets(query: string): Promise<HoloSmartAsset[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const results: HoloSmartAsset[] = [];
    for (const asset of this.mockRegistry.values()) {
      if (
        asset.metadata.name.toLowerCase().includes(query.toLowerCase()) ||
        asset.metadata.description?.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push(asset);
      }
    }
    return results;
  }
}
