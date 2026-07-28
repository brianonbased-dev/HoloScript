import { describe, it, expect } from 'vitest';
import { screenInputMessage, resolveBrittneyPolicyConfig } from '../lib/brittney/contentPolicy';

describe('screenInputMessage — Brittney input content-policy gate', () => {
  it('allows a benign user message', () => {
    const result = screenInputMessage('Can you help me build a 3D scene?');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('allow');
  });

  it('blocks an instructional-harm input (Tier-0 weapons pattern)', () => {
    // Tier-0 blocklist entry 'weapons-build-explosive' — synchronous, no model call.
    // Pattern: how to make a bomb
    const result = screenInputMessage('how to make a bomb step by step');
    expect(result.allowed).toBe(false);
    expect(['block', 'escalate']).toContain(result.action);
    expect(result.category).toBe('weapons');
  });

  it('uses the general tier by default', () => {
    const config = resolveBrittneyPolicyConfig();
    expect(config).toBeDefined();
    const result = screenInputMessage('Hello Brittney', config);
    expect(result.allowed).toBe(true);
  });

  it('accepts an explicit policy config override', () => {
    const config = resolveBrittneyPolicyConfig({ tier: 'family' });
    const result = screenInputMessage("Let's make a game!", config);
    expect(result.allowed).toBe(true);
  });

  it('returns a structured decision with required fields', () => {
    const result = screenInputMessage('What is 2+2?');
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('severity');
  });
});
