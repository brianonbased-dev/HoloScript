/**
 * RayTracingTrait — tests (config-only, no onAttach/onEvent)
 */
import { describe, it, expect } from 'vitest';
import { RayTracingTrait } from '../RayTracingTrait';

describe('RayTracingTrait', () => {
  it('has name "ray_tracing"', () => {
    expect(RayTracingTrait.name).toBe('ray_tracing');
  });
});
