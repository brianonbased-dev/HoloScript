import { describe, it, expect } from 'vitest';
import { LoroDoc } from 'loro-crdt';
import {
  loroBatchTouchesEconomicTrait,
  loroEventTouchesEconomicTrait,
  isEconomicTraitName
} from './loroSpatialTraitEvents.js';
import {
  FILM3D_VOLUMETRICS_ROOT,
  registerVolumetricNode,
  setVolumetricVoxelPayload,
  unregisterVolumetricNode
} from './film3dVolumetricCrdt.js';

describe('loroSpatialTraitEvents (Loro v1.x batch shape)', () => {
  it('isEconomicTraitName narrows known traits', () => {
    expect(isEconomicTraitName('marketplace_listing')).toBe(true);
    expect(isEconomicTraitName('agent_owned_entity')).toBe(true);
    expect(isEconomicTraitName('other')).toBe(false);
  });

  it('detects economic trait when map diff includes name string', () => {
    const doc = new LoroDoc();
    const batches: Parameters<typeof loroBatchTouchesEconomicTrait>[1][] = [];
    const unsub = doc.subscribe((batch) => batches.push(batch));
    const node = doc.getMap('trait_node');
    node.set('name', 'marketplace_listing');
    doc.commit();
    unsub();
    expect(batches.length).toBeGreaterThan(0);
    const last = batches[batches.length - 1]!;
    expect(loroBatchTouchesEconomicTrait(doc, last)).toBe(true);
    expect(last.events.some((ev) => loroEventTouchesEconomicTrait(doc, ev))).toBe(true);
  });

  it('detects agent_owned_entity via batch helper', () => {
    const doc = new LoroDoc();
    const batches: Parameters<typeof loroBatchTouchesEconomicTrait>[1][] = [];
    const unsub = doc.subscribe((b) => batches.push(b));
    const m = doc.getMap('entity');
    m.set('name', 'agent_owned_entity');
    doc.commit();
    unsub();
    const economic = batches.some((b) => loroBatchTouchesEconomicTrait(doc, b));
    expect(economic).toBe(true);
  });
});

describe('film3dVolumetricCrdt (WebRTC graph root)', () => {
  it('stores voxel bytes under the shared volumetrics root', () => {
    const doc = new LoroDoc();
    registerVolumetricNode(doc, 'node-a', { format: 'voxel' });
    const payload = new Uint8Array([1, 2, 3, 4]);
    setVolumetricVoxelPayload(doc, 'node-a', payload);

    const root = doc.getMap(FILM3D_VOLUMETRICS_ROOT);
    const roundtrip = root.get('node-a::voxels');
    expect(roundtrip).toBeInstanceOf(Uint8Array);
    expect([...(roundtrip as Uint8Array)]).toEqual([1, 2, 3, 4]);
  });

  it('unregisterVolumetricNode removes prefixed keys', () => {
    const doc = new LoroDoc();
    registerVolumetricNode(doc, 'n1', { format: 'voxel' });
    setVolumetricVoxelPayload(doc, 'n1', new Uint8Array([9]));
    unregisterVolumetricNode(doc, 'n1');
    const root = doc.getMap(FILM3D_VOLUMETRICS_ROOT);
    const snap = root.toJSON() as Record<string, unknown>;
    expect(Object.keys(snap).filter((k) => k.startsWith('n1::'))).toEqual([]);
  });
});
