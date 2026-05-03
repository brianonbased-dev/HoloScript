import type { HoloValue } from '../parser/HoloCompositionTypes';

/**
 * Shared Kotlin/Android Code Generation Helpers
 *
 * Common utilities extracted from AndroidCompiler and AndroidXRCompiler
 * to eliminate duplication between the two compilers.
 *
 * Both compilers share: emit(), sanitizeName(), toKotlinType(),
 * toKotlinValue(), findProp/findObjProp(), compositionHasTrait().
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPE CONVERSION
// =============================================================================

/**
 * Convert a HoloValue to its Kotlin type representation.
 */
export function toKotlinType(value: HoloValue): string {
  if (value === null) return 'Any?';
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Float';
  if (typeof value === 'string') return 'String';
  if (Array.isArray(value)) {
    if (value.length === 3 && value.every((v) => typeof v === 'number')) return 'Vector3';
    return 'List<Any>';
  }
  return 'Any';
}

/**
 * Convert a HoloValue to its Kotlin value literal.
 * Requires an escapeStringValue function from the compiler for string escaping.
 */
export function toKotlinValue(
  value: HoloValue,
  escapeFn: (s: string, target: string) => string
): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${value}` : `${value}f`;
  }
  if (typeof value === 'string') return `"${escapeFn(value, 'Kotlin')}"`;
  if (Array.isArray(value)) {
    if (value.length === 3 && value.every((v) => typeof v === 'number')) {
      return `Vector3(${value[0]}f, ${value[1]}f, ${value[2]}f)`;
    }
    return `listOf(${value.map((v) => toKotlinValue(v, escapeFn)).join(', ')})`;
  }
  return 'null';
}

// =============================================================================
// NAME SANITIZATION
// =============================================================================

/**
 * Sanitize a name for use as a Kotlin identifier.
 * Capitalizes the first character (AndroidCompiler style).
 */
export function sanitizeNameCapitalized(name: string): string {
  const result = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Sanitize a name for use as a Kotlin identifier.
 * Does not capitalize (AndroidXRCompiler style).
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

// =============================================================================
// ANDROID COLOR CONVERSION
// =============================================================================

const NAMED_COLORS: Record<string, string> = {
  red: 'android.graphics.Color.RED',
  green: 'android.graphics.Color.GREEN',
  blue: 'android.graphics.Color.BLUE',
  white: 'android.graphics.Color.WHITE',
  black: 'android.graphics.Color.BLACK',
  yellow: 'android.graphics.Color.YELLOW',
  cyan: 'android.graphics.Color.CYAN',
  magenta: 'android.graphics.Color.MAGENTA',
};

/**
 * Convert a HoloValue to an Android color expression (ARCore style).
 */
export function toAndroidColor(value: HoloValue | undefined): string {
  if (!value) return 'android.graphics.Color.BLUE';

  if (typeof value === 'string') {
    if (value.startsWith('#')) {
      return `android.graphics.Color.parseColor("${value}")`;
    }
    return NAMED_COLORS[value.toLowerCase()] || 'android.graphics.Color.BLUE';
  }
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b, a = 1] = value as number[];
    return `android.graphics.Color.argb(${Math.round(a * 255)}, ${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  return 'android.graphics.Color.BLUE';
}

/**
 * Convert a hex color string to Android XR Color format.
 */
export function toKotlinColor(hex: string): string {
  if (typeof hex === 'string' && hex.startsWith('#')) {
    const raw = hex.slice(1);
    if (raw.length === 6) return `Color(0xFF${raw.toUpperCase()})`;
    if (raw.length === 8) {
      const [rr, gg, bb, aa] = [
        raw.substring(0, 2),
        raw.substring(2, 4),
        raw.substring(4, 6),
        raw.substring(6, 8),
      ];
      return `Color(0x${aa.toUpperCase()}${rr.toUpperCase()}${gg.toUpperCase()}${bb.toUpperCase()})`;
    }
  }
  return 'Color.White';
}

// =============================================================================
// GEOMETRY MAPPING
// =============================================================================

const SCENEFORM_GEOMETRIES: Record<string, string> = {
  cube: 'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)',
  box: 'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)',
  sphere: 'ShapeFactory.makeSphere(0.05f, Vector3.zero(), material)',
  cylinder: 'ShapeFactory.makeCylinder(0.05f, 0.1f, Vector3.zero(), material)',
};

const DEFAULT_GEOMETRY =
  'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)';

/**
 * Map a mesh type to a SceneForm geometry factory call.
 */
export function getSceneformGeometry(meshType: string): string {
  return SCENEFORM_GEOMETRIES[meshType] || DEFAULT_GEOMETRY;
}

const FILAMENT_SHAPES: Record<string, string> = {
  cube: 'BoxShape',
  box: 'BoxShape',
  sphere: 'IcoSphereShape',
  cylinder: 'CylinderShape',
  cone: 'ConeShape',
  plane: 'QuadShape',
  torus: 'CustomRingGeometry',
  capsule: 'CapsuleShape',
};

/**
 * Map a shape type to a Filament shape class name.
 */
export function mapShapeToFilament(type: string): string {
  return FILAMENT_SHAPES[type] ?? `Unknown("${type}")`;
}

// =============================================================================
// COMPOSITION HELPERS
// =============================================================================

import type { HoloObjectDecl, HoloComposition } from '../parser/HoloCompositionTypes';

/**
 * Find a property value on a HoloObjectDecl by key.
 */
export function findObjProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
  return obj.properties?.find((p) => p.key === key)?.value;
}

/**
 * Check if any object in the composition has a specific trait.
 */
export function compositionHasTrait(composition: HoloComposition, traitName: string): boolean {
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (name === traitName) return true;
    }
  }
  return false;
}

/**
 * Check if any object in the composition uses ARCore depth traits.
 */
export function compositionUsesArCoreDepthTraits(composition: HoloComposition): boolean {
  const depthTraits = new Set(['occlusion_mesh', 'environment_probe', 'spatial_awareness']);
  return (
    composition.objects?.some((o) => o.traits?.some((t) => depthTraits.has(t.name))) ?? false
  );
}

/**
 * Convert a number array to Kotlin Float3 representation.
 */
export function toKotlinFloat3(arr: number[]): string {
  if (Array.isArray(arr) && arr.length >= 3) return `Float3(${arr[0]}f, ${arr[1]}f, ${arr[2]}f)`;
  if (Array.isArray(arr) && arr.length >= 1) return `Float3(${arr[0]}f, ${arr[0]}f, ${arr[0]}f)`;
  const v = typeof arr === 'number' ? arr : 0;
  return `Float3(${v}f, ${v}f, ${v}f)`;
}