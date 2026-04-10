import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  HoloSmartAssetSchema,
  HoloSmartAssetMetadataSchema,
  HoloPhysicsPropertiesSchema,
  HoloAIBehaviorSchema,
} from '../schema/smart-asset';

describe('HoloSmartAsset Schema', () => {
  describe('HoloSmartAssetMetadataSchema', () => {
    it('should validate valid metadata', () => {
      const metadata = {
        name: 'Test Asset',
        version: '1.0.0',
      };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should validate metadata with all fields', () => {
      const metadata = {
        name: 'Complete Asset',
        version: '2.5.0',
        author: 'Test Author',
        description: 'A complete test asset',
        tags: ['vr', 'interactive', 'physics'],
        thumbnail: 'assets/thumbnail.png',
        license: 'MIT',
      };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should require name field', () => {
      const metadata = { version: '1.0.0' };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should require version field', () => {
      const metadata = { name: 'Test' };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should allow optional author', () => {
      const metadata = { name: 'Test', version: '1.0.0' };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should validate tags as string array', () => {
      const metadata = {
        name: 'Test',
        version: '1.0.0',
        tags: ['tag1', 'tag2'],
      };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should reject non-string tags', () => {
      const metadata = {
        name: 'Test',
        version: '1.0.0',
        tags: [1, 2, 3],
      };
      const result = HoloSmartAssetMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('HoloPhysicsPropertiesSchema', () => {
    it('should validate empty object', () => {
      const result = HoloPhysicsPropertiesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should validate physics with mass', () => {
      const physics = { mass: 10 };
      const result = HoloPhysicsPropertiesSchema.safeParse(physics);
      expect(result.success).toBe(true);
    });

    it('should validate all physics properties', () => {
      const physics = {
        mass: 50,
        friction: 0.5,
        restitution: 0.3,
        isStatic: false,
        colliderType: 'box',
      };
      const result = HoloPhysicsPropertiesSchema.safeParse(physics);
      expect(result.success).toBe(true);
    });

    it('should validate collider types', () => {
      const validTypes = ['box', 'sphere', 'capsule', 'mesh'];
      for (const type of validTypes) {
        const result = HoloPhysicsPropertiesSchema.safeParse({ colliderType: type });
        expect(result.success, `${type} should be valid`).toBe(true);
      }
    });

    it('should reject invalid collider type', () => {
      const physics = { colliderType: 'cylinder' };
      const result = HoloPhysicsPropertiesSchema.safeParse(physics);
      expect(result.success).toBe(false);
    });

    it('should validate boolean isStatic', () => {
      const physics1 = { isStatic: true };
      const physics2 = { isStatic: false };
      expect(HoloPhysicsPropertiesSchema.safeParse(physics1).success).toBe(true);
      expect(HoloPhysicsPropertiesSchema.safeParse(physics2).success).toBe(true);
    });

    it('should reject non-number mass', () => {
      const physics = { mass: 'heavy' };
      const result = HoloPhysicsPropertiesSchema.safeParse(physics);
      expect(result.success).toBe(false);
    });
  });

  describe('HoloAIBehaviorSchema', () => {
    it('should validate empty object', () => {
      const result = HoloAIBehaviorSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should validate with personality', () => {
      const ai = { personality: 'friendly merchant' };
      const result = HoloAIBehaviorSchema.safeParse(ai);
      expect(result.success).toBe(true);
    });

    it('should validate with interactions array', () => {
      const ai = {
        interactions: ['greet', 'trade', 'farewell'],
      };
      const result = HoloAIBehaviorSchema.safeParse(ai);
      expect(result.success).toBe(true);
    });

    it('should validate all AI properties', () => {
      const ai = {
        personality: 'helpful guide',
        interactions: ['help', 'explain', 'navigate'],
        knowledgeBaseId: 'kb-12345',
      };
      const result = HoloAIBehaviorSchema.safeParse(ai);
      expect(result.success).toBe(true);
    });

    it('should reject non-string interactions', () => {
      const ai = { interactions: [1, 2, 3] };
      const result = HoloAIBehaviorSchema.safeParse(ai);
      expect(result.success).toBe(false);
    });
  });

  describe('HoloSmartAssetSchema', () => {
    it('should validate minimal asset', () => {
      const asset = {
        metadata: {
          name: 'Minimal Asset',
          version: '1.0.0',
        },
        script: 'class Minimal {}',
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });

    it('should validate complete asset', () => {
      const asset = {
        metadata: {
          name: 'Complete Asset',
          version: '2.0.0',
          author: 'Test Corp',
          description: 'A fully configured asset',
          tags: ['complete', 'test'],
          license: 'MIT',
        },
        script: `
          class CompleteAsset {
            constructor() {
              this.health = 100;
            }
            takeDamage(amount) {
              this.health -= amount;
            }
          }
        `,
        physics: {
          mass: 25,
          friction: 0.4,
          restitution: 0.2,
          isStatic: false,
          colliderType: 'capsule',
        },
        ai: {
          personality: 'neutral entity',
          interactions: ['inspect', 'pick_up'],
        },
        dependencies: {
          'base-entity': '^1.0.0',
          'physics-utils': '^2.0.0',
        },
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });

    it('should require metadata', () => {
      const asset = {
        script: 'class Test {}',
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(false);
    });

    it('should require script', () => {
      const asset = {
        metadata: { name: 'Test', version: '1.0.0' },
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(false);
    });

    it('should allow optional physics', () => {
      const asset = {
        metadata: { name: 'No Physics', version: '1.0.0' },
        script: 'class Simple {}',
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });

    it('should allow optional ai', () => {
      const asset = {
        metadata: { name: 'No AI', version: '1.0.0' },
        script: 'class Dumb {}',
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });

    it('should validate dependencies as string record', () => {
      const asset = {
        metadata: { name: 'With Deps', version: '1.0.0' },
        script: 'class WithDeps {}',
        dependencies: {
          dep1: '1.0.0',
          dep2: '^2.0.0',
          dep3: '~3.0.0',
        },
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });

    it('should validate assets record with string values', () => {
      const asset = {
        metadata: { name: 'With Assets', version: '1.0.0' },
        script: 'class WithAssets {}',
        assets: {
          'textures/diffuse.png': 'base64encodeddata...',
          'audio/effect.mp3': 'base64audiodata...',
        },
      };
      const result = HoloSmartAssetSchema.safeParse(asset);
      expect(result.success).toBe(true);
    });
  });

  describe('Type inference', () => {
    it('should infer correct types from schema', () => {
      type InferredAsset = z.infer<typeof HoloSmartAssetSchema>;

      const asset: InferredAsset = {
        metadata: { name: 'Typed', version: '1.0.0' },
        script: 'class Typed {}',
      };

      expect(asset.metadata.name).toBe('Typed');
      expect(asset.script).toBe('class Typed {}');
    });
  });
});
