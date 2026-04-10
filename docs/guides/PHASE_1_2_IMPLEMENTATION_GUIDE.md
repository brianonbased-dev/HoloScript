# HoloScript+ Phase 1-2 Implementation Guide

## 🎯 Overview

This guide covers the implementation of critical Hololand ecosystem enhancements:

- **Phase 1** (✅ Complete): Networking, Voice Input, AI NPCs, Performance Telemetry
- **Phase 2** (⏳ In Progress): Advanced Commerce, Analytics, Avatars, Events

---

## Phase 1: Foundation Layer

### 1. Voice Input Trait (@voice_input)

**Location**: `packages/core/src/traits/VoiceInputTrait.ts`

#### Usage

```typescript
import { createVoiceInputTrait } from '@holoscript/core';

const voiceInput = createVoiceInputTrait({
  mode: 'continuous',
  confidenceThreshold: 0.7,
  commands: [
    {
      phrase: 'grab the sphere',
      aliases: ['pick up sphere', 'get sphere'],
      action: 'grab',
      params: { target: 'sphere' },
    },
  ],
  showTranscript: true,
  audioFeedback: true,
});

// Listen for voice input
voiceInput.on((event) => {
  if (event.type === 'final' && event.result.matchedCommand) {
    console.log('Command matched:', event.result.matchedCommand.action);
  }
});

// Start/stop listening
voiceInput.startListening();
voiceInput.toggleListening();
voiceInput.stopListening();
```

#### In HoloScript+ Code

```hsplus
composition "VoiceDemo" {
  template "MyOrb" {
    @grabbable
    @voice_input(
      mode: "continuous"
      confidence_threshold: 0.7
      commands: [
        { phrase: "grab", action: "grab" },
        { phrase: "throw", action: "throw" }
      ]
    )
    geometry: "sphere"
  }

  object "MyOrb" using "MyOrb" {
    position: [0, 0, -2]
  }
}
```

### 2. AI-Driven NPCs (@ai_driven)

**Location**: `packages/core/src/traits/AIDriverTrait.ts`

#### Usage

```typescript
import { createAIDriverTrait } from '@holoscript/core';

const npcAI = createAIDriverTrait({
  npcId: 'shopkeeper_001',
  decisionMode: 'hybrid',
  personality: {
    sociability: 0.8,
    aggression: 0.1,
    curiosity: 0.6,
    loyalty: 0.9,
  },
  goals: [
    {
      id: 'greet',
      name: 'Greet new customers',
      priority: 1.0,
      preconditions: new Map([['nearbyPlayers', true]]),
      effects: new Map([['engaged', true]]),
      cost: 1,
    },
  ],
});

npcAI.startAI();

// Update perception
npcAI.updatePerception(['player1', 'player2'], ['player1']);

// Dialogue
npcAI.speak('Welcome to my shop!');
npcAI.hear('player1', 'Do you have any swords?');

// Access context
const context = npcAI.getContext();
console.log('NPC mood:', context.mood);
```

#### In HoloScript+ Code

```hsplus
composition "NPCDemo" {
  template "Shopkeeper" {
    @ai_driven(
      decision_mode: "hybrid"
      personality: { sociability: 0.8, aggression: 0.1 }
      goals: [
        { id: "greet", priority: 1.0, name: "Greet customers" }
      ]
    )
    @on_perception_change { ... }
    geometry: "humanoid"
  }

  object "Shopkeeper" using "Shopkeeper" {
    position: [0, 1.5, 0]
  }
}
```

### 3. Performance Telemetry

**Location**: `packages/core/src/runtime/PerformanceTelemetry.ts`

#### Usage

```typescript
import { getPerformanceTelemetry } from '@holoscript/core';

const telemetry = getPerformanceTelemetry();

// Start monitoring
telemetry.startMonitoring();

// Set performance budgets
telemetry.setBudget({
  metricName: 'frame_duration',
  maxValue: 16.67, // 60fps target
  severity: 'warning',
  enabled: true,
});

// Record frame timing
telemetry.recordFrame(
  cpuTime, // ms
  gpuTime, // ms
  renderTime, // ms
  logicTime // ms
);

// Record memory snapshot
telemetry.recordMemorySnapshot();

// Get stats
console.log('Avg FPS:', telemetry.getAverageFPS());
console.log('Memory:', telemetry.getMemoryStats());

// Export metrics
class ConsoleExporter {
  async export(metrics) {
    console.log('Metrics:', metrics);
  }
  async flush() {}
}

telemetry.addExporter(new ConsoleExporter());

// Generate report
console.log(telemetry.generateReport());
```

---

## Phase 2: Commerce & Creator Tools

### Advanced Commerce System

**Location**: `packages/commerce/src/AdvancedCommerceSystem.ts`

#### Key Components

**InventoryManager** - Track shop items

```typescript
const inventory = new InventoryManager();

inventory.addItem({
  id: 'sword_001',
  name: 'Legendary Sword',
  category: 'weapons',
  quantity: 5,
  basePrice: 1000,
  currency: 'hololand-credits',
});

// Reserve items during purchase
inventory.reserve('sword_001', 1, 'checkout_123');

// Release if purchase fails
inventory.release('sword_001', 1, 'checkout_123');
```

**DynamicPricingEngine** - Adjust prices based on demand

```typescript
const pricing = new DynamicPricingEngine();

pricing.addRule({
  id: 'dynamic_sword',
  itemId: 'sword_001',
  strategy: 'dynamic',
  basePrice: 1000,
  minPrice: 800,
  maxPrice: 2000,
  demandMultiplier: 1.5,
  enabled: true,
});

// Calculate dynamic price
const price = pricing.calculatePrice('sword_001', demandLevel);

// Track demand
pricing.recordDemand('sword_001');
```

**NPCShopkeeper** - AI-driven NPC merchants

```typescript
const commerce = new AdvancedCommerceSystem();
const shopkeeper = commerce.createShopkeeper({
  npcId: 'merchant_001',
  shopName: 'Crystal Trading Post',
  inventoryIds: ['sword_001', 'shield_002'],
  personality: {
    chattiness: 0.8,
    haggleWillingness: 0.5,
    fairness: 0.7,
    uniqueness: 'Ah, another fine customer!',
  },
  markupPercentage: 20,
});

// Get greeting
console.log(shopkeeper.generateGreeting());

// Process purchase
const result = shopkeeper.processPurchase('sword_001', 1, 'PlayerName');
console.log(result.response);
```

**TransactionLogger** - Record and analyze sales

```typescript
const logger = commerce.getTransactionLogger();

logger.recordTransaction({
  id: 'txn_001',
  itemId: 'sword_001',
  buyerId: 'player_1',
  sellerId: 'merchant_001',
  quantity: 1,
  price: 1200,
  currency: 'hololand-credits',
  status: 'completed',
  timestamp: Date.now(),
  shopId: 'shop_001',
});

// Generate sales report
const report = logger.generateReport({
  start: Date.now() - 86400000,
  end: Date.now(),
});

console.log('Revenue:', report.totalRevenue);
console.log('Top Items:', report.topItems);
```

---

## Integration Patterns

### 1. Voice + Interaction

```hsplus
composition "VoiceInteraction" {
  template "BuyButton" {
    @clickable
    @voice_input(
      commands: [
        { phrase: "buy", action: "purchase" },
        { phrase: "cancel", action: "cancel_purchase" }
      ]
    )
    @on_voice_recognized { result } -> {
      if (result.matched_command.action == "purchase") {
        emit("shop:purchase_requested")
      }
    }
    geometry: "box"
  }

  object "BuyBtn" using "BuyButton" {
    position: [0, 1, 0]
  }
}
```

### 2. NPC Dialogue Loop

```typescript
// NPC perceives player, decides to greet
npc.updatePerception(['player1'], ['player1']);

// NPC speaks (integrated with speech synthesis)
npc.speak('Welcome to my shop!');

// Player voice-inputs response
const player_response = await voiceInput.listen();
npc.hear('player1', player_response);

// NPC decides next action based on dialogue
const context = npc.getContext();
```

### 3. Inventory + Voice Commerce

```hsplus
composition "VoiceCommerce" {
  template "ShopInventory" {
    @ai_driven(
      personality: { sociability: 0.8 }
    )
    @voice_input(
      commands: [
        { phrase: "what do you have", action: "list_inventory" },
        { phrase: "show me swords", action: "filter_category", params: { category: "weapons" } },
        { phrase: "how much is the sword", action: "query_price" }
      ]
    )
    @on_voice_recognized { result } -> {
      action := result.matched_command.action

      if (action == "list_inventory") {
        shopkeeper.show_inventory()
      }
      else if (action == "query_price") {
        price := shopkeeper.get_price("sword_001")
        speak("That sword costs ${price} credits")
      }
    }
    geometry: "sphere"
  }

  object "ShopInventory" using "ShopInventory" {
    position: [0, 1, 0]
  }
}
```

---

## Performance Considerations

### Frame Budget Monitoring

```typescript
telemetry.recordFrame(
  cpuTime, // Keep < 10ms for 60fps target
  gpuTime, // Keep < 6ms
  renderTime, // Keep < 8ms
  logicTime // Keep < 5ms
);

// Total should be < 16.67ms for 60fps
```

### Memory Budgets

- **Default**: 100MB for browser/mobile
- **VR Headset**: 200MB for Quest 3
- **Desktop**: 500MB+ available

Monitor with:

```typescript
telemetry.getMemoryStats(); // Check heap usage
telemetry.recordMemorySnapshot(); // Log snapshots
```

---

## Testing

### Voice Input Tests

```typescript
// Mock Web Speech API for testing
const mockRecognition = {
  start: () => {},
  stop: () => {},
  onresult: (e) => {
    e.results = [{ 0: { transcript: 'test', confidence: 0.95 }, isFinal: true }];
  },
};
```

### NPC Behavior Tests

```typescript
// Test GOAP planning
const goals = [{ id: 'greet', priority: 1.0, preconditions, effects }];

const planner = new GOAPPlanner(goals);
const plan = planner.planGoal(currentState, goals[0]);
expect(plan).toHaveLength(1);
```

### Commerce Tests

```typescript
// Test dynamic pricing
const pricing = new DynamicPricingEngine();
const price1 = pricing.calculatePrice('item', 1); // Low demand
const price2 = pricing.calculatePrice('item', 5); // High demand
expect(price2).toBeGreaterThan(price1);
```

---

## Next Steps

- **Phase 2 (Current)**: Advanced Commerce, Creator Dashboard, Avatar System, Events
- **Phase 3**: Location-Based Features, White-Label, Content Moderation, Advanced AI

See [PHASE_2_ROADMAP.md](./PHASE_2_ROADMAP.md) for detailed Phase 2 planning.
