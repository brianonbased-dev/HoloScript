declare module '@holoscript/sdk' {
  export interface HoloSmartAsset {
    metadata: {
      name: string;
      version: string;
      author?: string;
      description?: string;
      tags?: string[];
      thumbnail?: string;
    };
    script: string;
    physics?: {
      mass: number;
      colliderType: string;
      isStatic?: boolean;
    };
    ai?: {
      personality?: string;
      interactions?: string[];
    };
    assets?: Record<string, string>;
  }

  export class HoloHubClient {
    constructor(config?: any);
    fetchAsset(id: string): Promise<HoloSmartAsset | null>;
    publishAsset(asset: HoloSmartAsset): Promise<string>;
    searchAssets(query: string): Promise<HoloSmartAsset[]>;
  }
}
