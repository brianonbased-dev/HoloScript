# Hololand Platform Integration - Developer Guide

## Overview

The HoloScript VSCode extension includes comprehensive integration with the **Hololand Platform**, enabling businesses to create immersive AR/VR/VRR experiences with AI-powered narratives, blockchain integration, and real-time synchronization.

This guide covers all seven Hololand services and how to use them effectively.

---

## Table of Contents

1. [Service Overview](#service-overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Service Documentation](#service-documentation)
   - [VRR Sync Service](#vrr-sync-service)
   - [X402 Payment Service](#x402-payment-service)
   - [Agent Kit Service](#agent-kit-service)
   - [Zora Marketplace Service](#zora-marketplace-service)
   - [StoryWeaver AI Service](#storyweaver-ai-service)
   - [Quest Builder Service](#quest-builder-service)
   - [AR Preview Service](#ar-preview-service)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Service Overview

The Hololand Platform consists of seven specialized services:

| Service                      | Purpose                            | Key Features                           |
| ---------------------------- | ---------------------------------- | -------------------------------------- |
| **VRR Sync Service**         | Real-time VRR data synchronization | Weather, events, inventory sync        |
| **X402 Payment Service**     | HTTP 402 blockchain payments       | Ethereum transactions, payment gating  |
| **Agent Kit Service**        | AI agent wallet management         | NFT minting, wallet creation           |
| **Zora Marketplace Service** | NFT marketplace integration        | Zora Protocol, IPFS uploads, royalties |
| **StoryWeaver AI Service**   | AI narrative generation            | LLM integration, quest narratives      |
| **Quest Builder Service**    | Business quest creation            | Objectives, rewards, progress tracking |
| **AR Preview Service**       | AR entry point simulation          | QR codes, portals, layer transitions   |

---

## Architecture

### Layer Hierarchy

The Hololand platform operates across three layers:

```
┌─────────────────────────────────┐
│  AR Layer (Physical World)      │  ← AR Preview Service
│  - QR code scanning              │
│  - Image markers                 │
│  - Location triggers             │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  VRR Layer (Virtual Reality     │  ← VRR Sync Service
│             Reality)             │  ← Quest Builder Service
│  - Digital twins                 │
│  - Real-time sync                │
│  - Business experiences          │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  VR Layer (Full Immersion)       │  ← StoryWeaver AI Service
│  - Complete virtual worlds       │
│  - AI-generated narratives       │
└─────────────────────────────────┘

        Payment & Assets
┌─────────────────────────────────┐
│  Blockchain Layer                │  ← X402 Payment Service
│  - NFT minting                   │  ← Agent Kit Service
│  - Payments                      │  ← Zora Marketplace Service
│  - Agent wallets                 │
└─────────────────────────────────┘
```

### Service Dependencies

```typescript
// Core dependencies (from @holoscript/core)
import type {
  VRRData,
  X402PaymentRequest,
  AgentWallet,
  NFTMetadata,
  AIGeneratedNarrative,
  QuestConfig,
  ARPortalInfo,
} from '@holoscript/core';

// Each service is independent but can be composed
const syncService = new VRRSyncService();
const paymentService = new X402PaymentService();
const questService = new QuestBuilderService();
// etc.
```

---

## Getting Started

### Installation

The Hololand services are included with the HoloScript VSCode extension:

```bash
# Install the extension from VSIX or marketplace
code --install-extension holoscript-vscode-x.x.x.vsix
```

### Configuration

Services can be configured via VSCode settings or programmatically:

```json
{
  "holoscript.hololand.vrrSync.enabled": true,
  "holoscript.hololand.vrrSync.updateInterval": 30000,
  "holoscript.hololand.payments.enabled": true,
  "holoscript.hololand.payments.network": "ethereum",
  "holoscript.hololand.storyweaver.provider": "openai",
  "holoscript.hololand.storyweaver.apiKey": "sk-..."
}
```

---

## Service Documentation

### VRR Sync Service

**Purpose**: Synchronizes real-time data between physical businesses and their VRR digital twins.

#### Features

- **Weather Sync**: Real-time weather data for locations
- **Event Sync**: Business events and schedules
- **Inventory Sync**: Real-time product availability
- **Automatic Updates**: Configurable polling interval
- **Event Emission**: Subscribe to data change events

#### Usage Example

```typescript
import { VRRSyncService } from './services/VRRSyncService';

// Create and configure service
const syncService = new VRRSyncService({
  enabled: true,
  updateInterval: 30000, // 30 seconds
  sources: {
    weather: 'https://api.weather.com',
    events: 'https://api.events.com',
    inventory: 'https://api.inventory.com',
  },
});

// Subscribe to weather updates
syncService.on('weather-update', (data) => {
  console.log('Weather updated:', data);
});

// Start syncing
await syncService.start();

// Get current data
const weather = await syncService.getWeatherData('seattle');
const events = await syncService.getEventData('cafe-001');
const inventory = await syncService.getInventoryData('shop-123');

// Cleanup
syncService.dispose();
```

#### Configuration Options

```typescript
interface VRRSyncConfig {
  enabled: boolean;
  updateInterval: number; // milliseconds
  sources: {
    weather?: string;
    events?: string;
    inventory?: string;
  };
}
```

#### Testing

See [VRRSyncService.test.ts](../src/__tests__/VRRSyncService.test.ts) for comprehensive test examples.

---

### X402 Payment Service

**Purpose**: Implements HTTP 402 Payment Required protocol with blockchain transactions for content gating.

#### Features

- **Payment Gating**: Require payment before content access
- **Ethereum Integration**: ETH and ERC-20 token support
- **Transaction Tracking**: Complete payment history
- **Simulation Mode**: Test without real transactions
- **Multiple Networks**: Ethereum, Polygon, Base support

#### Usage Example

```typescript
import { X402PaymentService } from './services/X402PaymentService';

// Create service
const paymentService = new X402PaymentService({
  enabled: true,
  network: 'ethereum',
  simulationMode: true, // Set false for production
});

// Create payment request
const paymentRequest = {
  amount: 1000000000000000, // 0.001 ETH in wei
  currency: 'ETH',
  recipient: '0xRecipientAddress',
  description: 'Premium VR Experience Access',
};

// Process payment (simulated)
try {
  const result = await paymentService.requestPayment(paymentRequest, 'user-123');

  console.log('Payment successful!');
  console.log('Transaction:', result.txHash);
  console.log('Block:', result.blockNumber);
} catch (error) {
  console.error('Payment failed:', error);
}

// Get payment history
const history = paymentService.getPaymentHistory('user-123');
console.log(`User has ${history.length} payments`);

// Cleanup
paymentService.dispose();
```

#### Configuration Options

```typescript
interface X402PaymentConfig {
  enabled: boolean;
  network: 'ethereum' | 'polygon' | 'base';
  gasLimit: number;
  maxGasPrice: bigint;
  simulationMode: boolean;
}
```

---

### Agent Kit Service

**Purpose**: Manages AI agent wallets using Coinbase's Agent Kit for autonomous agent transactions.

#### Features

- **Wallet Creation**: Generate agent wallets
- **NFT Minting**: Mint NFTs for agents
- **Transaction Signing**: Secure transaction management
- **Multi-Network**: Support for multiple chains
- **Agent Profiles**: Metadata and configuration per agent

#### Usage Example

```typescript
import { AgentKitService } from './services/AgentKitService';

const agentService = new AgentKitService({
  enabled: true,
  network: 'base',
  defaultGasLimit: 100000,
});

// Create agent wallet
const wallet = await agentService.createWallet({
  name: 'Shop Assistant AI',
  purpose: 'Customer service',
  businessId: 'cafe-001',
});

console.log('Agent wallet:', wallet.address);
console.log('Network:', wallet.network);

// Mint NFT for agent
const nft = await agentService.mintNFT(wallet.id, {
  name: 'Agent Profile NFT',
  description: 'Digital identity for shop assistant',
  image: 'ipfs://...',
});

console.log('NFT minted:', nft.tokenId);

// Get all agent wallets
const wallets = agentService.getWallets();
console.log(`Managing ${wallets.length} agent wallets`);

// Cleanup
agentService.dispose();
```

#### Configuration Options

```typescript
interface AgentKitConfig {
  enabled: boolean;
  network: 'base' | 'ethereum' | 'polygon';
  defaultGasLimit: number;
  autoFundWallets: boolean;
}
```

---

### Zora Marketplace Service

**Purpose**: Integrates with Zora Protocol for NFT minting and marketplace listings.

#### Features

- **NFT Minting**: Create NFTs with metadata
- **IPFS Upload**: Automatic metadata upload
- **Royalty Configuration**: Permanent or temporary royalties
- **Multi-Network**: Base, Ethereum, Zora chain
- **Marketplace URLs**: Direct links to Zora marketplace

#### Usage Example

```typescript
import { ZoraMarketplaceService } from './services/ZoraMarketplaceService';

const zoraService = new ZoraMarketplaceService({
  enabled: true,
  network: 'base',
  defaultRoyalty: 10, // 10%
  ipfsGateway: 'https://ipfs.io/ipfs',
  simulationMode: true,
});

// Prepare NFT metadata
const metadata = {
  name: 'Phoenix Brew VRR Twin',
  description: 'Digital twin of Phoenix Brew Coffee Shop',
  image: 'ipfs://QmExampleHash',
  attributes: [
    { trait_type: 'Category', value: 'VRR Twin' },
    { trait_type: 'Location', value: 'Seattle, WA' },
    { trait_type: 'Business Type', value: 'Coffee Shop' },
  ],
};

// Configure royalties
const royaltyConfig = {
  percentage: 10,
  recipient: '0xCreatorAddress',
  permanent: true,
};

// Mint NFT
const result = await zoraService.mintNFT(metadata, royaltyConfig);

console.log('NFT minted!');
console.log('Token ID:', result.tokenId);
console.log('Contract:', result.contractAddress);
console.log('View on Zora:', result.marketplaceUrl);
console.log('IPFS URL:', result.ipfsUrl);

// Get minting statistics
const minted = zoraService.getMintedNFTs();
const avgRoyalty = zoraService.getTotalRoyaltyRate();
console.log(`Minted ${minted.length} NFTs with ${avgRoyalty}% avg royalty`);

// Cleanup
zoraService.dispose();
```

#### Configuration Options

```typescript
interface ZoraMarketplaceConfig {
  enabled: boolean;
  network: 'base' | 'ethereum' | 'zora';
  defaultRoyalty: number; // percentage
  ipfsGateway: string;
  simulationMode: boolean;
}
```

---

### StoryWeaver AI Service

**Purpose**: Generates AI-powered narratives and quest content using LLM providers.

#### Features

- **Narrative Generation**: Create immersive stories
- **Quest Generation**: AI-generated quest objectives and rewards
- **Multi-Provider**: OpenAI, Anthropic, Gemini support
- **Simulation Mode**: Test without API keys
- **History Tracking**: Track all generations

#### Usage Example

```typescript
import { StoryWeaverAIService } from './services/StoryWeaverAIService';

const storyService = new StoryWeaverAIService({
  provider: 'openai',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7,
  maxTokens: 1000,
});

// Generate narrative
const narrative = await storyService.generateNarrative(
  'Create an engaging story for a coffee shop VR experience',
  'Coffee Shop Adventure'
);

console.log('Generated narrative:');
console.log(narrative);

// Generate quest
const quest = await storyService.generateQuest('cafe-001', 'treasure hunt');

console.log('Quest:', quest.title);
console.log('Objectives:', quest.objectives.length);
console.log('Rewards:', quest.rewards.length);
console.log('Narrative:', quest.narrative);

// Get generation statistics
const history = storyService.getHistory();
const totalWords = storyService.getTotalWordsGenerated();
console.log(`Generated ${history.length} narratives (${totalWords} words)`);

// Cleanup
storyService.dispose();
```

#### Configuration Options

```typescript
interface StoryWeaverConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  model?: string;
  apiKey?: string;
  temperature: number; // 0-1
  maxTokens: number;
}
```

---

### Quest Builder Service

**Purpose**: Creates and manages business quests with objectives, rewards, and progress tracking.

#### Features

- **Quest Creation**: Define objectives and rewards
- **Progress Tracking**: Monitor player progress
- **Completion System**: Handle quest completion
- **Import/Export**: Save and load quests
- **Multi-Business**: Support multiple businesses

#### Usage Example

```typescript
import { QuestBuilderService } from './services/QuestBuilderService';

const questService = new QuestBuilderService();

// Define quest configuration
const questConfig = {
  businessId: 'cafe-001',
  title: 'Coffee Lover Quest',
  description: 'Explore our amazing coffee shop',
  objectives: [
    {
      type: 'location',
      description: 'Visit the coffee shop',
      targetValue: 1,
      required: true,
    },
    {
      type: 'interact',
      description: 'Talk to the barista',
      targetValue: 1,
      required: true,
    },
    {
      type: 'collect',
      description: 'Try 3 different drinks',
      targetValue: 3,
      required: false,
    },
  ],
  rewards: [
    { type: 'xp', value: 100, description: '100 XP' },
    { type: 'coupon', value: '15% off', description: 'Discount coupon' },
    { type: 'nft', value: 'coffee-badge', description: 'Coffee Lover Badge' },
  ],
  layer: 'ar',
  difficulty: 'easy',
};

// Create quest
const questId = await questService.createQuest(questConfig);
console.log('Quest created:', questId);

// Get quest details
const quest = questService.getQuest(questId);
console.log('Title:', quest.title);
console.log('Estimated duration:', quest.estimatedDuration, 'minutes');

// Track player progress
questService.updateQuestProgress(questId, 'player-123', quest.objectives[0].id, 1);

// Complete quest
const completion = await questService.completeQuest(questId, 'player-123');
console.log('Quest completed!');
console.log('Rewards:', completion.rewards);

// Get business quests
const businessQuests = questService.getQuestsByBusiness('cafe-001');
console.log(`Business has ${businessQuests.length} quests`);

// Export quests
const exported = questService.exportQuests();
await fs.writeFile('quests.json', exported);

// Cleanup
questService.dispose();
```

#### Configuration Options

Quest Builder Service has no configuration - it works out of the box.

---

### AR Preview Service

**Purpose**: Previews and simulates AR entry points with QR codes, image markers, and location triggers.

#### Features

- **Portal Creation**: QR, image, or location-based portals
- **QR Code Generation**: Automatic QR code creation
- **Scan Simulation**: Test portal scanning
- **Layer Transitions**: Simulate AR → VRR → VR transitions
- **Payment Integration**: Test paid portal access

#### Usage Example

```typescript
import { ARPreviewService } from './services/ARPreviewService';

const arService = new ARPreviewService({
  enabled: true,
  autoGenerateQR: true,
  simulateCameraFeed: true,
});

// Create QR portal
const qrPortal = arService.createPortal('VRR Coffee Shop', {
  title: 'Coffee Shop Entry',
  description: 'Enter the VRR coffee shop experience',
  triggerType: 'qr',
});

console.log('QR Portal created:', qrPortal.id);
console.log('QR Data:', qrPortal.triggerData);

// Create paid portal
const paidPortal = arService.createPortal('Premium VR Experience', {
  title: 'Premium Entry',
  description: 'Exclusive VR content',
  triggerType: 'qr',
  price: 1000000000000000, // 0.001 ETH
});

console.log('Paid portal requires:', paidPortal.price, 'wei');

// Simulate QR scan
await arService.simulateScan(qrPortal);

// Get scan history
const scanHistory = arService.getScanHistory();
console.log(`Total scans: ${scanHistory.length}`);

// Get transition history
const transitions = arService.getTransitionHistory();
transitions.forEach((t) => {
  console.log(`${t.from.toUpperCase()} → ${t.to.toUpperCase()}`);
  if (t.paymentTxHash) {
    console.log('Payment TX:', t.paymentTxHash);
  }
});

// Get all portals
const portals = arService.getAllPortals();
console.log(`Created ${portals.length} portals`);

// Cleanup
arService.dispose();
```

#### Configuration Options

```typescript
interface ARPreviewConfig {
  enabled: boolean;
  autoGenerateQR: boolean;
  simulateCameraFeed: boolean;
}
```

---

## Testing

All services have comprehensive unit tests with 100% coverage of core functionality.

### Running Tests

```bash
# Run all tests
cd packages/vscode-extension
pnpm test

# Run specific service tests
pnpm test VRRSyncService
pnpm test X402PaymentService
pnpm test AgentKitService
# etc.
```

### Test Structure

Each service test suite covers:

1. **Constructor & Configuration**: Default and custom configurations
2. **Core Operations**: Main service functionality
3. **Edge Cases**: Error handling, boundary conditions
4. **Integration**: Service interactions
5. **Disposal**: Cleanup and resource management

### Example Test

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VRRSyncService } from '../services/VRRSyncService';

describe('VRRSyncService', () => {
  let service: VRRSyncService;

  beforeEach(() => {
    service = new VRRSyncService();
  });

  afterEach(() => {
    service.dispose();
  });

  it('should sync weather data', async () => {
    await service.start();
    const weather = await service.getWeatherData('seattle');

    expect(weather.location).toBe('seattle');
    expect(weather.temperature).toBeGreaterThan(-50);
    expect(weather.temperature).toBeLessThan(150);
  });
});
```

### Test Coverage

Current test statistics:

- **Total Tests**: 295
- **Test Files**: 12
- **Pass Rate**: 100%
- **Services Covered**: 7/7

---

## Troubleshooting

### Common Issues

#### Issue: "API key not configured"

**Solution**: Configure the API key in VSCode settings or pass it to the service constructor:

```typescript
const service = new StoryWeaverAIService({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});
```

#### Issue: "Payment transaction failed"

**Solution**: Ensure you're in simulation mode for testing:

```typescript
const service = new X402PaymentService({
  simulationMode: true, // No real transactions
});
```

#### Issue: "VRR sync not updating"

**Solution**: Check the update interval and ensure the service is started:

```typescript
const service = new VRRSyncService({
  updateInterval: 30000, // 30 seconds
});
await service.start();
```

#### Issue: "Portal creation fails"

**Solution**: Ensure all required fields are provided:

```typescript
const portal = service.createPortal('Destination', {
  title: 'Portal Title', // Required
  description: 'Portal Description', // Required
  triggerType: 'qr', // Optional, defaults to 'qr'
});
```

### Debug Mode

Enable debug logging for all services:

```typescript
// Set VSCode setting
"holoscript.hololand.debug": true

// Or use output channels
service.outputChannel.show(); // Shows service logs
```

### Getting Help

- **Documentation**: This guide and inline code comments
- **Tests**: Check test files for usage examples
- **Issues**: Report bugs on GitHub
- **Community**: Discord server for questions

---

## Best Practices

### 1. Always Dispose Services

```typescript
const service = new VRRSyncService();
try {
  await service.start();
  // Use service...
} finally {
  service.dispose(); // Always cleanup
}
```

### 2. Use Simulation Mode for Development

```typescript
// Development
const service = new X402PaymentService({
  simulationMode: true,
});

// Production
const service = new X402PaymentService({
  simulationMode: false,
  network: 'ethereum',
});
```

### 3. Handle Errors Gracefully

```typescript
try {
  const result = await service.requestPayment(request, userId);
  console.log('Success:', result);
} catch (error) {
  console.error('Payment failed:', error);
  // Show user-friendly message
}
```

### 4. Subscribe to Events

```typescript
service.on('weather-update', (data) => {
  // Update UI
});

service.on('payment-complete', (result) => {
  // Grant access
});
```

### 5. Test Before Production

```typescript
// Always test with simulation mode first
const testService = new ZoraMarketplaceService({
  simulationMode: true,
});

await testService.mintNFT(metadata); // Safe testing

// Then use production mode
const prodService = new ZoraMarketplaceService({
  simulationMode: false,
});
```

---

## Next Steps

1. **Explore Examples**: Check `examples/` directory for complete applications
2. **Read Tests**: Test files show real-world usage patterns
3. **Join Community**: Discord server for discussions
4. **Contribute**: Submit PRs for improvements

---

## Additional Resources

- [HoloScript Documentation](../README.md)
- [Hololand Platform Overview](./HOLOLAND_OVERVIEW.md)
- [API Reference](./API_REFERENCE.md)
- [Example Projects](../examples/)
- [Test Suite](../src/__tests__/)

---

**Version**: 1.0.0
**Last Updated**: 2025-02-20
**Status**: Production Ready ✅
