# NFT Marketplace DSL

**Declarative NFT marketplace creation for HoloScript**

Turn 100 lines of HoloScript into 500+ lines of production-ready Solidity with ERC-1155, ERC-2981 royalties, lazy minting, and advanced gas optimization.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Syntax Reference](#syntax-reference)
- [Gas Optimization](#gas-optimization)
- [Multi-Chain Deployment](#multi-chain-deployment)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)

## Overview

The HoloScript NFT Marketplace DSL provides a declarative, high-level syntax for creating production-grade NFT marketplaces that compile to optimized Solidity contracts.

### Key Features

✅ **ERC-1155 Multi-Token Standard** - Fungible, semi-fungible, and non-fungible tokens in one contract
✅ **ERC-2981 Royalty Standard** - Automatic creator royalties with per-token overrides
✅ **Lazy Minting** - Off-chain signatures with on-chain redemption (85%+ gas savings)
✅ **Gas Optimization** - Static analysis, storage packing, custom errors, unchecked arithmetic
✅ **Multi-Chain Support** - Deploy to Base, Polygon, Ethereum L2s with one config
✅ **Marketplace Integration** - Built-in listing, auction, and offer systems
✅ **Security Hardened** - ReentrancyGuard, AccessControl, pausable, upgradeable

### Compression Ratio

**100 lines HoloScript → 500+ lines Solidity**

```
Basic marketplace:      120 lines → 650 lines  (5.4x)
Advanced marketplace:   180 lines → 1500 lines (8.3x)
```

## Quick Start

### 1. Define Your Marketplace

Create `my-marketplace.holo`:

```holo
nft marketplace "ArtCollection" {
  version: "1.0.0"

  chains: [
    { network: "base", chainId: 8453 }
  ]

  contract "ArtNFT" {
    symbol: "ART"
    standard: "ERC1155"
    maxSupply: 10000
    mintable: true
    burnable: true

    metadata: {
      baseURI: "ipfs://QmYourHash/"
      dynamic: true
    }
  }

  royalties: {
    defaultRoyalty: {
      receiver: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
      bps: 500  // 5%
    }
  }

  lazyMinting: {
    enabled: true
    voucherVersion: "1"
    signingDomain: "ArtCollection"
  }

  gasOptimization: {
    storageOptimization: true
    enableStaticAnalysis: true
  }
}
```

### 2. Compile to Solidity

```typescript
import { NFTMarketplaceCompiler } from '@holoscript/core';

const compiler = new NFTMarketplaceCompiler({
  solcVersion: '0.8.20',
  optimizer: { enabled: true, runs: 200 },
});

const output = compiler.compile(marketplaceAST);

// Output contains:
// - Solidity contracts
// - Deployment scripts
// - Gas analysis report
// - Multi-chain configs
```

### 3. Deploy

Generated deployment script (Hardhat):

```typescript
// deploy/01-deploy-marketplace.ts
import { ethers } from 'hardhat';

async function main() {
  const ArtNFT = await ethers.getContractFactory('ArtNFT');
  const artNFT = await ArtNFT.deploy(
    'ipfs://QmYourHash/', // baseURI
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', // royalty receiver
    500 // 5% royalty
  );

  await artNFT.waitForDeployment();
  console.log('ArtNFT deployed to:', await artNFT.getAddress());
}
```

Deploy to Base:

```bash
npx hardhat run deploy/01-deploy-marketplace.ts --network base
```

## Core Concepts

### 1. Marketplace Declaration

Every NFT marketplace starts with the `nft marketplace` declaration:

```holo
nft marketplace "MarketplaceName" {
  version: "1.0.0"

  chains: [ /* multi-chain configs */ ]
  contract: { /* NFT contract spec */ }
  marketplace: { /* trading features */ }
  royalties: { /* ERC-2981 config */ }
  lazyMinting: { /* lazy mint config */ }
  gasOptimization: { /* optimization rules */ }
}
```

### 2. Multi-Chain Configuration

Deploy the same contract to multiple chains:

```holo
chains: [
  {
    network: "base"
    chainId: 8453
    testnet: false
    rpcUrl: "https://mainnet.base.org"
    gasSettings: {
      maxPriorityFeePerGas: "0.001 gwei"
      maxFeePerGas: "0.1 gwei"
    }
  }
  {
    network: "polygon"
    chainId: 137
    testnet: false
  }
]
```

**Supported Networks:**

- `base` (Chain ID: 8453)
- `polygon` (Chain ID: 137)
- `ethereum` (Chain ID: 1)
- `optimism` (Chain ID: 10)
- `arbitrum` (Chain ID: 42161)
- `zora` (Chain ID: 7777777)

### 3. NFT Contract Configuration

Define your NFT contract with ERC-1155 or hybrid standard:

```holo
contract "MyNFT" {
  symbol: "NFT"
  standard: "ERC1155"  // or "ERC721" or "Hybrid"
  maxSupply: 100000

  // Features
  mintable: true
  burnable: true
  pausable: true
  upgradeable: true  // UUPS proxy pattern

  // Access control
  accessControl: {
    roles: [
      { name: "MINTER", permissions: ["mint", "setURI"] }
      { name: "ADMIN", permissions: ["pause", "withdraw", "upgrade"] }
    ]
    defaultAdmin: "multisig"
  }

  // Metadata
  metadata: {
    baseURI: "ipfs://QmHash/"
    uriSuffix: ".json"
    dynamic: true
    ipfsGateway: "https://cloudflare-ipfs.com/ipfs/"

    attributes: [
      { traitType: "Rarity", valueType: "string", required: true,
        enumValues: ["Common", "Rare", "Epic", "Legendary"] }
      { traitType: "Edition", valueType: "number", required: true }
    ]
  }

  // Extensions
  extensions: [
    { type: "ERC2981" }  // Royalty support
    { type: "ERC1155Supply" }  // Supply tracking
  ]
}
```

### 4. Royalty Configuration (ERC-2981)

Automatic creator royalties on secondary sales:

```holo
royalties: {
  // Default royalty for all tokens
  defaultRoyalty: {
    receiver: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
    bps: 500  // 500 basis points = 5%
  }

  perTokenRoyalty: true  // Allow custom royalties per token
  maxRoyaltyBps: 1000    // 10% hard cap (encourages liquidity)
  upgradeable: true      // Can rotate to split contracts
}
```

**Basis Points (BPS):**

- 100 bps = 1%
- 250 bps = 2.5%
- 500 bps = 5%
- 1000 bps = 10%
- 10000 bps = 100%

### 5. Lazy Minting

Off-chain signatures, on-chain redemption (85%+ gas savings):

```holo
lazyMinting: {
  enabled: true
  voucherVersion: "1"
  signingDomain: "MyNFT"

  // Multiple authorized signers (for scalability)
  allowedSigners: [
    "0x0000000000000000000000000000000000000002"
    "0x0000000000000000000000000000000000000003"
  ]

  expirationTime: 172800  // 48 hours

  // Validation rules
  redemptionValidation: [
    { type: "minPrice", value: 0.001, errorMessage: "Minimum 0.001 ETH" }
    { type: "maxSupply", value: 10000, errorMessage: "Sold out" }
    { type: "whitelist", value: "ipfs://QmMerkleRoot", errorMessage: "Not whitelisted" }
  ]
}
```

**How it works:**

1. Creator signs NFT voucher off-chain (no gas cost)
2. Buyer redeems voucher on-chain (mints NFT + pays)
3. Contract validates signature and mints token
4. Gas savings: ~85% vs pre-minting

### 6. Gas Optimization

Comprehensive static analysis and optimization:

```holo
gasOptimization: {
  storageOptimization: true   // Pack variables into slots
  batchOperations: true       // Enable batch minting
  useERC721A: true            // Sequential minting optimization
  enableStaticAnalysis: true  // Run gas analyzer
  targetGasLimit: 250000      // Max gas per transaction

  customOptimizations: [
    {
      name: "CustomErrors"
      description: "Replace require strings with custom errors"
      estimatedSavings: 50  // Gas units saved
    }
    {
      name: "UncheckedArithmetic"
      description: "Wrap safe operations in unchecked{}"
      estimatedSavings: 40
    }
  ]
}
```

## Syntax Reference

### Full Marketplace Schema

```typescript
nft marketplace "Name" {
  version: string
  chains: ChainConfig[]
  contracts: NFTContract[]
  marketplace?: MarketplaceConfig
  royalties?: RoyaltyConfig
  lazyMinting?: LazyMintingConfig
  gasOptimization?: GasOptimizationConfig
  metadata?: { [key: string]: any }
}

interface ChainConfig {
  network: 'base' | 'polygon' | 'ethereum' | 'optimism' | 'arbitrum' | 'zora'
  chainId: number
  rpcUrl?: string
  blockExplorer?: string
  testnet?: boolean
  gasSettings?: {
    maxPriorityFeePerGas?: string
    maxFeePerGas?: string
  }
}

interface NFTContract {
  name: string
  symbol: string
  standard: 'ERC1155' | 'ERC721' | 'Hybrid'
  maxSupply?: number
  mintable: boolean
  burnable: boolean
  pausable: boolean
  upgradeable: boolean
  accessControl?: AccessControlConfig
  metadata: MetadataConfig
  extensions?: ContractExtension[]
}

interface MarketplaceConfig {
  enableListing: boolean
  enableAuction: boolean
  enableOffers: boolean
  platformFee: number  // Basis points
  feeRecipient: string  // Address
  supportedPaymentTokens?: PaymentToken[]
  listingDuration?: { min: number, max: number }
}

interface RoyaltyConfig {
  defaultRoyalty: { receiver: string, bps: number }
  perTokenRoyalty?: boolean
  maxRoyaltyBps?: number
  upgradeable: boolean
}

interface LazyMintingConfig {
  enabled: boolean
  voucherVersion: string
  signingDomain: string
  allowedSigners?: string[]
  expirationTime?: number
  redemptionValidation?: ValidationRule[]
}

interface GasOptimizationConfig {
  storageOptimization: boolean
  batchOperations: boolean
  useERC721A?: boolean
  enableStaticAnalysis: boolean
  targetGasLimit?: number
  customOptimizations?: OptimizationRule[]
}
```

## Gas Optimization

### Automatic Optimizations

The compiler automatically applies these optimizations:

#### 1. **Storage Packing** (20k gas per slot saved)

```solidity
// Unoptimized
uint256 a;
uint128 b;
uint128 c;

// Optimized (packed into 2 slots instead of 3)
uint128 b;
uint128 c;
uint256 a;
```

#### 2. **Custom Errors** (50+ gas per revert)

```solidity
// Unoptimized
require(totalSupply < MAX_SUPPLY, "Max supply reached");

// Optimized
error MaxSupplyReached();
if (totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
```

#### 3. **Unchecked Arithmetic** (40 gas per operation)

```solidity
// Unoptimized
for (uint256 i = 0; i < length; i++) { ... }

// Optimized
for (uint256 i; i < length; ) {
    ...
    unchecked { ++i; }
}
```

#### 4. **Calldata vs Memory** (200+ gas per array)

```solidity
// Unoptimized
function process(uint256[] memory data) external { ... }

// Optimized
function process(uint256[] calldata data) external { ... }
```

#### 5. **Sequential Minting (ERC721A)** (80% savings on batch mints)

```solidity
// Unoptimized: Multiple storage writes
function mintBatch(address to, uint256 amount) {
    for (uint256 i; i < amount; i++) {
        _mint(to, _tokenIds.current());
        _tokenIds.increment();
    }
}

// Optimized: Single storage write + sequential tracking
function mintBatch(address to, uint256 amount) {
    uint256 startId = _nextTokenId;
    _nextTokenId += amount;
    _mintBatch(to, startId, amount);
}
```

### Gas Analysis Report

After compilation, review the gas analysis report:

```typescript
{
  totalOptimizations: 12,
  totalPotentialSavings: 456000,  // Gas units
  criticalCount: 0,
  highCount: 2,
  mediumCount: 5,
  lowCount: 5,
  optimizations: [
    {
      severity: "medium",
      category: "storage",
      issue: "Wasted 12 bytes in storage slot 2",
      suggestion: "Reorder uint128, uint64, bool together",
      potentialSavings: 20000
    }
  ],
  recommendations: [
    "Enable Solidity optimizer with runs=200",
    "Use custom errors instead of require strings",
    "Pack storage variables to minimize slots",
    "Use unchecked{} for safe arithmetic"
  ]
}
```

## Multi-Chain Deployment

### Deployment Process

1. **Configure chains** in marketplace definition
2. **Compile** to generate deployment scripts for each chain
3. **Deploy** using generated Hardhat/Foundry scripts
4. **Verify** contracts on block explorers

### Example: Deploy to Base + Polygon

```holo
chains: [
  { network: "base", chainId: 8453 }
  { network: "polygon", chainId: 137 }
]
```

Compile and deploy:

```bash
# Compile
holoscript compile marketplace.holo --target solidity

# Deploy to Base
npx hardhat run deploy/deploy-base.ts --network base

# Deploy to Polygon
npx hardhat run deploy/deploy-polygon.ts --network polygon
```

### Cost Estimates

Automatically generated cost estimates:

```
Deployment Costs:
  Base:    ~$0.0023 USD  (L2, ultra-low fees)
  Polygon: ~$0.15 USD    (established L2)
  Ethereum: ~$85 USD     (L1, high fees)
```

## Examples

### Example 1: Basic Art NFT Collection

```holo
nft marketplace "DigitalArt" {
  version: "1.0.0"

  chains: [{ network: "base", chainId: 8453 }]

  contract "ArtNFT" {
    symbol: "ART"
    standard: "ERC1155"
    maxSupply: 1000
    mintable: true
    burnable: true

    metadata: {
      baseURI: "ipfs://QmArtCollection/"
      dynamic: true
    }
  }

  royalties: {
    defaultRoyalty: {
      receiver: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
      bps: 500
    }
  }

  lazyMinting: {
    enabled: true
    voucherVersion: "1"
    signingDomain: "DigitalArt"
  }

  gasOptimization: {
    storageOptimization: true
    enableStaticAnalysis: true
  }
}
```

**Compiles to:** ~650 lines of Solidity

### Example 2: Gaming Assets Marketplace

```holo
nft marketplace "GameAssets" {
  version: "1.0.0"

  chains: [
    { network: "polygon", chainId: 137 }
  ]

  contract "GameItem" {
    symbol: "ITEM"
    standard: "ERC1155"
    maxSupply: 100000
    mintable: true
    burnable: true
    pausable: true

    accessControl: {
      roles: [
        { name: "GAME_ADMIN", permissions: ["mint", "pause"] }
      ]
    }

    metadata: {
      baseURI: "https://api.game.com/items/"
      dynamic: true
      attributes: [
        { traitType: "ItemType", valueType: "string", required: true,
          enumValues: ["Weapon", "Armor", "Consumable", "Special"] }
        { traitType: "Rarity", valueType: "string", required: true }
        { traitType: "Level", valueType: "number", required: true }
      ]
    }
  }

  marketplace: {
    enableListing: true
    enableAuction: false
    enableOffers: true
    platformFee: 250
    feeRecipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
  }

  royalties: {
    defaultRoyalty: {
      receiver: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
      bps: 750
    }
  }

  gasOptimization: {
    storageOptimization: true
    batchOperations: true
    enableStaticAnalysis: true
  }
}
```

**Compiles to:** ~850 lines of Solidity

## Best Practices

### Security

1. ✅ **Use multisig for admin roles** in production
2. ✅ **Enable pausable** for emergency stops
3. ✅ **Audit before mainnet** deployment
4. ✅ **Test extensively** on testnets
5. ✅ **Cap royalties** at 10% to encourage liquidity
6. ✅ **Use hardware wallet** for high-privilege operations

### Gas Optimization

1. ✅ **Enable storage optimization** - saves 20k+ gas per slot
2. ✅ **Use lazy minting** - saves 85%+ gas on minting
3. ✅ **Enable static analysis** - identifies all optimization opportunities
4. ✅ **Set compiler optimizer** - runs=200 for deployment optimization
5. ✅ **Use batch operations** - amortize transaction overhead

### Deployment

1. ✅ **Test on testnet first** (Base Goerli, Mumbai)
2. ✅ **Verify contracts** on block explorers
3. ✅ **Monitor gas prices** - deploy during low-traffic periods
4. ✅ **Use L2 networks** (Base, Polygon) for lower fees
5. ✅ **Document deployment** - save addresses, tx hashes

### Metadata

1. ✅ **Use IPFS** for decentralized storage
2. ✅ **Pin metadata** to reliable gateways (Pinata, Infura)
3. ✅ **Include high-res images** for marketplace compatibility
4. ✅ **Follow OpenSea metadata standard** for maximum compatibility
5. ✅ **Use dynamic URIs** for upgradeable metadata

## API Reference

### Compiler API

```typescript
import { NFTMarketplaceCompiler } from '@holoscript/core';

const compiler = new NFTMarketplaceCompiler({
  solcVersion: '0.8.20',
  optimizer: { enabled: true, runs: 200 },
  generateTests: true,
  includeNatSpec: true,
  licenseType: 'MIT'
});

const output = compiler.compile(marketplaceAST);

// Output structure
{
  contracts: CompiledContract[];
  deploymentScripts: DeploymentScript[];
  gasAnalysis: GasAnalysisReport;
  warnings: string[];
  estimatedDeploymentCost: { base: string, polygon: string };
}
```

### Gas Analyzer API

```typescript
import { GasOptimizationAnalyzer, ANALYZER_PRESETS } from '@holoscript/core';

const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.production);
const report = analyzer.analyze(solidityCode, 'MyContract.sol');

// Apply auto-fixes
const { code, appliedCount } = analyzer.applyAutoFixes(solidityCode);

// Report structure
{
  totalOptimizations: number;
  totalPotentialSavings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  optimizations: GasOptimization[];
  summary: string[];
}
```

---

## Resources

- [ERC-1155 Specification](https://eips.ethereum.org/EIPS/eip-1155)
- [ERC-2981 NFT Royalty Standard](https://eips.ethereum.org/EIPS/eip-2981)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/)
- [Base Network Documentation](https://docs.base.org/)
- [Polygon Documentation](https://docs.polygon.technology/)
- [Slither Static Analyzer](https://github.com/crytic/slither)
- [RareSkills Gas Optimization Guide](https://rareskills.io/post/gas-optimization)

---

**Generated by HoloScript NFT Marketplace Compiler v1.0.0**
