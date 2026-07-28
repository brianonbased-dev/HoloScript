import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginKeywordRegistry,
  NODE_TYPE_FAMILIES,
  registerPluginVerb,
  registerPluginVerbs,
  globalKeywordRegistry,
} from '../PluginKeywordRegistry';
import type { NodeTypeFamily, VerbEntry } from '../PluginKeywordRegistry';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fresh registry for each test (avoids global singleton bleed). */
function fresh(): PluginKeywordRegistry {
  return new PluginKeywordRegistry();
}

// ── NODE_TYPE_FAMILIES ────────────────────────────────────────────────────────

describe('NODE_TYPE_FAMILIES', () => {
  it('is a non-empty readonly array', () => {
    expect(NODE_TYPE_FAMILIES.length).toBeGreaterThan(0);
  });

  it('contains the core reaction-category families', () => {
    expect(NODE_TYPE_FAMILIES).toContain('movement');
    expect(NODE_TYPE_FAMILIES).toContain('interaction');
    expect(NODE_TYPE_FAMILIES).toContain('collision');
    expect(NODE_TYPE_FAMILIES).toContain('lifecycle');
    expect(NODE_TYPE_FAMILIES).toContain('signal');
  });

  it('contains the H2 extension families', () => {
    expect(NODE_TYPE_FAMILIES).toContain('cognitive');
    expect(NODE_TYPE_FAMILIES).toContain('control');
    expect(NODE_TYPE_FAMILIES).toContain('sensor');
    expect(NODE_TYPE_FAMILIES).toContain('transaction');
  });
});

// ── Built-ins ─────────────────────────────────────────────────────────────────

describe('PluginKeywordRegistry — built-in verbs', () => {
  it('pre-registers locomotion verbs in the movement family', () => {
    const r = fresh();
    for (const verb of ['move', 'turn', 'strafe', 'jump', 'land']) {
      expect(r.lookupFamily(verb)).toBe('movement');
    }
  });

  it('pre-registers cognitive verbs in the cognitive family', () => {
    const r = fresh();
    for (const verb of ['llm_call', 'recall', 'rag_query', 'plan', 'reflect']) {
      expect(r.lookupFamily(verb)).toBe('cognitive');
    }
  });

  it('marks built-in verbs as registeredBy "core"', () => {
    const r = fresh();
    const entries = r.entries();
    const coreEntries = entries.filter((e) => e.registeredBy === 'core');
    expect(coreEntries.length).toBeGreaterThanOrEqual(10); // 5 movement + 5 cognitive
  });

  it('starts with size >= 10 (5 movement + 5 cognitive)', () => {
    const r = fresh();
    expect(r.size).toBeGreaterThanOrEqual(10);
  });
});

// ── register ──────────────────────────────────────────────────────────────────

describe('PluginKeywordRegistry.register — happy path', () => {
  it('registers a new verb and makes it discoverable', () => {
    const r = fresh();
    r.register('actuate', 'control', 'robotics');
    expect(r.isKnownVerb('actuate')).toBe(true);
    expect(r.lookupFamily('actuate')).toBe('control');
  });

  it('registers a sensor verb', () => {
    const r = fresh();
    r.register('measure_qubits', 'sensor', 'qm-bridge');
    expect(r.lookupFamily('measure_qubits')).toBe('sensor');
  });

  it('is idempotent when the same plugin re-registers the same verb', () => {
    const r = fresh();
    r.register('dose', 'sensor', 'medical');
    expect(() => r.register('dose', 'sensor', 'medical')).not.toThrow();
    expect(r.lookupFamily('dose')).toBe('sensor');
  });

  it('increments size after each new registration', () => {
    const r = fresh();
    const before = r.size;
    r.register('emit_gcode', 'control', 'film3d-volumetrics');
    expect(r.size).toBe(before + 1);
  });
});

describe('PluginKeywordRegistry.register — conformance gate', () => {
  it('throws on an unknown family', () => {
    const r = fresh();
    expect(() => r.register('greet', 'dialogue' as NodeTypeFamily, 'chat-plugin')).toThrow(
      /Unknown node-type family/
    );
  });

  it('throws when a different plugin tries to re-register an existing verb', () => {
    const r = fresh();
    r.register('actuate', 'control', 'robotics');
    expect(() => r.register('actuate', 'control', 'other-plugin')).toThrow(
      /already registered by plugin/
    );
  });

  it('throws when trying to override a core built-in verb from a plugin', () => {
    const r = fresh();
    expect(() => r.register('move', 'movement', 'locomotion-override')).toThrow(
      /already registered by plugin "core"/
    );
  });

  it('throws on invalid verb format (uppercase)', () => {
    const r = fresh();
    expect(() => r.register('Actuate', 'control', 'robotics')).toThrow(/Invalid verb/);
  });

  it('throws on invalid verb format (starts with digit)', () => {
    const r = fresh();
    expect(() => r.register('1move', 'movement', 'bad-plugin')).toThrow(/Invalid verb/);
  });

  it('throws on empty verb string', () => {
    const r = fresh();
    expect(() => r.register('', 'signal', 'bad-plugin')).toThrow(/Invalid verb/);
  });
});

// ── seal ──────────────────────────────────────────────────────────────────────

describe('PluginKeywordRegistry.seal', () => {
  it('starts unsealed', () => {
    const r = fresh();
    expect(r.isSealed).toBe(false);
  });

  it('is sealed after calling seal()', () => {
    const r = fresh();
    r.seal();
    expect(r.isSealed).toBe(true);
  });

  it('is idempotent — sealing twice does not throw', () => {
    const r = fresh();
    r.seal();
    expect(() => r.seal()).not.toThrow();
  });

  it('blocks registration after sealing', () => {
    const r = fresh();
    r.seal();
    expect(() => r.register('actuate', 'control', 'robotics')).toThrow(/sealed/);
  });

  it('allows lookups after sealing', () => {
    const r = fresh();
    r.register('pay', 'transaction', 'wallet-plugin');
    r.seal();
    expect(r.lookupFamily('pay')).toBe('transaction');
    expect(r.isKnownVerb('move')).toBe(true);
  });
});

// ── lookupFamily / isKnownVerb ────────────────────────────────────────────────

describe('lookupFamily / isKnownVerb', () => {
  it('returns undefined for an unregistered verb', () => {
    const r = fresh();
    expect(r.lookupFamily('nonexistent')).toBeUndefined();
  });

  it('returns false for isKnownVerb on an unregistered verb', () => {
    const r = fresh();
    expect(r.isKnownVerb('nonexistent')).toBe(false);
  });

  it('returns the correct family for a registered plugin verb', () => {
    const r = fresh();
    r.register('stake', 'transaction', 'wallet-plugin');
    expect(r.lookupFamily('stake')).toBe('transaction');
  });
});

// ── verbsInFamily ─────────────────────────────────────────────────────────────

describe('verbsInFamily', () => {
  it('returns all movement verbs for the movement family', () => {
    const r = fresh();
    const verbs = r.verbsInFamily('movement');
    expect(verbs).toContain('move');
    expect(verbs).toContain('turn');
    expect(verbs).toContain('strafe');
    expect(verbs).toContain('jump');
    expect(verbs).toContain('land');
  });

  it('returns all cognitive verbs for the cognitive family', () => {
    const r = fresh();
    const verbs = r.verbsInFamily('cognitive');
    expect(verbs).toContain('llm_call');
    expect(verbs).toContain('recall');
  });

  it('includes newly registered verbs', () => {
    const r = fresh();
    r.register('measure_strain', 'sensor', 'civil-engineering');
    expect(r.verbsInFamily('sensor')).toContain('measure_strain');
  });

  it('returns an empty array for a family with no verbs', () => {
    const r = fresh();
    expect(r.verbsInFamily('transaction')).toHaveLength(0);
  });
});

// ── entries ───────────────────────────────────────────────────────────────────

describe('entries', () => {
  it('returns a readonly array of VerbEntry objects', () => {
    const r = fresh();
    const result = r.entries();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  it('each entry has verb, family, and registeredBy fields', () => {
    const r = fresh();
    for (const entry of r.entries()) {
      expect(typeof entry.verb).toBe('string');
      expect(typeof entry.family).toBe('string');
      expect(typeof entry.registeredBy).toBe('string');
    }
  });

  it('includes newly registered verbs in entries', () => {
    const r = fresh();
    r.register('emit_gcode', 'control', 'film3d-volumetrics');
    const entry = r.entries().find((e) => e.verb === 'emit_gcode');
    expect(entry).toBeDefined();
    expect(entry?.family).toBe('control');
    expect(entry?.registeredBy).toBe('film3d-volumetrics');
  });
});

// ── registerPluginVerb convenience function ───────────────────────────────────

describe('registerPluginVerb (module-level function)', () => {
  it('registers into the global registry', () => {
    // Global registry has the built-ins; this just checks the function works
    // (we can't easily isolate the global in tests, but we can verify the call succeeds)
    // Note: avoid registering verbs that would collide with other tests on the same global.
    expect(() => registerPluginVerb('pay_via_x402', 'transaction', 'x402-plugin')).not.toThrow();
    expect(globalKeywordRegistry.isKnownVerb('pay_via_x402')).toBe(true);
  });
});

// ── registerPluginVerbs batch function ───────────────────────────────────────

describe('registerPluginVerbs (batch)', () => {
  it('registers multiple verbs in one call', () => {
    const r = fresh();
    r.register = r.register.bind(r); // bind for safety

    // Use fresh registry via the method directly since registerPluginVerbs uses global
    // Test the underlying mechanism via a local registry instead
    const verbs: Array<{ verb: string; family: NodeTypeFamily }> = [
      { verb: 'attach_joint', family: 'control' },
      { verb: 'read_sensor', family: 'sensor' },
    ];
    for (const { verb, family } of verbs) {
      r.register(verb, family, 'robotics-batch-test');
    }
    expect(r.isKnownVerb('attach_joint')).toBe(true);
    expect(r.isKnownVerb('read_sensor')).toBe(true);
  });

  it('registerPluginVerbs helper registers into global', () => {
    expect(() =>
      registerPluginVerbs('insurance-plugin', [
        { verb: 'assess_risk', family: 'sensor' },
        { verb: 'issue_policy', family: 'transaction' },
      ])
    ).not.toThrow();
    expect(globalKeywordRegistry.lookupFamily('assess_risk')).toBe('sensor');
    expect(globalKeywordRegistry.lookupFamily('issue_policy')).toBe('transaction');
  });
});

// ── globalKeywordRegistry singleton ──────────────────────────────────────────

describe('globalKeywordRegistry singleton', () => {
  it('is an instance of PluginKeywordRegistry', () => {
    expect(globalKeywordRegistry).toBeInstanceOf(PluginKeywordRegistry);
  });

  it('has the built-in verbs pre-registered', () => {
    expect(globalKeywordRegistry.isKnownVerb('move')).toBe(true);
    expect(globalKeywordRegistry.isKnownVerb('llm_call')).toBe(true);
  });

  it('is not sealed at module load time', () => {
    // The global should be sealable by scene init — not pre-sealed
    // (If a prior test sealed it, this would fail — don't call seal() on the global in tests)
    expect(globalKeywordRegistry.isSealed).toBe(false);
  });
});
