import { createElasticityTraitHandler } from './elasticityCore';

/**
 * Legacy-friendly alias: @bounce(mode: true) — delegates to the same physics
 * pipeline as @elastic via compileElasticityTraitContext.
 */
export const bounceHandler = createElasticityTraitHandler('bounce');
