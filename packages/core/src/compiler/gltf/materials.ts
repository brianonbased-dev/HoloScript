/**
 * glTF Material Utilities
 *
 * Helper functions for creating and managing glTF PBR materials
 * from HoloScript object properties.
 */

export interface PBRMaterialConfig {
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  normalScale?: number;
  occlusionStrength?: number;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided: boolean;
  unlit?: boolean;
}

export interface GLTFMaterialOutput {
  name: string;
  pbrMetallicRoughness: {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
  };
  normalTexture?: { index: number; scale?: number };
  occlusionTexture?: { index: number; strength?: number };
  emissiveFactor?: [number, number, number];
  emissiveTexture?: { index: number };
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Named color palette for quick material creation
 */
export const NAMED_COLORS: Record<string, [number, number, number]> = {
  // Primary
  red: [1, 0, 0],
  green: [0, 0.8, 0],
  blue: [0, 0.4, 1],

  // Secondary
  yellow: [1, 1, 0],
  cyan: [0, 1, 1],
  magenta: [1, 0, 1],

  // Neutrals
  white: [1, 1, 1],
  black: [0, 0, 0],
  gray: [0.5, 0.5, 0.5],
  grey: [0.5, 0.5, 0.5],

  // Extended
  orange: [1, 0.5, 0],
  purple: [0.5, 0, 0.8],
  pink: [1, 0.7, 0.8],
  brown: [0.6, 0.3, 0.1],
  gold: [1, 0.84, 0],
  silver: [0.75, 0.75, 0.75],
  bronze: [0.8, 0.5, 0.2],

  // Materials
  wood: [0.6, 0.4, 0.2],
  metal: [0.7, 0.7, 0.75],
  glass: [0.9, 0.95, 1],
  water: [0.2, 0.4, 0.8],
  grass: [0.2, 0.6, 0.1],
  stone: [0.5, 0.5, 0.5],
  sand: [0.9, 0.85, 0.6],
  dirt: [0.4, 0.3, 0.2],
};

/**
 * Material presets for common use cases
 */
export const MATERIAL_PRESETS: Record<string, Partial<PBRMaterialConfig>> = {
  default: {
    metallic: 0,
    roughness: 0.5,
  },

  plastic: {
    metallic: 0,
    roughness: 0.4,
  },

  rubber: {
    metallic: 0,
    roughness: 0.9,
  },

  metal: {
    metallic: 1,
    roughness: 0.3,
  },

  chrome: {
    metallic: 1,
    roughness: 0.1,
  },

  brushedMetal: {
    metallic: 1,
    roughness: 0.5,
  },

  gold: {
    metallic: 1,
    roughness: 0.2,
    baseColor: [1, 0.84, 0, 1],
  },

  copper: {
    metallic: 1,
    roughness: 0.3,
    baseColor: [0.95, 0.64, 0.54, 1],
  },

  glass: {
    metallic: 0,
    roughness: 0.1,
    baseColor: [1, 1, 1, 0.2],
    alphaMode: 'BLEND',
  },

  mirror: {
    metallic: 1,
    roughness: 0,
  },

  matte: {
    metallic: 0,
    roughness: 1,
  },

  glossy: {
    metallic: 0,
    roughness: 0.1,
  },

  wood: {
    metallic: 0,
    roughness: 0.7,
    baseColor: [0.6, 0.4, 0.2, 1],
  },

  concrete: {
    metallic: 0,
    roughness: 0.95,
    baseColor: [0.6, 0.6, 0.6, 1],
  },

  fabric: {
    metallic: 0,
    roughness: 1,
  },

  leather: {
    metallic: 0,
    roughness: 0.6,
  },

  ceramic: {
    metallic: 0,
    roughness: 0.3,
  },

  marble: {
    metallic: 0,
    roughness: 0.2,
    baseColor: [0.95, 0.95, 0.95, 1],
  },

  emissive: {
    metallic: 0,
    roughness: 1,
    emissive: [1, 1, 1],
  },

  neon: {
    metallic: 0,
    roughness: 1,
    emissive: [1, 1, 1],
    baseColor: [0, 0, 0, 1],
  },
};

/**
 * Parse a color string to RGB values
 */
export function parseColor(color: string | number[]): [number, number, number] {
  if (Array.isArray(color)) {
    return [color[0] ?? 1, color[1] ?? 1, color[2] ?? 1];
  }

  // Named color
  const named = NAMED_COLORS[color.toLowerCase()];
  if (named) return named;

  // Hex color
  if (color.startsWith('#')) {
    return parseHexColor(color);
  }

  // RGB string: rgb(255, 128, 0)
  if (color.toLowerCase().startsWith('rgb')) {
    return parseRGBString(color);
  }

  // HSL string: hsl(180, 50%, 50%)
  if (color.toLowerCase().startsWith('hsl')) {
    return parseHSLString(color);
  }

  return [1, 1, 1];
}

/**
 * Parse hex color (#RRGGBB or #RGB)
 */
export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');

  let r: number, g: number, b: number;

  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16) / 255;
    g = parseInt(h[1] + h[1], 16) / 255;
    b = parseInt(h[2] + h[2], 16) / 255;
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
  } else {
    return [1, 1, 1];
  }

  return [r, g, b];
}

/**
 * Parse RGB string: rgb(255, 128, 0)
 */
export function parseRGBString(rgb: string): [number, number, number] {
  const match = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!match) return [1, 1, 1];

  return [parseInt(match[1], 10) / 255, parseInt(match[2], 10) / 255, parseInt(match[3], 10) / 255];
}

/**
 * Parse HSL string: hsl(180, 50%, 50%)
 */
export function parseHSLString(hsl: string): [number, number, number] {
  const match = hsl.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
  if (!match) return [1, 1, 1];

  const h = parseInt(match[1], 10) / 360;
  const s = parseInt(match[2], 10) / 100;
  const l = parseInt(match[3], 10) / 100;

  return hslToRgb(h, s, l);
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r, g, b];
}

/**
 * Convert RGB to linear color space (for glTF)
 */
export function sRGBToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convert linear to sRGB color space
 */
export function linearToSRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Create a glTF material from config
 */
export function createMaterial(name: string, config: PBRMaterialConfig): GLTFMaterialOutput {
  const material: GLTFMaterialOutput = {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: config.baseColor,
      metallicFactor: config.metallic,
      roughnessFactor: config.roughness,
    },
  };

  // Emissive
  const emissiveSum = config.emissive[0] + config.emissive[1] + config.emissive[2];
  if (emissiveSum > 0) {
    material.emissiveFactor = config.emissive;
  }

  // Alpha mode
  if (config.alphaMode !== 'OPAQUE') {
    material.alphaMode = config.alphaMode;
    if (config.alphaMode === 'MASK' && config.alphaCutoff !== undefined) {
      material.alphaCutoff = config.alphaCutoff;
    }
  }

  // Double-sided
  if (config.doubleSided) {
    material.doubleSided = true;
  }

  // Unlit extension
  if (config.unlit) {
    material.extensions = {
      KHR_materials_unlit: {},
    };
  }

  return material;
}

/**
 * Apply a material preset
 */
export function applyPreset(
  presetName: string,
  overrides: Partial<PBRMaterialConfig> = {}
): PBRMaterialConfig {
  const preset = MATERIAL_PRESETS[presetName] || MATERIAL_PRESETS.default;

  return {
    baseColor: overrides.baseColor ??
      (preset.baseColor as [number, number, number, number]) ?? [1, 1, 1, 1],
    metallic: overrides.metallic ?? preset.metallic ?? 0,
    roughness: overrides.roughness ?? preset.roughness ?? 0.5,
    emissive: overrides.emissive ?? (preset.emissive as [number, number, number]) ?? [0, 0, 0],
    alphaMode: overrides.alphaMode ?? preset.alphaMode ?? 'OPAQUE',
    alphaCutoff: overrides.alphaCutoff ?? preset.alphaCutoff,
    doubleSided: overrides.doubleSided ?? preset.doubleSided ?? false,
    normalScale: overrides.normalScale ?? preset.normalScale,
    occlusionStrength: overrides.occlusionStrength ?? preset.occlusionStrength,
    unlit: overrides.unlit ?? preset.unlit,
  };
}
