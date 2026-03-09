import { World, Entity } from '../ecs/World';
import { SelectionManager } from './SelectionManager';
import { GizmoSystem } from './GizmoSystem';
import { Inspector } from './Inspector';
import { InspectorPanel } from './InspectorPanel';
import { EditorPersistence } from './EditorPersistence';
import { AssetManager } from './AssetManager';
import { AssetBrowserPanel } from './AssetBrowserPanel';
import { MarketplacePanel } from './MarketplacePanel';
import { NFTAsset } from '../web3/Web3Provider';
import { UIBuilder } from './UIBuilder';
import { createButton, createPanel } from '../ui/UIComponents';
import { Vector3, Quaternion } from '../types/HoloScriptPlus';

/**
 * EditorUI
 *
 * Central coordinator for the Editor.
 * Instantiates and wires together the critical editor systems.
 */
export class EditorUI {
  public world: World;
  public selectionManager: SelectionManager;
  public gizmoSystem: GizmoSystem;
  public inspector: Inspector;
  public inspectorPanel: InspectorPanel;
  public assetManager: AssetManager;
  public assetBrowser: AssetBrowserPanel;
  public marketplace: MarketplacePanel;
  public persistence: EditorPersistence;
  private uiBuilder: UIBuilder;

  private systemMenuRoot: Entity | undefined;

  constructor(world: World) {
    this.world = world;
    this.selectionManager = new SelectionManager();
    this.gizmoSystem = new GizmoSystem(world, this.selectionManager);
    this.inspector = new Inspector(world, this.selectionManager);
    this.inspectorPanel = new InspectorPanel(world, this.inspector);
    this.persistence = new EditorPersistence(world);
    this.uiBuilder = new UIBuilder(world);

    this.assetManager = new AssetManager(world);
    this.assetBrowser = new AssetBrowserPanel(world, this.assetManager, this.uiBuilder);

    // Handle Spawning
    this.assetBrowser.onAssetSelected = (asset) => {
      console.log('Spawning asset:', asset.name);
      // Spawn 1 meter in front of user (0, 1.5, -1)
      const spawnPos: Vector3 = { x: 0, y: 1.5, z: -1 };

      const entity = this.world.createEntity();
      this.world.addComponent(entity, 'Name', { value: asset.name });
      this.world.addComponent(entity, 'Transform', {
        position: spawnPos,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });

      if (asset.assetType === 'model') {
        this.world.addComponent(entity, 'GLTF', { src: asset.url });
      } else if (asset.assetType === 'texture') {
        // Create a quad with texture
        this.world.addComponent(entity, 'Render', { type: 'plane', texture: asset.url });
      }

      // Select the new entity
      this.selectionManager.select(entity);
    };

    this.marketplace = new MarketplacePanel(world, this.uiBuilder);

    // Handle Minting/Spawning
    this.marketplace.onSpawnNFT = (nft: NFTAsset) => {
      console.log('Spawning NFT:', nft.name);
      const spawnPos: Vector3 = { x: -0.5, y: 1.5, z: -1 };

      const entity = this.world.createEntity();
      this.world.addComponent(entity, 'Name', { value: nft.name });
      this.world.addComponent(entity, 'Transform', {
        position: spawnPos,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });

      // Web3 Trait
      this.world.addComponent(entity, 'Web3', {
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        chainId: nft.chainId,
        tokenType: 'ERC721',
      });

      // Visuals
      if (nft.modelUrl) {
        this.world.addComponent(entity, 'GLTF', { src: nft.modelUrl });
      } else {
        this.world.addComponent(entity, 'Render', { type: 'plane', texture: nft.imageUrl });
      }

      this.selectionManager.select(entity);
    };

    this.createSystemMenu();
  }

  private createSystemMenu() {
    // Create a floating menu for system operations
    const menuNode = createPanel({
      id: 'system_menu',
      width: 0.4,
      height: 0.15,
      position: { x: -0.5, y: 2.0, z: -1 }, // Above Inspector
      color: '#444',
    });

    this.systemMenuRoot = this.uiBuilder.spawn(menuNode);
    this.world.addTag(this.systemMenuRoot, 'NoSelect');

    // Save Button
    const saveBtn = createButton({
      text: 'Save',
      width: 0.1,
      height: 0.08,
      position: { x: -0.1, y: 0, z: 0.01 },
      color: '#28a745',
    });
    const saveEntity = this.uiBuilder.spawn(saveBtn, this.systemMenuRoot);
    this.world.addTag(saveEntity, 'UI_System_Save'); // Tag for interaction handling

    // Load Button
    const loadBtn = createButton({
      text: 'Load',
      width: 0.1,
      height: 0.08,
      position: { x: 0.1, y: 0, z: 0.01 },
      color: '#007bff',
    });
    const loadEntity = this.uiBuilder.spawn(loadBtn, this.systemMenuRoot);
    this.world.addTag(loadEntity, 'UI_System_Load');

    // Market Button
    const marketBtn = createButton({
      text: 'Market',
      width: 0.1,
      height: 0.08,
      position: { x: 0.2, y: 0, z: 0.01 }, // Right of Load
      color: '#8a2be2', // Violet
    });
    const marketEntity = this.uiBuilder.spawn(marketBtn, this.systemMenuRoot);
    this.world.addTag(marketEntity, 'UI_System_Market');
  }

  /**
   * Update loop for editor systems.
   * Should be called by the main Runtime loop if editor mode is active.
   */
  update(delta: number) {
    this.gizmoSystem.update(delta);
    this.inspectorPanel.rebuild();
    // AssetBrowser doesn't need per-frame update yet
  }

  /**
   * Handle interaction with an entity (e.g. click/trigger).
   */
  handleInteraction(entity: Entity) {
    // 1. Check System Menu
    if (this.world.hasTag(entity, 'UI_System_Save')) {
      this.persistence.save('latest'); // Hardcoded name for MVP
      return;
    }
    if (this.world.hasTag(entity, 'UI_System_Load')) {
      this.persistence.load('latest');
      return;
    }

    // Marketplace Toggle (Future: Add button)
    // For now, if user clicks specific market tag
    if (this.world.hasTag(entity, 'UI_System_Market')) {
      // Toggle visibility?
      // Currently panels are always spawned.
      // We just let them coexist.
      return;
    }

    // 2. Check Inspector UI
    this.inspectorPanel.handleInteraction(entity);

    // 3. Asset Browser
    // (AssetBrowserPanel handles its own interaction logic if we expose it,
    //  but currently it relies on simple callbacks.
    //  Wait, AssetBrowserPanel doesn't expose 'handleInteraction'.
    //  It just has callbacks on UI components?)
    //  Ah, UIBuilder components might not auto-fire callbacks if input system doesn't know them.
    //  Our `handleInteraction` here is the bridge.
    if (this.world.hasTag(entity, 'UI_Tab_Model')) this.assetBrowser.setTab('model');
    if (this.world.hasTag(entity, 'UI_Tab_Texture')) this.assetBrowser.setTab('texture');
    // Check asset items?
    // AssetBrowser added 'UIInteractive' component.
    // If InputSystem calls entity.components.UIInteractive.onClick(), we don't need manual dispatch.
    // But if `handleInteraction` is the ONLY input entry point...
    const interactive = this.world.getComponent<any>(entity, 'UIInteractive');
    if (interactive && interactive.onClick) {
      interactive.onClick();
      // Stop propagation?
      return;
    }

    // 3. Scene Handling (Selection) is via InputSystem -> SelectionManager
  }
}
