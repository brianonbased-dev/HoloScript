// Testbed tests — topology validation, seed-legit manifest, isolation gate.
// G.GOLD.013/015: test false cases explicitly.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOPOLOGY,
  validateTopology,
  type TestbedTopology,
} from '../src/testbed/testbed-config.js';
import { seedLegit, type ServerManifest } from '../src/testbed/seed-legit.js';

describe('validateTopology', () => {
  it('accepts default topology', () => {
    const errors = validateTopology(DEFAULT_TOPOLOGY);
    expect(errors).toHaveLength(0);
  });

  it('rejects <10 legitimate servers', () => {
    const topo: TestbedTopology = {
      ...DEFAULT_TOPOLOGY,
      legitimateServers: DEFAULT_TOPOLOGY.legitimateServers.slice(0, 5),
    };
    const errors = validateTopology(topo);
    expect(errors.some((e) => e.includes('Legitimate server count'))).toBe(true);
  });

  it('rejects <2 adversarial servers', () => {
    const topo: TestbedTopology = {
      ...DEFAULT_TOPOLOGY,
      adversarialServers: DEFAULT_TOPOLOGY.adversarialServers.slice(0, 1),
    };
    const errors = validateTopology(topo);
    expect(errors.some((e) => e.includes('Adversarial server count'))).toBe(true);
  });

  it('rejects duplicate server ids', () => {
    const topo: TestbedTopology = {
      ...DEFAULT_TOPOLOGY,
      legitimateServers: [
        ...DEFAULT_TOPOLOGY.legitimateServers,
        DEFAULT_TOPOLOGY.legitimateServers[0], // duplicate
      ],
    };
    const errors = validateTopology(topo);
    expect(errors.some((e) => e.includes('Duplicate server id'))).toBe(true);
  });
});

describe('seedLegit', () => {
  it('emits a manifest with all servers', () => {
    const manifest = seedLegit();
    expect(manifest.servers.length).toBe(
      DEFAULT_TOPOLOGY.legitimateServers.length +
        DEFAULT_TOPOLOGY.adversarialServers.length
    );
    expect(manifest.sandboxId).toBe(DEFAULT_TOPOLOGY.sandboxId);
    expect(manifest.networkName).toBe(DEFAULT_TOPOLOGY.networkName);
  });

  it('includes adversarial flags on attack servers', () => {
    const manifest = seedLegit();
    const adv = manifest.servers.filter((s) => s.adversarial);
    expect(adv.length).toBe(DEFAULT_TOPOLOGY.adversarialServers.length);
    for (const s of adv) {
      expect(s.attackId).toBeTruthy();
    }
  });

  it('throws on invalid topology', () => {
    const badTopo: TestbedTopology = {
      ...DEFAULT_TOPOLOGY,
      legitimateServers: DEFAULT_TOPOLOGY.legitimateServers.slice(0, 3),
    };
    expect(() => seedLegit(badTopo)).toThrow('Testbed topology invalid');
  });
});

describe('DEFAULT_TOPOLOGY', () => {
  it('has ≥10 legitimate servers', () => {
    expect(DEFAULT_TOPOLOGY.legitimateServers.length).toBeGreaterThanOrEqual(10);
  });

  it('has ≥2 adversarial servers', () => {
    expect(DEFAULT_TOPOLOGY.adversarialServers.length).toBeGreaterThanOrEqual(2);
  });

  it('has ≥2 sybil adversarial servers (K≥5 per spec)', () => {
    const sybilCount = DEFAULT_TOPOLOGY.adversarialServers.filter(
      (s) => s.attackId === 'sybil'
    ).length;
    expect(sybilCount).toBeGreaterThanOrEqual(2);
  });

  it('has at least one server per attack class', () => {
    const attacks = new Set(DEFAULT_TOPOLOGY.adversarialServers.map((s) => s.attackId));
    expect(attacks.has('whitewasher')).toBe(true);
    expect(attacks.has('sybil')).toBe(true);
    expect(attacks.has('score-manipulator')).toBe(true);
    expect(attacks.has('slow-poisoner')).toBe(true);
    expect(attacks.has('eclipse')).toBe(true);
  });
});
