// Shared material resolution — the reality of matter, as growable data.
//
// Default Material Realism (founder canon D.125): unless an object is explicitly
// designed abstract, it holds the TRUE reality of its matter. That reality is not a
// bare `restitution: 0.5` float — it is a *material* (rubber, steel, clay…) with real
// physical constants, from which mass (density x volume), bounce, friction and surface
// appearance are DERIVED. Objects react to *other objects* by combining both materials'
// constants (a material PAIR), so rubber-on-steel and clay-on-steel differ correctly.
//
// Single home for `material:` name -> physical + render constants, mirroring the
// geometry-registry pattern: growing the material vocabulary is a data edit HERE, and
// because resolution is target-agnostic, physics compilers, renderers and future
// deformation/audio consumers resolve the SAME matter and translate it their own way.

export interface Material {
  /** Canonical material name. */
  readonly name: string;
  // ── physical (SI) ──────────────────────────────────────────────────────────
  /** Density, kg/m^3 — mass is density x volume, never hand-set. */
  readonly density: number;
  /** Coefficient of restitution 0..1 (bounciness) for a like-on-like impact. */
  readonly restitution: number;
  /** Kinetic friction coefficient (dimensionless). */
  readonly friction: number;
  /** Young's modulus, Pa — stiffness; drives future soft-body deformation. */
  readonly youngsModulus: number;
  /** Relative hardness 0..1 (Mohs-ish, normalized). */
  readonly hardness: number;
  // ── render ("paint the window") ──────────────────────────────────────────────
  /** Linear-space base color RGB, 0..1. */
  readonly albedo: readonly [number, number, number];
  /** PBR roughness 0..1 (rubber high, glass low). */
  readonly roughness: number;
  /** PBR metalness 0..1 (steel 1, dielectrics 0). */
  readonly metalness: number;
  /** Subsurface translucency 0..1 (flesh/fur/wax/ice > 0). */
  readonly subsurface: number;
}

// Canonical matter. Constants are real-world order-of-magnitude values (density kg/m^3,
// restitution/friction measured against a hard surface). Adding a material is one entry.
const MATERIALS: Record<string, Material> = {
  rubber: {
    name: 'rubber',
    density: 1100,
    restitution: 0.85,
    friction: 0.9,
    youngsModulus: 5.0e7,
    hardness: 0.3,
    albedo: [0.05, 0.05, 0.06],
    roughness: 0.8,
    metalness: 0.0,
    subsurface: 0.05,
  },
  steel: {
    name: 'steel',
    density: 7850,
    restitution: 0.6,
    friction: 0.6,
    youngsModulus: 2.0e11,
    hardness: 0.95,
    albedo: [0.56, 0.57, 0.58],
    roughness: 0.28,
    metalness: 1.0,
    subsurface: 0.0,
  },
  plastic: {
    name: 'plastic',
    density: 1050,
    restitution: 0.7,
    friction: 0.35,
    youngsModulus: 2.3e9,
    hardness: 0.5,
    albedo: [0.2, 0.45, 0.85],
    roughness: 0.42,
    metalness: 0.0,
    subsurface: 0.04,
  },
  wood: {
    name: 'wood',
    density: 750,
    restitution: 0.5,
    friction: 0.5,
    youngsModulus: 1.1e10,
    hardness: 0.6,
    albedo: [0.42, 0.28, 0.14],
    roughness: 0.78,
    metalness: 0.0,
    subsurface: 0.1,
  },
  glass: {
    name: 'glass',
    density: 2500,
    restitution: 0.55,
    friction: 0.4,
    youngsModulus: 7.0e10,
    hardness: 0.9,
    albedo: [0.85, 0.9, 0.92],
    roughness: 0.06,
    metalness: 0.0,
    subsurface: 0.25,
  },
  clay: {
    name: 'clay',
    density: 1900,
    restitution: 0.08,
    friction: 0.9,
    youngsModulus: 1.0e7,
    hardness: 0.12,
    albedo: [0.62, 0.44, 0.36],
    roughness: 0.92,
    metalness: 0.0,
    subsurface: 0.12,
  },
  ice: {
    name: 'ice',
    density: 917,
    restitution: 0.12,
    friction: 0.05,
    youngsModulus: 9.0e9,
    hardness: 0.4,
    albedo: [0.78, 0.86, 0.92],
    roughness: 0.14,
    metalness: 0.0,
    subsurface: 0.45,
  },
  foam: {
    name: 'foam',
    density: 50,
    restitution: 0.25,
    friction: 0.7,
    youngsModulus: 1.0e6,
    hardness: 0.05,
    albedo: [0.9, 0.86, 0.7],
    roughness: 0.95,
    metalness: 0.0,
    subsurface: 0.3,
  },
  stone: {
    name: 'stone',
    density: 2600,
    restitution: 0.35,
    friction: 0.7,
    youngsModulus: 5.0e10,
    hardness: 0.8,
    albedo: [0.45, 0.45, 0.47],
    roughness: 0.85,
    metalness: 0.0,
    subsurface: 0.0,
  },
  // Toward "limbs and body" (D.125) — soft, subsurface-heavy matter for later deformation.
  flesh: {
    name: 'flesh',
    density: 1010,
    restitution: 0.2,
    friction: 0.6,
    youngsModulus: 5.0e4,
    hardness: 0.08,
    albedo: [0.8, 0.52, 0.45],
    roughness: 0.6,
    metalness: 0.0,
    subsurface: 0.7,
  },
  fur: {
    name: 'fur',
    density: 300,
    restitution: 0.15,
    friction: 0.8,
    youngsModulus: 1.0e5,
    hardness: 0.06,
    albedo: [0.35, 0.24, 0.14],
    roughness: 0.98,
    metalness: 0.0,
    subsurface: 0.55,
  },
};

// Name aliases -> canonical material. Case-insensitive; grow by one line.
const ALIAS: Record<string, string> = {
  rubber: 'rubber',
  bouncy: 'rubber',
  tire: 'rubber',
  steel: 'steel',
  metal: 'steel',
  iron: 'steel',
  ballbearing: 'steel',
  plastic: 'plastic',
  abs: 'plastic',
  pvc: 'plastic',
  acrylic: 'plastic',
  wood: 'wood',
  oak: 'wood',
  timber: 'wood',
  pine: 'wood',
  glass: 'glass',
  marble: 'glass',
  clay: 'clay',
  putty: 'clay',
  mud: 'clay',
  dough: 'clay',
  ice: 'ice',
  frost: 'ice',
  foam: 'foam',
  sponge: 'foam',
  cushion: 'foam',
  stone: 'stone',
  rock: 'stone',
  concrete: 'stone',
  granite: 'stone',
  flesh: 'flesh',
  skin: 'flesh',
  meat: 'flesh',
  body: 'flesh',
  fur: 'fur',
  hair: 'fur',
  wool: 'fur',
};

/**
 * The material an object gets when none is authored. Per Default Material Realism the
 * default is a REAL material (not a matterless abstraction) — a neutral solid plastic —
 * and callers can flag `defaulted` so honesty is preserved (the object is real-by-default,
 * not silently materialless).
 */
export const DEFAULT_MATERIAL_NAME = 'plastic';

export interface MaterialResolution {
  readonly material: Material;
  /** True when the name was absent/unknown and the default was substituted. */
  readonly defaulted: boolean;
}

/** Resolve a `material:` name to real matter. Unknown/empty -> DEFAULT (flagged). */
export function resolveMaterial(name?: unknown): MaterialResolution {
  const key = String(name ?? '')
    .trim()
    .toLowerCase();
  const canonical = ALIAS[key];
  if (canonical && MATERIALS[canonical])
    return { material: MATERIALS[canonical], defaulted: false };
  return { material: MATERIALS[DEFAULT_MATERIAL_NAME], defaulted: true };
}

/** All known material names (for gates / benchmarks / docs). */
export function materialNames(): string[] {
  return Object.keys(MATERIALS);
}

// ── volume + mass (mass is DERIVED, never asserted) ───────────────────────────
/** Volume (m^3) of a canonical primitive given a radius and half-extents. */
export function primitiveVolume(
  kind: string,
  radius: number,
  half: readonly [number, number, number]
): number {
  switch (kind) {
    case 'sphere':
      return (4 / 3) * Math.PI * radius * radius * radius;
    case 'cylinder':
      return Math.PI * radius * radius * (half[1] * 2);
    case 'cone':
      return (1 / 3) * Math.PI * radius * radius * (half[1] * 2);
    case 'torus': {
      const tube = radius * 0.3;
      return 2 * Math.PI * Math.PI * radius * tube * tube;
    }
    default:
      return (
        Math.max(1e-6, half[0] * 2) * Math.max(1e-6, half[1] * 2) * Math.max(1e-6, half[2] * 2)
      ); // box
  }
}

/** Mass (kg) = density x volume. */
export function massFor(material: Material, volume: number): number {
  return material.density * Math.max(1e-6, volume);
}

// ── material-pair reactions (objects reacting to OTHER objects) ────────────────
/** Coefficient of restitution for a contact between two materials (geometric mean). */
export function combineRestitution(a: Material, b: Material): number {
  return Math.sqrt(Math.max(0, a.restitution) * Math.max(0, b.restitution));
}
/** Kinetic friction for a contact between two materials (geometric mean). */
export function combineFriction(a: Material, b: Material): number {
  return Math.sqrt(Math.max(0, a.friction) * Math.max(0, b.friction));
}
