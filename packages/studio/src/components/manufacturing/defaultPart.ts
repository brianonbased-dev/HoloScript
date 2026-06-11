/**
 * defaultPart.ts — shared part definition used by both ParametricPartDemo (landing)
 * and ParametricSlidersPanel (/create part mode).
 *
 * A "mounting plate" part: box minus a cylindrical hole.
 * Params are named sliders that substitute into the SDF tree.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single named parameter with its range and default value. */
export interface PartParam {
  name: string;
  /** Display label for the slider. */
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  /** How to format the numeric display. */
  format: (v: number) => string;
}

/** Part definition: a list of params and a function to build the SDF JSON tree. */
export interface PartDefinition {
  name: string;
  params: PartParam[];
  /**
   * Build the SDF node from the current param values.
   * The SDF shape matches SDFNode from @holoscript/engine/simulation.
   * Called client-side only — engine import is server-only.
   */
  buildSDF: (params: Record<string, number>) => unknown;
  /**
   * World-space AABB for the part — sent with the SDF to /api/manufacturing/mesh.
   */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

// ── Default part: mounting plate ─────────────────────────────────────────────

/**
 * Build the mounting-plate SDF from named params.
 * Mirrors the logic in ParametricPartDemo.buildMountingPlateSDF().
 */
function buildMountingPlateSDF(params: Record<string, number>): unknown {
  const holeRadius = params['holeRadius'] ?? 0.25;
  const thickness = params['thickness'] ?? 0.3;

  const plate = {
    type: 'primitive',
    primitive: 'box',
    params: { halfX: 1.0, halfY: thickness * 0.5, halfZ: 1.0 },
  };

  const hole = {
    type: 'primitive',
    primitive: 'cylinder',
    params: { radius: holeRadius, halfHeight: 2.0 },
  };

  return {
    type: 'csg',
    operation: 'difference',
    children: [plate, hole],
  };
}

export const DEFAULT_PART_DEFINITION: PartDefinition = {
  name: 'mounting-plate',
  params: [
    {
      name: 'holeRadius',
      label: 'Hole radius',
      min: 0.05,
      max: 0.5,
      step: 0.01,
      value: 0.25,
      unit: 'u',
      format: (v) => v.toFixed(2),
    },
    {
      name: 'thickness',
      label: 'Plate thickness',
      min: 0.1,
      max: 0.8,
      step: 0.01,
      value: 0.3,
      unit: 'u',
      format: (v) => v.toFixed(2),
    },
  ],
  buildSDF: buildMountingPlateSDF,
  bounds: { min: [-1.2, -0.8, -1.2], max: [1.2, 0.8, 1.2] },
};
