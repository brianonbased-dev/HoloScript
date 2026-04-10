# ZoraCoinsTrait Testnet Validation Guide

## Overview

This guide walks you through the complete testnet validation process for ZoraCoinsTrait blockchain integration on Base Goerli.

**Estimated Time:** 30-45 minutes
**Cost:** Free (testnet ETH from faucet)
**Prerequisites:** MetaMask or compatible Web3 wallet

---

## Validation Checklist

- [ ] **Step 1:** Get testnet ETH from faucet
- [ ] **Step 2:** Create testnet collection on Zora
- [ ] **Step 3:** Configure environment variables
- [ ] **Step 4:** Check wallet balance
- [ ] **Step 5:** Estimate gas costs
- [ ] **Step 6:** Execute test mint
- [ ] **Step 7:** Verify transaction on BaseScan
- [ ] **Step 8:** Validate NFT appears in wallet

---

## Step 1: Get Testnet ETH

### 1.1 Add Base Goerli to MetaMask

**Network Details:**

- **Network Name:** Base Goerli
- **RPC URL:** `https://goerli.base.org`
- **Chain ID:** 84531
- **Currency Symbol:** ETH
- **Block Explorer:** `https://goerli.basescan.org`

**Quick Add:**

1. Visit [https://chainlist.org/chain/84531](https://chainlist.org/chain/84531)
2. Click "Add to MetaMask"
3. Approve network addition

### 1.2 Request Testnet ETH

**Option 1: Coinbase Faucet (Recommended)**

1. Visit: [https://www.coinbase.com/faucets/base-ethereum-goerli-faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
2. Connect your wallet
3. Click "Send me ETH"
4. Wait 1-2 minutes for confirmation
5. **Amount received:** ~0.05 ETH (plenty for testing)

**Option 2: Alchemy Faucet**

1. Visit: [https://www.alchemy.com/faucets/base-goerli](https://www.alchemy.com/faucets/base-goerli)
2. Create free Alchemy account
3. Enter wallet address
4. Request testnet ETH

**Option 3: Paradigm Faucet**

1. Visit: [https://faucet.paradigm.xyz/](https://faucet.paradigm.xyz/)
2. Connect Twitter account (verification)
3. Request Base Goerli ETH

### 1.3 Verify Balance

```bash
# Check balance via script
TEST_WALLET_ADDRESS=0xYourAddress pnpm tsx scripts/test-zora-testnet.ts --step=1
```

**Expected output:**

```
✅ Wallet has sufficient balance: 0.050000 ETH
```

---

## Step 2: Create Testnet Collection on Zora

### 2.1 Visit Zora Testnet

1. Navigate to: [https://testnet.zora.co/create](https://testnet.zora.co/create)
2. Connect your wallet (ensure you're on Base Goerli network)

**Note:** If testnet.zora.co is unavailable, use the Zora CLI or direct contract deployment (see Advanced section).

### 2.2 Create 1155 Collection

**Collection Settings:**

- **Name:** "HoloScript Test Collection"
- **Description:** "Testing ZoraCoinsTrait blockchain integration"
- **Type:** ERC-1155 (multi-edition)
- **Chain:** Base Goerli

Click "Create Collection" and approve transaction.

### 2.3 Copy Contract Address

After creation:

1. Navigate to your collection page
2. Copy the contract address (starts with `0x...`)
3. Save this for environment configuration

**Example:** `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0`

---

## Step 3: Configure Environment

### 3.1 Create .env File

Create or update `.env` in `packages/core/`:

```bash
# Base Testnet RPC
BASE_TESTNET_RPC_URL=https://goerli.base.org

# Test Wallet Address (your wallet with testnet ETH)
TEST_WALLET_ADDRESS=0xYourWalletAddress

# Test Collection ID (from Step 2)
TEST_COLLECTION_ID=0xYourCollectionAddress

# Optional: Custom RPC for better reliability
# BASE_TESTNET_RPC_URL=https://base-goerli.g.alchemy.com/v2/YOUR_API_KEY
```

### 3.2 Verify Configuration

```bash
# Print environment variables
echo "Wallet: $TEST_WALLET_ADDRESS"
echo "Collection: $TEST_COLLECTION_ID"
echo "RPC: $BASE_TESTNET_RPC_URL"
```

---

## Step 4: Check Wallet Balance

Run the validation script:

```bash
pnpm tsx scripts/test-zora-testnet.ts --step=1
```

**Expected Output:**

```
[STEP 1] Checking Wallet Balance
============================================================
ℹ️  Wallet Address: 0xYourAddress
ℹ️  Balance: 0.050000 ETH
✅ Wallet has sufficient balance: 0.050000 ETH
```

**If balance is zero:**

- Return to Step 1 and request testnet ETH
- Wait a few minutes for faucet transaction to confirm
- Check BaseScan: `https://goerli.basescan.org/address/YOUR_ADDRESS`

---

## Step 5: Estimate Gas Costs

```bash
pnpm tsx scripts/test-zora-testnet.ts --step=2
```

**Expected Output:**

```
[STEP 2] Estimating Gas Costs
============================================================
ℹ️  Collection Address: 0x742d35Cc...
ℹ️  Mint Quantity: 1
ℹ️  Gas Estimate:
  Gas Limit: 240000
  Max Fee Per Gas: ... wei
  Total Gas Cost: 0.000240 ETH
  Mint Fee (0.000777 × 1): 0.000777 ETH
  Total Cost: 0.001017 ETH
✅ Wallet has sufficient balance for mint
```

**If insufficient balance:**

- Check that `TEST_WALLET_ADDRESS` is correct
- Ensure testnet ETH arrived (check BaseScan)
- Request more testnet ETH if needed

---

## Step 6: Execute Test Mint

### Option A: Using Test Script (Manual)

The script will display instructions:

```bash
pnpm tsx scripts/test-zora-testnet.ts --step=3
```

**Output:**

```
[STEP 3] Executing Test Mint
============================================================
❌ MANUAL STEP REQUIRED
ℹ️  This step requires manual execution due to wallet signing.

To execute the mint:
1. Use the HoloScript runtime or a custom script
2. Connect your wallet with TEST_WALLET_ADDRESS
3. Trigger a mint event with the following config:

  context.emit('wallet_connected', {
    address: '0xYourAddress'
  });

  context.emit('zora_mint', {
    mintConfig: {
      initialSupply: 1,
      maxSupply: 10,
      priceETH: '0',
      name: 'HoloScript Test Coin',
      description: 'Testnet validation for ZoraCoinsTrait',
      tags: ['test', 'holoscript', 'zora']
    }
  });
```

### Option B: Using HoloScript Scene (Recommended)

Create `test-mint.hsplus`:

```holoscript
scene "TestnetMintValidation" {
  environment: "studio",
  lighting: "bright"
}

object "TestCoin" @zora_coins {
  default_chain: "base-testnet",
  collection_id: "0xYourCollectionAddress",
  creator_wallet: "0xYourWalletAddress",
  royalty_percentage: 0.0,

  geometry: "cylinder",
  material: "gold",
  position: [0, 1.5, -2],
  scale: [0.1, 0.1, 0.02],

  @glowing {
    intensity: 0.8,
    color: "#FFD700"
  }
}
```

Run the scene and trigger mint via HoloScript runtime.

### Option C: Using TypeScript Directly

Create `test-mint.ts`:

```typescript
import { WalletConnection } from './src/traits/utils/WalletConnection';
import { GasEstimator } from './src/traits/utils/GasEstimator';
import { zoraCreator1155ImplABI } from '@zoralabs/protocol-deployments';
import type { Address, Hex } from 'viem';

async function testMint() {
  const wallet = new WalletConnection({ chain: 'base-testnet' });
  await wallet.connect(process.env.TEST_WALLET_ADDRESS as Address);

  const publicClient = wallet.getPublicClient();
  const walletClient = wallet.getWalletClient();

  const contractAddress = process.env.TEST_COLLECTION_ID as Address;
  const quantity = BigInt(1);

  // Estimate gas
  const estimate = await GasEstimator.estimateMintGas(publicClient, contractAddress, quantity);

  console.log('Gas estimate:', GasEstimator.formatEstimate(estimate));

  // Simulate transaction
  const { request } = await publicClient.simulateContract({
    address: contractAddress,
    abi: zoraCreator1155ImplABI,
    functionName: 'mintWithRewards',
    args: [wallet.getAddress()!, BigInt(0), quantity, '0x' as Hex, wallet.getAddress()!],
    value: estimate.mintFee,
    account: walletClient.account,
  });

  // Execute mint
  const txHash = await walletClient.writeContract(request);
  console.log('Transaction sent:', txHash);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  console.log('Transaction confirmed!');
  console.log('Block:', receipt.blockNumber);
  console.log('Status:', receipt.status);

  return txHash;
}

testMint().catch(console.error);
```

Run:

```bash
pnpm tsx test-mint.ts
```

**Expected Output:**

```
Gas estimate: { totalCostETH: '0.001017', ... }
Transaction sent: 0x1234567890abcdef...
Transaction confirmed!
Block: 12345678
Status: success
```

**Save the transaction hash** for Step 7!

---

## Step 7: Verify Transaction on BaseScan

```bash
TEST_TX_HASH=0xYourTransactionHash pnpm tsx scripts/test-zora-testnet.ts --step=4
```

**Expected Output:**

```
[STEP 4] Verifying Transaction
============================================================
ℹ️  Transaction Hash: 0x1234567890abcdef...
ℹ️  Fetching transaction receipt...

Transaction Receipt:
  Status: success
  Block Number: 12345678
  Gas Used: 180234
  Transaction Hash: 0x1234567890abcdef...
  Token ID: 0

✅ Transaction confirmed successfully!

📊 View on BaseScan:
  https://goerli.basescan.org/tx/0x1234567890abcdef...
```

### Manual Verification

1. Visit BaseScan link from output
2. Verify transaction status is "Success"
3. Check "Tokens Transferred" section
4. Confirm NFT was minted to your wallet

---

## Step 8: Validate NFT in Wallet

### 8.1 View on BaseScan

Visit: `https://goerli.basescan.org/address/YOUR_WALLET_ADDRESS#tokentxnsErc1155`

**Verify:**

- Transfer event from `0x0000...` to your address
- Token ID matches output from Step 7
- Collection address matches `TEST_COLLECTION_ID`

### 8.2 Import to MetaMask

1. Open MetaMask
2. Switch to Base Goerli network
3. Go to "NFTs" tab
4. Click "Import NFT"
5. Enter:
   - **Address:** `TEST_COLLECTION_ID`
   - **Token ID:** From Step 7 output
6. Click "Import"

**Expected:** NFT appears in MetaMask with name "HoloScript Test Coin"

### 8.3 View on Zora

Visit: `https://testnet.zora.co/collections/base-goerli:YOUR_COLLECTION_ADDRESS/token/TOKEN_ID`

**Verify:**

- Metadata displays correctly
- Owner is your wallet address
- Minting timestamp is recent

---

## Validation Complete! ✅

If all steps passed:

✅ **Wallet connection** works on Base testnet
✅ **Gas estimation** is accurate
✅ **Balance checking** prevents insufficient funds
✅ **Transaction execution** succeeds on-chain
✅ **Transaction monitoring** tracks confirmation
✅ **NFT minting** works via Zora Protocol SDK

**ZoraCoinsTrait is PRODUCTION READY for Base L2!**

---

## Troubleshooting

### Issue: "Insufficient balance" error

**Cause:** Not enough testnet ETH for gas + mint fee

**Fix:**

1. Check balance: `pnpm tsx scripts/test-zora-testnet.ts --step=1`
2. Request more ETH from faucet (Step 1)
3. Wait for faucet transaction to confirm

### Issue: "Transaction reverted" error

**Cause:** Contract may not allow minting, or parameters incorrect

**Fix:**

1. Verify collection allows public minting
2. Check `TEST_COLLECTION_ID` is correct ERC-1155 contract
3. Try minting directly via Zora UI first
4. Check contract on BaseScan for mint function

### Issue: "Wallet not connected" error

**Cause:** Wallet client not initialized properly

**Fix:**

1. Ensure `TEST_WALLET_ADDRESS` is set in `.env`
2. Verify wallet address format (starts with `0x`, 42 characters)
3. Check that wallet has testnet ETH

### Issue: "RPC request failed" error

**Cause:** Network connectivity or RPC endpoint issue

**Fix:**

1. Check internet connection
2. Try alternative RPC: `https://goerli.base.org`
3. Use Alchemy/Infura custom RPC
4. Verify Base Goerli network is online

### Issue: Transaction takes too long

**Cause:** Network congestion or low gas price

**Fix:**

1. Wait up to 5 minutes (script has timeout)
2. Check transaction on BaseScan for status
3. If "pending", wait or increase gas price
4. If "failed", check revert reason on BaseScan

---

## Advanced: Direct Contract Deployment

If Zora testnet UI is unavailable, deploy a test ERC-1155 contract directly:

### Using Remix IDE

1. Visit: [https://remix.ethereum.org/](https://remix.ethereum.org/)
2. Create new file: `TestCollection.sol`
3. Paste Zora 1155 implementation (or simple ERC-1155)
4. Compile contract
5. Deploy to Base Goerli via MetaMask
6. Copy deployed contract address → `TEST_COLLECTION_ID`

### Using Hardhat

```bash
# Install Hardhat
npm install --save-dev hardhat @nomiclabs/hardhat-ethers

# Create deployment script
# deploy-test-collection.js
# Deploy to Base Goerli
npx hardhat run scripts/deploy-test-collection.js --network base-goerli
```

---

## Next Steps After Validation

1. **Update Success Criteria** in `ZORA_IMPLEMENTATION_GUIDE.md`
   - Mark testnet validation as complete ✅

2. **Deploy to Mainnet** (if ready)
   - Update `default_chain: "base"` in production configs
   - Use real collection IDs
   - Ensure wallet has real ETH for gas

3. **Documentation**
   - Add testnet validation results to implementation guide
   - Update README with production deployment instructions

4. **Production Monitoring**
   - Set up transaction monitoring
   - Configure error alerting
   - Track gas costs and optimize

---

**Questions?** See [ZoraCoinsIntegration.md](./ZoraCoinsIntegration.md) or [ZORA_IMPLEMENTATION_GUIDE.md](../ZORA_IMPLEMENTATION_GUIDE.md)
