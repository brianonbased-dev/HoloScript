/**
 * @holoscript/sdk acceptance tests
 * Covers: Zod schemas (HoloSmartAssetMetadataSchema, HoloPhysicsPropertiesSchema,
 *         HoloAIBehaviorSchema) and HoloHubClient (constructor, fetchAsset,
 *         publishAsset, searchAssets)
 */
import { describe, it, expect } from 'vitest';
import {
  HoloSmartAssetMetadataSchema,
  HoloPhysicsPropertiesSchema,
  HoloAIBehaviorSchema,
} from '../schema/smart-asset';
import { HoloHubClient } from '../holohub/client';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HoloSmartAssetMetadataSchema
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloSmartAssetMetadataSchema', () => {
  it('is defined', () => {
    expect(HoloSmartAssetMetadataSchema).toBeDefined();
  });

  it('parses a minimal valid metadata', () => {
    const result = HoloSmartAssetMetadataSchema.safeParse({
      name: 'MyAsset',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('parses a full valid metadata', () => {
    const result = HoloSmartAssetMetadataSchema.safeParse({
      name: 'Turret',
      version: '2.1.0',
      author: 'HoloCorp',
      description: 'A defense turret',
      tags: ['defense', 'weapon'],
      thumbnail: '/assets/turret.png',
      license: 'MIT',
    });
    expect(result.success).toBe(true);
  });

  it('fails when name is missing', () => {
    const result = HoloSmartAssetMetadataSchema.safeParse({ version: '1.0.0' });
    expect(result.success).toBe(false);
  });

  it('fails when version is missing', () => {
    const result = HoloSmartAssetMetadataSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('tags field is optional', () => {
    const result = HoloSmartAssetMetadataSchema.safeParse({ name: 'A', version: '1.0.0' });
    expect(result.success).toBe(true);
  });

  it('author is optional', () => {
    const result = HoloSmartAssetMetadataSchema.safeParse({ name: 'A', version: '1.0.0' });
    expect(result.success).toBe(true);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HoloPhysicsPropertiesSchema
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloPhysicsPropertiesSchema', () => {
  it('is defined', () => {
    expect(HoloPhysicsPropertiesSchema).toBeDefined();
  });

  it('parses an empty object (all optional)', () => {
    const result = HoloPhysicsPropertiesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('parses valid physics properties', () => {
    const result = HoloPhysicsPropertiesSchema.safeParse({
      mass: 10,
      friction: 0.5,
      restitution: 0.3,
      isStatic: false,
      colliderType: 'box',
    });
    expect(result.success).toBe(true);
  });

  it('colliderType accepts "box", "sphere", "capsule", "mesh"', () => {
    for (const type of ['box', 'sphere', 'capsule', 'mesh']) {
      const result = HoloPhysicsPropertiesSchema.safeParse({ colliderType: type });
      expect(result.success).toBe(true);
    }
  });

  it('colliderType rejects invalid values', () => {
    const result = HoloPhysicsPropertiesSchema.safeParse({ colliderType: 'cylinder' });
    expect(result.success).toBe(false);
  });

  it('mass must be a number', () => {
    const result = HoloPhysicsPropertiesSchema.safeParse({ mass: 'heavy' });
    expect(result.success).toBe(false);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HoloAIBehaviorSchema
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloAIBehaviorSchema', () => {
  it('is defined', () => {
    expect(HoloAIBehaviorSchema).toBeDefined();
  });

  it('parses an empty object (all optional)', () => {
    expect(HoloAIBehaviorSchema.safeParse({}).success).toBe(true);
  });

  it('parses valid AI behavior config', () => {
    const result = HoloAIBehaviorSchema.safeParse({
      personality: 'friendly',
      interactions: ['wave', 'speak'],
      knowledgeBaseId: 'kb-123',
    });
    expect(result.success).toBe(true);
  });

  it('interactions must be an array of strings', () => {
    const result = HoloAIBehaviorSchema.safeParse({ interactions: 'not-an-array' });
    expect(result.success).toBe(false);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HoloHubClient
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloHubClient', () => {
  it('constructs with default config', () => {
    const client = new HoloHubClient();
    expect(client).toBeDefined();
  });

  it('constructs with custom config', () => {
    const client = new HoloHubClient({ apiKey: 'test-key', endpoint: 'http://localhost:3000' });
    expect(client).toBeDefined();
  });

  it('fetchAsset returns null for unknown ID', async () => {
    const client = new HoloHubClient();
    const asset = await client.fetchAsset('unknown-xyz');
    expect(asset).toBeNull();
  }, 2000);

  it('fetchAsset returns seeded "turret-v1" asset', async () => {
    const client = new HoloHubClient();
    const asset = await client.fetchAsset('turret-v1');
    expect(asset).not.toBeNull();
    expect(asset!.metadata.name).toBe('Standard Turret');
  }, 2000);

  it('published asset can be fetched back', async () => {
    const client = new HoloHubClient();
    const asset = {
      metadata: { name: 'Test Orb', version: '1.0.0', author: 'Dev' },
      script: 'sphere { @color(blue) }',
    };
    const id = await client.publishAsset(asset);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const fetched = await client.fetchAsset(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.metadata.name).toBe('Test Orb');
  }, 3000);

  it('publishAsset generates an ID from name and version', async () => {
    const client = new HoloHubClient();
    const id = await client.publishAsset({
      metadata: { name: 'Flying Box', version: '2.0.0' },
      script: 'cube {}',
    });
    expect(id).toBe('flying-box-2.0.0');
  }, 2000);

  it('searchAssets returns an array', async () => {
    const client = new HoloHubClient();
    const results = await client.searchAssets('turret');
    expect(Array.isArray(results)).toBe(true);
  }, 1000);

  it('searchAssets finds the seeded turret', async () => {
    const client = new HoloHubClient();
    const results = await client.searchAssets('turret');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.name).toContain('Turret');
  }, 1000);

  it('searchAssets returns empty array for unknown query', async () => {
    const client = new HoloHubClient();
    const results = await client.searchAssets('zzz-not-found-xyzzy');
    expect(results).toHaveLength(0);
  }, 1000);
});
