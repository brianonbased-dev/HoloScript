import { describe, it, expect } from 'vitest';
import { resolveAssetAlias, DEFAULT_ASSET_ALIASES } from '../AssetAliases';

describe('AssetAliases', () => {
  it('resolves known alias', () => {
    expect(resolveAssetAlias('tree')).toBe('nature/oak_tree_v1');
  });

  it('resolves case-insensitively', () => {
    expect(resolveAssetAlias('Tree')).toBe('nature/oak_tree_v1');
    expect(resolveAssetAlias('ROCK')).toBe('nature/granite_rock_01');
  });

  it('returns original for unknown alias', () => {
    expect(resolveAssetAlias('nonexistent_thing')).toBe('nonexistent_thing');
  });

  it('custom aliases override defaults', () => {
    const custom = { tree: 'custom/my_tree' };
    expect(resolveAssetAlias('tree', custom)).toBe('custom/my_tree');
  });

  it('custom aliases checked first', () => {
    const custom = { rock: 'custom_rock' };
    expect(resolveAssetAlias('rock', custom)).toBe('custom_rock');
  });

  it('falls through to defaults if custom has no match', () => {
    const custom = { something_else: 'val' };
    expect(resolveAssetAlias('tree', custom)).toBe('nature/oak_tree_v1');
  });

  it('DEFAULT_ASSET_ALIASES has expected keys', () => {
    expect(DEFAULT_ASSET_ALIASES).toHaveProperty('tree');
    expect(DEFAULT_ASSET_ALIASES).toHaveProperty('robot');
    expect(DEFAULT_ASSET_ALIASES).toHaveProperty('house');
  });
});
