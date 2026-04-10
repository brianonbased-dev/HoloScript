import { describe, it, expect } from 'vitest';
import { HoloSmartAssetSchema } from '../src/schema/smart-asset';

describe('HoloSmartAsset Schema', () => {
  it('should validate a valid smart asset', () => {
    const validAsset = {
      metadata: {
        name: 'Test Asset',
        version: '1.0.0',
        author: 'Test User',
        description: 'A test asset',
        tags: ['test', 'unit'],
      },
      script: 'const x = 1;',
      physics: {
        mass: 10,
        isStatic: false,
        colliderType: 'box',
      },
      ai: {
        personality: 'helpful',
      },
      dependencies: {
        'some-lib': '1.2.3',
      },
    };

    const result = HoloSmartAssetSchema.safeParse(validAsset);
    expect(result.success).toBe(true);
  });

  it('should reject an invalid smart asset (missing metadata)', () => {
    const invalidAsset = {
      script: 'const x = 1;',
    };

    const result = HoloSmartAssetSchema.safeParse(invalidAsset);
    expect(result.success).toBe(false);
  });

  it('should validate an asset with minimal fields', () => {
    const minimalAsset = {
      metadata: {
        name: 'Minimal Asset',
        version: '0.0.1',
      },
      script: 'print("Hello");',
    };
    const result = HoloSmartAssetSchema.safeParse(minimalAsset);
    expect(result.success).toBe(true);
  });
});
