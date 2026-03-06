/**
 * ARPreviewService — AR entry point preview and simulation
 *
 * Provides QR code generation, camera simulation, and AR portal preview
 * for testing AR → VRR → VR layer transitions.
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type {
  ARPortalInfo,
  QRScanData,
  LayerTransition,
} from '../../../core/src/plugins/HololandTypes';

export interface ARPreviewConfig {
  enabled: boolean;
  autoGenerateQR: boolean;
  simulateCameraFeed: boolean;
}

export class ARPreviewService {
  private config: ARPreviewConfig;
  private outputChannel: vscode.OutputChannel;
  private portals: Map<string, ARPortalInfo> = new Map();
  private scanHistory: QRScanData[] = [];
  private transitionHistory: LayerTransition[] = [];

  constructor(config?: Partial<ARPreviewConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      autoGenerateQR: config?.autoGenerateQR ?? true,
      simulateCameraFeed: config?.simulateCameraFeed ?? true,
    };
    this.outputChannel = vscode.window.createOutputChannel('AR Preview');
  }

  /**
   * Create an AR portal
   */
  createPortal(
    destination: string,
    options: {
      title: string;
      description: string;
      triggerType?: 'qr' | 'image' | 'location';
      price?: number;
      previewImageUrl?: string;
    }
  ): ARPortalInfo {
    const portalId = `portal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const triggerData =
      options.triggerType === 'qr'
        ? this.generateQRData(portalId)
        : options.triggerType === 'location'
        ? '47.6062,-122.3321' // Default: Seattle coordinates
        : `https://example.com/marker_${portalId}.png`;

    const portal: ARPortalInfo = {
      id: portalId,
      triggerType: options.triggerType || 'qr',
      triggerData,
      destination,
      requiresPayment: (options.price || 0) > 0,
      price: options.price,
      title: options.title,
      description: options.description,
      previewImageUrl: options.previewImageUrl,
    };

    this.portals.set(portalId, portal);

    this.outputChannel.appendLine(`AR Portal created: ${portal.title}`);
    this.outputChannel.appendLine(`  ID: ${portalId}`);
    this.outputChannel.appendLine(`  Trigger: ${portal.triggerType}`);
    this.outputChannel.appendLine(`  Data: ${triggerData}`);
    this.outputChannel.appendLine(`  Destination: ${destination}`);
    if (portal.requiresPayment) {
      this.outputChannel.appendLine(`  Price: ${portal.price} wei`);
    }

    vscode.window.showInformationMessage(
      `AR Portal created: ${portal.title}`,
      'View QR Code',
      'Simulate Scan'
    ).then((action) => {
      if (action === 'View QR Code' && portal.triggerType === 'qr') {
        this.showQRCode(portal);
      } else if (action === 'Simulate Scan') {
        this.simulateScan(portal);
      }
    });

    return portal;
  }

  /**
   * Generate QR code data
   */
  private generateQRData(portalId: string): string {
    // In a real implementation, this would generate actual QR code data
    // For now, return a mock URL
    return `https://hololand.app/portal/${portalId}`;
  }

  /**
   * Show QR code (opens browser or webview)
   */
  async showQRCode(portal: ARPortalInfo): Promise<void> {
    this.outputChannel.appendLine(`Showing QR code for portal: ${portal.id}`);

    // In a real implementation, this would generate and display a QR code image
    // For now, just show the data
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      portal.triggerData
    )}`;

    const open = await vscode.window.showInformationMessage(
      `QR Code for "${portal.title}"\nData: ${portal.triggerData}`,
      'Open QR Code'
    );

    if (open === 'Open QR Code') {
      vscode.env.openExternal(vscode.Uri.parse(qrCodeUrl));
    }
  }

  /**
   * Simulate QR code scan
   */
  async simulateScan(portal: ARPortalInfo): Promise<void> {
    this.outputChannel.appendLine(`Simulating QR scan for portal: ${portal.id}`);

    // Simulate camera feed delay
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning QR code...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 30, message: 'Initializing camera...' });
        await new Promise((resolve) => setTimeout(resolve, 500));
        progress.report({ increment: 40, message: 'Detecting QR code...' });
        await new Promise((resolve) => setTimeout(resolve, 800));
        progress.report({ increment: 30, message: 'Processing...' });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    );

    const scanData: QRScanData = {
      data: portal.triggerData,
      format: 'QR_CODE',
      timestamp: Date.now(),
      portalId: portal.id,
    };

    this.scanHistory.push(scanData);

    this.outputChannel.appendLine(`✅ QR scan successful`);
    this.outputChannel.appendLine(`  Portal: ${portal.title}`);
    this.outputChannel.appendLine(`  Destination: ${portal.destination}`);

    // Simulate layer transition
    if (portal.requiresPayment) {
      const pay = await vscode.window.showInformationMessage(
        `Entry requires payment: ${portal.price} wei`,
        'Pay & Enter',
        'Cancel'
      );

      if (pay !== 'Pay & Enter') {
        vscode.window.showInformationMessage('Entry cancelled');
        return;
      }
    }

    this.simulateLayerTransition(portal, 'ar', 'vrr');
  }

  /**
   * Simulate layer transition (AR → VRR → VR)
   */
  private simulateLayerTransition(
    portal: ARPortalInfo,
    from: 'ar' | 'vrr' | 'vr',
    to: 'ar' | 'vrr' | 'vr'
  ): void {
    // Generate proper 64-character transaction hash
    const generateTxHash = () => {
      let hash = '0x';
      for (let i = 0; i < 64; i++) {
        hash += Math.floor(Math.random() * 16).toString(16);
      }
      return hash;
    };

    const transition: LayerTransition = {
      from,
      to,
      timestamp: Date.now(),
      userId: 'dev_user',
      portalId: portal.id,
      paymentTxHash: portal.requiresPayment ? generateTxHash() : undefined,
    };

    this.transitionHistory.push(transition);

    this.outputChannel.appendLine(
      `🚀 Layer transition: ${from.toUpperCase()} → ${to.toUpperCase()}`
    );
    if (transition.paymentTxHash) {
      this.outputChannel.appendLine(`   Payment TX: ${transition.paymentTxHash}`);
    }

    vscode.window.showInformationMessage(
      `🚀 Entered ${to.toUpperCase()} layer: ${portal.destination}`
    );
  }

  /**
   * Get all portals
   */
  getAllPortals(): ARPortalInfo[] {
    return Array.from(this.portals.values());
  }

  /**
   * Get portal by ID
   */
  getPortal(portalId: string): ARPortalInfo | undefined {
    return this.portals.get(portalId);
  }

  /**
   * Get scan history
   */
  getScanHistory(limit?: number): QRScanData[] {
    return limit ? this.scanHistory.slice(-limit) : [...this.scanHistory];
  }

  /**
   * Get transition history
   */
  getTransitionHistory(limit?: number): LayerTransition[] {
    return limit ? this.transitionHistory.slice(-limit) : [...this.transitionHistory];
  }

  /**
   * Delete a portal
   */
  deletePortal(portalId: string): boolean {
    const deleted = this.portals.delete(portalId);
    if (deleted) {
      this.outputChannel.appendLine(`Portal deleted: ${portalId}`);
    }
    return deleted;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ARPreviewConfig>): void {
    this.config = { ...this.config, ...config };
    this.outputChannel.appendLine(`Config updated: ${JSON.stringify(this.config)}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): ARPreviewConfig {
    return { ...this.config };
  }

  /**
   * Export portals
   */
  exportPortals(): string {
    const portals = Array.from(this.portals.values());
    return JSON.stringify(portals, null, 2);
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.scanHistory = [];
    this.transitionHistory = [];
    this.outputChannel.appendLine('History cleared');
  }

  /**
   * Dispose of service resources
   */
  dispose(): void {
    this.portals.clear();
    this.scanHistory = [];
    this.transitionHistory = [];
    this.outputChannel.dispose();
  }
}
