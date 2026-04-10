/**
 * @holoscript/core Asset Aliases
 *
 * Semantic mapping layer that translates common AI requests or descriptive names
 * into specific asset IDs, paths, or URLs. This decouples AI generation from
 * physical asset storage.
 */

export const DEFAULT_ASSET_ALIASES: Record<string, string> = {
  // Nature
  tree: 'nature/oak_tree_v1',
  pine: 'nature/pine_evergreen_01',
  rock: 'nature/granite_rock_01',
  bush: 'nature/hedge_shrub_01',
  grass: 'nature/grass_clump_01',
  flower: 'nature/wildflower_blue_01',

  // Architecture/Props
  bench: 'props/park_bench_wood',
  lamp: 'props/street_lamp_deco',
  fountain: 'props/fountain_art_deco',
  arch: 'props/deco_arch_stone',
  dome: 'props/glass_dome_gold',

  // Characters
  human_male: 'characters/base_male_rigged',
  human_female: 'characters/base_female_rigged',
  robot: 'characters/droid_worker_01',
  brittney: 'characters/brittney_v4_rigged',
  avatar: 'characters/base_avatar_01',

  // Structures
  shop: 'buildings/shop_front_01',
  house: 'buildings/cottage_solarpunk_01',
  tower: 'buildings/tech_spire_01',
};

/**
 * Resolves an alias to its target asset ID.
 * Returns the original name if no alias is found.
 */
export function resolveAssetAlias(name: string, customAliases?: Record<string, string>): string {
  const normalized = name.toLowerCase();

  // Check custom aliases first
  if (customAliases && customAliases[normalized]) {
    return customAliases[normalized];
  }

  // Check default aliases
  if (DEFAULT_ASSET_ALIASES[normalized]) {
    return DEFAULT_ASSET_ALIASES[normalized];
  }

  return name;
}
