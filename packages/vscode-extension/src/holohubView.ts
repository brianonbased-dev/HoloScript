import * as vscode from 'vscode';
import { HoloHubClient, HoloSmartAsset } from '@holoscript/sdk';

export class HoloHubTreeDataProvider implements vscode.TreeDataProvider<HoloSmartAssetItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<HoloSmartAssetItem | undefined | null | void> =
    new vscode.EventEmitter<HoloSmartAssetItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<HoloSmartAssetItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private client: HoloHubClient;

  constructor() {
    this.client = new HoloHubClient();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HoloSmartAssetItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: HoloSmartAssetItem): Promise<HoloSmartAssetItem[]> {
    if (element) {
      return [];
    }

    try {
      // Fetch assets from Mock HoloHub
      const assets = await this.client.searchAssets('');
      return assets.map((asset: HoloSmartAsset) => new HoloSmartAssetItem(asset));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to fetch HoloHub assets: ${error}`);
      return [];
    }
  }
}

export class HoloSmartAssetItem extends vscode.TreeItem {
  constructor(public readonly asset: HoloSmartAsset) {
    super(asset.metadata.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = asset.metadata.description;
    this.description = `v${asset.metadata.version}`;

    // Icon (built-in package icon)
    this.iconPath = new vscode.ThemeIcon('package');

    this.contextValue = 'smartAsset';
  }
}
