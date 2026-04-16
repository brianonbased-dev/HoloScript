import { describe, it, expect } from 'vitest';
import { compileElasticityTraitContext, type ElasticityTraitContext } from './elasticityCore';

describe('elasticity / bounce consolidation', () => {
  it('maps @bounce(mode: true) and bare @elastic to identical ElasticityTraitContext', () => {
    const bounceCtx = compileElasticityTraitContext('bounce', { mode: true });
    const elasticCtx = compileElasticityTraitContext('elastic', {});
    expect(bounceCtx).toEqual(elasticCtx);
    expect(bounceCtx).toEqual<ElasticityTraitContext>({ enabled: true, coefficient: 0.5 });
  });

  it('maps bounce_factor on bounce to coefficient on elastic', () => {
    const bounceCtx = compileElasticityTraitContext('bounce', { mode: true, bounce_factor: 0.72 });
    const elasticCtx = compileElasticityTraitContext('elastic', { coefficient: 0.72 });
    expect(bounceCtx).toEqual(elasticCtx);
  });

  it('disables bounce when mode is false', () => {
    expect(compileElasticityTraitContext('bounce', { mode: false })).toEqual({
      enabled: false,
      coefficient: 0,
    });
  });
});
