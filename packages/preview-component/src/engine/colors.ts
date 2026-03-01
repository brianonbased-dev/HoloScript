/**
 * Color name resolution for HoloScript.
 * Maps named colors to hex values used by Three.js materials.
 */

const COLOR_MAP: Record<string, number> = {
  red: 0xe53935,
  green: 0x43a047,
  blue: 0x1e88e5,
  yellow: 0xfdd835,
  cyan: 0x00acc1,
  magenta: 0xd81b60,
  white: 0xfafafa,
  black: 0x212121,
  gray: 0x757575,
  grey: 0x757575,
  purple: 0x8e24aa,
  orange: 0xfb8c00,
  pink: 0xf06292,
  gold: 0xffc107,
  silver: 0xbdbdbd,
  bronze: 0xcd7f32,
  copper: 0xb87333,
  teal: 0x00897b,
  indigo: 0x5c6bc0,
  lime: 0xc0ca33,
  coral: 0xff7043,
  navy: 0x283593,
  sky: 0x4fc3f7,
  forest: 0x2e7d32,
  rose: 0xec407a,
  ice: 0xe1f5fe,
  lava: 0xff5722,
  neon: 0x39ff14,
  plasma: 0xff073a,
  hologram: 0x00fff7,
  energy: 0xffea00,
  crystal: 0xb3e5fc,
  nebula: 0x7b1fa2,
};

const DEFAULT_COLOR = 0x4a9eff;

/**
 * Resolve a color string to a hex number.
 * Supports named colors, hex strings (with or without #), and falls back to default.
 */
export function resolveColor(colorStr: string | undefined | null): number {
  if (!colorStr) return DEFAULT_COLOR;

  const cleaned = colorStr.toLowerCase().replace(/['"#]/g, '');

  // Check for 6-digit hex
  if (/^[0-9a-f]{6}$/.test(cleaned)) {
    return parseInt(cleaned, 16);
  }

  // Check named colors
  return COLOR_MAP[cleaned] ?? DEFAULT_COLOR;
}

/**
 * Skybox gradient presets.
 * Each preset defines [top, middle, bottom] colors for a vertical gradient.
 */
export const SKYBOX_GRADIENTS: Record<string, [number, number, number]> = {
  sunset: [0xffd27f, 0xff6b6b, 0x1a0a3e],
  night: [0x0a0a1a, 0x0f0f2a, 0x1a1a3e],
  nebula: [0x7b1fa2, 0x4a148c, 0x0a0a1a],
  sky: [0x87ceeb, 0x4fc3f7, 0xffffff],
  underwater: [0x006994, 0x003d5b, 0x001524],
  void: [0x0a0a0f, 0x0a0a0f, 0x0a0a0f],
  cyberpunk: [0x0d0221, 0x1a0a3e, 0x7b1fa2],
};
