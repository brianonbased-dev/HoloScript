# ZoraCoinsTrait - Zora Protocol Integration Documentation

## Overview

The **ZoraCoinsTrait** provides full blockchain integration with the [Zora Protocol](https://zora.co/) on Base L2, enabling HoloScript objects to mint NFTs representing collectible "coins" in virtual environments.

**Key Features:**

- ✅ Real blockchain transactions on Base L2 (mainnet and testnet)
- ✅ Gas estimation and balance validation
- ✅ ERC-1155 NFT minting via Zora Protocol SDK
- ✅ Transaction monitoring and confirmation tracking
- ✅ Creator royalties and referral rewards
- ✅ Event-driven architecture for real-time updates

**Version:** 3.2.0
**Status:** Production Ready (as of June 2026)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Setup](#environment-setup)
3. [Configuration](#configuration)
4. [Usage Examples](#usage-examples)
5. [Wallet Connection](#wallet-connection)
6. [Minting Workflow](#minting-workflow)
7. [Events Reference](#events-reference)
8. [Gas Estimation](#gas-estimation)
9. [Error Handling](#error-handling)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)
12. [Advanced Topics](#advanced-topics)

---

## Quick Start

### 1. Create a Zora Collection

Before using ZoraCoinsTrait, create a collection on Zora:

1. Visit [https://zora.co/create](https://zora.co/create)
2. Connect your wallet (Base network)
3. Create a new 1155 collection
4. Copy the contract address

### 2. Configure Environment

Add to your `.env` file:

```bash
# Base Mainnet RPC (required for production)
BASE_RPC_URL=https://mainnet.base.org

# Base Testnet RPC (required for testing)
BASE_TESTNET_RPC_URL=https://goerli.base.org

# Optional: Use custom RPC providers
# BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

### 3. Use in HoloScript

```holoscript
object "MyCoin" @zora_coins {
  default_chain: "base",
  collection_id: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  creator_wallet: "0xYourWalletAddress",
  royalty_percentage: 10.0,

  geometry: "cylinder",
  material: "metallic_gold",
  position: [0, 1.5, -2],
  scale: [0.1, 0.1, 0.02]
}
```

### 4. Connect Wallet & Mint

```typescript
// Emit wallet connection event
context.emit('wallet_connected', {
  address: '0xYourWalletAddress',
});

// Trigger mint action
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 1,
    maxSupply: 100,
    priceETH: '0.001',
    name: 'My Collectible Coin',
    description: 'A rare collectible from my virtual world',
    tags: ['collectible', 'gaming', 'VR'],
  },
});
```

---

## Environment Setup

### Dependencies

The following packages are required (automatically installed):

```json
{
  "@zoralabs/protocol-deployments": "^0.7.2",
  "viem": "^2.45.3",
  "wagmi": "^3.4.3"
}
```

### RPC Endpoints

**Base Mainnet:**

- Public RPC: `https://mainnet.base.org`
- Alchemy: `https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY`
- Infura: `https://base-mainnet.infura.io/v3/YOUR_PROJECT_ID`

**Base Testnet (Goerli):**

- Public RPC: `https://goerli.base.org`
- Alchemy: `https://base-goerli.g.alchemy.com/v2/YOUR_API_KEY`

**Recommended:** Use Alchemy or Infura for production deployments for better reliability and rate limits.

### Environment Variables

Create a `.env` file in your project root:

```bash
# Required: Base L2 RPC URLs
BASE_RPC_URL=https://mainnet.base.org
BASE_TESTNET_RPC_URL=https://goerli.base.org

# Optional: Private key for server-side wallet (DO NOT commit to git!)
# WALLET_PRIVATE_KEY=0x...

# Optional: Etherscan API key for transaction verification
# BASESCAN_API_KEY=...

# Optional: Enable testnet integration tests
ENABLE_TESTNET_TESTS=false
```

**⚠️ Security Warning:** Never commit private keys to version control. Use environment variables or secure key management systems.

---

## Configuration

### ZoraCoinsConfig Interface

```typescript
interface ZoraCoinsConfig {
  // Blockchain Configuration
  default_chain?: 'base' | 'base-testnet';
  collection_id?: string; // Zora 1155 contract address
  creator_wallet?: string; // Creator's Ethereum address

  // Royalty Configuration
  royalty_percentage?: number; // 0-100 (e.g., 10 = 10%)

  // Marketplace Configuration
  enable_marketplace?: boolean; // Enable secondary sales
  allow_transfers?: boolean; // Allow NFT transfers
}
```

### Example Configurations

**Basic Configuration (Mainnet):**

```holoscript
object "GoldCoin" @zora_coins {
  default_chain: "base",
  collection_id: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  creator_wallet: "0xCreatorAddress",
  royalty_percentage: 5.0
}
```

**Testnet Configuration:**

```holoscript
object "TestCoin" @zora_coins {
  default_chain: "base-testnet",
  collection_id: "0xTestCollectionAddress",
  creator_wallet: "0xTestWalletAddress",
  royalty_percentage: 0.0  // No royalties for testing
}
```

---

## Usage Examples

### Example 1: Simple Collectible Coin

```holoscript
object "RareCoin" @zora_coins {
  default_chain: "base",
  collection_id: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  creator_wallet: "0xCreatorAddress",
  royalty_percentage: 10.0,

  geometry: "cylinder",
  material: "gold",
  @glowing {
    intensity: 0.8,
    color: "#FFD700"
  }
}
```

### Example 2: Limited Edition Series

```typescript
// Mint 100 limited edition coins
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 100,
    maxSupply: 100,
    priceETH: '0.01',
    name: 'Limited Edition Gold Coin #1',
    description: 'Only 100 minted. Exclusive collectible.',
    tags: ['limited', 'exclusive', 'gold'],
  },
});
```

### Example 3: Dynamic Coin with Metadata

```typescript
// Mint coin with custom metadata
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 1,
    maxSupply: 1, // 1/1 unique
    priceETH: '0.1',
    name: 'Legendary Dragon Coin',
    description: 'Forged in the fires of Mount Doom',
    tags: ['legendary', 'dragon', 'unique'],
    metadata: {
      attributes: [
        { trait_type: 'Rarity', value: 'Legendary' },
        { trait_type: 'Element', value: 'Fire' },
        { trait_type: 'Power', value: '9999' },
      ],
    },
  },
});
```

---

## Wallet Connection

### Connecting a Wallet

**Method 1: Event-based (Recommended)**

```typescript
context.emit('wallet_connected', {
  address: '0xYourWalletAddress',
});
```

**Method 2: Programmatic**

```typescript
import { WalletConnection } from '@holoscript/core/traits/utils/WalletConnection';

const wallet = new WalletConnection({ chain: 'base' });
await wallet.connect('0xYourWalletAddress' as Address);
```

### Checking Connection Status

```typescript
const state = node.__zoraCoinsState;

if (state.isConnected && state.wallet) {
  console.log('Wallet connected:', state.walletAddress);
} else {
  console.log('No wallet connected');
}
```

### Disconnecting

```typescript
if (state.wallet) {
  state.wallet.disconnect();
  state.isConnected = false;
  state.walletAddress = null;
}
```

---

## Minting Workflow

### 1. Prerequisites

- ✅ Wallet connected
- ✅ Collection ID configured
- ✅ Sufficient ETH balance (gas + mint fee)

### 2. Trigger Mint

```typescript
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 1,
    maxSupply: 100,
    priceETH: '0.001',
    name: 'My Coin',
    description: 'A collectible coin',
    tags: ['gaming', 'collectible'],
  },
});
```

### 3. Monitor Events

```typescript
// Gas estimation started
context.on('zora_estimating_gas', (data) => {
  console.log('Estimating gas for', data.quantity, 'mints');
});

// Gas estimated
context.on('zora_gas_estimated', (data) => {
  console.log('Total cost:', data.estimate.totalCostETH);
});

// Transaction sending
context.on('zora_transaction_sending', (data) => {
  console.log('Sending transaction...');
});

// Transaction sent
context.on('zora_transaction_sent', (data) => {
  console.log('Transaction hash:', data.txHash);
});

// Transaction confirmed
context.on('zora_transaction_confirmed', (data) => {
  console.log('Confirmed in block:', data.blockNumber);
  console.log('Gas used:', data.gasUsed);
});

// Mint complete
context.on('zora_mint_complete', (data) => {
  console.log('Mint successful!');
  console.log('Token ID:', data.tokenId);
  console.log('Contract:', data.contractAddress);
});

// Mint failed
context.on('zora_mint_failed', (data) => {
  console.error('Mint failed:', data.error);
});
```

### 4. Check Mint Status

```typescript
const state = node.__zoraCoinsState;

state.pendingMints.forEach((mint) => {
  console.log(`Mint ${mint.id}: ${mint.status}`);

  if (mint.status === 'complete') {
    console.log('  Token ID:', mint.tokenId);
    console.log('  Tx Hash:', mint.txHash);
    console.log('  Block:', mint.blockNumber);
  }

  if (mint.status === 'failed') {
    console.error('  Error:', mint.error);
  }
});
```

---

## Events Reference

### Wallet Events

| Event                 | Data                  | Description                   |
| --------------------- | --------------------- | ----------------------------- |
| `wallet_connected`    | `{ address: string }` | Wallet successfully connected |
| `wallet_disconnected` | `{}`                  | Wallet disconnected           |

### Minting Events

| Event                        | Data                                                                                                                 | Description                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `zora_mint`                  | `{ mintConfig: MintConfig }`                                                                                         | Trigger new mint                  |
| `zora_estimating_gas`        | `{ mintId: string, quantity: number }`                                                                               | Gas estimation started            |
| `zora_gas_estimated`         | `{ mintId: string, estimate: FormattedGasEstimate }`                                                                 | Gas estimated                     |
| `zora_transaction_simulated` | `{ mintId: string, success: boolean }`                                                                               | Transaction simulated             |
| `zora_transaction_sending`   | `{ mintId: string }`                                                                                                 | Sending transaction to blockchain |
| `zora_transaction_sent`      | `{ mintId: string, txHash: string }`                                                                                 | Transaction sent (pending)        |
| `zora_transaction_confirmed` | `{ mintId: string, txHash: string, blockNumber: number, gasUsed: string }`                                           | Transaction confirmed on-chain    |
| `zora_mint_complete`         | `{ mintId: string, txHash: string, contractAddress: string, tokenId: number, blockNumber: number, gasUsed: string }` | Mint completed successfully       |
| `zora_mint_failed`           | `{ mintId: string, txHash?: string, error: string }`                                                                 | Mint failed                       |

---

## Gas Estimation

### How It Works

The `GasEstimator` utility calculates the total cost for a Zora mint:

1. **Gas Limit:** Estimated gas units (200k default + 20% buffer)
2. **Gas Price:** Current Base L2 gas price (EIP-1559)
3. **Mint Fee:** Zora Protocol fee (0.000777 ETH per mint)
4. **Total Cost:** `(gasLimit × maxFeePerGas) + (0.000777 ETH × quantity)`

### Example Calculation

```
Minting 5 NFTs:
- Gas Limit: 240,000 (200k + 20% buffer)
- Max Fee Per Gas: 0.001 gwei
- Gas Cost: 240,000 × 0.001 gwei = 0.00024 ETH
- Mint Fee: 5 × 0.000777 ETH = 0.003885 ETH
- Total: 0.00024 + 0.003885 = 0.004125 ETH (~$8.25 @ $2000/ETH)
```

### Getting Gas Estimates

```typescript
import { GasEstimator } from '@holoscript/core/traits/utils/GasEstimator';

const estimate = await GasEstimator.estimateMintGas(
  publicClient,
  contractAddress,
  BigInt(quantity)
);

console.log('Gas estimate:', GasEstimator.formatEstimate(estimate));
// Output:
// {
//   totalGasCostETH: '0.00024',
//   mintFeeETH: '0.003885',
//   totalCostETH: '0.004125'
// }
```

### Checking Balance

```typescript
const balanceCheck = await GasEstimator.checkSufficientBalance(
  publicClient,
  walletAddress,
  estimate
);

if (!balanceCheck.sufficient) {
  const shortfall = GasEstimator.formatCost(balanceCheck.shortfall);
  console.error('Insufficient balance. Need', shortfall, 'more ETH');
}
```

---

## Error Handling

### Common Errors

#### 1. Wallet Not Connected

```
Error: Wallet not connected. Please connect wallet by emitting wallet_connected event first.
```

**Solution:**

```typescript
context.emit('wallet_connected', { address: '0xYourAddress' });
```

#### 2. Insufficient Balance

```
Error: Insufficient balance for mint transaction.
Required: 0.004125 ETH
Available: 0.001 ETH
Shortfall: 0.003125 ETH
```

**Solution:** Add more ETH to your wallet on Base L2.

#### 3. Collection ID Required

```
Error: collection_id is required. Auto-deployment not yet implemented.
Create a Zora collection first at https://zora.co/create
```

**Solution:** Create a collection on Zora and add `collection_id` to config.

#### 4. Transaction Timeout

```
Error: Transaction timeout after 5 minutes. Hash: 0x...
```

**Solution:** Check transaction status on [BaseScan](https://basescan.org/). May need to retry with higher gas price.

#### 5. Transaction Reverted

```
Error: Transaction reverted on-chain: 0x...
```

**Solution:** Check contract state, ensure collection allows minting, verify all parameters.

### Error Recovery

```typescript
context.on('zora_mint_failed', async (data) => {
  console.error('Mint failed:', data.error);

  // Retry logic
  if (data.error.includes('timeout')) {
    console.log('Retrying mint...');
    context.emit('zora_mint', { mintConfig: originalConfig });
  }

  // Insufficient balance - notify user
  if (data.error.includes('Insufficient balance')) {
    showNotification('Please add more ETH to your wallet');
  }
});
```

---

## Testing

### Running Tests

**All tests:**

```bash
pnpm test ZoraCoinsTrait
```

**Blockchain integration tests only:**

```bash
pnpm test ZoraCoinsTrait.blockchain.test.ts
```

**Enable testnet tests:**

```bash
ENABLE_TESTNET_TESTS=true pnpm test ZoraCoinsTrait.blockchain.test.ts
```

### Test Coverage

Current test coverage (60%+ target):

- ✅ Wallet connection and disconnection
- ✅ Gas estimation (single and batch)
- ✅ Balance checking
- ✅ Error handling
- ✅ Event emission
- ✅ Integration with trait lifecycle
- ⏸️ Testnet minting (manual testing required)

### Manual Testing on Testnet

1. **Get testnet ETH:**
   - Visit [Base Goerli Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
   - Request testnet ETH

2. **Create testnet collection:**
   - Switch wallet to Base Goerli
   - Create collection on testnet Zora

3. **Configure testnet:**

   ```holoscript
   object "TestCoin" @zora_coins {
     default_chain: "base-testnet",
     collection_id: "0xTestnetCollectionAddress",
     creator_wallet: "0xTestWalletAddress"
   }
   ```

4. **Test mint:**

   ```typescript
   context.emit('wallet_connected', { address: '0xTestWallet' });
   context.emit('zora_mint', {
     mintConfig: {
       initialSupply: 1,
       maxSupply: 10,
       priceETH: '0', // Free mints on testnet
       name: 'Test Coin',
       description: 'Testing Zora integration',
     },
   });
   ```

5. **Verify on BaseScan:**
   - Check transaction: `https://goerli.basescan.org/tx/TX_HASH`
   - Verify NFT minted: `https://goerli.basescan.org/token/COLLECTION_ADDRESS`

---

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to Base RPC

**Solutions:**

- Check `BASE_RPC_URL` in `.env`
- Try public RPC: `https://mainnet.base.org`
- Use Alchemy/Infura for better reliability
- Verify network connectivity

### Gas Estimation Failures

**Problem:** Gas estimation fails or returns unrealistic values

**Solutions:**

- Check contract address is valid
- Ensure collection allows minting
- Verify RPC endpoint is responsive
- Use conservative fallback (200k gas)

### Transaction Not Confirming

**Problem:** Transaction sent but not confirming after 5 minutes

**Solutions:**

- Check Base network status: [https://status.base.org](https://status.base.org)
- Verify transaction on BaseScan
- Check gas price wasn't too low
- Wait longer (Base blocks are ~2 seconds)

### Mint Status Stuck in "Minting"

**Problem:** Pending mint never completes or fails

**Solutions:**

- Check transaction hash on BaseScan
- Verify wallet has sufficient balance
- Check for transaction revert reason
- Ensure `onUpdate` handler is running

### Wallet Connection Rejected

**Problem:** Wallet connection event doesn't work

**Solutions:**

- Ensure address is valid Ethereum address (0x... format)
- Check wallet has access to Base network
- Verify address has some ETH for transactions
- Try disconnecting and reconnecting

---

## Advanced Topics

### Custom RPC Providers

For production deployments, use dedicated RPC providers:

**Alchemy:**

```bash
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

**Infura:**

```bash
BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_PROJECT_ID
```

**Benefits:**

- Higher rate limits
- Better reliability
- Analytics dashboard
- Websocket support

### Batch Minting

Mint multiple NFTs in a single transaction:

```typescript
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 100, // Mint 100 at once
    maxSupply: 1000,
    priceETH: '0.001',
    name: 'Batch Mint Collection',
    description: 'Efficient batch minting',
  },
});
```

**Note:** Gas costs scale linearly with quantity. Ensure wallet has sufficient balance.

### Custom Metadata

Add rich metadata for marketplaces:

```typescript
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 1,
    maxSupply: 1,
    priceETH: '0.1',
    name: 'Epic Sword NFT',
    description: 'Legendary weapon from the ancient realm',
    metadata: {
      image: 'ipfs://QmYourImageHash',
      animation_url: 'ipfs://QmYourAnimationHash',
      attributes: [
        { trait_type: 'Rarity', value: 'Epic' },
        { trait_type: 'Damage', value: '999', max_value: 1000 },
        { trait_type: 'Element', value: 'Fire' },
        { display_type: 'boost_percentage', trait_type: 'Critical Hit', value: 25 },
      ],
      properties: {
        category: 'weapon',
        type: 'sword',
      },
    },
  },
});
```

### Royalty Configuration

Configure creator royalties (enforced on compatible marketplaces):

```holoscript
object "ArtCoin" @zora_coins {
  royalty_percentage: 10.0,  // 10% on secondary sales
  creator_wallet: "0xCreatorAddress"
}
```

**Supported Marketplaces:**

- OpenSea (configurable)
- Zora Marketplace
- Rarible
- Foundation

### Transaction Monitoring

Monitor transaction status programmatically:

```typescript
async function waitForMint(mintId: string, maxWaitTime: number = 300000) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkStatus = () => {
      const mint = state.pendingMints.find((m) => m.id === mintId);

      if (!mint) {
        reject(new Error('Mint not found'));
        return;
      }

      if (mint.status === 'complete') {
        resolve(mint);
        return;
      }

      if (mint.status === 'failed') {
        reject(new Error(mint.error || 'Mint failed'));
        return;
      }

      if (Date.now() - startTime > maxWaitTime) {
        reject(new Error('Timeout waiting for mint'));
        return;
      }

      // Check again in 2 seconds
      setTimeout(checkStatus, 2000);
    };

    checkStatus();
  });
}

// Usage
try {
  const completedMint = await waitForMint('mint_abc123', 300000);
  console.log('Mint complete! Token ID:', completedMint.tokenId);
} catch (error) {
  console.error('Mint failed:', error.message);
}
```

---

## Resources

### Official Documentation

- [Zora Protocol Docs](https://docs.zora.co/)
- [Base Network Docs](https://docs.base.org/)
- [Viem Documentation](https://viem.sh/)
- [Wagmi Documentation](https://wagmi.sh/)

### Explorers

- [BaseScan (Mainnet)](https://basescan.org/)
- [BaseScan (Testnet)](https://goerli.basescan.org/)
- [Zora Explorer](https://explorer.zora.energy/)

### Faucets

- [Base Goerli Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
- [Alchemy Base Faucet](https://www.alchemy.com/faucets/base-goerli)

### Community

- [HoloScript Discord](https://discord.gg/holoscript)
- [Zora Discord](https://discord.gg/zora)
- [Base Discord](https://discord.gg/buildonbase)

---

## Support

For issues or questions:

1. **Check documentation:** Review this guide and [ZORA_IMPLEMENTATION_GUIDE.md](../ZORA_IMPLEMENTATION_GUIDE.md)
2. **Search issues:** Check [GitHub Issues](https://github.com/holoscript/core/issues)
3. **Ask community:** Join [HoloScript Discord](https://discord.gg/holoscript)
4. **Report bugs:** Open an issue with reproduction steps

---

**Last Updated:** June 2026
**Version:** 3.2.0
**Maintainer:** HoloScript Core Team
