/**
 * SemanticErrorReporter.test.ts — Tests for the LLM-readable spatial error translator
 *
 * Covers: all 5 error types (IntersectionViolation, OutOfBounds, ValueViolation,
 * PositionViolation, PhysicsViolation), report() text output, and toAgentFeedback()
 * JSON structure.
 */

import { describe, it, expect } from 'vitest';
import { SemanticErrorReporter } from '../../reporter/SemanticErrorReporter';
import type { SpatialError, AgentFeedback } from '../../reporter/SemanticErrorReporter';
import { BoundingBox } from '../../spatial/BoundingBox';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeIntersectionError(): SpatialError {
  return {
    type: 'IntersectionViolation',
    entityA: 'nft_crate',
    entityB: 'main_floor',
    boundsA: new BoundingBox({ x: -0.5, y: 0, z: -0.5 }, { x: 0.5, y: 1, z: 0.5 }),
    boundsB: new BoundingBox({ x: -5, y: -0.1, z: -5 }, { x: 5, y: 0.5, z: 5 }),
    affectedLines: [12, 13, 14],
  };
}

function makeOutOfBoundsError(): SpatialError {
  return {
    type: 'OutOfBounds',
    entityA: 'spawn_point',
    boundsA: new BoundingBox({ x: -2, y: 0, z: -2 }, { x: 2, y: 3, z: 2 }),
    container: new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }),
    affectedLines: [25],
  };
}

// ── report() ─────────────────────────────────────────────────────────────────

describe('SemanticErrorReporter — report()', () => {
  it('IntersectionViolation mentions both entity names', () => {
    const msg = SemanticErrorReporter.report(makeIntersectionError());
    expect(msg).toContain('nft_crate');
    expect(msg).toContain('main_floor');
    expect(msg).toContain('SpatialAssertionError');
  });

  it('IntersectionViolation includes clipping info', () => {
    const msg = SemanticErrorReporter.report(makeIntersectionError());
    expect(msg).toContain('clipping');
  });

  it('IntersectionViolation includes a Fix suggestion', () => {
    const msg = SemanticErrorReporter.report(makeIntersectionError());
    expect(msg).toContain('Fix');
  });

  it('IntersectionViolation without bounds gives a simple message', () => {
    const err: SpatialError = { type: 'IntersectionViolation', entityA: 'a', entityB: 'b' };
    const msg = SemanticErrorReporter.report(err);
    expect(msg).toContain("'a' intersects 'b'");
  });

  it('OutOfBounds mentions the entity name', () => {
    const msg = SemanticErrorReporter.report(makeOutOfBoundsError());
    expect(msg).toContain('spawn_point');
    expect(msg).toContain('outside');
  });

  it('OutOfBounds includes per-axis violation details', () => {
    const msg = SemanticErrorReporter.report(makeOutOfBoundsError());
    // spawn_point min.x is -2, container min.x is 0 → violation
    expect(msg).toContain('min.x');
  });

  it('ValueViolation reports numeric constraint', () => {
    const err: SpatialError = {
      type: 'ValueViolation',
      entityA: 'scene',
      values: { polyCount: '120000', limit: '100000' },
    };
    const msg = SemanticErrorReporter.report(err);
    expect(msg).toContain('numeric constraint');
    expect(msg).toContain('polyCount');
  });

  it('PositionViolation reports position mismatch', () => {
    const err: SpatialError = {
      type: 'PositionViolation',
      entityA: 'player',
      values: { expected_y: '5.0', actual_y: '3.2' },
    };
    const msg = SemanticErrorReporter.report(err);
    expect(msg).toContain('expected position');
    expect(msg).toContain('player');
  });

  it('PhysicsViolation mentions simulation', () => {
    const err: SpatialError = {
      type: 'PhysicsViolation',
      entityA: 'ball',
      values: { after_ticks: '120', expected_y: '0.5', actual_y: '-2.0' },
    };
    const msg = SemanticErrorReporter.report(err);
    expect(msg).toContain('PhysicsViolation');
    expect(msg).toContain('ball');
    expect(msg).toContain('colliders');
  });

  it('unknown error type returns generic message', () => {
    const err = { type: 'UnknownType' as any };
    const msg = SemanticErrorReporter.report(err);
    expect(msg).toContain('unknown error type');
  });
});

// ── toAgentFeedback() ────────────────────────────────────────────────────────

describe('SemanticErrorReporter — toAgentFeedback()', () => {
  it('returns correct shape for IntersectionViolation', () => {
    const fb = SemanticErrorReporter.toAgentFeedback(makeIntersectionError());
    expect(fb.error_type).toBe('IntersectionViolation');
    expect(fb.semantic_message).toBeTruthy();
    expect(fb.spatial_hint).toContain('penetration');
    expect(fb.fix_suggestion).toContain('Adjust');
    expect(fb.affected_lines).toEqual([12, 13, 14]);
    expect(fb.raw).toBeDefined();
  });

  it('returns correct shape for OutOfBounds', () => {
    const fb = SemanticErrorReporter.toAgentFeedback(makeOutOfBoundsError());
    expect(fb.error_type).toBe('OutOfBounds');
    expect(fb.fix_suggestion).toContain('spawn_point');
    expect(fb.affected_lines).toEqual([25]);
  });

  it('returns correct shape for ValueViolation', () => {
    const err: SpatialError = {
      type: 'ValueViolation',
      entityA: 'scene',
      values: { polyCount: '120000' },
    };
    const fb = SemanticErrorReporter.toAgentFeedback(err);
    expect(fb.error_type).toBe('ValueViolation');
    expect(fb.fix_suggestion).toContain('polyCount');
  });

  it('affected_lines defaults to empty array', () => {
    const err: SpatialError = { type: 'PhysicsViolation', entityA: 'ball' };
    const fb = SemanticErrorReporter.toAgentFeedback(err);
    expect(fb.affected_lines).toEqual([]);
  });

  it('raw field contains the original SpatialError', () => {
    const err = makeIntersectionError();
    const fb = SemanticErrorReporter.toAgentFeedback(err);
    expect(fb.raw).toBe(err);
  });
});
