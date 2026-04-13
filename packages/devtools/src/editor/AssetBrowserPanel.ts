import { World, Entity } from '@holoscript/engine/ecs/World';
import { AssetManager } from './AssetManager';
import { UIBuilder } from './UIBuilder';
import { AssetMetadata, AssetType } from '../assets/AssetMetadata';
import { createPanel, createButton, createText } from '../ui/UIComponents';

export class AssetBrowserPanel {
  private world: World;
  private assetManager: AssetManager;
  private uiBuilder: UIBuilder;

  public panelRoot: Entity | undefined;
  private contentContainer: Entity | undefined;

  private currentTab: AssetType = 'model';
  private currentPage: number = 0;

  public onAssetSelected?: (asset: AssetMetadata) => void;

  constructor(world: World, assetManager: AssetManager, uiBuilder: UIBuilder) {
    this.world = world;
    this.assetManager = assetManager;
    this.uiBuilder = uiBuilder;

    this.createPanel();
  }

  private createPanel() {
    // Main Panel Background
    const _bg = createPanel({ width: 0.8, height: 0.6, color: '#222222' });
    // Position at hardcoded offset for now
    this.panelRoot = this.uiBuilder.spawn({
      type: 'Panel',
      properties: {
        width: 0.8,
        height: 0.6,
        color: '#222222',
        borderRadius: 0.02,
        position: [0.8, 1.5, -0.5],
        rotation: { x: 0, y: -0.5, z: 0 }, // Angled towards user
      },
      children: [],
    });

    this.world.addTag(this.panelRoot, 'NoSelect');
    this.world.addTag(this.panelRoot, 'EditorUI_AssetBrowser_Root');

    // Create Tabs (Header)
    this.createTabs();

    // Content Area
    this.renderGrid();
  }

  private createTabs() {
    if (!this.panelRoot) return;

    // Models Tab
    const mBtn = this.uiBuilder.spawn(
      {
        type: 'Button',
        properties: {
          text: 'Models',
          width: 0.2,
          height: 0.08,
          position: [-0.2, 0.25, 0.02],
          color: this.currentTab === 'model' ? '#007bff' : '#444',
        },
      },
      this.panelRoot
    );
    this.world.addTag(mBtn, 'UI_Tab_Model');
    this.world.addComponent(mBtn, 'UIInteractive', { onClick: () => this.setTab('model') });

    // Textures Tab
    const tBtn = this.uiBuilder.spawn(
      {
        type: 'Button',
        properties: {
          text: 'Textures',
          width: 0.2,
          height: 0.08,
          position: [0.2, 0.25, 0.02],
          color: this.currentTab === 'texture' ? '#007bff' : '#444',
        },
      },
      this.panelRoot
    );
    this.world.addTag(tBtn, 'UI_Tab_Texture');
    this.world.addComponent(tBtn, 'UIInteractive', { onClick: () => this.setTab('texture') });
  }

  public setTab(type: AssetType) {
    if (this.currentTab === type) return;
    this.currentTab = type;
    this.refresh();
  }

  public refresh() {
    if (this.panelRoot) {
      this.destroyChildren(this.panelRoot); // Custom helper needed
      this.createTabs();
      this.renderGrid();
    }
  }

  private renderGrid() {
    if (!this.panelRoot) return;

    const assets = this.assetManager.getAssetsByType(this.currentTab);
    const cols = 3;
    const startX = -0.25;
    const startY = 0.15;
    const gapX = 0.25;
    const gapY = 0.2;

    assets.forEach((asset, i) => {
      if (i > 8) return; // Limit for MVP

      const col = i % cols;
      const row = Math.floor(i / cols);

      const item = this.uiBuilder.spawn(
        {
          type: 'Button',
          properties: {
            text: asset.name.length > 10 ? asset.name.substring(0, 10) + '...' : asset.name,
            width: 0.2,
            height: 0.15,
            position: [startX + col * gapX, startY - row * gapY, 0.02,],
            color: '#3a3a3a',
          },
        },
        this.panelRoot
      );

      // Add metadata component for selection
      this.world.addComponent(item, 'AssetRef', { id: asset.id });
      this.world.addComponent(item, 'UIInteractive', {
        onClick: () => {
          if (this.onAssetSelected) this.onAssetSelected(asset);
        },
      });
    });
  }

  private destroyChildren(parent: Entity) {
    // Naive implementation: Iterate all entities, find children.
    // Optimization: Store children IDs in this class.
    // For now, rely on World implementation to be fast enough for editor UI.
    const all = this.world.getAllEntities();
    const children = all.filter((e) => {
      const t = this.world.getComponent<any>(e, 'Transform');
      return t && t.parent === parent;
    });
    children.forEach((c) => {
      this.destroyChildren(c); // Recursive
      this.world.destroyEntity(c);
    });
  }
}
