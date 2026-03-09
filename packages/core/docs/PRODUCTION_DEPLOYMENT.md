# ZoraCoinsTrait Production Deployment Guide

## Overview

This guide covers deploying ZoraCoinsTrait with real Zora Protocol integration to Base L2 mainnet for production use.

**⚠️ IMPORTANT:** Production deployment involves real ETH and real NFTs. Test thoroughly before deploying.

---

## Pre-Deployment Checklist

### Code Validation

- [x] All integration tests passing (24/24)
- [x] TypeScript compilation successful
- [x] No linting errors
- [x] Code reviewed and approved
- [x] Documentation complete

### Infrastructure

- [ ] Production RPC endpoint configured (Alchemy/Infura recommended)
- [ ] Wallet private keys stored securely (not in .env!)
- [ ] Error monitoring set up (Sentry, LogRocket, etc.)
- [ ] Transaction monitoring configured
- [ ] Backup RPC endpoints configured

### Zora Configuration

- [ ] Production Zora collection(s) created on Base mainnet
- [ ] Collection ownership verified
- [ ] Royalty settings configured
- [ ] Mint permissions set correctly

### Security

- [ ] Private keys stored in secure vault (AWS KMS, HashiCorp Vault, etc.)
- [ ] Environment variables validated
- [ ] Rate limiting configured
- [ ] CORS settings reviewed
- [ ] API authentication enabled

---

## Step 1: Production Environment Setup

### 1.1 Create Production Collection on Zora

1. **Visit Zora Mainnet:**
   - URL: [https://zora.co/create](https://zora.co/create)
   - Ensure wallet is on Base mainnet (Chain ID: 8453)

2. **Create ERC-1155 Collection:**
   - Collection Name: Your project name
   - Description: Clear description for marketplace listings
   - Collection Type: ERC-1155 (multi-edition)
   - Chain: **Base** (mainnet)

3. **Configure Settings:**
   - Royalty Percentage: 5-10% recommended
   - Creator Address: Your production wallet
   - Mint Price: Set initial mint price (or 0 for free mints)

4. **Deploy Contract:**
   - Review gas costs (typically 0.001-0.005 ETH)
   - Approve transaction in wallet
   - Wait for deployment confirmation

5. **Save Contract Address:**
   ```bash
   # Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
   PRODUCTION_COLLECTION_ID=0xYourCollectionAddress
   ```

### 1.2 Configure Production RPC

**Option 1: Alchemy (Recommended)**

1. Create account at [https://www.alchemy.com/](https://www.alchemy.com/)
2. Create new app:
   - Chain: Base
   - Network: Mainnet
3. Copy API key
4. Configure:
   ```bash
   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   ```

**Benefits:**

- Free tier: 300M compute units/month
- Enhanced APIs (NFT, Token, Transaction)
- Websocket support
- Analytics dashboard

**Option 2: Infura**

1. Create account at [https://infura.io/](https://infura.io/)
2. Create new project
3. Add Base network
4. Configure:
   ```bash
   BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_PROJECT_ID
   ```

**Option 3: Public RPC (Not Recommended for Production)**

```bash
BASE_RPC_URL=https://mainnet.base.org
```

**⚠️ Warning:** Public RPCs have rate limits and lower reliability.

### 1.3 Secure Key Management

**NEVER store private keys in .env files or version control!**

**Option 1: AWS Systems Manager Parameter Store**

```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const client = new SSMClient({ region: 'us-east-1' });

async function getPrivateKey(): Promise<string> {
  const command = new GetParameterCommand({
    Name: '/holoscript/production/wallet-private-key',
    WithDecryption: true,
  });

  const response = await client.send(command);
  return response.Parameter!.Value!;
}
```

**Option 2: HashiCorp Vault**

```typescript
import vault from 'node-vault';

const client = vault({
  endpoint: 'https://vault.example.com:8200',
  token: process.env.VAULT_TOKEN,
});

async function getPrivateKey(): Promise<string> {
  const secret = await client.read('secret/holoscript/wallet');
  return secret.data.private_key;
}
```

**Option 3: Environment Variables (Development Only)**

```bash
# .env (DO NOT COMMIT!)
WALLET_PRIVATE_KEY=0x...
```

Add to `.gitignore`:

```
.env
.env.local
.env.production
```

---

## Step 2: Production Configuration

### 2.1 HoloScript Scene Configuration

Update your production HoloScript files:

```holoscript
scene "ProductionNFTMint" {
  environment: "gallery",
  lighting: "natural"
}

object "ProductionCoin" @zora_coins {
  // Production Configuration
  default_chain: "base",  // MAINNET (not "base-testnet"!)
  collection_id: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",  // Your production collection
  creator_wallet: "0xYourProductionWallet",  // Your production address
  royalty_percentage: 10.0,  // 10% royalties

  // Visual Configuration
  geometry: "cylinder",
  material: "metallic_gold",
  position: [0, 1.5, -2],
  scale: [0.1, 0.1, 0.02],

  @glowing {
    intensity: 0.8,
    color: "#FFD700"
  },

  @grabbable {
    snap_to_hand: true
  }
}
```

### 2.2 Environment Variables

**Production .env:**

```bash
# Production RPC (required)
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Backup RPC (optional but recommended)
BASE_RPC_URL_BACKUP=https://base-mainnet.infura.io/v3/YOUR_PROJECT_ID

# BaseScan API Key (for transaction verification)
BASESCAN_API_KEY=YOUR_BASESCAN_API_KEY

# Error Monitoring
SENTRY_DSN=https://your-sentry-dsn
ENVIRONMENT=production

# Feature Flags
ENABLE_TESTNET=false
ENABLE_DEBUG_LOGGING=false
```

### 2.3 Gas Price Strategy

Configure gas price limits to avoid overpaying:

```typescript
import { GasEstimator } from './src/traits/utils/GasEstimator';

// Set maximum gas price (in gwei)
const MAX_GAS_PRICE_GWEI = 0.1; // 0.1 gwei (Base is very cheap)

async function estimateWithLimit(publicClient, contractAddress, quantity) {
  const estimate = await GasEstimator.estimateMintGas(publicClient, contractAddress, quantity);

  // Check if gas price is reasonable
  const gasPriceGwei = Number(estimate.maxFeePerGas) / 1e9;

  if (gasPriceGwei > MAX_GAS_PRICE_GWEI) {
    throw new Error(`Gas price too high: ${gasPriceGwei} gwei (max: ${MAX_GAS_PRICE_GWEI} gwei)`);
  }

  return estimate;
}
```

---

## Step 3: Deployment

### 3.1 Pre-Flight Checks

Run automated checks before deployment:

```bash
# Run all tests
pnpm test

# Check TypeScript compilation
pnpm build

# Lint code
pnpm lint

# Verify environment variables
node scripts/verify-env.js
```

### 3.2 Smoke Test on Mainnet

**Test with minimal funds first:**

```typescript
// smoke-test-mainnet.ts
import { WalletConnection } from './src/traits/utils/WalletConnection';
import { GasEstimator } from './src/traits/utils/GasEstimator';

async function smokeTest() {
  console.log('🔥 Production Smoke Test\n');

  // 1. Connect to mainnet
  const wallet = new WalletConnection({ chain: 'base' });
  console.log('✅ Connected to Base mainnet (chain', wallet.getChainId(), ')');

  // 2. Check RPC connectivity
  const publicClient = wallet.getPublicClient();
  const blockNumber = await publicClient.getBlockNumber();
  console.log('✅ Latest block:', blockNumber);

  // 3. Get current gas prices
  const gasPrices = await GasEstimator.getCurrentGasPrices(publicClient);
  console.log('✅ Gas prices:', gasPrices.maxFeePerGasGwei, 'gwei');

  // 4. Estimate mint cost
  const estimate = await GasEstimator.estimateMintGas(
    publicClient,
    process.env.PRODUCTION_COLLECTION_ID as any,
    BigInt(1)
  );
  const formatted = GasEstimator.formatEstimate(estimate);
  console.log('✅ Estimated mint cost:', formatted.totalCostETH, 'ETH');

  console.log('\n✅ All smoke tests passed!');
}

smokeTest().catch(console.error);
```

Run:

```bash
PRODUCTION_COLLECTION_ID=0x... pnpm tsx smoke-test-mainnet.ts
```

### 3.3 Initial Production Mint

**Test with single NFT first:**

```bash
# Mint 1 NFT to verify everything works
WALLET_ADDRESS=0x... \
COLLECTION_ID=0x... \
pnpm tsx examples/production-mint.ts --quantity=1
```

**Monitor transaction:**

- Check BaseScan: `https://basescan.org/tx/TX_HASH`
- Verify NFT minted correctly
- Check gas costs are reasonable
- Validate metadata appears correctly

---

## Step 4: Monitoring & Observability

### 4.1 Transaction Monitoring

Set up monitoring for all Zora transactions:

```typescript
import * as Sentry from '@sentry/node';

// Monitor mint events
context.on('zora_transaction_sent', (data) => {
  console.log('Transaction sent:', data.txHash);

  // Send to monitoring service
  Sentry.addBreadcrumb({
    category: 'zora',
    message: 'Mint transaction sent',
    data: { txHash: data.txHash, mintId: data.mintId },
    level: 'info',
  });
});

context.on('zora_mint_failed', (data) => {
  console.error('Mint failed:', data.error);

  // Alert on failures
  Sentry.captureException(new Error(`Zora mint failed: ${data.error}`), {
    tags: { mintId: data.mintId, txHash: data.txHash },
  });
});

context.on('zora_mint_complete', (data) => {
  console.log('Mint complete:', data.tokenId);

  // Track successful mints
  analytics.track('NFT Minted', {
    tokenId: data.tokenId,
    contractAddress: data.contractAddress,
    gasUsed: data.gasUsed,
  });
});
```

### 4.2 Error Alerting

Configure alerts for critical errors:

```typescript
// Slack webhook for alerts
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function alertSlack(message: string, severity: 'info' | 'warning' | 'error') {
  const emoji = severity === 'error' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';

  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${emoji} [HoloScript ZoraCoinsTrait] ${message}`,
    }),
  });
}

// Use in error handlers
context.on('zora_mint_failed', async (data) => {
  await alertSlack(`Mint failed for ${data.mintId}: ${data.error}`, 'error');
});
```

### 4.3 Metrics Dashboard

Track key metrics:

- **Mint Success Rate:** Successful mints / Total mint attempts
- **Average Gas Cost:** Total gas spent / Number of mints
- **Mint Duration:** Time from initiation to confirmation
- **Error Rate:** Failed mints / Total mint attempts
- **Cost per NFT:** Gas + mint fee per successful mint

Example (using Prometheus):

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

const mintCounter = new Counter({
  name: 'zora_mints_total',
  help: 'Total number of mint attempts',
  labelNames: ['status'],
});

const gasCostHistogram = new Histogram({
  name: 'zora_gas_cost_eth',
  help: 'Gas cost distribution in ETH',
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01],
});

const mintDurationHistogram = new Histogram({
  name: 'zora_mint_duration_seconds',
  help: 'Time from initiation to confirmation',
  buckets: [1, 5, 10, 30, 60],
});

// Track metrics
context.on('zora_mint_complete', (data) => {
  mintCounter.inc({ status: 'success' });
  // ... record other metrics
});

context.on('zora_mint_failed', (data) => {
  mintCounter.inc({ status: 'failed' });
});
```

---

## Step 5: Scaling Considerations

### 5.1 Rate Limiting

Implement rate limiting to avoid overwhelming the RPC:

```typescript
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  maxConcurrent: 5, // Max 5 concurrent requests
  minTime: 200, // Min 200ms between requests
});

// Wrap mint function
async function mintWithRateLimit(config: MintConfig) {
  return limiter.schedule(() => executeMinting(config));
}
```

### 5.2 Batch Minting

For high-volume scenarios, batch mints:

```typescript
// Mint 100 NFTs in a single transaction
context.emit('zora_mint', {
  mintConfig: {
    initialSupply: 100, // Batch mint
    maxSupply: 10000,
    priceETH: '0.001',
    name: 'Batch Collection',
    description: 'High-volume minting',
  },
});
```

**Benefits:**

- Lower gas cost per NFT (amortized)
- Fewer transactions to monitor
- Faster minting process

**Considerations:**

- Higher upfront cost
- All-or-nothing (transaction fails, all mints fail)

### 5.3 Fallback RPC

Configure fallback RPCs for reliability:

```typescript
const RPC_ENDPOINTS = [
  process.env.BASE_RPC_URL,
  process.env.BASE_RPC_URL_BACKUP,
  'https://mainnet.base.org',
];

async function getPublicClient() {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpc),
      });

      // Test connectivity
      await client.getBlockNumber();
      return client;
    } catch (error) {
      console.warn(`RPC ${rpc} failed, trying next...`);
    }
  }

  throw new Error('All RPC endpoints failed');
}
```

---

## Step 6: Production Validation

### 6.1 Validation Checklist

After deployment, validate:

- [ ] First production mint successful
- [ ] NFT appears in wallet
- [ ] NFT visible on OpenSea/Zora marketplace
- [ ] Metadata displays correctly
- [ ] Royalties configured properly
- [ ] Gas costs are reasonable (<0.01 ETH per mint)
- [ ] Error monitoring working
- [ ] Alerts firing correctly
- [ ] Metrics being tracked

### 6.2 Post-Deployment Monitoring

Monitor for first 24 hours:

1. **Check error rates** - Should be <1%
2. **Monitor gas costs** - Should be stable
3. **Track mint success rate** - Should be >99%
4. **Verify marketplace listings** - NFTs appear correctly
5. **Test end-to-end flow** - User can mint and receive NFT

---

## Security Best Practices

### 1. Never Commit Secrets

```bash
# .gitignore
.env
.env.local
.env.production
*.key
*.pem
secrets/
```

### 2. Use Environment-Specific Configs

```typescript
const config = {
  development: {
    chain: 'base-testnet',
    rpcUrl: 'https://goerli.base.org',
  },
  production: {
    chain: 'base',
    rpcUrl: process.env.BASE_RPC_URL,
  },
};

const environment = process.env.NODE_ENV || 'development';
export default config[environment];
```

### 3. Validate All Inputs

```typescript
function validateMintConfig(config: MintConfig) {
  if (!config.name || config.name.length > 100) {
    throw new Error('Invalid name');
  }

  if (config.initialSupply < 1 || config.initialSupply > 10000) {
    throw new Error('Invalid supply');
  }

  // ... more validations
}
```

### 4. Implement Transaction Replay Protection

```typescript
const processedTxHashes = new Set<string>();

function checkReplay(txHash: string) {
  if (processedTxHashes.has(txHash)) {
    throw new Error('Transaction already processed');
  }
  processedTxHashes.add(txHash);
}
```

---

## Rollback Plan

If issues occur in production:

### 1. Immediate Actions

- Pause new mints (feature flag)
- Alert team
- Capture error logs
- Check BaseScan for transaction status

### 2. Investigation

- Review error logs
- Check RPC endpoint status
- Verify contract state
- Test on testnet to reproduce

### 3. Rollback Steps

- Revert to previous working version
- Re-deploy with fixes
- Validate on testnet first
- Gradual rollout to production

---

## Support & Resources

- **Zora Docs:** https://docs.zora.co/
- **Base Docs:** https://docs.base.org/
- **Viem Docs:** https://viem.sh/
- **BaseScan:** https://basescan.org/
- **HoloScript Discord:** (your support channel)

---

**Last Updated:** 2026-02-12
**Version:** 3.2.0
**Status:** Production Ready ✅
