/**
 * HololandServices — Central service manager for Hololand Platform integration
 *
 * Initializes and manages all Hololand services (VRR sync, AgentKit,
 * Zora, StoryWeaver, Quest Builder, AR Preview, x402 Payments).
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { VRRSyncService } from './VRRSyncService';
import { X402PaymentService } from './X402PaymentService';
import { AgentKitService } from './AgentKitService';
import { ZoraMarketplaceService } from './ZoraMarketplaceService';
import { StoryWeaverAIService } from './StoryWeaverAIService';
import { QuestBuilderService } from './QuestBuilderService';
import { ARPreviewService } from './ARPreviewService';

export class HololandServices {
  private static instance: HololandServices;

  public vrrSync: VRRSyncService;
  public x402Payment: X402PaymentService;
  public agentKit: AgentKitService;
  public zoraMarketplace: ZoraMarketplaceService;
  public storyWeaver: StoryWeaverAIService;
  public questBuilder: QuestBuilderService;
  public arPreview: ARPreviewService;

  private outputChannel: vscode.OutputChannel;

  private constructor(context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('Hololand Platform');

    // Load configuration from workspace settings
    const config = vscode.workspace.getConfiguration('holoscript.hololand');

    // Initialize VRR Sync Service
    this.vrrSync = new VRRSyncService({
      enabled: config.get('vrr.enabled', true),
      updateInterval: config.get('vrr.updateInterval', 300000),
      sources: {
        weather: config.get('vrr.weatherSync', true),
        events: config.get('vrr.eventsSync', false),
        inventory: config.get('vrr.inventorySync', false),
      },
    });

    // Initialize x402 Payment Service
    this.x402Payment = new X402PaymentService({
      enabled: config.get('x402.enabled', true),
      network: config.get('x402.network', 'base-sepolia'),
      simulationMode: config.get('x402.simulationMode', true),
    });

    // Initialize AgentKit Service
    this.agentKit = new AgentKitService({
      enabled: config.get('agentkit.enabled', true),
      network: config.get('agentkit.network', 'base-sepolia'),
      simulationMode: config.get('agentkit.simulationMode', true),
    });

    // Initialize Zora Marketplace Service
    this.zoraMarketplace = new ZoraMarketplaceService({
      enabled: config.get('zora.enabled', true),
      network: config.get('zora.network', 'base'),
      defaultRoyalty: config.get('zora.defaultRoyalty', 10),
      simulationMode: config.get('zora.simulationMode', true),
    });

    // Initialize StoryWeaver AI Service
    this.storyWeaver = new StoryWeaverAIService({
      provider: config.get('storyweaver.provider', 'openai'),
      model: config.get('storyweaver.model'),
      apiKey: config.get('storyweaver.apiKey'),
      temperature: config.get('storyweaver.temperature', 0.7),
    });

    // Initialize Quest Builder Service (with StoryWeaver integration)
    this.questBuilder = new QuestBuilderService(this.storyWeaver);

    // Initialize AR Preview Service
    this.arPreview = new ARPreviewService({
      enabled: config.get('ar.enabled', true),
      autoGenerateQR: config.get('ar.autoGenerateQR', true),
      simulateCameraFeed: config.get('ar.simulateCameraFeed', true),
    });

    this.outputChannel.appendLine('✅ Hololand Platform services initialized');

    // Start VRR sync if enabled
    if (config.get('vrr.autoStart', false)) {
      this.vrrSync.start();
    }

    // Register configuration change listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('holoscript.hololand')) {
          this.onConfigurationChanged();
        }
      })
    );

    // Register for disposal
    context.subscriptions.push({
      dispose: () => this.dispose(),
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(context: vscode.ExtensionContext): HololandServices {
    if (!HololandServices.instance) {
      HololandServices.instance = new HololandServices(context);
    }
    return HololandServices.instance;
  }

  /**
   * Handle configuration changes
   */
  private onConfigurationChanged(): void {
    this.outputChannel.appendLine('Configuration changed, reloading services...');

    const config = vscode.workspace.getConfiguration('holoscript.hololand');

    // Update VRR Sync
    this.vrrSync.updateConfig({
      enabled: config.get('vrr.enabled', true),
      updateInterval: config.get('vrr.updateInterval', 300000),
      sources: {
        weather: config.get('vrr.weatherSync', true),
        events: config.get('vrr.eventsSync', false),
        inventory: config.get('vrr.inventorySync', false),
      },
    });

    // Update x402 Payment
    this.x402Payment.updateConfig({
      enabled: config.get('x402.enabled', true),
      network: config.get('x402.network', 'base-sepolia'),
      simulationMode: config.get('x402.simulationMode', true),
    });

    // Update AgentKit
    this.agentKit.updateConfig({
      enabled: config.get('agentkit.enabled', true),
      network: config.get('agentkit.network', 'base-sepolia'),
      simulationMode: config.get('agentkit.simulationMode', true),
    });

    // Update Zora
    this.zoraMarketplace.updateConfig({
      enabled: config.get('zora.enabled', true),
      network: config.get('zora.network', 'base'),
      defaultRoyalty: config.get('zora.defaultRoyalty', 10),
      simulationMode: config.get('zora.simulationMode', true),
    });

    // Update StoryWeaver
    this.storyWeaver.updateConfig({
      provider: config.get('storyweaver.provider', 'openai'),
      model: config.get('storyweaver.model'),
      apiKey: config.get('storyweaver.apiKey'),
      temperature: config.get('storyweaver.temperature', 0.7),
    });

    // Update AR Preview
    this.arPreview.updateConfig({
      enabled: config.get('ar.enabled', true),
      autoGenerateQR: config.get('ar.autoGenerateQR', true),
      simulateCameraFeed: config.get('ar.simulateCameraFeed', true),
    });

    this.outputChannel.appendLine('✅ Services configuration updated');
  }

  /**
   * Get service status summary
   */
  getStatus(): Record<string, any> {
    return {
      vrrSync: {
        enabled: this.vrrSync.getConfig().enabled,
        running: !!this.vrrSync,
      },
      x402Payment: {
        enabled: this.x402Payment.getConfig().enabled,
        simulationMode: this.x402Payment.getConfig().simulationMode,
        totalSpent: this.x402Payment.getTotalSpent(),
      },
      agentKit: {
        enabled: this.agentKit.getConfig().enabled,
        walletCount: this.agentKit.getAllWallets().length,
        totalRoyalties: this.agentKit.getTotalRoyalties(),
      },
      zoraMarketplace: {
        enabled: this.zoraMarketplace.getConfig().enabled,
        mintedCount: this.zoraMarketplace.getMintedNFTs().length,
      },
      storyWeaver: {
        provider: this.storyWeaver.getConfig().provider,
        totalGenerated: this.storyWeaver.getTotalWordsGenerated(),
      },
      questBuilder: {
        questCount: this.questBuilder.getAllQuests().length,
      },
      arPreview: {
        enabled: this.arPreview.getConfig().enabled,
        portalCount: this.arPreview.getAllPortals().length,
      },
    };
  }

  /**
   * Show status in output channel
   */
  showStatus(): void {
    const status = this.getStatus();

    this.outputChannel.show();
    this.outputChannel.appendLine('\n========================================');
    this.outputChannel.appendLine('Hololand Platform Status');
    this.outputChannel.appendLine('========================================');
    this.outputChannel.appendLine(`VRR Sync: ${status.vrrSync.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    this.outputChannel.appendLine(
      `x402 Payments: ${status.x402Payment.enabled ? '✅ Enabled' : '❌ Disabled'} (${status.x402Payment.simulationMode ? 'Simulation' : 'Live'})`
    );
    this.outputChannel.appendLine(
      `AgentKit: ${status.agentKit.enabled ? '✅ Enabled' : '❌ Disabled'} (${status.agentKit.walletCount} wallets)`
    );
    this.outputChannel.appendLine(
      `Zora Marketplace: ${status.zoraMarketplace.enabled ? '✅ Enabled' : '❌ Disabled'} (${status.zoraMarketplace.mintedCount} NFTs)`
    );
    this.outputChannel.appendLine(`StoryWeaver AI: ${status.storyWeaver.provider} (${status.storyWeaver.totalGenerated} words)`);
    this.outputChannel.appendLine(`Quest Builder: ${status.questBuilder.questCount} quests`);
    this.outputChannel.appendLine(
      `AR Preview: ${status.arPreview.enabled ? '✅ Enabled' : '❌ Disabled'} (${status.arPreview.portalCount} portals)`
    );
    this.outputChannel.appendLine('========================================\n');
  }

  /**
   * Dispose of all services
   */
  dispose(): void {
    this.outputChannel.appendLine('Disposing Hololand Platform services...');

    this.vrrSync.dispose();
    this.x402Payment.dispose();
    this.agentKit.dispose();
    this.zoraMarketplace.dispose();
    this.storyWeaver.dispose();
    this.questBuilder.dispose();
    this.arPreview.dispose();
    this.outputChannel.dispose();
  }
}
