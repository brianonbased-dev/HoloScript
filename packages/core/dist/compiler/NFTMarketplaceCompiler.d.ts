/**
 * @holoscript/core/compiler/NFTMarketplaceCompiler
 *
 * Hand-crafted declarations mirroring
 * packages/core/src/compiler/NFTMarketplaceCompiler.ts.
 */
import type { NFTMarketplaceAST, NFTMarketplaceCompilationOutput } from '../parser/NFTMarketplaceTypes';

export interface NFTMarketplaceCompilerOptions {
  solcVersion?: string;
  optimizer?: {
    enabled: boolean;
    runs: number;
  };
  generateTests?: boolean;
  includeNatSpec?: boolean;
  licenseType?: string;
}

export declare class NFTMarketplaceCompiler {
  constructor(options?: NFTMarketplaceCompilerOptions);
  compile(marketplace: NFTMarketplaceAST): NFTMarketplaceCompilationOutput;
}
