/**
 * HololandCommands — VSCode command registration for Hololand Platform
 *
 * Registers all VSCode commands for VRR, AR, AgentKit, Zora, StoryWeaver,
 * Quest Builder, and x402 Payment features.
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { HololandServices } from './HololandServices';

export function registerHololandCommands(
  context: vscode.ExtensionContext,
  services: HololandServices
): void {
  // =========================================================================
  // VRR SYNC COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.vrr.startSync', () => {
      services.vrrSync.start();
      vscode.window.showInformationMessage('VRR synchronization started');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.vrr.stopSync', () => {
      services.vrrSync.stop();
      vscode.window.showInformationMessage('VRR synchronization stopped');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.vrr.showStatus', () => {
      const config = services.vrrSync.getConfig();
      vscode.window.showInformationMessage(
        `VRR Sync: ${config.enabled ? 'Enabled' : 'Disabled'}\nInterval: ${config.updateInterval}ms`
      );
    })
  );

  // =========================================================================
  // AR PREVIEW COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.ar.createPortal', async () => {
      const title = await vscode.window.showInputBox({
        prompt: 'Enter portal title',
        placeHolder: 'Coffee Shop VRR Twin',
      });
      if (!title) return;

      const description = await vscode.window.showInputBox({
        prompt: 'Enter portal description',
        placeHolder: 'Step into the virtual coffee shop',
      });
      if (!description) return;

      const destination = await vscode.window.showInputBox({
        prompt: 'Enter destination (VRR twin ID or VR world ID)',
        placeHolder: 'phoenix-brew-vrr',
      });
      if (!destination) return;

      const portal = services.arPreview.createPortal(destination, {
        title,
        description,
      });

      vscode.window.showInformationMessage(`AR Portal created: ${portal.id}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.ar.simulateQRScan', async () => {
      const portals = services.arPreview.getAllPortals();
      if (portals.length === 0) {
        vscode.window.showWarningMessage('No AR portals available. Create one first.');
        return;
      }

      const items = portals.map((p) => ({
        label: p.title,
        description: p.destination,
        portal: p,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select portal to scan',
      });

      if (selected) {
        await services.arPreview.simulateScan(selected.portal);
      }
    })
  );

  // =========================================================================
  // AGENTKIT WALLET COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.agentkit.createWallet', async () => {
      const agentId = await vscode.window.showInputBox({
        prompt: 'Enter AI agent ID',
        placeHolder: 'my-ai-agent',
      });
      if (!agentId) return;

      const wallet = await services.agentKit.createWallet(agentId);
      vscode.window.showInformationMessage(
        `Wallet created: ${wallet.address.slice(0, 10)}...`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.agentkit.mintNFT', async () => {
      const wallets = services.agentKit.getAllWallets();
      if (wallets.length === 0) {
        vscode.window.showWarningMessage('No wallets available. Create one first.');
        return;
      }

      const walletItems = wallets.map((w) => ({
        label: w.id,
        description: w.address,
        wallet: w,
      }));

      const selectedWallet = await vscode.window.showQuickPick(walletItems, {
        placeHolder: 'Select wallet',
      });
      if (!selectedWallet) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Enter NFT name',
        placeHolder: 'Phoenix Brew VRR Twin',
      });
      if (!name) return;

      const description = await vscode.window.showInputBox({
        prompt: 'Enter NFT description',
        placeHolder: 'Digital twin of Phoenix Brew coffee shop',
      });
      if (!description) return;

      const result = await services.agentKit.mintNFT(selectedWallet.wallet.id, {
        name,
        description,
        image: 'ipfs://placeholder',
      });

      vscode.window.showInformationMessage(`NFT minted: ${result.tokenId}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.agentkit.viewBalance', async () => {
      const wallets = services.agentKit.getAllWallets();
      if (wallets.length === 0) {
        vscode.window.showWarningMessage('No wallets available');
        return;
      }

      const items = wallets.map((w) => ({
        label: w.id,
        description: `${w.address} - ${w.balance} wei`,
      }));

      await vscode.window.showQuickPick(items, {
        placeHolder: 'Wallet balances',
      });
    })
  );

  // =========================================================================
  // ZORA MARKETPLACE COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.zora.mintNFT', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter NFT name',
        placeHolder: 'My VR World',
      });
      if (!name) return;

      const description = await vscode.window.showInputBox({
        prompt: 'Enter NFT description',
        placeHolder: 'An immersive VR experience',
      });
      if (!description) return;

      const royalty = await vscode.window.showInputBox({
        prompt: 'Enter royalty percentage (10-15% typical)',
        placeHolder: '10',
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 0 || num > 100) {
            return 'Please enter a number between 0 and 100';
          }
          return null;
        },
      });
      if (!royalty) return;

      const result = await services.zoraMarketplace.mintNFT(
        { name, description, image: 'ipfs://placeholder' },
        { percentage: parseInt(royalty), recipient: '0xCreator', permanent: true }
      );

      vscode.window.showInformationMessage(
        `NFT minted on Zora: ${result.tokenId}`,
        'View on Zora'
      ).then((action) => {
        if (action === 'View on Zora') {
          vscode.env.openExternal(vscode.Uri.parse(result.marketplaceUrl));
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.zora.viewRoyalties', () => {
      const nfts = services.zoraMarketplace.getMintedNFTs();
      if (nfts.length === 0) {
        vscode.window.showInformationMessage('No NFTs minted yet');
        return;
      }

      const items = nfts.map((nft) => ({
        label: nft.tokenId,
        description: `${nft.royaltyPercentage}% royalty`,
        detail: nft.marketplaceUrl,
      }));

      vscode.window.showQuickPick(items, {
        placeHolder: 'Your Zora NFTs',
      });
    })
  );

  // =========================================================================
  // STORYWEAVER AI COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.storyweaver.generateNarrative', async () => {
      const theme = await vscode.window.showInputBox({
        prompt: 'Enter narrative theme',
        placeHolder: 'mystery, adventure, fantasy, etc.',
      });
      if (!theme) return;

      const prompt = await vscode.window.showInputBox({
        prompt: 'Enter narrative prompt (optional)',
        placeHolder: 'Create an immersive intro for...',
      });

      const narrative = await services.storyWeaver.generateNarrative(
        prompt || `Create a narrative for a ${theme} themed experience`,
        theme
      );

      // Show in new editor
      const doc = await vscode.workspace.openTextDocument({
        content: narrative,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.storyweaver.generateQuest', async () => {
      const businessId = await vscode.window.showInputBox({
        prompt: 'Enter business ID',
        placeHolder: 'phoenix-brew',
      });
      if (!businessId) return;

      const theme = await vscode.window.showInputBox({
        prompt: 'Enter quest theme',
        placeHolder: 'coffee adventure',
      });
      if (!theme) return;

      const quest = await services.storyWeaver.generateQuest(businessId, theme);

      vscode.window.showInformationMessage(
        `Quest generated: ${quest.title}`,
        'View Quest'
      ).then((action) => {
        if (action === 'View Quest') {
          vscode.commands.executeCommand('holoscript.quest.preview');
        }
      });
    })
  );

  // =========================================================================
  // QUEST BUILDER COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.quest.openBuilder', async () => {
      vscode.window.showInformationMessage('Quest Builder UI coming soon!');
      // TODO: Open webview panel with quest builder UI
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.quest.preview', async () => {
      const quests = services.questBuilder.getAllQuests();
      if (quests.length === 0) {
        vscode.window.showInformationMessage('No quests available');
        return;
      }

      const items = quests.map((q) => ({
        label: q.title,
        description: `${q.layer} - ${q.difficulty}`,
        detail: q.description,
        quest: q,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select quest to preview',
      });

      if (selected) {
        services.questBuilder.showQuestDetails(selected.quest.id);
      }
    })
  );

  // =========================================================================
  // X402 PAYMENT COMMANDS
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.x402.simulatePayment', async () => {
      const endpoint = await vscode.window.showInputBox({
        prompt: 'Enter payment endpoint',
        placeHolder: 'https://api.example.com/premium-content',
      });
      if (!endpoint) return;

      const price = await vscode.window.showInputBox({
        prompt: 'Enter price in wei',
        placeHolder: '1000000000000000',
        validateInput: (value) => {
          if (isNaN(parseInt(value))) {
            return 'Please enter a valid number';
          }
          return null;
        },
      });
      if (!price) return;

      const receipt = await services.x402Payment.pay({
        endpoint,
        price: parseInt(price),
        currency: 'ETH',
      });

      vscode.window.showInformationMessage(
        `Payment successful: ${receipt.txHash.slice(0, 10)}...`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.x402.viewHistory', () => {
      const history = services.x402Payment.getHistory();
      if (history.length === 0) {
        vscode.window.showInformationMessage('No payment history');
        return;
      }

      const items = history.map((r) => ({
        label: `${r.amount} wei to ${r.to}`,
        description: r.txHash.slice(0, 20) + '...',
        detail: new Date(r.timestamp).toLocaleString(),
      }));

      vscode.window.showQuickPick(items, {
        placeHolder: 'Payment history',
      });
    })
  );

  // =========================================================================
  // PLATFORM STATUS COMMAND
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.hololand.showStatus', () => {
      services.showStatus();
    })
  );
}
