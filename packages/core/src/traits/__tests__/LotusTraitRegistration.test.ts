/**
 * Lotus trait registration — runtime + parser surface parity.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VR_TRAITS } from '../constants';
import { vrTraitRegistry } from '../VRTraitSystem';

const LOTUS_RUNTIME_TRAITS = [
  'botanical_lotus',
  'phyllotaxis',
  'bloom_reactive',
  'lotus_root',
  'lotus_stalk',
  'lotus_petal',
  'lotus_center',
  'lotus_gardener',
] as const;

const GENESIS_TRIGGER = 'lotus_genesis_trigger';

describe('Lotus trait registration', () => {
  const registryPath = path.join(__dirname, '..', 'trait-registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Record<
    string,
    { id?: string; namespace?: string; source?: string }
  >;

  it('registers every backed Lotus trait with the runtime handler registry', () => {
    for (const name of LOTUS_RUNTIME_TRAITS) {
      const traitName = name as Parameters<typeof vrTraitRegistry.getHandler>[0];
      expect(vrTraitRegistry.getHandler(traitName)?.name).toBe(name);
    }
  });

  it('lists every backed Lotus trait in trait-registry.json', () => {
    for (const name of LOTUS_RUNTIME_TRAITS) {
      expect(registry[name]).toMatchObject({
        id: name,
        namespace: '@holoscript/core',
        source: 'holoscript',
      });
    }
  });

  it('admits every backed Lotus trait through the parser trait-name surface', () => {
    for (const name of LOTUS_RUNTIME_TRAITS) {
      expect(VR_TRAITS).toContain(name);
    }
  });

  it('keeps the founder-gated genesis trigger intentionally unbacked', () => {
    const traitName = GENESIS_TRIGGER as Parameters<typeof vrTraitRegistry.getHandler>[0];
    expect(vrTraitRegistry.getHandler(traitName)).toBeUndefined();
    expect(registry).not.toHaveProperty(GENESIS_TRIGGER);
    expect(VR_TRAITS).not.toContain(GENESIS_TRIGGER);
  });
});
