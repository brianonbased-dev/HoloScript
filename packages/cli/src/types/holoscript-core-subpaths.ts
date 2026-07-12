declare module '@holoscript/core/parser/NFTMarketplaceTypes' {
  export interface NFTMarketplaceAST {
    type: 'NFTMarketplace';
    name: string;
    chains: Array<{ network: string; chainId: number; testnet: boolean }>;
    contracts: Array<{
      name: string;
      symbol: string;
      standard: string;
      maxSupply: number;
      mintable: boolean;
      burnable: boolean;
      pausable: boolean;
      upgradeable: boolean;
      metadata: Record<string, unknown>;
    }>;
    royalties: {
      defaultRoyalty: { receiver: string; bps: number };
      upgradeable?: boolean;
      [key: string]: unknown;
    };
    lazyMinting: Record<string, unknown>;
    gasOptimization: Record<string, unknown>;
  }
}

declare module '@holoscript/core/compiler/NFTMarketplaceCompiler' {
  import type { NFTMarketplaceAST } from '@holoscript/core/parser/NFTMarketplaceTypes';

  export interface NFTMarketplaceCompilerOptions {
    solcVersion?: string;
    optimizer?: { enabled?: boolean; runs?: number };
    generateTests?: boolean;
    includeNatSpec?: boolean;
    licenseType?: string;
  }

  export class NFTMarketplaceCompiler {
    constructor(options?: NFTMarketplaceCompilerOptions);
    compile(ast: NFTMarketplaceAST): {
      contracts: Array<{ name: string; solidity: string }>;
      deploymentScripts: Array<{ chain: string; script: string }>;
      gasAnalysis?: {
        totalOptimizations: number;
        estimatedSavings: number;
        criticalIssues: Array<{
          severity?: string;
          issue: string;
          suggestion: string;
          potentialSavings: number;
        }>;
        recommendations: string[];
      };
      warnings?: string[];
      estimatedDeploymentCost?: Record<string, string>;
    };
  }
}

declare module '@holoscript/core/compiler/GasOptimizationAnalyzer' {
  export const ANALYZER_PRESETS: Record<string, unknown>;
  export class GasOptimizationAnalyzer {
    constructor(options?: unknown);
  }
}
