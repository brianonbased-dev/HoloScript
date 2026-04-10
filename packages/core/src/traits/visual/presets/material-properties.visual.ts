import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for material-properties traits (33 traits).
 * Maps natural material names to PBR properties.
 */
export const MATERIAL_PROPERTIES_VISUALS: Record<string, TraitVisualConfig> = {
  wooden: {
    material: { roughness: 0.8, metalness: 0.0, color: '#8B5E3C' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  stone_material: {
    material: { roughness: 0.85, metalness: 0.0, color: '#808080' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  brick: {
    material: { roughness: 0.9, metalness: 0.0, color: '#9B3A2E' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  concrete: {
    material: { roughness: 0.95, metalness: 0.0, color: '#A0A0A0' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  marble_material: {
    material: { roughness: 0.15, metalness: 0.0, color: '#F0EDE6', envMapIntensity: 0.8 },
    tags: ['mineral', 'polished'],
    layer: 'base_material',
  },
  granite: {
    material: { roughness: 0.6, metalness: 0.0, color: '#6B6B6B' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  sandstone: {
    material: { roughness: 0.9, metalness: 0.0, color: '#D4A76A' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  slate: {
    material: { roughness: 0.5, metalness: 0.0, color: '#4A5568' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  clay: {
    material: { roughness: 0.95, metalness: 0.0, color: '#B86B4A' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  terracotta: {
    material: { roughness: 0.85, metalness: 0.0, color: '#CC6644' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  glass_material: {
    material: { roughness: 0.0, metalness: 0.0, transmission: 0.95, ior: 1.5, transparent: true },
    tags: ['transparent', 'reflective'],
    layer: 'base_material',
  },
  stained_glass: {
    material: { roughness: 0.0, metalness: 0.0, transmission: 0.7, ior: 1.5, transparent: true },
    tags: ['transparent', 'colorful'],
    layer: 'base_material',
  },
  crystal_material: {
    material: { roughness: 0.0, metalness: 0.1, transmission: 0.9, ior: 2.0, iridescence: 1.0 },
    tags: ['transparent', 'reflective', 'gem'],
    layer: 'base_material',
  },
  ice_material: {
    material: {
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.8,
      ior: 1.31,
      color: '#D6EAF8',
      transparent: true,
    },
    tags: ['transparent', 'cold'],
    layer: 'base_material',
  },
  bone: {
    material: { roughness: 0.7, metalness: 0.0, color: '#E8DCC8' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  ivory: {
    material: { roughness: 0.3, metalness: 0.0, color: '#FFFFF0' },
    tags: ['organic', 'polished'],
    layer: 'base_material',
  },
  shell: {
    material: { roughness: 0.2, metalness: 0.1, color: '#FFF5EE', iridescence: 0.5 },
    tags: ['organic', 'iridescent'],
    layer: 'base_material',
  },
  coral: {
    material: { roughness: 0.8, metalness: 0.0, color: '#FF6F61' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  bamboo: {
    material: { roughness: 0.7, metalness: 0.0, color: '#A8C97F' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  paper: {
    material: { roughness: 1.0, metalness: 0.0, color: '#FAF0E6' },
    tags: ['organic', 'lightweight'],
    layer: 'base_material',
  },
  cardboard: {
    material: { roughness: 1.0, metalness: 0.0, color: '#C4A35A' },
    tags: ['organic', 'lightweight'],
    layer: 'base_material',
  },
  plastic: {
    material: { roughness: 0.5, metalness: 0.0, clearcoat: 0.1 },
    tags: ['synthetic', 'opaque'],
    layer: 'base_material',
  },
  resin: {
    material: {
      roughness: 0.1,
      metalness: 0.0,
      clearcoat: 0.5,
      color: '#FFD700',
      transparent: true,
      opacity: 0.85,
    },
    tags: ['synthetic', 'translucent'],
    layer: 'base_material',
  },
  wax: {
    material: { roughness: 0.6, metalness: 0.0, color: '#FFF8DC', transmission: 0.2 },
    tags: ['organic', 'translucent'],
    layer: 'base_material',
  },
  foam: {
    material: { roughness: 1.0, metalness: 0.0, color: '#F5F5F5' },
    tags: ['synthetic', 'lightweight'],
    layer: 'base_material',
  },
  composite: {
    material: { roughness: 0.4, metalness: 0.2, color: '#3C3C3C' },
    tags: ['synthetic', 'opaque'],
    layer: 'base_material',
  },
  carbon_fiber: {
    material: { roughness: 0.3, metalness: 0.4, color: '#1A1A1A', clearcoat: 0.8 },
    tags: ['synthetic', 'reflective'],
    layer: 'base_material',
  },
  kevlar: {
    material: { roughness: 0.7, metalness: 0.0, color: '#C8B400' },
    tags: ['synthetic', 'opaque'],
    layer: 'base_material',
  },
  fiberglass: {
    material: { roughness: 0.5, metalness: 0.0, color: '#E8E8D0' },
    tags: ['synthetic', 'opaque'],
    layer: 'base_material',
  },
  plaster: {
    material: { roughness: 0.95, metalness: 0.0, color: '#F5F5F0' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  concrete_reinforced: {
    material: { roughness: 0.9, metalness: 0.05, color: '#909090' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  thatch: {
    material: { roughness: 1.0, metalness: 0.0, color: '#C8A96E' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  adobe: {
    material: { roughness: 0.95, metalness: 0.0, color: '#C4956A' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // FABRICS — differentiated by sheen (Three.js meshPhysicalMaterial props)
  // =========================================================================
  cotton: {
    material: {
      roughness: 0.95,
      metalness: 0.0,
      sheen: 0.6,
      sheenRoughness: 0.9,
      sheenColor: '#ffffff',
    },
    tags: ['fabric', 'opaque'],
    layer: 'base_material',
  },
  polyester: {
    material: {
      roughness: 0.7,
      metalness: 0.0,
      sheen: 0.8,
      sheenRoughness: 0.4,
      sheenColor: '#e8e8e8',
    },
    tags: ['fabric', 'synthetic'],
    layer: 'base_material',
  },
  silk: {
    material: {
      roughness: 0.3,
      metalness: 0.0,
      sheen: 1.0,
      sheenRoughness: 0.2,
      sheenColor: '#fffaf0',
      anisotropy: 0.8,
    },
    tags: ['fabric', 'anisotropic'],
    layer: 'base_material',
  },
  satin: {
    material: {
      roughness: 0.25,
      metalness: 0.0,
      sheen: 0.9,
      sheenRoughness: 0.15,
      sheenColor: '#fff5ee',
      anisotropy: 0.6,
    },
    tags: ['fabric', 'anisotropic'],
    layer: 'base_material',
  },
  linen: {
    material: {
      roughness: 0.9,
      metalness: 0.0,
      sheen: 0.4,
      sheenRoughness: 0.85,
      sheenColor: '#f5f0e8',
    },
    tags: ['fabric', 'organic'],
    layer: 'base_material',
  },
  wool: {
    material: {
      roughness: 1.0,
      metalness: 0.0,
      sheen: 0.7,
      sheenRoughness: 1.0,
      sheenColor: '#e8dcc8',
    },
    tags: ['fabric', 'organic'],
    layer: 'base_material',
  },
  denim: {
    material: {
      roughness: 0.85,
      metalness: 0.0,
      color: '#2b4570',
      sheen: 0.5,
      sheenRoughness: 0.7,
      sheenColor: '#4a6fa5',
    },
    tags: ['fabric', 'opaque'],
    layer: 'base_material',
  },
  velvet: {
    material: {
      roughness: 1.0,
      metalness: 0.0,
      sheen: 1.0,
      sheenRoughness: 0.8,
      sheenColor: '#ffffff',
    },
    tags: ['fabric', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // SKIN & ORGANIC — subsurface scattering (thickness + attenuationColor)
  // =========================================================================
  skin: {
    material: {
      roughness: 0.5,
      metalness: 0.0,
      color: '#e8b89d',
      thickness: 0.8,
      attenuationColor: '#cc4422',
      attenuationDistance: 0.5,
    },
    tags: ['organic', 'sss'],
    layer: 'base_material',
  },
  candle_wax: {
    material: {
      roughness: 0.7,
      metalness: 0.0,
      color: '#fff8dc',
      thickness: 2.0,
      attenuationColor: '#ffaa44',
      attenuationDistance: 0.3,
      transmission: 0.15,
    },
    tags: ['organic', 'sss', 'translucent'],
    layer: 'base_material',
  },
  jade: {
    material: {
      roughness: 0.2,
      metalness: 0.0,
      color: '#00a86b',
      thickness: 1.5,
      attenuationColor: '#004d32',
      attenuationDistance: 1.0,
      transmission: 0.1,
    },
    tags: ['mineral', 'sss'],
    layer: 'base_material',
  },
  leaf: {
    material: {
      roughness: 0.6,
      metalness: 0.0,
      color: '#228b22',
      thickness: 0.3,
      attenuationColor: '#44cc22',
      attenuationDistance: 0.5,
    },
    tags: ['organic', 'sss'],
    layer: 'base_material',
  },

  // =========================================================================
  // MUD & EARTH — differentiated by roughness, color, wetness (clearcoat)
  // =========================================================================
  clay_mud: {
    material: {
      roughness: 0.95,
      metalness: 0.0,
      color: '#8b4513',
      thickness: 0.5,
      attenuationColor: '#663311',
      attenuationDistance: 0.8,
    },
    tags: ['earth', 'opaque'],
    layer: 'base_material',
  },
  sandy_mud: {
    material: { roughness: 0.85, metalness: 0.02, color: '#c2a66b' },
    tags: ['earth', 'opaque'],
    layer: 'base_material',
  },
  wet_mud: {
    material: {
      roughness: 0.4,
      metalness: 0.0,
      color: '#3d2b1f',
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    },
    tags: ['earth', 'wet'],
    layer: 'base_material',
  },
  dry_earth: {
    material: { roughness: 1.0, metalness: 0.0, color: '#9b7653' },
    tags: ['earth', 'opaque'],
    layer: 'base_material',
  },
  red_clay: {
    material: {
      roughness: 0.95,
      metalness: 0.0,
      color: '#cc4b2e',
      thickness: 0.4,
      attenuationColor: '#993322',
      attenuationDistance: 0.6,
    },
    tags: ['earth', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // BRUSHED METALS — anisotropy-driven
  // =========================================================================
  brushed_steel: {
    material: { roughness: 0.35, metalness: 1.0, color: '#c0c0c0', anisotropy: 0.7 },
    tags: ['metal', 'anisotropic'],
    layer: 'base_material',
  },
  brushed_aluminum: {
    material: { roughness: 0.3, metalness: 1.0, color: '#d0d0d0', anisotropy: 0.8 },
    tags: ['metal', 'anisotropic'],
    layer: 'base_material',
  },
  cast_iron: {
    material: { roughness: 0.7, metalness: 0.9, color: '#3a3a3a' },
    tags: ['metal', 'opaque'],
    layer: 'base_material',
  },
  rust: {
    material: { roughness: 0.9, metalness: 0.3, color: '#8b3a15' },
    tags: ['metal', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // COATED SURFACES — clearcoat-driven
  // =========================================================================
  car_paint: {
    material: { roughness: 0.1, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
    tags: ['synthetic', 'coated'],
    layer: 'base_material',
  },
  varnished_wood: {
    material: {
      roughness: 0.3,
      metalness: 0.0,
      color: '#8b5e3c',
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    },
    tags: ['organic', 'coated'],
    layer: 'base_material',
  },
  glazed_ceramic: {
    material: {
      roughness: 0.15,
      metalness: 0.0,
      color: '#f0ede6',
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
    },
    tags: ['mineral', 'coated'],
    layer: 'base_material',
  },

  // =========================================================================
  // IRIDESCENT — thin-film interference
  // =========================================================================
  oil_slick: {
    material: { roughness: 0.0, metalness: 0.1, color: '#1a1a2e', iridescence: 1.0 },
    tags: ['iridescent', 'reflective'],
    layer: 'base_material',
  },
  pearl: {
    material: {
      roughness: 0.15,
      metalness: 0.0,
      color: '#fdeef4',
      iridescence: 0.6,
      sheen: 0.3,
      sheenRoughness: 0.2,
      sheenColor: '#fff0f5',
    },
    tags: ['organic', 'iridescent'],
    layer: 'base_material',
  },
  soap_bubble: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.9,
      transparent: true,
      opacity: 0.3,
      iridescence: 1.0,
    },
    tags: ['transparent', 'iridescent'],
    layer: 'base_material',
  },

  // =========================================================================
  // GEMSTONES — transmission + IOR
  // =========================================================================
  diamond: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      color: '#ffffff',
      transmission: 0.95,
      ior: 2.417,
      thickness: 0.5,
      transparent: true,
    },
    tags: ['transparent', 'gem'],
    layer: 'base_material',
  },
  ruby: {
    material: {
      roughness: 0.05,
      metalness: 0.0,
      color: '#e0115f',
      transmission: 0.4,
      ior: 1.76,
      thickness: 1.0,
    },
    tags: ['transparent', 'gem'],
    layer: 'base_material',
  },
  sapphire: {
    material: {
      roughness: 0.05,
      metalness: 0.0,
      color: '#0f52ba',
      transmission: 0.4,
      ior: 1.77,
      thickness: 1.0,
    },
    tags: ['transparent', 'gem'],
    layer: 'base_material',
  },
  emerald: {
    material: {
      roughness: 0.1,
      metalness: 0.0,
      color: '#50c878',
      transmission: 0.3,
      ior: 1.57,
      thickness: 1.2,
    },
    tags: ['transparent', 'gem'],
    layer: 'base_material',
  },
  amber_gem: {
    material: {
      roughness: 0.1,
      metalness: 0.0,
      color: '#ffbf00',
      transmission: 0.6,
      ior: 1.55,
      thickness: 2.0,
      transparent: true,
      attenuationColor: '#cc6600',
      attenuationDistance: 1.0,
    },
    tags: ['transparent', 'gem', 'sss'],
    layer: 'base_material',
  },
  opal_gem: {
    material: {
      roughness: 0.15,
      metalness: 0.0,
      color: '#e8e0d0',
      iridescence: 0.9,
      transmission: 0.1,
      ior: 1.45,
    },
    tags: ['iridescent', 'gem'],
    layer: 'base_material',
  },
  amethyst: {
    material: {
      roughness: 0.05,
      metalness: 0.0,
      color: '#9966cc',
      transmission: 0.5,
      ior: 1.54,
      transparent: true,
    },
    tags: ['transparent', 'gem'],
    layer: 'base_material',
  },
  obsidian: {
    material: { roughness: 0.05, metalness: 0.0, color: '#0b0b0b', envMapIntensity: 1.2 },
    tags: ['mineral', 'reflective'],
    layer: 'base_material',
  },
  turquoise: {
    material: { roughness: 0.6, metalness: 0.0, color: '#40e0d0' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // MORE METALS
  // =========================================================================
  titanium: {
    material: { roughness: 0.25, metalness: 1.0, color: '#878681' },
    tags: ['metal', 'opaque'],
    layer: 'base_material',
  },
  tungsten: {
    material: { roughness: 0.3, metalness: 1.0, color: '#696969' },
    tags: ['metal', 'opaque'],
    layer: 'base_material',
  },
  brass: {
    material: { roughness: 0.35, metalness: 1.0, color: '#b5a642' },
    tags: ['metal', 'opaque'],
    layer: 'base_material',
  },
  mercury_metal: {
    material: { roughness: 0.0, metalness: 1.0, color: '#d4d4d4', envMapIntensity: 2.0 },
    tags: ['metal', 'reflective'],
    layer: 'base_material',
  },

  // =========================================================================
  // NATURAL / WEATHER
  // =========================================================================
  snow: {
    material: {
      roughness: 0.8,
      metalness: 0.0,
      color: '#f0f8ff',
      thickness: 0.5,
      attenuationColor: '#c8e0ff',
      attenuationDistance: 2.0,
    },
    tags: ['natural', 'sss'],
    layer: 'base_material',
  },
  frost: {
    material: {
      roughness: 0.3,
      metalness: 0.0,
      color: '#e8f4f8',
      transmission: 0.15,
      ior: 1.31,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1,
    },
    tags: ['natural', 'transparent'],
    layer: 'base_material',
  },
  moss: {
    material: {
      roughness: 1.0,
      metalness: 0.0,
      color: '#4a7c3f',
      sheen: 0.2,
      sheenRoughness: 1.0,
      sheenColor: '#5a9c4f',
    },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  bark: {
    material: { roughness: 0.95, metalness: 0.0, color: '#5c4033' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // AGED / WEATHERED
  // =========================================================================
  patina: {
    material: { roughness: 0.6, metalness: 0.4, color: '#4a9c7e' },
    tags: ['metal', 'aged'],
    layer: 'condition',
  },
  tarnished_silver: {
    material: { roughness: 0.5, metalness: 0.7, color: '#8a8a7a' },
    tags: ['metal', 'aged'],
    layer: 'condition',
  },
  oxidized_copper: {
    material: { roughness: 0.65, metalness: 0.5, color: '#2e8b57' },
    tags: ['metal', 'aged'],
    layer: 'condition',
  },

  // =========================================================================
  // CONSTRUCTION
  // =========================================================================
  asphalt: {
    material: { roughness: 0.9, metalness: 0.0, color: '#3a3a3a' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  cement: {
    material: { roughness: 0.85, metalness: 0.0, color: '#a0a0a0' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  tile_ceramic: {
    material: {
      roughness: 0.2,
      metalness: 0.0,
      color: '#e8e0d0',
      clearcoat: 0.6,
      clearcoatRoughness: 0.05,
    },
    tags: ['mineral', 'coated'],
    layer: 'base_material',
  },
  drywall: {
    material: { roughness: 1.0, metalness: 0.0, color: '#f0ece0' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },
  stucco: {
    material: { roughness: 0.95, metalness: 0.0, color: '#e8dcc8' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // LEATHER VARIANTS
  // =========================================================================
  suede: {
    material: {
      roughness: 1.0,
      metalness: 0.0,
      color: '#8b6914',
      sheen: 0.6,
      sheenRoughness: 1.0,
      sheenColor: '#a07828',
    },
    tags: ['fabric', 'organic'],
    layer: 'base_material',
  },
  patent_leather: {
    material: {
      roughness: 0.05,
      metalness: 0.0,
      color: '#1a1a1a',
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
    },
    tags: ['synthetic', 'coated'],
    layer: 'base_material',
  },
  nubuck: {
    material: {
      roughness: 0.95,
      metalness: 0.0,
      color: '#c8a882',
      sheen: 0.5,
      sheenRoughness: 0.9,
      sheenColor: '#d4b892',
    },
    tags: ['fabric', 'organic'],
    layer: 'base_material',
  },

  // =========================================================================
  // RUBBER VARIANTS
  // =========================================================================
  silicone: {
    material: {
      roughness: 0.6,
      metalness: 0.0,
      color: '#e0e0e0',
      thickness: 0.5,
      attenuationColor: '#cccccc',
      attenuationDistance: 1.0,
    },
    tags: ['synthetic', 'sss'],
    layer: 'base_material',
  },
  latex: {
    material: {
      roughness: 0.3,
      metalness: 0.0,
      color: '#ffefd5',
      clearcoat: 0.5,
      clearcoatRoughness: 0.1,
      thickness: 0.3,
      attenuationColor: '#ffcc88',
      attenuationDistance: 0.5,
    },
    tags: ['synthetic', 'coated'],
    layer: 'base_material',
  },

  // =========================================================================
  // LIQUIDS — surface appearance
  // =========================================================================
  lava: {
    material: {
      roughness: 0.8,
      metalness: 0.0,
      color: '#ff4400',
      emissive: '#ff2200',
      emissiveIntensity: 3.0,
    },
    tags: ['emissive', 'hot'],
    layer: 'base_material',
  },
  blood: {
    material: {
      roughness: 0.2,
      metalness: 0.0,
      color: '#8b0000',
      clearcoat: 0.7,
      clearcoatRoughness: 0.05,
      thickness: 1.0,
      attenuationColor: '#440000',
      attenuationDistance: 0.3,
    },
    tags: ['organic', 'wet'],
    layer: 'base_material',
  },
  molten_metal: {
    material: {
      roughness: 0.15,
      metalness: 0.8,
      color: '#ff8c00',
      emissive: '#ff6600',
      emissiveIntensity: 5.0,
    },
    tags: ['metal', 'emissive', 'hot'],
    layer: 'base_material',
  },

  // =========================================================================
  // BLACKBODY / THERMAL
  // =========================================================================
  ember: {
    material: {
      roughness: 0.9,
      metalness: 0.0,
      color: '#2a0a00',
      emissive: '#ff4400',
      emissiveIntensity: 2.0,
    },
    tags: ['emissive', 'hot'],
    layer: 'base_material',
  },
  coal: {
    material: {
      roughness: 0.85,
      metalness: 0.0,
      color: '#1a1a1a',
      emissive: '#cc2200',
      emissiveIntensity: 0.5,
    },
    tags: ['mineral', 'emissive'],
    layer: 'base_material',
  },

  // =========================================================================
  // SPECIAL EFFECTS
  // =========================================================================
  glitter: {
    material: { roughness: 0.2, metalness: 0.8, color: '#ffd700', envMapIntensity: 2.0 },
    tags: ['reflective', 'sparkle'],
    layer: 'base_material',
  },
  fluorescent_material: {
    material: {
      roughness: 0.5,
      metalness: 0.0,
      color: '#39ff14',
      emissive: '#39ff14',
      emissiveIntensity: 1.5,
    },
    tags: ['emissive', 'fluorescent'],
    layer: 'base_material',
  },
  glow_in_dark: {
    material: {
      roughness: 0.7,
      metalness: 0.0,
      color: '#2a3a2a',
      emissive: '#44ff44',
      emissiveIntensity: 0.8,
    },
    tags: ['emissive', 'phosphorescent'],
    layer: 'base_material',
  },

  // =========================================================================
  // MISC — common real-world materials
  // =========================================================================
  porcelain: {
    material: {
      roughness: 0.1,
      metalness: 0.0,
      color: '#f8f4f0',
      clearcoat: 0.7,
      clearcoatRoughness: 0.02,
    },
    tags: ['mineral', 'coated'],
    layer: 'base_material',
  },
  cork: {
    material: { roughness: 0.95, metalness: 0.0, color: '#b88a50' },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  felt: {
    material: {
      roughness: 1.0,
      metalness: 0.0,
      color: '#5a8a5a',
      sheen: 0.4,
      sheenRoughness: 1.0,
      sheenColor: '#6a9a6a',
    },
    tags: ['fabric', 'opaque'],
    layer: 'base_material',
  },
  rope: {
    material: {
      roughness: 1.0,
      metalness: 0.0,
      color: '#c4a35a',
      sheen: 0.2,
      sheenRoughness: 1.0,
      sheenColor: '#b89848',
    },
    tags: ['organic', 'opaque'],
    layer: 'base_material',
  },
  parchment: {
    material: {
      roughness: 0.8,
      metalness: 0.0,
      color: '#f0e6c8',
      thickness: 0.1,
      attenuationColor: '#d4c0a0',
      attenuationDistance: 0.2,
    },
    tags: ['organic', 'sss'],
    layer: 'base_material',
  },
  charcoal: {
    material: { roughness: 0.9, metalness: 0.0, color: '#1a1a1a' },
    tags: ['mineral', 'opaque'],
    layer: 'base_material',
  },

  // =========================================================================
  // ANIMATED MATERIALS — time-driven surface effects
  // =========================================================================
  flowing_water: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      color: '#006994',
      transmission: 0.85,
      ior: 1.33,
      transparent: true,
    },
    tags: ['liquid', 'animated', 'transparent'],
    layer: 'base_material',
  },
  rippling_water: {
    material: {
      roughness: 0.05,
      metalness: 0.0,
      color: '#005577',
      transmission: 0.8,
      ior: 1.33,
      transparent: true,
    },
    tags: ['liquid', 'animated', 'transparent'],
    layer: 'base_material',
  },
  flickering_fire: {
    material: {
      roughness: 0.8,
      metalness: 0.0,
      color: '#ff4400',
      emissive: '#ff2200',
      emissiveIntensity: 3.0,
    },
    emissive: { color: '#ff2200', intensity: 3.0 },
    tags: ['emissive', 'animated', 'thermal'],
    layer: 'visual_effect',
  },
  pulsing_glow: {
    material: { roughness: 0.5, metalness: 0.0, emissive: '#00ff88', emissiveIntensity: 2.0 },
    emissive: { color: '#00ff88', intensity: 2.0 },
    tags: ['emissive', 'animated'],
    layer: 'lighting',
  },
  breathing_light: {
    material: { roughness: 0.3, metalness: 0.0, emissive: '#4488ff', emissiveIntensity: 1.5 },
    emissive: { color: '#4488ff', intensity: 1.5 },
    tags: ['emissive', 'animated'],
    layer: 'lighting',
  },
  scrolling_lava: {
    material: {
      roughness: 0.8,
      metalness: 0.0,
      color: '#ff4400',
      emissive: '#ff2200',
      emissiveIntensity: 4.0,
    },
    emissive: { color: '#ff2200', intensity: 4.0 },
    tags: ['emissive', 'animated', 'thermal'],
    layer: 'visual_effect',
  },
  flickering_neon: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      emissive: '#ff00ff',
      emissiveIntensity: 3.5,
      transparent: true,
      opacity: 0.9,
    },
    emissive: { color: '#ff00ff', intensity: 3.5 },
    tags: ['emissive', 'animated', 'transparent'],
    layer: 'visual_effect',
  },
  shimmer_heat: {
    material: { roughness: 0.0, metalness: 0.0, transparent: true, opacity: 0.15 },
    tags: ['animated', 'transparent', 'atmospheric'],
    layer: 'environmental',
  },

  // =========================================================================
  // VOLUMETRIC MATERIALS — non-surface phenomena
  // =========================================================================
  fog: {
    material: { roughness: 0.0, metalness: 0.0, color: '#c0c0c0', transparent: true, opacity: 0.3 },
    tags: ['volumetric', 'atmospheric', 'transparent'],
    layer: 'environmental',
  },
  dense_fog: {
    material: { roughness: 0.0, metalness: 0.0, color: '#a0a0a0', transparent: true, opacity: 0.5 },
    tags: ['volumetric', 'atmospheric', 'transparent'],
    layer: 'environmental',
  },
  smoke_visual: {
    material: { roughness: 0.0, metalness: 0.0, color: '#404040', transparent: true, opacity: 0.4 },
    tags: ['volumetric', 'animated', 'transparent'],
    layer: 'visual_effect',
  },
  fire_volume: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      color: '#ff4400',
      emissive: '#ff2200',
      emissiveIntensity: 4.0,
      transparent: true,
      opacity: 0.7,
    },
    emissive: { color: '#ff2200', intensity: 4.0 },
    tags: ['volumetric', 'emissive', 'animated', 'thermal'],
    layer: 'visual_effect',
  },
  clouds_visual: {
    material: { roughness: 0.0, metalness: 0.0, color: '#ffffff', transparent: true, opacity: 0.6 },
    tags: ['volumetric', 'atmospheric', 'transparent'],
    layer: 'environmental',
  },
  mist: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      color: '#e0e8f0',
      transparent: true,
      opacity: 0.25,
    },
    tags: ['volumetric', 'atmospheric', 'transparent'],
    layer: 'environmental',
  },
  steam: {
    material: { roughness: 0.0, metalness: 0.0, color: '#e8e8e8', transparent: true, opacity: 0.3 },
    tags: ['volumetric', 'animated', 'transparent'],
    layer: 'visual_effect',
  },
  aurora_borealis: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      emissive: '#00ff88',
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.3,
    },
    emissive: { color: '#00ff88', intensity: 2.0 },
    tags: ['volumetric', 'emissive', 'animated'],
    layer: 'visual_effect',
  },
  nebula: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      emissive: '#ff44aa',
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.4,
    },
    emissive: { color: '#ff44aa', intensity: 1.5 },
    tags: ['volumetric', 'emissive'],
    layer: 'visual_effect',
  },
  god_rays: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      color: '#ffffd0',
      emissive: '#ffff88',
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.15,
    },
    emissive: { color: '#ffff88', intensity: 0.5 },
    tags: ['volumetric', 'atmospheric', 'transparent'],
    layer: 'lighting',
  },
  neon_gas: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      emissive: '#ff4400',
      emissiveIntensity: 3.0,
      transparent: true,
      opacity: 0.5,
    },
    emissive: { color: '#ff4400', intensity: 3.0 },
    tags: ['volumetric', 'emissive'],
    layer: 'visual_effect',
  },
  magical_mist: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      emissive: '#8844ff',
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.3,
    },
    emissive: { color: '#8844ff', intensity: 1.5 },
    tags: ['volumetric', 'emissive', 'animated'],
    layer: 'visual_effect',
  },
};
