# Hololand Platform - Quick Start Guide

Get up and running with the Hololand Platform in 5 minutes!

## Installation

The Hololand services are included with the HoloScript VSCode extension. No additional installation required.

## Quick Examples

### 1. Create a VRR Digital Twin with Real-Time Sync

```typescript
import { VRRSyncService } from './services/VRRSyncService';

// Create service
const syncService = new VRRSyncService({
  updateInterval: 30000, // Update every 30 seconds
});

// Start syncing
await syncService.start();

// Get real-time data
const weather = await syncService.getWeatherData('seattle');
console.log(`Current temperature: ${weather.temperature}°F`);

const events = await syncService.getEventData('cafe-001');
console.log(`Upcoming events: ${events.events.length}`);
```

### 2. Add Payment Gating to Premium Content

```typescript
import { X402PaymentService } from './services/X402PaymentService';

const paymentService = new X402PaymentService({
  network: 'ethereum',
  simulationMode: true, // Safe for testing
});

// Require payment
const result = await paymentService.requestPayment(
  {
    amount: 1000000000000000, // 0.001 ETH
    currency: 'ETH',
    recipient: '0xYourAddress',
    description: 'Premium VR Access',
  },
  'user-123'
);

console.log('Payment successful! TX:', result.txHash);
// Grant access to premium content
```

### 3. Create AI Agent Wallets

```typescript
import { AgentKitService } from './services/AgentKitService';

const agentService = new AgentKitService({
  network: 'base',
});

// Create agent wallet
const wallet = await agentService.createWallet({
  name: 'Shop Assistant AI',
  purpose: 'Customer service',
  businessId: 'cafe-001',
});

console.log('Agent wallet created:', wallet.address);

// Mint NFT for agent
const nft = await agentService.mintNFT(wallet.id, {
  name: 'Agent Profile',
  description: 'AI assistant digital identity',
  image: 'ipfs://...',
});

console.log('NFT minted:', nft.tokenId);
```

### 4. Mint Business NFTs on Zora

```typescript
import { ZoraMarketplaceService } from './services/ZoraMarketplaceService';

const zoraService = new ZoraMarketplaceService({
  network: 'base',
  defaultRoyalty: 10, // 10% royalties
  simulationMode: true,
});

// Mint NFT
const result = await zoraService.mintNFT(
  {
    name: 'My Coffee Shop VRR Twin',
    description: 'Digital twin NFT',
    image: 'ipfs://QmExample...',
    attributes: [
      { trait_type: 'Category', value: 'VRR Twin' },
      { trait_type: 'Location', value: 'Seattle' },
    ],
  },
  {
    percentage: 10,
    recipient: '0xYourAddress',
    permanent: true,
  }
);

console.log('NFT minted!');
console.log('View on Zora:', result.marketplaceUrl);
```

### 5. Generate AI Narratives

```typescript
import { StoryWeaverAIService } from './services/StoryWeaverAIService';

const storyService = new StoryWeaverAIService({
  provider: 'openai',
  // No API key = simulation mode
});

// Generate narrative
const narrative = await storyService.generateNarrative(
  'Create an engaging story',
  'Coffee Shop Adventure'
);

console.log('Generated narrative:', narrative);

// Generate quest
const quest = await storyService.generateQuest('cafe-001', 'treasure hunt');
console.log('Quest:', quest.title);
console.log('Objectives:', quest.objectives.length);
```

### 6. Create Business Quests

```typescript
import { QuestBuilderService } from './services/QuestBuilderService';

const questService = new QuestBuilderService();

// Create quest
const questId = await questService.createQuest({
  businessId: 'cafe-001',
  title: 'Coffee Lover Quest',
  description: 'Explore our coffee shop',
  objectives: [
    {
      type: 'location',
      description: 'Visit the shop',
      targetValue: 1,
      required: true,
    },
    {
      type: 'interact',
      description: 'Talk to barista',
      targetValue: 1,
      required: true,
    },
  ],
  rewards: [
    { type: 'xp', value: 100, description: '100 XP' },
    { type: 'coupon', value: '15% off', description: 'Discount' },
  ],
  layer: 'ar',
  difficulty: 'easy',
});

console.log('Quest created:', questId);

// Complete quest
const completion = await questService.completeQuest(questId, 'player-123');
console.log('Rewards earned:', completion.rewards);
```

### 7. Preview AR Entry Points

```typescript
import { ARPreviewService } from './services/ARPreviewService';

const arService = new ARPreviewService({
  autoGenerateQR: true,
  simulateCameraFeed: true,
});

// Create QR portal
const portal = arService.createPortal('VRR Coffee Shop', {
  title: 'Coffee Shop Entry',
  description: 'Enter the VRR experience',
  triggerType: 'qr',
});

console.log('QR Portal:', portal.triggerData);

// Simulate scan
await arService.simulateScan(portal);

// Check transitions
const transitions = arService.getTransitionHistory();
console.log(`Layer transitions: ${transitions.length}`);
```

## Complete Example: Coffee Shop VRR Experience

```typescript
import {
  VRRSyncService,
  QuestBuilderService,
  ARPreviewService,
  X402PaymentService,
} from './services';

async function createCoffeeShopExperience() {
  // 1. Setup VRR sync
  const syncService = new VRRSyncService({ updateInterval: 30000 });
  await syncService.start();

  // 2. Create AR portal
  const arService = new ARPreviewService();
  const portal = arService.createPortal('Phoenix Brew VRR', {
    title: 'Phoenix Brew Coffee Shop',
    description: 'Step into our virtual coffee shop',
    triggerType: 'qr',
  });

  // 3. Create quest
  const questService = new QuestBuilderService();
  const questId = await questService.createQuest({
    businessId: 'phoenix-brew',
    title: 'Coffee Connoisseur',
    description: 'Become a coffee expert',
    objectives: [
      {
        type: 'location',
        description: 'Visit Phoenix Brew',
        targetValue: 1,
        required: true,
      },
      {
        type: 'collect',
        description: 'Try 3 signature drinks',
        targetValue: 3,
        required: true,
      },
    ],
    rewards: [
      { type: 'xp', value: 200, description: '200 XP' },
      { type: 'coupon', value: '20% off', description: '20% discount' },
      { type: 'nft', value: 'coffee-badge', description: 'Expert Badge' },
    ],
    layer: 'vrr',
    difficulty: 'medium',
  });

  // 4. Add premium content
  const paymentService = new X402PaymentService({
    network: 'base',
    simulationMode: true,
  });

  console.log('✅ Coffee Shop VRR Experience Ready!');
  console.log(`   Portal ID: ${portal.id}`);
  console.log(`   QR Code: ${portal.triggerData}`);
  console.log(`   Quest ID: ${questId}`);

  // Cleanup
  return () => {
    syncService.dispose();
    arService.dispose();
    questService.dispose();
    paymentService.dispose();
  };
}

// Run it
const cleanup = await createCoffeeShopExperience();

// When done
cleanup();
```

## Configuration

Set VSCode settings for default configurations:

```json
{
  "holoscript.hololand.vrrSync.enabled": true,
  "holoscript.hololand.vrrSync.updateInterval": 30000,
  "holoscript.hololand.payments.network": "base",
  "holoscript.hololand.payments.simulationMode": true,
  "holoscript.hololand.zora.network": "base",
  "holoscript.hololand.zora.defaultRoyalty": 10,
  "holoscript.hololand.storyweaver.provider": "openai"
}
```

## Next Steps

1. **Read Full Guide**: [HOLOLAND_PLATFORM_GUIDE.md](./HOLOLAND_PLATFORM_GUIDE.md)
2. **Run Tests**: `cd packages/vscode-extension && pnpm test`
3. **Explore Examples**: Check `examples/` directory
4. **Join Community**: Discord server for support

## Common Patterns

### Pattern 1: Payment-Gated Quest

```typescript
// Create paid quest
const questId = await questService.createQuest({
  /* ... */
});

// Require payment before quest start
await paymentService.requestPayment(
  {
    amount: 5000000000000000, // 0.005 ETH
    description: `Access to Quest: ${questId}`,
  },
  userId
);

// Grant quest access
```

### Pattern 2: NFT-Rewarded Quest Completion

```typescript
// Complete quest
const completion = await questService.completeQuest(questId, userId);

// Mint reward NFT
const nft = await zoraService.mintNFT({
  name: `Quest Completion: ${completion.questId}`,
  description: 'Quest achievement NFT',
  // ...
});
```

### Pattern 3: Real-Time VRR Updates

```typescript
syncService.on('weather-update', async (weather) => {
  // Update VRR environment
  console.log('Weather changed:', weather.condition);
});

syncService.on('inventory-update', async (inventory) => {
  // Update available items in VRR
  console.log('Inventory updated:', inventory.items.length);
});
```

## Troubleshooting

**Q: Payment service fails**
A: Use `simulationMode: true` for testing

**Q: AI generation fails**
A: No API key? Service runs in simulation mode automatically

**Q: VRR sync not updating**
A: Check `updateInterval` and ensure service is started with `await service.start()`

**Q: Portal scan doesn't work**
A: Ensure portal is created before calling `simulateScan()`

## Resources

- **Full Documentation**: [HOLOLAND_PLATFORM_GUIDE.md](./HOLOLAND_PLATFORM_GUIDE.md)
- **Test Examples**: [src/**tests**/](../src/__tests__/)
- **Type Definitions**: `@holoscript/core/plugins/HololandTypes`

---

**Ready to build amazing VRR experiences!** 🚀
