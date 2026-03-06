/**
 * AssetAliases — Production Tests
 */

import { describe, it, expect } from 'vitest';
import { resolveAssetAlias, DEFAULT_ASSET_ALIASES } from '../AssetAliases';

// =============================================================================
// DEFAULT_ASSET_ALIASES shape
// =============================================================================

describe('DEFAULT_ASSET_ALIASES', () => {
  it('contains nature category entries', () => {
    expect(DEFAULT_ASSET_ALIASES.tree).toBe('nature/oak_tree_v1');
    expect(DEFAULT_ASSET_ALIASES.rock).toBe('nature/granite_rock_01');
    expect(DEFAULT_ASSET_ALIASES.grass).toBe('nature/grass_clump_01');
  });

  it('contains architecture/props entries', () => {
    expect(DEFAULT_ASSET_ALIASES.bench).toBe('props/park_bench_wood');
    expect(DEFAULT_ASSET_ALIASES.lamp).toBe('props/street_lamp_deco');
    expect(DEFAULT_ASSET_ALIASES.fountain).toBe('props/fountain_art_deco');
  });

  it('contains character entries', () => {
    expect(DEFAULT_ASSET_ALIASES.human_male).toBe('characters/base_male_rigged');
    expect(DEFAULT_ASSET_ALIASES.brittney).toBe('characters/brittney_v4_rigged');
    expect(DEFAULT_ASSET_ALIASES.robot).toBe('characters/droid_worker_01');
  });

  it('contains structure entries', () => {
    expect(DEFAULT_ASSET_ALIASES.house).toBe('buildings/cottage_solarpunk_01');
    expect(DEFAULT_ASSET_ALIASES.tower).toBe('buildings/tech_spire_01');
  });

  it('has at least 15 aliases total', () => {
    expect(Object.keys(DEFAULT_ASSET_ALIASES).length).toBeGreaterThanOrEqual(15);
  });
});

// =============================================================================
// resolveAssetAlias — default aliases
// =============================================================================

describe('resolveAssetAlias — default aliases', () => {
  it('resolves known alias (tree)', () => {
    expect(resolveAssetAlias('tree')).toBe('nature/oak_tree_v1');
  });

  it('resolves known alias (bench)', () => {
    expect(resolveAssetAlias('bench')).toBe('props/park_bench_wood');
  });

  it('resolves known alias (human_male)', () => {
    expect(resolveAssetAlias('human_male')).toBe('characters/base_male_rigged');
  });

  it('normalizes to lowercase for resolution', () => {
    expect(resolveAssetAlias('TREE')).toBe('nature/oak_tree_v1');
    expect(resolveAssetAlias('Tree')).toBe('nature/oak_tree_v1');
    expect(resolveAssetAlias('TrEe')).toBe('nature/oak_tree_v1');
  });

  it('returns original name when alias not found', () => {
    expect(resolveAssetAlias('does_not_exist')).toBe('does_not_exist');
  });

  it('returns empty string unchanged if empty string passed', () => {
    expect(resolveAssetAlias('')).toBe('');
  });

  it('returns path-like strings unchanged', () => {
    expect(resolveAssetAlias('models/custom_rock.glb')).toBe('models/custom_rock.glb');
  });
});

// =============================================================================
// resolveAssetAlias — custom aliases
// =============================================================================

describe('resolveAssetAlias — custom aliases', () => {
  it('custom alias takes priority over default alias', () => {
    const custom = { tree: 'custom/special_tree' };
    expect(resolveAssetAlias('tree', custom)).toBe('custom/special_tree');
  });

  it('falls through to default when not in custom', () => {
    const custom = { dragon: 'creatures/dragon_01' };
    expect(resolveAssetAlias('tree', custom)).toBe('nature/oak_tree_v1');
  });

  it('resolves custom-only alias', () => {
    const custom = { portal: 'fx/magic_portal_v2' };
    expect(resolveAssetAlias('portal', custom)).toBe('fx/magic_portal_v2');
  });

  it('custom alias also normalized to lowercase', () => {
    const custom = { crystal: 'gems/crystal_raw' };
    expect(resolveAssetAlias('CRYSTAL', custom)).toBe('gems/crystal_raw');
  });

  it('returns original name if not in custom or default', () => {
    const custom = { x: 'y' };
    expect(resolveAssetAlias('unknown', custom)).toBe('unknown');
  });

  it('works with empty custom aliases', () => {
    expect(resolveAssetAlias('rock', {})).toBe('nature/granite_rock_01');
  });
});
