import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionProvider } from '../CompletionProvider';

describe('CompletionProvider', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider();
  });

  it('returns node types when prefix is empty', () => {
    const items = provider.getCompletions({ prefix: '' });
    const labels = items.map((i) => i.label);
    expect(labels).toContain('box');
    expect(labels).toContain('sphere');
    expect(labels).toContain('panel');
  });

  it('returns traits and directives on @ trigger', () => {
    const items = provider.getCompletions({ prefix: '', triggerChar: '@' });
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.has('trait')).toBe(true);
    expect(kinds.has('directive')).toBe(true);
  });

  it('filters traits by prefix after @', () => {
    const items = provider.getCompletions({ prefix: '@grab' });
    expect(items.some((i) => i.label === 'grabbable')).toBe(true);
    expect(items.every((i) => i.label.startsWith('grab') || i.kind !== 'trait')).toBe(true);
  });

  it('returns property completions for colon context', () => {
    const items = provider.getCompletions({ prefix: 'pos:' });
    expect(items.some((i) => i.kind === 'property')).toBe(true);
  });

  it('returns property completions for dot context', () => {
    const items = provider.getCompletions({ prefix: 'mat.col' });
    const props = items.filter((i) => i.kind === 'property');
    expect(props.some((i) => i.label === 'color')).toBe(true);
  });

  it('general search returns all matching items', () => {
    const items = provider.getCompletions({ prefix: 'box' });
    expect(items.some((i) => i.label === 'box')).toBe(true);
  });

  it('registerTrait adds custom completion', () => {
    const before = provider.totalCompletions;
    provider.registerTrait({ label: 'myCustomTrait', kind: 'trait', detail: 'Custom' });
    expect(provider.totalCompletions).toBe(before + 1);
  });

  it('custom traits appear in @ completions', () => {
    provider.registerTrait({ label: 'custom', kind: 'trait', detail: 'Custom' });
    const items = provider.getCompletions({ prefix: '@cus' });
    expect(items.some((i) => i.label === 'custom')).toBe(true);
  });

  it('totalCompletions counts all categories', () => {
    expect(provider.totalCompletions).toBeGreaterThan(20); // traits + directives + types + properties
  });

  // ==========================================================================
  // v6 Universal Domain Completions (v5.4 — Domains Unified)
  // ==========================================================================

  describe('v6 trait completions', () => {
    it('@end prefix returns endpoint trait', () => {
      const items = provider.getCompletions({ prefix: '@end' });
      expect(items.some((i) => i.label === 'endpoint')).toBe(true);
    });

    it('@circ prefix returns circuit_breaker trait', () => {
      const items = provider.getCompletions({ prefix: '@circ' });
      expect(items.some((i) => i.label === 'circuit_breaker')).toBe(true);
    });

    it('@pipe prefix returns pipeline trait', () => {
      const items = provider.getCompletions({ prefix: '@pipe' });
      expect(items.some((i) => i.label === 'pipeline')).toBe(true);
    });

    it('@mid prefix returns middleware trait', () => {
      const items = provider.getCompletions({ prefix: '@mid' });
      expect(items.some((i) => i.label === 'middleware')).toBe(true);
    });

    it('v6 traits appear in unfiltered @ trigger', () => {
      const items = provider.getCompletions({ prefix: '', triggerChar: '@' });
      const labels = items.map((i) => i.label);
      expect(labels).toContain('endpoint');
      expect(labels).toContain('circuit_breaker');
      expect(labels).toContain('container');
      expect(labels).toContain('migration');
      expect(labels).toContain('queue');
    });

    it('v6 traits all have v6: detail prefix', () => {
      const items = provider.getCompletions({ prefix: '', triggerChar: '@' });
      const v6Items = items.filter((i) => i.detail?.startsWith('v6:'));
      expect(v6Items.length).toBeGreaterThanOrEqual(72);
    });

    it('totalCompletions includes v6 traits', () => {
      // Must be at least spatial traits (~100) + v6 traits (~72) + directives + types + blocks
      expect(provider.totalCompletions).toBeGreaterThan(150);
    });
  });

  describe('v6 domain context completions', () => {
    it('service block context returns service-specific traits', () => {
      const items = provider.getBlockSubBlockCompletions('service');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('endpoint');
      expect(labels).toContain('handler');
      expect(labels).toContain('middleware');
      expect(labels).not.toContain('migration'); // data domain, not service
    });

    it('data block context returns data-specific traits', () => {
      const items = provider.getBlockSubBlockCompletions('data');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('db');
      expect(labels).toContain('model');
      expect(labels).toContain('migration');
      expect(labels).toContain('cache');
      expect(labels).not.toContain('endpoint'); // service domain, not data
    });

    it('resilience block context returns resilience traits', () => {
      const items = provider.getBlockSubBlockCompletions('resilience');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('circuit_breaker');
      expect(labels).toContain('retry');
      expect(labels).toContain('timeout');
      expect(labels).toContain('fallback');
      expect(labels).not.toContain('db'); // data domain, not resilience
    });

    it('pipeline block context returns pipeline traits', () => {
      const items = provider.getBlockSubBlockCompletions('pipeline');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('stream');
      expect(labels).toContain('queue');
      expect(labels).toContain('worker');
      expect(labels).toContain('scheduler');
    });

    it('container block context returns container traits', () => {
      const items = provider.getBlockSubBlockCompletions('container');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('deployment');
      expect(labels).toContain('scaling');
      expect(labels).toContain('dockerfile');
    });

    it('network block context returns network traits', () => {
      const items = provider.getBlockSubBlockCompletions('network');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('http');
      expect(labels).toContain('websocket');
      expect(labels).toContain('grpc');
      expect(labels).toContain('tls_config');
    });

    it('obs_metric block context returns metric traits', () => {
      const items = provider.getBlockSubBlockCompletions('obs_metric');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('metric');
      expect(labels).toContain('trace');
      expect(labels).toContain('health_check');
      expect(labels).toContain('slo');
    });

    it('service_contract block context returns contract traits', () => {
      const items = provider.getBlockSubBlockCompletions('service_contract');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('contract');
      expect(labels).toContain('schema');
      expect(labels).toContain('validator');
      expect(labels).toContain('dto');
    });
  });
});
