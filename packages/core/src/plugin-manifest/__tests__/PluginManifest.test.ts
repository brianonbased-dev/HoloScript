import { describe, it, expect, vi } from 'vitest';
import { traitName, manifestTraitNames, combinePluginRegistrations } from '../PluginManifest';
import type { PluginManifest, PluginTraitEntry, PluginRegistration } from '../PluginManifest';

// ── traitName ─────────────────────────────────────────────────────────────────

describe('traitName — string entry', () => {
  it('returns the string itself', () => {
    expect(traitName('eoq')).toBe('eoq');
  });

  it('returns the string for any value', () => {
    expect(traitName('menu')).toBe('menu');
    expect(traitName('')).toBe('');
  });
});

describe('traitName — object entry', () => {
  it('extracts the name field', () => {
    const entry: PluginTraitEntry = { name: 'demand_forecast', description: 'Demand forecasting' };
    expect(traitName(entry)).toBe('demand_forecast');
  });

  it('extracts the name when optional fields are absent', () => {
    const entry: PluginTraitEntry = { name: 'inventory' };
    expect(traitName(entry)).toBe('inventory');
  });
});

// ── manifestTraitNames ───────────────────────────────────────────────────────

describe('manifestTraitNames', () => {
  it('returns names for a string-only traits array', () => {
    const manifest: PluginManifest = {
      id: 'logistics',
      version: '1.0.0',
      traits: ['route_optimization', 'fleet_tracking'],
    };
    expect(manifestTraitNames(manifest)).toEqual(['route_optimization', 'fleet_tracking']);
  });

  it('returns names for an object-only traits array', () => {
    const manifest: PluginManifest = {
      id: 'medical',
      version: '1.0.0',
      traits: [
        { name: 'diagnosis', description: 'Differential diagnosis' },
        { name: 'treatment', outputUnit: 'mg/kg' },
      ],
    };
    expect(manifestTraitNames(manifest)).toEqual(['diagnosis', 'treatment']);
  });

  it('handles a mixed string and object traits array', () => {
    const manifest: PluginManifest = {
      id: 'mixed',
      version: '1.0.0',
      traits: ['raw_trait', { name: 'rich_trait', description: 'With metadata' }],
    };
    expect(manifestTraitNames(manifest)).toEqual(['raw_trait', 'rich_trait']);
  });

  it('returns an empty array for an empty traits array', () => {
    const manifest: PluginManifest = { id: 'empty', version: '1.0.0', traits: [] };
    expect(manifestTraitNames(manifest)).toEqual([]);
  });
});

// ── combinePluginRegistrations ────────────────────────────────────────────────

interface MockRegistrar {
  registeredTraits: Array<{ name: string; handler: () => void }>;
  registerTrait(name: string, handler: () => void): void;
}

function makeMockRegistrar(): MockRegistrar {
  const registrar: MockRegistrar = {
    registeredTraits: [],
    registerTrait(name, handler) {
      this.registeredTraits.push({ name, handler });
    },
  };
  return registrar;
}

describe('combinePluginRegistrations — empty array', () => {
  it('returns empty pluginIds and traitNames', () => {
    const registrar = makeMockRegistrar();
    const result = combinePluginRegistrations(registrar, []);
    expect(result.pluginIds).toEqual([]);
    expect(result.traitNames).toEqual([]);
  });

  it('calls no register functions', () => {
    const registrar = makeMockRegistrar();
    combinePluginRegistrations(registrar, []);
    expect(registrar.registeredTraits).toHaveLength(0);
  });
});

describe('combinePluginRegistrations — single plugin', () => {
  const manifest: PluginManifest = {
    id: 'aerospace',
    version: '2.0.0',
    traits: ['delta_v', 'orbit', { name: 'thermal_load', outputUnit: 'W/m²' }],
  };

  it('returns the plugin id', () => {
    const registrar = makeMockRegistrar();
    const handler = vi.fn();
    const plugin: PluginRegistration<MockRegistrar> = {
      manifest,
      register: (r) => r.registerTrait('delta_v', handler),
    };
    const result = combinePluginRegistrations(registrar, [plugin]);
    expect(result.pluginIds).toEqual(['aerospace']);
  });

  it('returns all declared trait names from the manifest', () => {
    const registrar = makeMockRegistrar();
    const plugin: PluginRegistration<MockRegistrar> = {
      manifest,
      register: (r) => r.registerTrait('delta_v', vi.fn()),
    };
    const result = combinePluginRegistrations(registrar, [plugin]);
    expect(result.traitNames).toEqual(['delta_v', 'orbit', 'thermal_load']);
  });

  it('calls the register function with the registrar', () => {
    const registrar = makeMockRegistrar();
    const register = vi.fn();
    combinePluginRegistrations(registrar, [{ manifest, register }]);
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(registrar);
  });
});

describe('combinePluginRegistrations — multiple plugins', () => {
  const aerospaceManifest: PluginManifest = {
    id: 'aerospace',
    version: '2.0.0',
    traits: ['delta_v', 'orbit'],
  };
  const medicalManifest: PluginManifest = {
    id: 'medical',
    version: '1.5.0',
    traits: ['diagnosis', { name: 'treatment', description: 'Treatment planning' }],
  };

  it('accumulates all plugin ids in order', () => {
    const registrar = makeMockRegistrar();
    const result = combinePluginRegistrations(registrar, [
      { manifest: aerospaceManifest, register: vi.fn() },
      { manifest: medicalManifest, register: vi.fn() },
    ]);
    expect(result.pluginIds).toEqual(['aerospace', 'medical']);
  });

  it('accumulates all trait names in declaration order', () => {
    const registrar = makeMockRegistrar();
    const result = combinePluginRegistrations(registrar, [
      { manifest: aerospaceManifest, register: vi.fn() },
      { manifest: medicalManifest, register: vi.fn() },
    ]);
    expect(result.traitNames).toEqual(['delta_v', 'orbit', 'diagnosis', 'treatment']);
  });

  it('calls each register function exactly once', () => {
    const registrar = makeMockRegistrar();
    const registerA = vi.fn();
    const registerB = vi.fn();
    combinePluginRegistrations(registrar, [
      { manifest: aerospaceManifest, register: registerA },
      { manifest: medicalManifest, register: registerB },
    ]);
    expect(registerA).toHaveBeenCalledOnce();
    expect(registerB).toHaveBeenCalledOnce();
  });

  it('calls register functions in array order', () => {
    const registrar = makeMockRegistrar();
    const callOrder: string[] = [];
    combinePluginRegistrations(registrar, [
      { manifest: aerospaceManifest, register: () => callOrder.push('aerospace') },
      { manifest: medicalManifest, register: () => callOrder.push('medical') },
    ]);
    expect(callOrder).toEqual(['aerospace', 'medical']);
  });
});

describe('combinePluginRegistrations — registrar passthrough', () => {
  it('passes the same registrar instance to every register function', () => {
    const registrar = makeMockRegistrar();
    const received: MockRegistrar[] = [];
    const manifests = [
      { id: 'a', version: '1.0.0', traits: ['x'] },
      { id: 'b', version: '1.0.0', traits: ['y'] },
    ] satisfies PluginManifest[];
    combinePluginRegistrations(
      registrar,
      manifests.map((manifest) => ({
        manifest,
        register: (r: MockRegistrar) => received.push(r),
      }))
    );
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(registrar);
    expect(received[1]).toBe(registrar);
  });
});

describe('PluginManifest — optional fields', () => {
  it('accepts a manifest with only required fields', () => {
    const manifest: PluginManifest = {
      id: 'minimal',
      version: '0.1.0',
      traits: ['ping'],
    };
    expect(manifest.autoRegister).toBeUndefined();
    expect(manifest.name).toBeUndefined();
    expect(manifest.coreVersion).toBeUndefined();
    expect(manifest.solverContract).toBeUndefined();
    expect(manifest.receiptSchema).toBeUndefined();
  });

  it('accepts a fully-specified manifest', () => {
    const manifest: PluginManifest = {
      id: 'full',
      version: '3.0.0',
      traits: [{ name: 'compute', description: 'Heavy compute', outputUnit: 'FLOPS' }],
      name: 'Full Plugin',
      description: 'All optional fields present',
      autoRegister: true,
      coreVersion: '>=8.0.0',
      runtimeEntry: './src/runtime.ts',
      solverContract: 'full-solver-contract-v1',
      receiptSchema: 'full-receipt-schema-v1',
    };
    expect(manifest.autoRegister).toBe(true);
    expect(manifest.coreVersion).toBe('>=8.0.0');
    expect(manifest.solverContract).toBe('full-solver-contract-v1');
  });
});
