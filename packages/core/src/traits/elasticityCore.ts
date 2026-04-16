/**
 * Canonical elasticity / collision-bounce behavior for @elastic and @bounce traits.
 * ThrowableTrait's bounce flags map through compileElasticityTraitContext('bounce', ...).
 */
import type { Vector3 } from '../types';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { TraitContext, TraitHandler } from './TraitTypes';

/** Normalized physics inputs — stable across @bounce and @elastic AST paths. */
export interface ElasticityTraitContext {
  enabled: boolean;
  /** Coefficient of restitution (matches legacy bounce_factor semantics, 0–1). */
  coefficient: number;
}

function readNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Compile decorator params for @elastic or @bounce into one canonical shape.
 * - @elastic — canonical; default coefficient 0.5 when unspecified (matches legacy bounce_factor default).
 * - @bounce — maps `mode` / `bounce` to enabled; `bounce_factor` / `factor` → coefficient.
 */
export function compileElasticityTraitContext(
  trait: 'bounce' | 'elastic',
  params?: Record<string, unknown>
): ElasticityTraitContext {
  const p = params ?? {};

  if (trait === 'elastic') {
    if (p.enabled === false) {
      return { enabled: false, coefficient: 0 };
    }
    const coef = readNumber(
      p.coefficient ?? p.restitution ?? p.factor ?? p.bounce_factor,
      0.5
    );
    const enabled = p.enabled !== false && coef > 0;
    return { enabled, coefficient: enabled ? coef : 0 };
  }

  const mode = p.mode ?? p.bounce ?? false;
  const enabled = Boolean(mode);
  const coefficient = readNumber(p.bounce_factor ?? p.factor ?? p.coefficient, 0.5);
  return { enabled, coefficient: enabled ? coefficient : 0 };
}

/** Shared collision response: reflect velocity about normal, scaled by coefficient. */
export function applyElasticCollisionResponse(
  context: TraitContext,
  node: HSPlusNode,
  collision: { relativeVelocity: Vector3; normal: Vector3 },
  coefficient: number
): void {
  const bounceFactor = coefficient;
  const velocity = collision.relativeVelocity;
  const normal = collision.normal;
  const dot = velocity[0] * normal[0] + velocity[1] * normal[1] + velocity[2] * normal[2];
  const reflected: Vector3 = [
    (velocity[0] - 2 * dot * normal[0]) * bounceFactor,
    (velocity[1] - 2 * dot * normal[1]) * bounceFactor,
    (velocity[2] - 2 * dot * normal[2]) * bounceFactor,
  ];
  context.physics.applyVelocity(node, reflected);
}

export function createElasticityTraitHandler(trait: 'elastic' | 'bounce'): TraitHandler {
  const defaultConfig: Record<string, unknown> =
    trait === 'elastic' ? {} : { mode: false };

  return {
    name: trait,
    defaultConfig,
    onEvent(node, config, context, event) {
      if (event.type !== 'collision') return;
      const evRec = event as unknown as Record<string, unknown>;
      const collision = evRec.data as { relativeVelocity: Vector3; normal: Vector3 };
      const ctx = compileElasticityTraitContext(trait, config as Record<string, unknown>);
      if (!ctx.enabled) return;
      applyElasticCollisionResponse(context, node, collision, ctx.coefficient);
    },
  };
}
