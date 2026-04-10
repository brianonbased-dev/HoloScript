import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoloHubClient } from '../holohub/client';

describe('HoloHubClient', () => {
  let client: HoloHubClient;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    client = new HoloHubClient();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = new HoloHubClient();
      expect(defaultClient).toBeDefined();
    });

    it('should accept custom endpoint', () => {
      const customClient = new HoloHubClient({
        endpoint: 'https://custom.holohub.io/v1',
      });
      expect(customClient).toBeDefined();
    });

    it('should accept API key', () => {
      const authClient = new HoloHubClient({
        apiKey: 'test-api-key-123',
      });
      expect(authClient).toBeDefined();
    });

    it('should include mock turret asset by default', async () => {
      const asset = await client.fetchAsset('turret-v1');
      expect(asset).not.toBeNull();
      expect(asset?.metadata.name).toBe('Standard Turret');
    });
  });

  describe('fetchAsset', () => {
    it('should return seeded mock asset', async () => {
      const asset = await client.fetchAsset('turret-v1');
      expect(asset).not.toBeNull();
      expect(asset?.metadata.name).toBe('Standard Turret');
      expect(asset?.metadata.version).toBe('1.0.0');
      expect(asset?.metadata.author).toBe('HoloCorp');
    });

    it('should return null for non-existent asset', async () => {
      const asset = await client.fetchAsset('nonexistent-asset');
      expect(asset).toBeNull();
    });

    it('should include physics properties on turret', async () => {
      const asset = await client.fetchAsset('turret-v1');
      expect(asset?.physics).toBeDefined();
      expect(asset?.physics?.mass).toBe(100);
      expect(asset?.physics?.isStatic).toBe(true);
      expect(asset?.physics?.colliderType).toBe('box');
    });

    it('should include script on turret', async () => {
      const asset = await client.fetchAsset('turret-v1');
      expect(asset?.script).toContain('Turret');
      expect(asset?.script).toContain('fire()');
    });
  });

  describe('publishAsset', () => {
    it('should publish new asset and return ID', async () => {
      const newAsset = {
        metadata: {
          name: 'Test Weapon',
          version: '1.0.0',
          author: 'Test Author',
          description: 'A test weapon',
        },
        script: 'class TestWeapon { attack() {} }',
        physics: {
          mass: 5,
          isStatic: false,
        },
      };

      const id = await client.publishAsset(newAsset);
      expect(id).toBe('test-weapon-1.0.0');

      // Verify it can be fetched
      const fetched = await client.fetchAsset(id);
      expect(fetched).not.toBeNull();
      expect(fetched?.metadata.name).toBe('Test Weapon');
    });

    it('should generate ID from name and version', async () => {
      const asset = {
        metadata: {
          name: 'My Cool Object',
          version: '2.5.0',
        },
        script: 'class MyObject {}',
      };

      const id = await client.publishAsset(asset);
      expect(id).toBe('my-cool-object-2.5.0');
    });

    it('should handle special characters in name', async () => {
      const asset = {
        metadata: {
          name: 'Special   Object!!!',
          version: '1.0.0',
        },
        script: 'class Special {}',
      };

      const id = await client.publishAsset(asset);
      expect(id).toContain('special');
      expect(id).toContain('object');
    });

    it('should overwrite existing asset with same ID', async () => {
      const asset1 = {
        metadata: {
          name: 'Duplicate',
          version: '1.0.0',
          description: 'First version',
        },
        script: 'class V1 {}',
      };

      const asset2 = {
        metadata: {
          name: 'Duplicate',
          version: '1.0.0',
          description: 'Second version',
        },
        script: 'class V2 {}',
      };

      await client.publishAsset(asset1);
      await client.publishAsset(asset2);

      const fetched = await client.fetchAsset('duplicate-1.0.0');
      expect(fetched?.metadata.description).toBe('Second version');
      expect(fetched?.script).toBe('class V2 {}');
    });
  });

  describe('searchAssets', () => {
    it('should find assets by name', async () => {
      const results = await client.searchAssets('turret');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.name).toBe('Standard Turret');
    });

    it('should find assets by description', async () => {
      const results = await client.searchAssets('defense');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', async () => {
      const results1 = await client.searchAssets('TURRET');
      const results2 = await client.searchAssets('turret');
      expect(results1.length).toBe(results2.length);
    });

    it('should return empty array for no matches', async () => {
      const results = await client.searchAssets('nonexistent-xyz-123');
      expect(results).toEqual([]);
    });

    it('should find published assets', async () => {
      await client.publishAsset({
        metadata: {
          name: 'Searchable Widget',
          version: '1.0.0',
          description: 'A unique searchable item',
        },
        script: 'class Widget {}',
      });

      const results = await client.searchAssets('searchable');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.metadata.name === 'Searchable Widget')).toBe(true);
    });

    it('should find assets by partial match', async () => {
      const results = await client.searchAssets('Standard');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('multiple clients', () => {
    it('should have isolated registries', async () => {
      const client1 = new HoloHubClient();
      const client2 = new HoloHubClient();

      await client1.publishAsset({
        metadata: { name: 'Client1 Asset', version: '1.0.0' },
        script: 'class C1 {}',
      });

      // Client2 should not see client1's published asset
      const results = await client2.searchAssets('Client1');
      expect(results.length).toBe(0);
    });
  });
});
