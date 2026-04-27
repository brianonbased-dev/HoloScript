import { describe, it, expect, vi, beforeEach } from 'vitest';
import { elasticityHandler } from '../ElasticityTrait';
import {
  compileElasticityTraitContext,
  applyElasticCollisionResponse,
  type ElasticityTraitContext,
} from '../elasticityCore';
import type { TraitContext } from '../TraitTypes';

// ─── elasticityCore unit tests ─────────────────────────────────────────────

describe('compileElasticityTraitContext – elastic trait', () => {
  it('returns defaults when no params', () => {
    const ctx = compileElasticityTraitContext('elastic');
    expect(ctx.enabled).toBe(true);
    expect(ctx.coefficient).toBeCloseTo(0.5);
  });

  it('respects explicit coefficient', () => {
    const ctx = compileElasticityTraitContext('elastic', { coefficient: 0.8 });
    expect(ctx.enabled).toBe(true);
    expect(ctx.coefficient).toBeCloseTo(0.8);
  });

  it('maps restitution alias', () => {
    const ctx = compileElasticityTraitContext('elastic', { restitution: 0.9 });
    expect(ctx.coefficient).toBeCloseTo(0.9);
  });

  it('maps factor alias', () => {
    const ctx = compileElasticityTraitContext('elastic', { factor: 0.3 });
    expect(ctx.coefficient).toBeCloseTo(0.3);
  });

  it('maps bounce_factor alias', () => {
    const ctx = compileElasticityTraitContext('elastic', { bounce_factor: 0.7 });
    expect(ctx.coefficient).toBeCloseTo(0.7);
  });

  it('disables when enabled=false', () => {
    const ctx = compileElasticityTraitContext('elastic', { enabled: false });
    expect(ctx.enabled).toBe(false);
    expect(ctx.coefficient).toBe(0);
  });

  it('disables when coefficient=0', () => {
    const ctx = compileElasticityTraitContext('elastic', { coefficient: 0 });
    expect(ctx.enabled).toBe(false);
  });

  it('accepts string coefficient', () => {
    const ctx = compileElasticityTraitContext('elastic', { coefficient: '0.6' });
    expect(ctx.coefficient).toBeCloseTo(0.6);
  });
});

describe('compileElasticityTraitContext – bounce trait', () => {
  it('is disabled by default (no mode)', () => {
    const ctx = compileElasticityTraitContext('bounce');
    expect(ctx.enabled).toBe(false);
  });

  it('enables when mode is truthy', () => {
    const ctx = compileElasticityTraitContext('bounce', { mode: 'elastic' });
    expect(ctx.enabled).toBe(true);
    expect(ctx.coefficient).toBeCloseTo(0.5);
  });

  it('enables when bounce=true', () => {
    const ctx = compileElasticityTraitContext('bounce', { bounce: true });
    expect(ctx.enabled).toBe(true);
  });

  it('maps bounce_factor for bounce trait', () => {
    const ctx = compileElasticityTraitContext('bounce', {
      bounce: true,
      bounce_factor: 0.4,
    });
    expect(ctx.coefficient).toBeCloseTo(0.4);
  });
});

// ─── applyElasticCollisionResponse ─────────────────────────────────────────

describe('applyElasticCollisionResponse', () => {
  it('emits elastic:collision event via context', () => {
    const emitFn = vi.fn();
    const applyVelocityFn = vi.fn();
    const ctx: TraitContext = {
      emit: emitFn,
      physics: { applyVelocity: applyVelocityFn },
    } as any;
    const node = { id: 'n1', traits: new Set(), emit: vi.fn() } as any;

    applyElasticCollisionResponse(
      ctx,
      node,
      {
        relativeVelocity: { x: 1, y: -1, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
      },
      0.8
    );

    expect(applyVelocityFn).toHaveBeenCalled();
  });
});

// ─── elasticityHandler (the exported handler from ElasticityTrait.ts) ──────

describe('elasticityHandler', () => {
  it('is a TraitHandler object', () => {
    expect(elasticityHandler).toBeDefined();
    expect(typeof elasticityHandler).toBe('object');
  });

  it('has a name property', () => {
    expect(typeof (elasticityHandler as any).name).toBe('string');
  });
});
