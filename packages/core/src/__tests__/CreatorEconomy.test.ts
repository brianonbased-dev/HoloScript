import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@holoscript/engine/ecs/World';
import { EditorUI } from '../editor/EditorUI';
import { Web3Provider } from '@holoscript/platform';
import { ReactiveState } from '../state/ReactiveState';
import { AssetRegistry } from '../assets/AssetRegistry';

describe('Creator Economy', () => {
  let world: World;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    world = new World(new ReactiveState());
  });

  it('should connect to mock provider', async () => {
    const provider = Web3Provider.getInstance();
    const address = await provider.connect();

    expect(provider.isConnected).toBe(true);
    expect(address).toContain('0x');
  });

  it('should fetch user assets', async () => {
    const provider = Web3Provider.getInstance();
    await provider.connect();
    const assets = await provider.getMyAssets();

    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0].chainId).toBe(8453); // Base
  });

  it('should spawn NFT via MarketplacePanel', async () => {
    const editor = new EditorUI(world);
    const marketplace = editor.marketplace;

    // Mock connection
    const provider = Web3Provider.getInstance();
    await provider.connect();

    const assets = await provider.getMyAssets();
    const nft = assets[0];

    // Listen for new entity
    const startCount = world.getAllEntities().length;

    // Trigger spawn
    if (marketplace.onSpawnNFT) {
      marketplace.onSpawnNFT(nft);
    } else {
      throw new Error('Callback not bound');
    }

    const endCount = world.getAllEntities().length;
    expect(endCount).toBeGreaterThan(startCount);

    // Verify Components
    const newEntity = editor.selectionManager.primary;
    expect(newEntity).toBeDefined();

    const web3 = world.getComponent<any>(newEntity!, 'Web3');
    expect(web3).toBeDefined();
    expect(web3.contractAddress).toBe(nft.contractAddress);
    expect(web3.chainId).toBe(nft.chainId);

    const gltf = world.getComponent<any>(newEntity!, 'GLTF');
    expect(gltf).toBeDefined(); // Assuming the mock asset has modelUrl
  });
});
