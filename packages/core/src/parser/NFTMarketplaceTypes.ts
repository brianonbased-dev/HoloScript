/**
 * NFT Marketplace DSL Types
 * AST node definitions for declarative NFT marketplace specification
 *
 * @version 1.0.0
 * @author HoloScript Core Team
 */

export interface NFTMarketplaceAST {
  type: 'NFTMarketplace';
  name: string;
  version?: string;
  chains: ChainConfig[];
  contracts: NFTContract[];
  marketplace?: MarketplaceConfig;
  royalties?: RoyaltyConfig;
  lazyMinting?: LazyMintingConfig;
  gasOptimization?: GasOptimizationConfig;
  metadata?: Record<string, any>;
}

/**
 * Multi-chain deployment configuration
 */
export interface ChainConfig {
  network: 'base' | 'polygon' | 'ethereum' | 'optimism' | 'arbitrum' | 'zora';
  chainId: number;
  rpcUrl?: string;
  blockExplorer?: string;
  testnet?: boolean;
  gasSettings?: {
    maxPriorityFeePerGas?: string;
    maxFeePerGas?: string;
  };
}

/**
 * NFT Contract specification (ERC-1155 or hybrid)
 */
export interface NFTContract {
  name: string;
  symbol: string;
  standard: 'ERC1155' | 'ERC721' | 'Hybrid';
  maxSupply?: number;
  mintable: boolean;
  burnable: boolean;
  pausable: boolean;
  upgradeable: boolean;
  accessControl?: AccessControlConfig;
  metadata: MetadataConfig;
  extensions?: ContractExtension[];
}

export interface AccessControlConfig {
  roles: RoleDefinition[];
  defaultAdmin: string;
}

export interface RoleDefinition {
  name: string;
  permissions: ('mint' | 'burn' | 'pause' | 'setURI' | 'withdraw' | 'upgrade')[];
}

export interface MetadataConfig {
  baseURI?: string;
  uriSuffix?: string;
  dynamic: boolean;
  ipfsGateway?: string;
  attributes?: AttributeDefinition[];
}

export interface AttributeDefinition {
  traitType: string;
  valueType: 'string' | 'number' | 'boolean';
  required: boolean;
  enumValues?: string[];
}

export interface ContractExtension {
  type: 'ERC2981' | 'ERC721Enumerable' | 'ERC1155Supply' | 'Custom';
  config?: Record<string, any>;
}

/**
 * Marketplace configuration
 */
export interface MarketplaceConfig {
  enableListing: boolean;
  enableAuction: boolean;
  enableOffers: boolean;
  platformFee: number; // Basis points (e.g., 250 = 2.5%)
  feeRecipient: string;
  supportedPaymentTokens?: PaymentToken[];
  listingDuration?: {
    min: number; // seconds
    max: number;
  };
}

export interface PaymentToken {
  symbol: string;
  address: string;
  decimals: number;
}

/**
 * ERC-2981 Royalty configuration
 */
export interface RoyaltyConfig {
  defaultRoyalty: {
    receiver: string;
    bps: number; // Basis points (max 10000 = 100%)
  };
  perTokenRoyalty?: boolean;
  maxRoyaltyBps?: number; // Cap to encourage liquidity (typically 1000 = 10%)
  upgradeable: boolean;
}

/**
 * Lazy Minting configuration
 */
export interface LazyMintingConfig {
  enabled: boolean;
  voucherVersion: string;
  signingDomain: string;
  allowedSigners?: string[];
  expirationTime?: number; // seconds
  redemptionValidation?: ValidationRule[];
}

export interface ValidationRule {
  type: 'minPrice' | 'maxSupply' | 'whitelist' | 'custom';
  value: unknown;
  errorMessage?: string;
}

/**
 * Gas Optimization configuration
 */
export interface GasOptimizationConfig {
  storageOptimization: boolean;
  batchOperations: boolean;
  useERC721A?: boolean; // For ERC721 contracts
  customOptimizations?: OptimizationRule[];
  targetGasLimit?: number;
  enableStaticAnalysis: boolean;
}

export interface OptimizationRule {
  name: string;
  description: string;
  pattern: string;
  replacement: string;
  estimatedSavings: number; // Gas units
}

/**
 * Compilation output
 */
export interface NFTMarketplaceCompilationOutput {
  contracts: CompiledContract[];
  deploymentScripts: DeploymentScript[];
  gasAnalysis?: GasAnalysisReport;
  warnings?: string[];
  estimatedDeploymentCost?: {
    base: string;
    polygon: string;
  };
}

export interface CompiledContract {
  name: string;
  solidity: string;
  abi: unknown[];
  bytecode?: string;
  sourceMap?: string;
}

export interface DeploymentScript {
  chain: string;
  script: string; // Hardhat/Foundry deployment script
  verification?: VerificationConfig;
}

export interface VerificationConfig {
  contractName: string;
  constructorArgs: unknown[];
  apiKey?: string;
}

export interface GasAnalysisReport {
  totalOptimizations: number;
  estimatedSavings: number; // Total gas units saved
  criticalIssues: GasIssue[];
  recommendations: string[];
  storageLayout: StorageSlot[];
}

export interface GasIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: string;
  issue: string;
  suggestion: string;
  potentialSavings: number;
}

export interface StorageSlot {
  slot: number;
  offset: number;
  variableName: string;
  type: string;
  size: number;
}
