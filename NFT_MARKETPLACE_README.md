# HoloScript NFT Marketplace DSL

**Declarative NFT marketplace creation - 100 lines HoloScript → 500+ lines Solidity**

Turn high-level marketplace specifications into production-ready Solidity contracts with ERC-1155, ERC-2981 royalties, lazy minting, and advanced gas optimization.

## 🚀 Features

### Core Standards
- ✅ **ERC-1155** - Multi-token standard (fungible, semi-fungible, non-fungible)
- ✅ **ERC-2981** - NFT royalty standard with per-token overrides
- ✅ **ERC721A Patterns** - Sequential minting optimization (80% gas savings)

### Advanced Capabilities
- ⚡ **Lazy Minting** - Off-chain signatures, on-chain redemption (85%+ gas savings)
- 🔍 **Gas Optimization** - Static analysis with pattern detection and auto-fixes
- 🌐 **Multi-Chain** - Deploy to Base, Polygon, Ethereum L2s
- 🛡️ **Security** - ReentrancyGuard, AccessControl, Pausable, UUPS upgradeable
- 📊 **Marketplace** - Built-in listing, auction, and offer systems

### Developer Experience
- 📝 **Declarative Syntax** - Describe what you want, not how to implement it
- 🎨 **Type-Safe** - Full TypeScript support
- 🧪 **Auto-Generated Tests** - Comprehensive test suites
- 📚 **NatSpec Documentation** - Auto-generated contract docs
- 🔧 **CLI Integration** - One command deployment

## 📦 Installation

```bash
npm install @holoscript/core @holoscript/cli
```

## 🎯 Quick Start

### 1. Create Marketplace Definition

Create `my-nft.holo`:

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

```bash
holoscript nft-compile my-nft.holo --gas-analysis
```

**Output:**
```
✓ Compilation successful!

📝 Writing contracts...
  ✓ ArtNFT.sol

🚀 Writing deployment scripts...
  ✓ deploy-base.ts

⚡ Gas Analysis Report:
─────────────────────────────────────────────────
Total Optimizations: 12
Potential Savings: ~456,000 gas

📊 Summary:
  Contracts generated: 1
  Deployment scripts: 1
  Output directory: ./generated

✨ Compilation complete!
```

### 3. Deploy

```bash
npx hardhat run generated/deploy/deploy-base.ts --network base
```

## 📖 Documentation

- [Full DSL Syntax Reference](./docs/nft-marketplace-dsl.md)
- [Gas Optimization Guide](#gas-optimization)
- [Multi-Chain Deployment](#multi-chain-deployment)
- [API Reference](#api-reference)

## 🔥 Examples

### Basic Art NFT

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
      attributes: [
        { traitType: "Artist", valueType: "string", required: true }
        { traitType: "Rarity", valueType: "string", required: true,
          enumValues: ["Common", "Rare", "Epic", "Legendary"] }
      ]
    }
  }

  royalties: {
    defaultRoyalty: { receiver: "0x...", bps: 500 }
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

### Advanced Multi-Chain Marketplace

```holo
nft marketplace "MetaverseAssets" {
  version: "2.0.0"

  // Deploy to Base (L2 - low fees) and Polygon (established ecosystem)
  chains: [
    {
      network: "base"
      chainId: 8453
      rpcUrl: "https://mainnet.base.org"
      gasSettings: {
        maxPriorityFeePerGas: "0.001 gwei"
        maxFeePerGas: "0.1 gwei"
      }
    }
    {
      network: "polygon"
      chainId: 137
      rpcUrl: "https://polygon-rpc.com"
    }
  ]

  contract "MetaverseAsset" {
    symbol: "META"
    standard: "Hybrid"  // Best of ERC721 + ERC1155
    maxSupply: 100000
    mintable: true
    burnable: true
    pausable: true
    upgradeable: true  // UUPS proxy

    accessControl: {
      roles: [
        { name: "MINTER", permissions: ["mint", "setURI"] }
        { name: "ADMIN", permissions: ["pause", "withdraw", "upgrade"] }
      ]
      defaultAdmin: "multisig"
    }

    metadata: {
      baseURI: "ipfs://QmMetaverse/"
      dynamic: true
      attributes: [
        { traitType: "Category", valueType: "string", required: true,
          enumValues: ["Avatar", "Wearable", "Land", "Building", "Vehicle"] }
        { traitType: "Rarity", valueType: "string", required: true }
        { traitType: "Creator", valueType: "string", required: true }
      ]
    }

    extensions: [
      { type: "ERC2981", config: { perTokenOverride: true } }
      { type: "ERC1155Supply" }
    ]
  }

  marketplace: {
    enableListing: true
    enableAuction: true
    enableOffers: true
    platformFee: 250  // 2.5%
    feeRecipient: "0x..."

    supportedPaymentTokens: [
      { symbol: "ETH", address: "0x0", decimals: 18 }
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 }
    ]
  }

  royalties: {
    defaultRoyalty: { receiver: "0x...", bps: 750 }  // 7.5%
    perTokenRoyalty: true
    maxRoyaltyBps: 1000  // 10% hard cap
    upgradeable: true
  }

  lazyMinting: {
    enabled: true
    voucherVersion: "2"
    signingDomain: "MetaverseAssets-v2"
    allowedSigners: [
      "0x..."  // Backend signer 1
      "0x..."  // Backend signer 2
    ]
    expirationTime: 172800  // 48 hours

    redemptionValidation: [
      { type: "minPrice", value: 0.001 }
      { type: "maxSupply", value: 100000 }
      { type: "whitelist", value: "ipfs://QmWhitelist" }
    ]
  }

  gasOptimization: {
    storageOptimization: true
    batchOperations: true
    useERC721A: true  // Sequential minting
    enableStaticAnalysis: true
    targetGasLimit: 250000

    customOptimizations: [
      {
        name: "CustomErrors"
        description: "Replace require strings with custom errors"
        estimatedSavings: 50
      }
      {
        name: "UncheckedArithmetic"
        description: "Wrap safe operations in unchecked{}"
        estimatedSavings: 40
      }
    ]
  }
}
```

**Compiles to:** ~1500 lines of Solidity

## ⚡ Gas Optimization

### Automatic Optimizations

The compiler automatically applies these optimizations:

| Optimization | Gas Saved | Description |
|---|---|---|
| **Storage Packing** | ~20,000 per slot | Packs uint128, uint64, bool into single slots |
| **Custom Errors** | ~50 per revert | Replaces require strings with custom errors |
| **Unchecked Arithmetic** | ~40 per op | Wraps safe operations in unchecked{} |
| **Calldata Parameters** | ~200 per array | Uses calldata for read-only arrays |
| **Sequential Minting** | ~80% on batch | ERC721A-style sequential tracking |
| **Batch Operations** | ~60% overhead | Amortizes transaction costs |

### Gas Analysis Report

```
⚡ Gas Analysis Report:
─────────────────────────────────────────────────
Total Optimizations: 12
Potential Savings: ~456,000 gas

Severity Breakdown:
  Critical: 0
  High: 2
  Medium: 5

Top Issues:
  • Wasted 12 bytes in storage slot 2
    Reorder uint128, uint64, bool together
    Savings: ~20,000 gas

  • Using require with string error message
    Replace with custom error
    Savings: ~75 gas

Recommendations:
  → Enable Solidity optimizer with runs=200
  → Use custom errors instead of require strings
  → Pack storage variables to minimize slots
  → Use unchecked{} for safe arithmetic
```

## 🌐 Multi-Chain Deployment

### Supported Networks

| Network | Chain ID | Type | Gas Fees | Status |
|---|---|---|---|---|
| **Base** | 8453 | L2 (Optimism) | Ultra-low (~$0.002) | ✅ Recommended |
| **Polygon** | 137 | L2 (PoS) | Low (~$0.15) | ✅ Established |
| **Ethereum** | 1 | L1 | High (~$85) | ⚠️ Expensive |
| **Optimism** | 10 | L2 (Optimism) | Low | ✅ Supported |
| **Arbitrum** | 42161 | L2 (Arbitrum) | Low | ✅ Supported |
| **Zora** | 7777777 | L2 (Optimism) | Ultra-low | ✅ NFT-focused |

### Deployment Process

1. **Configure chains** in marketplace definition
2. **Compile** with `holoscript nft-compile`
3. **Deploy** to testnet first (Base Goerli, Mumbai)
4. **Verify** on block explorers (Basescan, Polygonscan)
5. **Deploy** to mainnet

### Cost Estimates

Automatically calculated deployment costs:

```
💰 Estimated Deployment Costs:
  base: ~$0.0023 USD
  polygon: ~$0.15 USD
  ethereum: ~$85 USD
```

## 📚 API Reference

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

// Output contains:
// - Solidity contracts (.sol)
// - Deployment scripts (Hardhat/Foundry)
// - Gas analysis report
// - Test files (optional)
// - Cost estimates
```

### Gas Analyzer API

```typescript
import { GasOptimizationAnalyzer, ANALYZER_PRESETS } from '@holoscript/core';

// Use preset configurations
const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.production);
const report = analyzer.analyze(solidityCode, 'MyContract.sol');

// Apply automatic fixes
const { code, appliedCount } = analyzer.applyAutoFixes(solidityCode);

console.log(`Applied ${appliedCount} optimizations`);
console.log(`Total savings: ~${report.totalPotentialSavings} gas`);
```

### CLI Commands

```bash
# Compile marketplace to Solidity
holoscript nft-compile marketplace.holo

# With options
holoscript nft-compile marketplace.holo \
  --output ./contracts \
  --solc-version 0.8.20 \
  --optimizer-runs 200 \
  --gas-analysis \
  --generate-tests

# Generate gas report only
holoscript nft-analyze contract.sol
```

## 🛡️ Security Best Practices

1. ✅ **Use multisig** for admin roles (Gnosis Safe)
2. ✅ **Enable pausable** for emergency stops
3. ✅ **Audit contracts** before mainnet (CertiK, OpenZeppelin)
4. ✅ **Test extensively** on testnets
5. ✅ **Cap royalties** at 10% max (encourages liquidity)
6. ✅ **Use hardware wallet** for deployment
7. ✅ **Verify contracts** on block explorers
8. ✅ **Monitor with Tenderly** or similar

## 🧪 Testing

Auto-generated test suites include:

- ✅ Contract deployment
- ✅ Minting (standard + lazy)
- ✅ Burning
- ✅ Transfers
- ✅ Royalty calculations (ERC-2981)
- ✅ Marketplace listings
- ✅ Access control
- ✅ Pausable functionality
- ✅ Upgradeability (if enabled)
- ✅ Gas consumption benchmarks

```bash
npx hardhat test
```

## 📊 Comparison

### HoloScript vs Manual Solidity

| Metric | HoloScript NFT DSL | Manual Solidity |
|---|---|---|
| **Lines of Code** | 120 | 650 |
| **Development Time** | 30 minutes | 8+ hours |
| **Gas Optimization** | Automatic | Manual |
| **Multi-Chain** | Built-in | Duplicate code |
| **Royalty Support** | ERC-2981 included | Manual implementation |
| **Lazy Minting** | 1 config block | 100+ lines |
| **Testing** | Auto-generated | Manual |
| **Documentation** | Auto-generated | Manual |
| **Security** | Best practices | Depends on developer |

### Compression Ratio

**5.4x - 8.3x compression**

```
Basic:      120 lines → 650 lines   (5.4x)
Advanced:   180 lines → 1500 lines  (8.3x)
```

## 🌟 Why Use HoloScript NFT DSL?

### Developer Benefits

1. **10x Faster Development** - Minutes instead of days
2. **Gas Optimized by Default** - Static analysis finds every optimization
3. **Multi-Chain Ready** - Deploy to Base, Polygon, etc. with one config
4. **Production Grade** - Uses OpenZeppelin contracts
5. **Fully Typed** - TypeScript support throughout
6. **Best Practices** - Security patterns built-in

### Business Benefits

1. **Lower Costs** - 85%+ gas savings from lazy minting
2. **Faster Time-to-Market** - Ship in days, not weeks
3. **Reduce Errors** - Auto-generated, tested code
4. **Multi-Chain Strategy** - Easy L2 deployment
5. **Future-Proof** - Upgradeable contracts
6. **Creator-Friendly** - ERC-2981 royalties built-in

## 🔗 Resources

### Standards
- [ERC-1155: Multi-Token Standard](https://eips.ethereum.org/EIPS/eip-1155)
- [ERC-2981: NFT Royalty Standard](https://eips.ethereum.org/EIPS/eip-2981)
- [ERC721A: Gas-Optimized NFTs](https://www.erc721a.org/)

### Networks
- [Base Documentation](https://docs.base.org/)
- [Polygon Documentation](https://docs.polygon.technology/)

### Tools
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Slither Static Analyzer](https://github.com/crytic/slither)
- [RareSkills Gas Optimization](https://rareskills.io/post/gas-optimization)

### HoloScript
- [Full Documentation](./docs/nft-marketplace-dsl.md)
- [Examples](./examples/)
- [API Reference](#api-reference)

## 📝 License

MIT License - see [LICENSE](./LICENSE)

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

**Built with HoloScript** • [Website](https://holoscript.org) • [Discord](https://discord.gg/holoscript) • [Twitter](https://twitter.com/holoscript)

**Generated by HoloScript NFT Marketplace Compiler v1.0.0**
