/**
 * @holoscript/core/parser/NFTMarketplaceTypes
 *
 * Hand-crafted declarations mirroring
 * packages/core/src/parser/NFTMarketplaceTypes.ts.
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
  metadata?: Record<string, unknown>;
}

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
  config?: Record<string, unknown>;
}

export interface MarketplaceConfig {
  enableListing: boolean;
  enableAuction: boolean;
  enableOffers: boolean;
  platformFee: number;
  feeRecipient: string;
  supportedPaymentTokens?: PaymentToken[];
  listingDuration?: {
    min: number;
    max: number;
  };
}

export interface PaymentToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface RoyaltyConfig {
  defaultRoyalty: {
    receiver: string;
    bps: number;
  };
  perTokenRoyalty?: boolean;
  maxRoyaltyBps?: number;
  upgradeable: boolean;
}

export interface LazyMintingConfig {
  enabled: boolean;
  voucherVersion: string;
  signingDomain: string;
  allowedSigners?: string[];
  expirationTime?: number;
  redemptionValidation?: ValidationRule[];
}

export interface ValidationRule {
  type: 'minPrice' | 'maxSupply' | 'whitelist' | 'custom';
  value: unknown;
  errorMessage?: string;
}

export interface GasOptimizationConfig {
  storageOptimization: boolean;
  batchOperations: boolean;
  useERC721A?: boolean;
  customOptimizations?: OptimizationRule[];
  targetGasLimit?: number;
  enableStaticAnalysis: boolean;
}

export interface OptimizationRule {
  name: string;
  description: string;
  pattern: string;
  replacement: string;
  estimatedSavings: number;
}

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
  script: string;
  verification?: VerificationConfig;
}

export interface VerificationConfig {
  contractName: string;
  constructorArgs: unknown[];
  apiKey?: string;
}

export interface GasAnalysisReport {
  totalOptimizations: number;
  estimatedSavings: number;
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
