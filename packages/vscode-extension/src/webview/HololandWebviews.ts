/**
 * HololandWebviews — Central registration for all Hololand webviews
 *
 * Exports all webview panels and provides registration functions.
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { VRRTwinPreviewPanel } from './VRRTwinPreviewPanel';
import { QuestBuilderPanel } from './QuestBuilderPanel';
import { ARSimulatorPanel } from './ARSimulatorPanel';
import { AgentWalletDashboard } from './AgentWalletDashboard';
import type { HololandServices } from '../services/HololandServices';

/**
 * Register all Hololand webview commands
 */
export function registerHololandWebviews(
  context: vscode.ExtensionContext,
  services: HololandServices
): void {
  // VRR Twin Preview
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.hololand.openVRRPreview', () => {
      VRRTwinPreviewPanel.createOrShow(context.extensionUri, services);
    })
  );

  // Quest Builder
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.hololand.openQuestBuilder', () => {
      QuestBuilderPanel.createOrShow(context.extensionUri, services);
    })
  );

  // AR Simulator
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.hololand.openARSimulator', () => {
      ARSimulatorPanel.createOrShow(context.extensionUri, services);
    })
  );

  // Agent Wallet Dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.hololand.openWalletDashboard', () => {
      AgentWalletDashboard.createOrShow(context.extensionUri, services);
    })
  );

  // Register webview panel serializers for restoration
  if (vscode.window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(VRRTwinPreviewPanel.viewType, {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
          VRRTwinPreviewPanel.revive(webviewPanel, context.extensionUri, services);
        },
      })
    );
  }

  console.log('HoloScript: Hololand webviews registered');
}

// Export all webview classes
export { VRRTwinPreviewPanel, QuestBuilderPanel, ARSimulatorPanel, AgentWalletDashboard };
