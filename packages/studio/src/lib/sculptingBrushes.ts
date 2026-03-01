/**
 * sculptingBrushes.ts — 3D Sculpting Brush Engine
 *
 * Brush definitions, falloff curves, and stroke application for mesh sculpting.
 */

// Re-export mesh sculpting brush functions
export {
  type BrushParameters,
  applyGrabBrush,
  applySmoothBrush,
  applyInflateBrush,
  applyCreaseBrush,
  applySymmetryMirror,
  subdivideMesh,
  reduceMesh,
} from './sculpt/sculptingBrushes';

export interface Vec3 { x: number; y: number; z: number }

export interface SculptBrush {
  id: string;
  name: string;
  type: BrushType;
  radius: number;          // World units
  strength: number;        // 0..1
  falloff: FalloffCurve;
  symmetry: 'none' | 'x' | 'y' | 'z';
  smoothIterations: number;
}

export type BrushType =
  | 'standard' | 'inflate' | 'flatten' | 'smooth'
  | 'pinch' | 'crease' | 'grab' | 'mask'
  | 'scrape' | 'clay' | 'snake-hook';

export type FalloffCurve = 'linear' | 'smooth' | 'sharp' | 'constant' | 'dome';

// ═══════════════════════════════════════════════════════════════════
// Falloff Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate falloff weight based on distance from brush center.
 */
export function falloffWeight(distance: number, radius: number, curve: FalloffCurve): number {
  if (distance >= radius) return 0;
  const t = distance / radius; // 0..1

  switch (curve) {
    case 'constant': return 1;
    case 'linear': return 1 - t;
    case 'smooth': return 1 - (3 * t * t - 2 * t * t * t); // Smoothstep
    case 'sharp': return (1 - t) * (1 - t);
    case 'dome': return Math.sqrt(1 - t * t);
    default: return 1 - t;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Built-in Brushes
// ═══════════════════════════════════════════════════════════════════

export const BRUSHES: SculptBrush[] = [
  { id: 'standard', name: 'Standard', type: 'standard', radius: 0.5, strength: 0.5, falloff: 'smooth', symmetry: 'none', smoothIterations: 0 },
  { id: 'inflate', name: 'Inflate', type: 'inflate', radius: 0.4, strength: 0.4, falloff: 'smooth', symmetry: 'none', smoothIterations: 0 },
  { id: 'flatten', name: 'Flatten', type: 'flatten', radius: 0.6, strength: 0.6, falloff: 'dome', symmetry: 'none', smoothIterations: 0 },
  { id: 'smooth', name: 'Smooth', type: 'smooth', radius: 0.5, strength: 0.8, falloff: 'smooth', symmetry: 'none', smoothIterations: 3 },
  { id: 'pinch', name: 'Pinch', type: 'pinch', radius: 0.3, strength: 0.5, falloff: 'sharp', symmetry: 'none', smoothIterations: 0 },
  { id: 'crease', name: 'Crease', type: 'crease', radius: 0.2, strength: 0.6, falloff: 'sharp', symmetry: 'none', smoothIterations: 0 },
  { id: 'grab', name: 'Grab', type: 'grab', radius: 0.5, strength: 1.0, falloff: 'smooth', symmetry: 'none', smoothIterations: 0 },
  { id: 'mask', name: 'Mask', type: 'mask', radius: 0.5, strength: 1.0, falloff: 'smooth', symmetry: 'none', smoothIterations: 0 },
  { id: 'clay', name: 'Clay', type: 'clay', radius: 0.5, strength: 0.5, falloff: 'dome', symmetry: 'none', smoothIterations: 1 },
  { id: 'scrape', name: 'Scrape', type: 'scrape', radius: 0.6, strength: 0.4, falloff: 'linear', symmetry: 'none', smoothIterations: 0 },
  { id: 'snake-hook', name: 'Snake Hook', type: 'snake-hook', radius: 0.3, strength: 0.8, falloff: 'smooth', symmetry: 'none', smoothIterations: 0 },
];

/**
 * Get a brush by ID.
 */
export function getBrush(id: string): SculptBrush | undefined {
  return BRUSHES.find(b => b.id === id);
}

/**
 * Apply a brush stroke to a vertex (compute displacement).
 */
export function applyBrushStroke(
  brush: SculptBrush,
  vertexPos: Vec3,
  brushCenter: Vec3,
  normal: Vec3
): Vec3 {
  const dx = vertexPos.x - brushCenter.x;
  const dy = vertexPos.y - brushCenter.y;
  const dz = vertexPos.z - brushCenter.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const weight = falloffWeight(dist, brush.radius, brush.falloff) * brush.strength;
  if (weight <= 0) return { x: 0, y: 0, z: 0 };

  switch (brush.type) {
    case 'standard':
      return { x: normal.x * weight, y: normal.y * weight, z: normal.z * weight };
    case 'inflate':
      return { x: normal.x * weight * 0.5, y: normal.y * weight * 0.5, z: normal.z * weight * 0.5 };
    case 'flatten':
      return { x: 0, y: -vertexPos.y * weight * 0.1, z: 0 };
    case 'smooth':
      return { x: -dx * weight * 0.05, y: -dy * weight * 0.05, z: -dz * weight * 0.05 };
    case 'pinch':
      return { x: -dx * weight * 0.1, y: 0, z: -dz * weight * 0.1 };
    case 'grab':
      return { x: 0, y: weight * 0.5, z: 0 }; // Placeholder — real grab uses mouse delta
    default:
      return { x: normal.x * weight, y: normal.y * weight, z: normal.z * weight };
  }
}

/**
 * Estimate affected vertices for a brush stroke.
 */
export function estimateAffectedVertices(totalVertices: number, brushRadius: number, meshRadius: number): number {
  if (meshRadius <= 0) return 0;
  const surfaceRatio = (brushRadius * brushRadius) / (meshRadius * meshRadius * 4);
  return Math.min(totalVertices, Math.ceil(totalVertices * Math.min(1, surfaceRatio)));
}
