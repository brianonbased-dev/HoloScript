import { World, Entity } from '@holoscript/engine/ecs/World';
import { UIBuilder } from './UIBuilder';
import { Web3Provider, NFTAsset } from '../web3/Web3Provider';
import { createPanel, createButton, createText } from '../ui/UIComponents';

export class MarketplacePanel {
  public world: World;
  public uiBuilder: UIBuilder;
  public web3: Web3Provider;

  public panelRoot: Entity | undefined;

  public onSpawnNFT?: (asset: NFTAsset) => void;

  constructor(world: World, uiBuilder: UIBuilder, web3?: Web3Provider) {
    this.world = world;
    this.uiBuilder = uiBuilder;
    this.web3 = web3 || Web3Provider.getInstance();

    this.createPanel();
  }

  createPanel() {
    // Create Main Background
    this.panelRoot = this.uiBuilder.spawn({
      type: 'Panel',
      properties: {
        width: 0.8,
        height: 0.6,
        color: '#1a1a1a',
        position: { x: -0.8, y: 1.5, z: -0.5 },
        rotation: { x: 0, y: 0.5, z: 0 },
        borderRadius: 0.02,
      },
    });

    this.world.addTag(this.panelRoot, 'NoSelect');
    this.world.addTag(this.panelRoot, 'EditorUI_Marketplace');

    // Initial Render
    this.render();
  }

  async render() {
    if (!this.panelRoot) return;

    // Title
    this.uiBuilder.spawn(
      {
        type: 'Text',
        properties: {
          text: 'Infinite Market (Base)',
          fontSize: 0.05,
          position: { x: 0, y: 0.25, z: 0.02 },
          color: '#ffffff',
          align: 'center',
        },
      },
      this.panelRoot
    );

    if (!this.web3.isConnected) {
      this.renderConnectButton();
    } else {
      await this.renderWalletView();
    }
  }

  renderConnectButton() {
    if (!this.panelRoot) return;

    const btn = this.uiBuilder.spawn(
      {
        type: 'Button',
        properties: {
          text: 'Connect Wallet',
          width: 0.3,
          height: 0.1,
          position: { x: 0, y: 0, z: 0.02 },
          color: '#0052ff',
        },
      },
      this.panelRoot
    );

    this.world.addComponent(btn, 'UIInteractive', {
      onClick: async () => {
        await this.web3.connect();
        this.refresh();
      },
    });
  }

  async renderWalletView() {
    if (!this.panelRoot) return;

    // Fetch Mock Assets
    const assets = await this.web3.getMyAssets();

    // List Assets
    assets.forEach((asset, i) => {
      if (i > 3) return;

      const btn = this.uiBuilder.spawn(
        {
          type: 'Button',
          properties: {
            text: asset.name,
            width: 0.6,
            height: 0.1,
            position: { x: 0, y: 0.1 - i * 0.12, z: 0.02 },
            color: '#333',
          },
        },
        this.panelRoot
      );

      // Interaction: Spawn NFT
      this.world.addComponent(btn, 'UIInteractive', {
        onClick: () => {
          if (this.onSpawnNFT) this.onSpawnNFT(asset);
        },
      });
    });
  }

  refresh() {
    if (this.panelRoot) {
      // Destroy Children
      const all = this.world.getAllEntities();
      const children = all.filter((e) => {
        const t = this.world.getComponent<any>(e, 'Transform');
        return t && t.parent === this.panelRoot;
      });
      children.forEach((c) => this.world.destroyEntity(c));

      this.render();
    }
  }
}
