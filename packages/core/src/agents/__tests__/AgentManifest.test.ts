import { describe, it, expect } from 'vitest';
import {
  AgentManifestBuilder,
  createManifest,
  validateManifest,
} from '../AgentManifest';
import type { AgentManifest } from '../AgentManifest';

describe('AgentManifestBuilder', () => {
  function minimalBuilder() {
    return createManifest()
      .identity('a1', 'TestAgent', '1.0.0')
      .addCapability({ type: 'render', domain: 'spatial' })
      .addEndpoint({ protocol: 'local', address: 'localhost' });
  }

  it('builds valid manifest', () => {
    const m = minimalBuilder().build();
    expect(m.id).toBe('a1');
    expect(m.name).toBe('TestAgent');
    expect(m.version).toBe('1.0.0');
    expect(m.status).toBe('online');
    expect(m.registeredAt).toBeDefined();
  });

  it('throws without id', () => {
    expect(() => createManifest()
      .addCapability({ type: 'render', domain: 'spatial' })
      .addEndpoint({ protocol: 'local', address: 'localhost' })
      .build()).toThrow();
  });

  it('throws without capabilities', () => {
    expect(() => createManifest()
      .identity('a1', 'T', '1.0.0')
      .addEndpoint({ protocol: 'local', address: 'localhost' })
      .build()).toThrow();
  });

  it('throws without endpoints', () => {
    expect(() => createManifest()
      .identity('a1', 'T', '1.0.0')
      .addCapability({ type: 'render', domain: 'spatial' })
      .build()).toThrow();
  });

  it('description sets description', () => {
    const m = minimalBuilder().description('A test agent').build();
    expect(m.description).toBe('A test agent');
  });

  it('classify sets categories/position/section', () => {
    const m = minimalBuilder().classify(['autonomous'], 'frontend', 'strings').build();
    expect(m.categories).toContain('autonomous');
    expect(m.position).toBe('frontend');
  });

  it('addCapabilities adds multiple', () => {
    const m = minimalBuilder()
      .addCapabilities([{ type: 'analyze', domain: 'vision' }, { type: 'generate', domain: 'nlp' }])
      .build();
    expect(m.capabilities.length).toBe(3); // 1 from minimal + 2
  });

  it('spatial sets scope', () => {
    const m = minimalBuilder().spatial({ global: true }).build();
    expect(m.spatialScope?.global).toBe(true);
  });

  it('trust sets level and verification', () => {
    const m = minimalBuilder().trust('verified', { verified: true, method: 'signature' }).build();
    expect(m.trustLevel).toBe('verified');
    expect(m.verification?.method).toBe('signature');
  });

  it('healthCheck sets interval', () => {
    const m = minimalBuilder().healthCheck(30000).build();
    expect(m.healthCheckInterval).toBe(30000);
  });

  it('tags accumulates', () => {
    const m = minimalBuilder().tags('fast', 'gpu').tags('ai').build();
    expect(m.tags).toEqual(['fast', 'gpu', 'ai']);
  });

  it('metadata merges', () => {
    const m = minimalBuilder().metadata({ a: 1 }).metadata({ b: 2 }).build();
    expect(m.metadata?.a).toBe(1);
    expect(m.metadata?.b).toBe(2);
  });
});

describe('validateManifest', () => {
  it('valid manifest has no errors', () => {
    const m: Partial<AgentManifest> = {
      id: 'a1', name: 'T', version: '1.0.0',
      capabilities: [{ type: 'render', domain: 'spatial' }],
      endpoints: [{ protocol: 'local', address: 'localhost' }],
      trustLevel: 'local',
      description: 'ok',
      healthCheckInterval: 5000,
    };
    const r = validateManifest(m);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports missing id', () => {
    const r = validateManifest({ name: 'T', version: '1' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('reports missing capabilities', () => {
    const r = validateManifest({ id: 'a', name: 'T', version: '1', capabilities: [] });
    expect(r.valid).toBe(false);
  });

  it('reports missing endpoints', () => {
    const r = validateManifest({ id: 'a', name: 'T', version: '1', capabilities: [{ type: 'r', domain: 'd' }], endpoints: [] });
    expect(r.valid).toBe(false);
  });

  it('reports bad capability', () => {
    const r = validateManifest({
      id: 'a', name: 'T', version: '1',
      capabilities: [{ type: '', domain: '' } as any],
      endpoints: [{ protocol: 'local', address: 'x' }],
    });
    expect(r.errors.some(e => e.includes('Capability'))).toBe(true);
  });

  it('reports bad endpoint', () => {
    const r = validateManifest({
      id: 'a', name: 'T', version: '1',
      capabilities: [{ type: 'r', domain: 'd' }],
      endpoints: [{ protocol: '', address: '' } as any],
    });
    expect(r.errors.some(e => e.includes('Endpoint'))).toBe(true);
  });

  it('warns on missing description', () => {
    const r = validateManifest({
      id: 'a', name: 'T', version: '1',
      capabilities: [{ type: 'r', domain: 'd' }],
      endpoints: [{ protocol: 'local', address: 'x' }],
      trustLevel: 'local',
    });
    expect(r.warnings.some(w => w.includes('description'))).toBe(true);
  });

  it('warns on untrusted level', () => {
    const r = validateManifest({
      id: 'a', name: 'T', version: '1',
      capabilities: [{ type: 'r', domain: 'd' }],
      endpoints: [{ protocol: 'local', address: 'x' }],
      trustLevel: 'untrusted',
    });
    expect(r.warnings.some(w => w.includes('Untrusted'))).toBe(true);
  });
});
