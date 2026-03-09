/**
 * AgentManifest — Production Test Suite
 *
 * Covers: AgentManifestBuilder (fluent API), createManifest, validateManifest.
 */
import { describe, it, expect } from 'vitest';
import { AgentManifestBuilder, createManifest, validateManifest } from '../AgentManifest';

/**
 * Helper — build() requires at least id, name, version, one capability, one endpoint.
 */
function minBuilder() {
  return new AgentManifestBuilder()
    .identity('a1', 'TestAgent', '1.0.0')
    .addCapability({ type: 'compute', domain: 'physics' })
    .addEndpoint({ protocol: 'http', address: 'localhost' });
}

describe('AgentManifestBuilder — Production', () => {
  it('builds a valid manifest with required fields', () => {
    const m = minBuilder().build();
    expect(m.id).toBe('a1');
    expect(m.name).toBe('TestAgent');
    expect(m.version).toBe('1.0.0');
    expect(m.capabilities!.length).toBe(1);
    expect(m.endpoints!.length).toBe(1);
  });

  it('fluent chaining sets all optional fields', () => {
    const m = minBuilder()
      .description('A test agent')
      .trust('verified')
      .healthCheck(5000)
      .tags('physics', 'ai')
      .metadata({ custom: true })
      .build();
    expect(m.description).toBe('A test agent');
    expect(m.trustLevel).toBe('verified');
    expect(m.healthCheckInterval).toBe(5000);
    expect(m.tags).toContain('physics');
    expect(m.metadata?.custom).toBe(true);
  });

  it('addCapability adds multiple capabilities', () => {
    const m = minBuilder().addCapability({ type: 'render', domain: 'graphics' }).build();
    expect(m.capabilities!.length).toBe(2);
  });

  it('addEndpoint adds endpoint with port', () => {
    const m = minBuilder()
      .addEndpoint({ protocol: 'ws', address: 'localhost', port: 8080 })
      .build();
    expect(m.endpoints!.length).toBe(2);
    expect(m.endpoints!.some((e) => e.port === 8080)).toBe(true);
  });

  it('spatial sets spatial scope', () => {
    const m = minBuilder().spatial({ global: true }).build();
    expect(m.spatialScope?.global).toBe(true);
  });

  it('build throws without identity', () => {
    expect(() =>
      new AgentManifestBuilder()
        .addCapability({ type: 'compute', domain: 'physics' })
        .addEndpoint({ protocol: 'http', address: 'localhost' })
        .build()
    ).toThrow();
  });

  it('build throws without capability', () => {
    expect(() =>
      new AgentManifestBuilder()
        .identity('a1', 'Agent', '1.0.0')
        .addEndpoint({ protocol: 'http', address: 'localhost' })
        .build()
    ).toThrow();
  });

  it('build throws without endpoint', () => {
    expect(() =>
      new AgentManifestBuilder()
        .identity('a1', 'Agent', '1.0.0')
        .addCapability({ type: 'compute', domain: 'physics' })
        .build()
    ).toThrow();
  });
});

describe('createManifest — Production', () => {
  it('returns a builder instance', () => {
    const builder = createManifest();
    expect(builder).toBeInstanceOf(AgentManifestBuilder);
  });

  it('can chain and build', () => {
    const m = createManifest()
      .identity('b1', 'Built', '1.0.0')
      .addCapability({ type: 'compute', domain: 'physics' })
      .addEndpoint({ protocol: 'http', address: 'localhost' })
      .build();
    expect(m.id).toBe('b1');
  });
});

describe('validateManifest — Production', () => {
  it('valid manifest passes', () => {
    const result = validateManifest({
      id: 'v1',
      name: 'Valid',
      version: '1.0.0',
      capabilities: [{ type: 'compute', domain: 'physics' }],
      endpoints: [{ protocol: 'http', address: 'localhost' }],
    });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('missing id fails validation', () => {
    const result = validateManifest({ name: 'NoId', version: '1.0.0' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('missing name fails validation', () => {
    const result = validateManifest({ id: 'x', version: '1.0.0' });
    expect(result.valid).toBe(false);
  });

  it('missing version fails validation', () => {
    const result = validateManifest({ id: 'x', name: 'X' });
    expect(result.valid).toBe(false);
  });
});
