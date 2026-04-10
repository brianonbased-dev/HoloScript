# HoloScript Plugin Ecosystem - Hololand Integration TODOs

**Purpose**: Extend all HoloScript plugins (Core, VS Code, IntelliJ, Neovim) to support Hololand's 3-layer architecture (AR → VRR → VR), x402 payments, AI agents, and creator monetization.

**Status**: Plugin ecosystem has basic VR/AR support. This document outlines expansion to full Hololand business features.

---

## 📋 Plugin Inventory

### 1. Core Plugin System

**Location**: `packages/core/src/plugins/`

- ✅ **PluginAPI.ts** - Sandboxed plugin API with permissions
- ✅ **PluginLoader.ts** - Dynamic plugin loading
- ✅ **ModRegistry.ts** - Mod/extension registry

**Current Capabilities**:

- Event system (on/off/emit)
- Asset registration (mesh, texture, audio, script, shader, data)
- Command registration
- Isolated state store per plugin
- Permission-based scene access

**Missing Hololand Features**: VRR sync hooks, x402 payment events, AgentKit wallet access, Zora NFT minting, AR entry point triggers

---

### 2. Core Extension System

**Location**: `packages/core/src/extensions/`

- ✅ **ExtensionRegistry.ts** - Extension loading/unloading
- ✅ **ExtensionInterface.ts** - Extension interface definition
- ✅ **AgentExtensionTypes.ts** - AI agent extension types

**Current Capabilities**:

- Trait registration
- Function registration
- Extension lifecycle (onLoad/onUnload)

**Missing Hololand Features**: VRR compiler extensions, AR compiler extensions, x402 payment provider extensions, Zora marketplace extensions

---

### 3. VS Code Extension

**Location**: `packages/vscode-extension/`

- ✅ **extension.ts** - Main extension entry point
- ✅ **services/** - Language services, LSP client
- ✅ **collaboration/** - Real-time collaboration
- ✅ **git/** - Semantic diff, 3D diff preview
- ✅ **previewPanel.ts** - 3D live preview
- ✅ **holohubView.ts** - Marketplace integration
- ✅ **agentApi.ts** - AI agent commands

**Current Capabilities**:

- MCP orchestrator integration
- AI auto-suggestions
- Live 3D preview
- Collaboration (cursors, selections, real-time editing)
- Semantic diff for VR scenes
- Smart asset viewer

**Missing Hololand Features**: VRR twin preview, AR QR scanner preview, x402 payment simulation, business quest builder UI, StoryWeaver AI narrative generation

---

### 4. IntelliJ Plugin

**Location**: `packages/intellij/`

- ✅ **build.gradle.kts** - Gradle build configuration
- ✅ **src/** - IntelliJ plugin source (Java/Kotlin)

**Current Capabilities**: Syntax highlighting, basic IDE support

**Missing Hololand Features**: Full feature parity with VS Code extension (VRR preview, quest builder, etc.)

---

### 5. Neovim Plugin

**Location**: `packages/neovim/plugin/`

- ✅ **holoscript.vim** - Neovim plugin

**Current Capabilities**: Syntax highlighting, basic Vim integration

**Missing Hololand Features**: LSP integration, VRR preview (via terminal graphics), inline quest editing

---

## 🎯 Hololand Integration Goals

### Phase 1: Core Plugin API Extensions (Week 1-2)

**File**: `packages/core/src/plugins/PluginAPI.ts`

**Add New Asset Types**:

```typescript
export interface PluginAsset {
  id: string;
  type:
    | 'mesh'
    | 'texture'
    | 'audio'
    | 'script'
    | 'shader'
    | 'data'
    | 'vrr_twin' // NEW: VRR twin asset
    | 'ar_marker' // NEW: AR QR code/marker
    | 'quest_pack' // NEW: Business quest bundle
    | 'nft_metadata'; // NEW: Zora NFT metadata
  path: string;
  pluginId: string;
  metadata?: Record<string, unknown>;
}
```

**Add New Events**:

```typescript
// VRR Real-Time Sync Events
on('vrr:weather_update', (data: WeatherData) => void);
on('vrr:event_sync', (events: EventData[]) => void);
on('vrr:inventory_sync', (inventory: InventoryData) => void);

// x402 Payment Events
on('x402:payment_required', (details: PaymentDetails) => void);
on('x402:payment_received', (receipt: PaymentReceipt) => void);
on('x402:payment_failed', (error: PaymentError) => void);

// AR Entry Events
on('ar:qr_scanned', (qrData: QRScanData) => void);
on('ar:portal_opened', (portalInfo: ARPortalInfo) => void);
on('ar:layer_transition', (transition: LayerTransition) => void);

// AgentKit Wallet Events
on('agentkit:wallet_created', (wallet: AgentWallet) => void);
on('agentkit:nft_minted', (nft: NFTData) => void);
on('agentkit:royalty_received', (royalty: RoyaltyEvent) => void);

// StoryWeaver AI Events
on('storyweaver:narrative_generated', (narrative: AIGeneratedNarrative) => void);
on('storyweaver:quest_created', (quest: AIGeneratedQuest) => void);

// Business Quest Events
on('quest:created', (quest: QuestDefinition) => void);
on('quest:progress_updated', (progress: QuestProgress) => void);
on('quest:completed', (completion: QuestCompletion) => void);
on('quest:reward_claimed', (reward: QuestReward) => void);
```

**Add New Permissions**:

```typescript
export type PluginPermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'scene:read'
  | 'scene:write'
  | 'network'
  // NEW: Hololand-specific permissions
  | 'vrr:sync' // Access VRR real-time sync APIs
  | 'x402:payment' // Trigger x402 payments
  | 'ar:camera' // Access device camera for AR
  | 'agentkit:wallet' // Access AI agent wallet
  | 'zora:nft_mint' // Mint NFTs via Zora
  | 'storyweaver:ai' // Access StoryWeaver AI services
  | 'quest:create' // Create business quests
  | 'quest:manage'; // Manage quest state
```

**Add Hololand API Methods**:

```typescript
// VRR Sync
syncVRRWeather(callback: (weather: WeatherData) => void): void;
syncVRREvents(callback: (events: EventData[]) => void): void;
syncVRRInventory(businessId: string, callback: (inventory: InventoryData) => void): void;

// x402 Payments
requirePayment(price: number, asset: 'USDC' | 'ETH'): Promise<PaymentReceipt>;
verifyPayment(receiptId: string): Promise<boolean>;

// AR Entry Points
startQRScanner(trigger: string, callback: (data: QRScanData) => void): void;
createARPortal(destination: string, price?: number): ARPortal;

// AgentKit Wallet
createAgentWallet(agentId: string): Promise<AgentWallet>;
mintNFT(metadata: NFTMetadata): Promise<{ tokenId: string }>;
payX402(endpoint: string, price: number): Promise<{ txHash: string }>;

// StoryWeaver AI
generateNarrative(prompt: string, theme: string): Promise<string>;
generateQuest(businessId: string, theme: string): Promise<QuestDefinition>;

// Business Quests
createQuest(config: QuestConfig): Promise<string>;
updateQuestProgress(questId: string, playerId: string, progress: number): Promise<void>;
completeQuest(questId: string, playerId: string): Promise<QuestReward>;
```

---

### Phase 2: VS Code Extension Enhancements (Week 2-4)

**File**: `packages/vscode-extension/src/extension.ts`

**New Commands**:

```typescript
// VRR Twin Commands
'holoscript.vrr.createTwin' - Create new VRR twin from HoloScript
'holoscript.vrr.syncWeather' - Manually trigger weather sync
'holoscript.vrr.previewTwin' - Preview VRR twin in 3D viewer

// AR Entry Point Commands
'holoscript.ar.createEntry' - Create AR entry point
'holoscript.ar.testQRScanner' - Test QR scanner in preview
'holoscript.ar.previewOverlay' - Preview camera overlay

// x402 Payment Commands
'holoscript.x402.simulate' - Simulate x402 payment flow
'holoscript.x402.configurePaywall' - Configure paywall for VRR/VR

// AgentKit Commands
'holoscript.agentkit.createWallet' - Create AI agent wallet
'holoscript.agentkit.mintNFT' - Mint VRR twin as NFT
'holoscript.agentkit.viewBalance' - View agent wallet balance

// Zora Creator Commands
'holoscript.zora.mintNFT' - Mint content as NFT on Zora
'holoscript.zora.uploadIPFS' - Upload metadata to IPFS
'holoscript.zora.viewRoyalties' - View creator royalty earnings

// StoryWeaver AI Commands
'holoscript.storyweaver.generateQuest' - AI-generate quest narrative
'holoscript.storyweaver.generateWorld' - AI-generate VR world
'holoscript.storyweaver.synthesizeVoice' - TTS for AI narrator

// Business Quest Builder Commands
'holoscript.quest.openBuilder' - Open no-code quest builder UI
'holoscript.quest.preview' - Preview quest flow
'holoscript.quest.publish' - Publish quest to production
```

**New Configuration** (package.json):

```json
"holoscript.vrr.weatherProvider": {
  "type": "string",
  "enum": ["weather.gov", "openweathermap", "weatherapi"],
  "default": "weather.gov",
  "description": "Weather API provider for VRR twins"
},
"holoscript.vrr.syncInterval": {
  "type": "number",
  "default": 300000,
  "description": "VRR sync interval in milliseconds (default 5 min)"
},
"holoscript.x402.enabled": {
  "type": "boolean",
  "default": true,
  "description": "Enable x402 payment protocol simulation"
},
"holoscript.agentkit.network": {
  "type": "string",
  "enum": ["base", "ethereum", "base-sepolia"],
  "default": "base-sepolia",
  "description": "Blockchain network for AgentKit wallets"
},
"holoscript.storyweaver.provider": {
  "type": "string",
  "enum": ["openai", "anthropic", "gemini"],
  "default": "openai",
  "description": "LLM provider for StoryWeaver AI"
},
"holoscript.quest.autoSave": {
  "type": "boolean",
  "default": true,
  "description": "Auto-save quest builder state"
}
```

**New Views** (package.json contributes.views):

```json
{
  "id": "holoscript.vrrTwins",
  "name": "VRR Twins",
  "icon": "icons/vrr-twin.svg"
},
{
  "id": "holoscript.businessQuests",
  "name": "Business Quests",
  "icon": "icons/quest.svg"
},
{
  "id": "holoscript.agentWallets",
  "name": "AI Agent Wallets",
  "icon": "icons/wallet.svg"
},
{
  "id": "holoscript.creatorNFTs",
  "name": "Creator NFTs",
  "icon": "icons/nft.svg"
}
```

**New Services**:

```
services/
├── VRRSyncService.ts        // Real-time VRR synchronization
├── X402PaymentService.ts    // Payment protocol simulation
├── AgentKitService.ts       // AI agent wallet management
├── ZoraMarketplaceService.ts // NFT minting via Zora
├── StoryWeaverAIService.ts   // AI narrative generation
├── QuestBuilderService.ts   // No-code quest builder backend
└── ARPreviewService.ts      // AR entry point preview
```

---

### Phase 3: Extension System Enhancements (Week 3-4)

**File**: `packages/core/src/extensions/ExtensionRegistry.ts`

**New Extension Types**:

```typescript
export interface HololandExtension extends HoloExtension {
  // VRR Compiler Extension
  compileVRRTwin?: (composition: HoloComposition) => VRRTwinOutput;

  // AR Compiler Extension
  compileAREntry?: (composition: HoloComposition) => AREntryOutput;

  // x402 Payment Provider Extension
  handleX402Payment?: (payment: PaymentRequest) => Promise<PaymentReceipt>;

  // Zora Marketplace Extension
  mintNFT?: (metadata: NFTMetadata) => Promise<ZoraNFTResult>;

  // StoryWeaver AI Provider Extension
  generateNarrative?: (prompt: string) => Promise<string>;

  // Quest Builder Extension
  createQuest?: (config: QuestConfig) => Promise<QuestDefinition>;
}
```

**Example Extension** (VRR Weather Sync):

```typescript
// packages/core/src/extensions/VRRWeatherExtension.ts
export const VRRWeatherExtension: HololandExtension = {
  id: 'vrr-weather-sync',
  name: 'VRR Weather Synchronization',
  version: '1.0.0',

  onLoad(context) {
    context.logger.info('VRR Weather Sync Extension loaded');

    // Register VRR weather sync trait
    context.registerTrait('weather_sync', (node, params) => {
      const { provider, refresh } = params;

      // Fetch weather data every 'refresh' interval
      const syncWeather = async () => {
        try {
          const response = await fetch(`https://api.weather.gov/...`);
          const weather = await response.json();

          // Update scene lighting based on weather
          node.skyColor = weather.sky_color;
          node.sunIntensity = weather.sun_intensity;

          context.logger.info(`Weather updated: ${weather.condition}`);
        } catch (error) {
          context.logger.error('Weather sync failed:', error);
        }
      };

      // Initial sync
      syncWeather();

      // Periodic sync
      setInterval(syncWeather, refresh);
    });
  },

  onUnload(context) {
    context.logger.info('VRR Weather Sync Extension unloaded');
  },
};
```

---

### Phase 4: Webview Components (Week 4-6)

**File**: `packages/vscode-extension/src/webview/`

**New Webview Panels**:

1. **VRR Twin Preview Panel** (`webview/VRRTwinPreview.tsx`):
   - Live Three.js preview with real-time weather/events/inventory sync
   - Side-by-side comparison with real-world location (Google Maps)
   - Sync status indicators
   - Manual refresh buttons

2. **Business Quest Builder Panel** (`webview/QuestBuilder.tsx`):
   - No-code quest flow builder (drag-and-drop nodes)
   - AR/VRR/VR step configuration
   - Reward management (coupons, discounts)
   - AI quest generation (StoryWeaver integration)
   - Quest preview mode

3. **AR Entry Point Simulator** (`webview/ARSimulator.tsx`):
   - QR code generator
   - Camera feed simulation
   - AR overlay preview
   - Portal visualization
   - State persistence test

4. **Agent Wallet Dashboard** (`webview/AgentWalletDashboard.tsx`):
   - Wallet balance (USDC, ETH)
   - Transaction history
   - NFT minting interface
   - Royalty earnings tracker
   - Revenue reinvestment settings

5. **Creator NFT Studio** (`webview/CreatorNFTStudio.tsx`):
   - VRR twin → NFT metadata generator
   - IPFS upload interface
   - Zora marketplace listing
   - Royalty configuration (10-15%)
   - Revenue analytics

6. **StoryWeaver AI Composer** (`webview/StoryWeaverComposer.tsx`):
   - AI narrative prompt input
   - Theme/genre selection
   - Generated narrative output
   - Quest objective generator
   - NPC dialogue generator
   - Voice synthesis preview

---

### Phase 5: IntelliJ & Neovim Parity (Week 5-6)

**IntelliJ Plugin** (`packages/intellij/src/`):

- Port VS Code extension features to IntelliJ IDEA
- Implement webview equivalents using Swing/JavaFX
- Add Kotlin-based LSP client for Hololand features
- Integrate with IntelliJ's HTTP Client for x402 simulation

**Neovim Plugin** (`packages/neovim/plugin/holoscript.vim`):

- Implement LSP client for Hololand features
- Add terminal-based quest builder (ncurses/TUI)
- VRR preview via terminal graphics (Kitty/iTerm2)
- AR QR code generation (ASCII art)
- Wallet balance display in status line

---

## 🧪 Testing Requirements

### Unit Tests

- [ ] Core Plugin API new events
- [ ] Core Plugin API new permissions
- [ ] Core Plugin API Hololand methods
- [ ] Extension system VRR/AR extensions
- [ ] VS Code command handlers
- [ ] Webview component rendering

### Integration Tests

- [ ] VRR twin preview with live weather sync
- [ ] AR QR scanner simulation
- [ ] x402 payment flow end-to-end
- [ ] Quest builder → HoloScript compiler
- [ ] AgentKit wallet → NFT minting
- [ ] StoryWeaver AI → quest generation

### E2E Tests

- [ ] Business owner creates VRR twin with quest
- [ ] AI agent mints VRR twin as NFT
- [ ] Player scans QR → AR → VRR → VR funnel
- [ ] Creator mints VR world on Zora, earns royalties

---

## 📊 Success Metrics

**Developer Experience**:

- Time to create VRR twin: <5 minutes (vs 30 minutes manual)
- Quest creation time: <10 minutes (no-code builder vs 2 hours coding)
- NFT minting friction: 1-click vs multi-step process

**Business Impact**:

- AR entry points: 10x increase in VRR engagement
- Quest creation: 50+ businesses create quests (vs 0 today)
- Creator NFTs: 100+ VRR twins/VR worlds minted in first month

**Technical Metrics**:

- Plugin install rate: 80%+ of HoloScript developers
- VRR preview usage: 90%+ of VRR twin projects use live preview
- Quest builder adoption: 70%+ of business owners use no-code builder

---

## 🚀 Implementation Priorities

**Critical Path** (blocks other features):

1. ✅ Core Plugin API event system (Week 1)
2. ✅ Core Plugin API permission system (Week 1)
3. ⏳ VS Code VRR preview panel (Week 2)
4. ⏳ VS Code quest builder panel (Week 3)
5. ⏳ Extension system VRR compiler hooks (Week 3)

**High Priority** (business value):

- Business quest builder UI (no-code)
- VRR twin live preview with sync
- AR entry point simulator
- Creator NFT studio

**Medium Priority** (nice-to-have):

- StoryWeaver AI composer
- Agent wallet dashboard
- IntelliJ plugin parity
- Neovim TUI features

**Low Priority** (future):

- Advanced quest analytics
- Multi-language i18n for plugins
- Plugin marketplace

---

## 🔗 Integration with Other TODOs

**HoloScript Compiler TODOs** (HOLOLAND_INTEGRATION_TODOS.md):

- VRRCompiler.ts → VS Code VRR preview service
- ARCompiler.ts → VS Code AR simulator service
- x402PaymentService.ts → VS Code payment simulation

**TrainingMonkey TODOs** (HOLOLAND_TRAINING_DATA_TODOS.md):

- Generate training data for plugin development
- Quest builder prompt templates
- VRR twin configuration examples

---

## 📝 Definition of Done

**Per Plugin**:

- [ ] Hololand events/permissions implemented
- [ ] Hololand API methods functional
- [ ] UI/webview panels complete
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Documentation updated

**Overall**:

- [ ] All 5 plugins support Hololand features
- [ ] Feature parity across VS Code, IntelliJ, Neovim
- [ ] E2E user journey tests pass
- [ ] Developer onboarding guide updated
- [ ] Video tutorials created

---

**Document Version**: 1.0
**Last Updated**: 2026-02-20
**Author**: Claude Sonnet 4.5 (AI Agent)
**Related Documents**:

- HOLOLAND_INTEGRATION_TODOS.md (HoloScript compilers/runtime)
- HOLOLAND_TRAINING_DATA_TODOS.md (TrainingMonkey data generation)
