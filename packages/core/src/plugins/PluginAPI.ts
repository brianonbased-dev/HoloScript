/**
 * PluginAPI — Safe runtime API surface for plugins
 *
 * Provides a sandboxed interface that plugins use to interact with
 * the engine. Enforces permission checks and exposes event hooks,
 * asset registration, and state access.
 *
 * @version 1.0.0
 */

import type { PluginPermission } from './PluginLoader';
import type {
  WeatherData,
  EventData,
  InventoryData,
  ARPortalInfo,
  QRScanData,
  ARPortal,
  AgentWallet,
  NFTMetadata,
  PaymentRequest,
  PaymentReceipt,
  AIGeneratedNarrative,
  AIGeneratedQuest,
  QuestDefinition,
  QuestConfig,
  QuestProgress,
  QuestCompletion,
  QuestReward,
} from './HololandTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface PluginEventHandler {
  event: string;
  handler: (payload: unknown) => void;
  pluginId: string;
}

export interface PluginAsset {
  id: string;
  type: 'mesh' | 'texture' | 'audio' | 'script' | 'shader' | 'data';
  path: string;
  pluginId: string;
  metadata?: Record<string, unknown>;
}

export interface PluginCommand {
  id: string;
  name: string;
  description?: string;
  handler: (...args: unknown[]) => unknown;
  pluginId: string;
}

export interface PluginAPIConfig {
  pluginId: string;
  permissions: PluginPermission[];
}

// =============================================================================
// PLUGIN API
// =============================================================================

export class PluginAPI {
  private eventHandlers: PluginEventHandler[] = [];
  private assets: Map<string, PluginAsset> = new Map();
  private commands: Map<string, PluginCommand> = new Map();
  private stateStore: Map<string, Map<string, unknown>> = new Map();
  private config: PluginAPIConfig;

  constructor(config: PluginAPIConfig) {
    this.config = config;
  }

  /**
   * Check if the plugin has a specific permission
   */
  hasPermission(permission: PluginPermission): boolean {
    return this.config.permissions.includes(permission);
  }

  /**
   * Require a permission or throw
   */
  private requirePermission(permission: PluginPermission): void {
    if (!this.hasPermission(permission)) {
      throw new Error(
        `Plugin "${this.config.pluginId}" lacks permission "${permission}"`
      );
    }
  }

  // ===========================================================================
  // EVENT SYSTEM
  // ===========================================================================

  /**
   * Subscribe to an engine event
   */
  on(event: string, handler: (payload: unknown) => void): void {
    this.eventHandlers.push({
      event,
      handler,
      pluginId: this.config.pluginId,
    });
  }

  /**
   * Unsubscribe from an engine event
   */
  off(event: string, handler: (payload: unknown) => void): void {
    this.eventHandlers = this.eventHandlers.filter(
      (h) => !(h.event === event && h.handler === handler)
    );
  }

  /**
   * Emit an event to the engine
   */
  emit(event: string, payload?: unknown): void {
    const relevantHandlers = this.eventHandlers.filter((h) => h.event === event);
    for (const h of relevantHandlers) {
      try {
        h.handler(payload);
      } catch {
        // isolate plugin errors
      }
    }
  }

  /**
   * Get all registered event handlers for a plugin
   */
  getEventHandlers(pluginId?: string): PluginEventHandler[] {
    if (pluginId) {
      return this.eventHandlers.filter((h) => h.pluginId === pluginId);
    }
    return [...this.eventHandlers];
  }

  // ===========================================================================
  // ASSET REGISTRATION
  // ===========================================================================

  /**
   * Register a plugin asset
   */
  registerAsset(asset: Omit<PluginAsset, 'pluginId'>): void {
    this.requirePermission('filesystem:read');

    const fullAsset: PluginAsset = {
      ...asset,
      pluginId: this.config.pluginId,
    };
    this.assets.set(asset.id, fullAsset);
  }

  /**
   * Unregister a plugin asset
   */
  unregisterAsset(assetId: string): boolean {
    const asset = this.assets.get(assetId);
    if (asset && asset.pluginId === this.config.pluginId) {
      this.assets.delete(assetId);
      return true;
    }
    return false;
  }

  /**
   * Get a registered asset by ID
   */
  getAsset(assetId: string): PluginAsset | undefined {
    return this.assets.get(assetId);
  }

  /**
   * Get all assets registered by a plugin
   */
  getAssetsByPlugin(pluginId: string): PluginAsset[] {
    return [...this.assets.values()].filter((a) => a.pluginId === pluginId);
  }

  /**
   * Get total count of registered assets
   */
  getAssetCount(): number {
    return this.assets.size;
  }

  // ===========================================================================
  // COMMAND REGISTRATION
  // ===========================================================================

  /**
   * Register a command that can be called by the engine or other plugins
   */
  registerCommand(command: Omit<PluginCommand, 'pluginId'>): void {
    const fullCommand: PluginCommand = {
      ...command,
      pluginId: this.config.pluginId,
    };
    this.commands.set(command.id, fullCommand);
  }

  /**
   * Execute a registered command
   */
  executeCommand(commandId: string, ...args: unknown[]): unknown {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command "${commandId}" not found`);
    }
    return command.handler(...args);
  }

  /**
   * Get all registered commands
   */
  getCommands(): PluginCommand[] {
    return [...this.commands.values()];
  }

  // ===========================================================================
  // STATE STORE (per-plugin isolated state)
  // ===========================================================================

  /**
   * Set a value in the plugin's isolated state store
   */
  setState(key: string, value: unknown): void {
    const pluginId = this.config.pluginId;
    if (!this.stateStore.has(pluginId)) {
      this.stateStore.set(pluginId, new Map());
    }
    this.stateStore.get(pluginId)!.set(key, value);
  }

  /**
   * Get a value from the plugin's isolated state store
   */
  getState(key: string): unknown {
    return this.stateStore.get(this.config.pluginId)?.get(key);
  }

  /**
   * Get all state keys for the current plugin
   */
  getStateKeys(): string[] {
    const store = this.stateStore.get(this.config.pluginId);
    return store ? [...store.keys()] : [];
  }

  // ===========================================================================
  // SCENE ACCESS (permission-gated)
  // ===========================================================================

  /**
   * Query scene nodes (requires scene:read)
   */
  queryScene(filter: Record<string, unknown>): Record<string, unknown>[] {
    this.requirePermission('scene:read');
    // Mock implementation — would delegate to runtime
    return [{ type: 'node', filter, source: this.config.pluginId }];
  }

  /**
   * Modify a scene node (requires scene:write)
   */
  modifyNode(nodeId: string, properties: Record<string, unknown>): void {
    this.requirePermission('scene:write');
    this.emit('node:modify', { nodeId, properties, source: this.config.pluginId });
  }

  // ===========================================================================
  // HOLOLAND PLATFORM APIs (permission-gated)
  // ===========================================================================

  /**
   * Subscribe to VRR weather updates (requires vrr:sync)
   */
  syncVRRWeather(callback: (weather: WeatherData) => void): void {
    this.requirePermission('vrr:sync');
    this.on('vrr:weather_updated', callback as (payload: unknown) => void);
  }

  /**
   * Subscribe to VRR event synchronization (requires vrr:sync)
   */
  syncVRREvents(callback: (data: { events: EventData[]; count: number }) => void): void {
    this.requirePermission('vrr:sync');
    this.on('vrr:events_synced', callback as (payload: unknown) => void);
  }

  /**
   * Subscribe to VRR inventory updates (requires vrr:sync)
   */
  syncVRRInventory(callback: (inventory: InventoryData) => void): void {
    this.requirePermission('vrr:sync');
    this.on('vrr:inventory_updated', callback as (payload: unknown) => void);
  }

  /**
   * Start AR QR code scanner (requires ar:camera)
   */
  startQRScanner(trigger: string, callback: (data: QRScanData) => void): void {
    this.requirePermission('ar:camera');
    this.emit('ar:scanner:start', { trigger, pluginId: this.config.pluginId });
    this.on('ar:qr_scanned', callback as (payload: unknown) => void);
  }

  /**
   * Create an AR portal to VRR/VR destination (requires ar:camera)
   */
  createARPortal(destination: string, price?: number): ARPortal {
    this.requirePermission('ar:camera');
    if (price && price > 0) {
      this.requirePermission('x402:payment');
    }

    const portalId = `portal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const portal: ARPortal = {
      id: portalId,
      activate: async () => {
        this.emit('ar:portal:activate', { portalId, destination, price });
      },
      deactivate: () => {
        this.emit('ar:portal:deactivate', { portalId });
      },
      onScan: (cb) => {
        this.on('ar:qr_scanned', (data) => {
          const scanData = data as QRScanData;
          if (scanData.portalId === portalId) {
            cb(scanData);
          }
        });
      },
    };
    return portal;
  }

  /**
   * Create an AI agent wallet (requires agentkit:wallet)
   */
  async createAgentWallet(agentId: string): Promise<AgentWallet> {
    this.requirePermission('agentkit:wallet');
    // Mock implementation — would delegate to AgentKit SDK
    const wallet: AgentWallet = {
      id: agentId,
      address: `0x${Math.random().toString(16).slice(2, 42)}`,
      network: 'base-sepolia',
      balance: '0',
      nonce: 0,
      createdAt: Date.now(),
    };
    this.emit('agentkit:wallet_created', wallet);
    return wallet;
  }

  /**
   * Mint an NFT using AI agent wallet (requires agentkit:wallet + zora:nft_mint)
   */
  async mintNFT(metadata: NFTMetadata): Promise<{ tokenId: string }> {
    this.requirePermission('agentkit:wallet');
    this.requirePermission('zora:nft_mint');
    // Mock implementation — would call Zora Protocol
    const tokenId = `token_${Date.now()}`;
    this.emit('agentkit:nft_minted', { tokenId, metadata });
    return { tokenId };
  }

  /**
   * Execute x402 payment (requires x402:payment + agentkit:wallet)
   */
  async payX402(endpoint: string, price: number): Promise<{ txHash: string }> {
    this.requirePermission('x402:payment');
    this.requirePermission('agentkit:wallet');
    // Mock implementation — would execute on-chain payment
    const txHash = `0x${Math.random().toString(16).slice(2, 66)}`;
    const receipt: PaymentReceipt = {
      txHash,
      from: this.config.pluginId,
      to: endpoint,
      amount: price.toString(),
      currency: 'ETH',
      timestamp: Date.now(),
      status: 'pending',
    };
    this.emit('agentkit:payment_sent', receipt);
    return { txHash };
  }

  /**
   * Generate AI narrative using StoryWeaver (requires storyweaver:ai)
   */
  async generateNarrative(prompt: string, theme: string): Promise<string> {
    this.requirePermission('storyweaver:ai');
    // Mock implementation — would call LLM provider
    const narrative: AIGeneratedNarrative = {
      text: `[AI-generated narrative for theme: ${theme}]`,
      theme,
      genre: 'adventure',
      wordCount: 250,
      generatedAt: Date.now(),
      provider: 'openai',
      model: 'gpt-4',
      prompt,
    };
    this.emit('storyweaver:narrative_generated', narrative);
    return narrative.text;
  }

  /**
   * Generate AI quest using StoryWeaver (requires storyweaver:ai + quest:create)
   */
  async generateQuest(businessId: string, theme: string): Promise<QuestDefinition> {
    this.requirePermission('storyweaver:ai');
    this.requirePermission('quest:create');
    // Mock implementation — would call LLM to generate quest
    const aiQuest: AIGeneratedQuest = {
      id: `quest_${Date.now()}`,
      title: `Quest: ${theme}`,
      description: `An AI-generated quest for ${businessId}`,
      narrative: '[AI-generated narrative]',
      objectives: [
        {
          id: 'obj1',
          type: 'location',
          description: 'Visit the location',
          targetValue: 1,
          required: true,
        },
      ],
      rewards: [{ type: 'xp', value: 100, description: '100 XP' }],
      difficulty: 'medium',
      estimatedDuration: 15,
      theme,
    };
    this.emit('storyweaver:quest_created', aiQuest);

    const quest: QuestDefinition = {
      ...aiQuest,
      businessId,
      layer: 'vrr',
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return quest;
  }

  /**
   * Create a business quest (requires quest:create)
   */
  async createQuest(config: QuestConfig): Promise<string> {
    this.requirePermission('quest:create');
    if (config.aiGenerate) {
      this.requirePermission('storyweaver:ai');
    }

    const questId = `quest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const quest: QuestDefinition = {
      id: questId,
      businessId: config.businessId,
      title: config.title,
      description: config.description,
      objectives: config.objectives.map((obj, idx) => ({
        id: `${questId}_obj${idx}`,
        ...obj,
      })),
      rewards: config.rewards,
      layer: config.layer,
      difficulty: config.difficulty,
      estimatedDuration: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.emit('quest:created', quest);
    return questId;
  }

  /**
   * Update quest progress (requires quest:manage)
   */
  async updateQuestProgress(
    questId: string,
    playerId: string,
    progress: number
  ): Promise<void> {
    this.requirePermission('quest:manage');
    const questProgress: QuestProgress = {
      questId,
      playerId,
      status: 'in_progress',
      objectiveProgress: { default: progress },
      lastUpdatedAt: Date.now(),
    };
    this.emit('quest:progress_updated', questProgress);
  }

  /**
   * Complete a quest (requires quest:manage)
   */
  async completeQuest(questId: string, playerId: string): Promise<QuestReward[]> {
    this.requirePermission('quest:manage');
    const rewards: QuestReward[] = [
      { type: 'xp', value: 100, description: '100 XP' },
    ];
    const completion: QuestCompletion = {
      questId,
      playerId,
      completedAt: Date.now(),
      rewards,
    };
    this.emit('quest:completed', completion);
    return rewards;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Remove all registrations for the current plugin
   */
  cleanup(): void {
    const pluginId = this.config.pluginId;

    // Remove event handlers
    this.eventHandlers = this.eventHandlers.filter((h) => h.pluginId !== pluginId);

    // Remove assets
    for (const [id, asset] of this.assets) {
      if (asset.pluginId === pluginId) {
        this.assets.delete(id);
      }
    }

    // Remove commands
    for (const [id, command] of this.commands) {
      if (command.pluginId === pluginId) {
        this.commands.delete(id);
      }
    }

    // Remove state
    this.stateStore.delete(pluginId);
  }
}
