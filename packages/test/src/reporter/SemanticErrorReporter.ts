/**
 * SemanticErrorReporter — translates raw AABB math failures into natural language
 * descriptions suitable for LLM agent self-correction loops.
 *
 * Instead of:
 *   Error: AABB(5,5,5,10,10,10) intersects AABB(4,8,5,9,12,10)
 *
 * Produces:
 *   SpatialAssertionError: 'nft_crate' is clipping through 'main_floor'.
 *   Crate bottom Y (5.0m) is 1.5m below floor top Y (6.5m).
 *   Fix: Adjust Y of 'nft_crate' by +1.5 units.
 */

import { BoundingBox, Vec3 } from '../spatial/BoundingBox';

// ── Public Types ───────────────────────────────────────────────────────────

export type SpatialErrorType =
  | 'IntersectionViolation'   // two objects are clipping through each other
  | 'OutOfBounds'             // object is outside its allowed container
  | 'ValueViolation'          // numeric property (e.g. polyCount) exceeds limit
  | 'PositionViolation'       // entity is not at expected position
  | 'PhysicsViolation';       // post-simulation assertion failed (e.g. object fell through floor)

export interface SpatialError {
  type: SpatialErrorType;
  entityA?: string;
  entityB?: string;
  boundsA?: BoundingBox;
  boundsB?: BoundingBox;
  container?: BoundingBox;
  /** Extra numeric context (e.g. { polyCount: 120000, limit: 100000 }) */
  values?: Record<string, number | string>;
  /** Line numbers in the source file where the relevant objects are defined. */
  affectedLines?: number[];
}

/** JSON-RPC-compatible feedback payload for AI agent consumption. */
export interface AgentFeedback {
  error_type: SpatialErrorType;
  semantic_message: string;
  spatial_hint: string;
  fix_suggestion: string;
  affected_lines: number[];
  raw?: SpatialError;
}

/** Full tool response payload returned by the execute_holotest MCP tool. */
export interface HolotestResult {
  tool_name: 'execute_holotest';
  status: 'passed' | 'failed' | 'error';
  summary: string;
  tests: TestReport[];
  agent_feedback?: AgentFeedback;
}

export interface TestReport {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: AgentFeedback;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(3);
}

function closestAxis(pen: Vec3): { axis: 'X' | 'Y' | 'Z'; depth: number } {
  const abs = { x: Math.abs(pen.x), y: Math.abs(pen.y), z: Math.abs(pen.z) };
  if (abs.y <= abs.x && abs.y <= abs.z) return { axis: 'Y', depth: pen.y };
  if (abs.x <= abs.z) return { axis: 'X', depth: pen.x };
  return { axis: 'Z', depth: pen.z };
}

// ── SemanticErrorReporter ──────────────────────────────────────────────────

export class SemanticErrorReporter {
  /**
   * Convert a SpatialError into a human-readable multi-line string.
   */
  static report(error: SpatialError): string {
    switch (error.type) {
      case 'IntersectionViolation':
        return SemanticErrorReporter._reportIntersection(error);
      case 'OutOfBounds':
        return SemanticErrorReporter._reportOutOfBounds(error);
      case 'ValueViolation':
        return SemanticErrorReporter._reportValue(error);
      case 'PositionViolation':
        return SemanticErrorReporter._reportPosition(error);
      case 'PhysicsViolation':
        return SemanticErrorReporter._reportPhysics(error);
      default:
        return `SpatialAssertionError: unknown error type`;
    }
  }

  /**
   * Convert a SpatialError into the structured AgentFeedback used in JSON-RPC responses.
   */
  static toAgentFeedback(error: SpatialError): AgentFeedback {
    const semantic_message = SemanticErrorReporter.report(error);

    let spatial_hint = '';
    let fix_suggestion = '';

    if (error.type === 'IntersectionViolation' && error.boundsA && error.boundsB) {
      const pen = error.boundsA.penetrationDepth(error.boundsB);
      const { axis, depth } = closestAxis(pen);
      spatial_hint = `Smallest penetration axis is ${axis} (${fmt(depth)}m). Moving on this axis is the cheapest fix.`;
      const sign = depth > 0 ? '+' : '-';
      fix_suggestion = `Adjust ${axis} of '${error.entityA ?? 'entity'}' by ${sign}${fmt(Math.abs(depth))} units to resolve clipping.`;
    } else if (error.type === 'OutOfBounds' && error.boundsA && error.container) {
      fix_suggestion = `Check the position and size of '${error.entityA ?? 'entity'}' against the allowed container.`;
      spatial_hint = `Container: ${error.container}. Entity bounds: ${error.boundsA}.`;
    } else if (error.type === 'ValueViolation') {
      const { values } = error;
      if (values) {
        fix_suggestion = Object.entries(values)
          .map(([k, v]) => `Reduce '${k}' to below the configured limit (current: ${v})`)
          .join('; ');
      }
    }

    return {
      error_type: error.type,
      semantic_message,
      spatial_hint,
      fix_suggestion,
      affected_lines: error.affectedLines ?? [],
      raw: error,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private static _reportIntersection(error: SpatialError): string {
    const a = error.entityA ?? 'EntityA';
    const b = error.entityB ?? 'EntityB';

    if (!error.boundsA || !error.boundsB) {
      return `SpatialAssertionError: '${a}' intersects '${b}'.`;
    }

    const bA = error.boundsA;
    const bB = error.boundsB;
    const vol = bA.intersectionVolume(bB);
    const pen = bA.penetrationDepth(bB);
    const { axis, depth } = closestAxis(pen);

    const lines = [
      `SpatialAssertionError: '${a}' is clipping through '${b}'.`,
    ];

    // Describe the overlap in plain English based on the minimum axis
    if (axis === 'Y') {
      const aBottom = fmt(bA.min.y);
      const bTop = fmt(bB.max.y);
      lines.push(`  '${a}' bottom Y (${aBottom}m) overlaps '${b}' top Y (${bTop}m) by ${fmt(Math.abs(depth))}m.`);
    } else if (axis === 'X') {
      lines.push(`  X overlap between '${a}' and '${b}' is ${fmt(Math.abs(depth))}m.`);
    } else {
      lines.push(`  Z overlap between '${a}' and '${b}' is ${fmt(Math.abs(depth))}m.`);
    }

    lines.push(`  Total intersection volume: ${fmt(vol)} m³.`);
    lines.push(`  Fix: Adjust ${axis} of '${a}' by ${depth > 0 ? '+' : ''}${fmt(depth)} units.`);

    return lines.join('\n');
  }

  private static _reportOutOfBounds(error: SpatialError): string {
    const entity = error.entityA ?? 'Entity';
    const lines = [`SpatialAssertionError: '${entity}' is outside its allowed volume.`];

    if (error.boundsA && error.container) {
      const b = error.boundsA;
      const c = error.container;
      if (b.min.x < c.min.x) lines.push(`  min.x (${fmt(b.min.x)}) < container min.x (${fmt(c.min.x)}): shift right by ${fmt(c.min.x - b.min.x)}m`);
      if (b.min.y < c.min.y) lines.push(`  min.y (${fmt(b.min.y)}) < container min.y (${fmt(c.min.y)}): shift up by ${fmt(c.min.y - b.min.y)}m`);
      if (b.min.z < c.min.z) lines.push(`  min.z (${fmt(b.min.z)}) < container min.z (${fmt(c.min.z)}): shift forward by ${fmt(c.min.z - b.min.z)}m`);
      if (b.max.x > c.max.x) lines.push(`  max.x (${fmt(b.max.x)}) > container max.x (${fmt(c.max.x)}): shift left by ${fmt(b.max.x - c.max.x)}m`);
      if (b.max.y > c.max.y) lines.push(`  max.y (${fmt(b.max.y)}) > container max.y (${fmt(c.max.y)}): shift down by ${fmt(b.max.y - c.max.y)}m`);
      if (b.max.z > c.max.z) lines.push(`  max.z (${fmt(b.max.z)}) > container max.z (${fmt(c.max.z)}): shift back by ${fmt(b.max.z - c.max.z)}m`);
    }

    return lines.join('\n');
  }

  private static _reportValue(error: SpatialError): string {
    const entity = error.entityA ?? 'Entity';
    const vals = error.values ?? {};
    const details = Object.entries(vals)
      .map(([k, v]) => `  '${k}' = ${v}`)
      .join('\n');
    return [
      `SpatialAssertionError: '${entity}' violated a numeric constraint.`,
      details,
    ].join('\n');
  }

  private static _reportPosition(error: SpatialError): string {
    const entity = error.entityA ?? 'Entity';
    const vals = error.values ?? {};
    const detail = Object.entries(vals)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    return [
      `SpatialAssertionError: '${entity}' is not at the expected position.`,
      detail,
    ].join('\n');
  }

  private static _reportPhysics(error: SpatialError): string {
    const entity = error.entityA ?? 'Entity';
    const vals = error.values ?? {};
    const detail = Object.entries(vals)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    return [
      `PhysicsViolation: '${entity}' did not behave correctly after simulation.`,
      detail,
      `  Hint: Check that colliders are enabled and the TickSimulator gravity/hz settings match the scene.`,
    ].join('\n');
  }
}
