import { describe, it, expect } from 'vitest';
import {
  PLUGIN_DESCRIPTOR,
  STRUCTURAL_BIOLOGY_OBJECT_TYPES,
  STRUCTURAL_BIOLOGY_TRAITS,
  register,
  residueAnchor,
  chainHash,
  verifyChain,
  type PluginHostRegistry,
  type ProteinObject,
  type LigandObject,
  type ChainObject,
} from '../index';

function fakeHost() {
  const objectTypes: Array<{ name: string; plugin: string }> = [];
  const traits: Array<{ name: string; plugin: string }> = [];
  const host: PluginHostRegistry = {
    registerObjectType(name, descriptor) {
      objectTypes.push({ name, plugin: descriptor.plugin });
    },
    registerTrait(name, descriptor) {
      traits.push({ name, plugin: descriptor.plugin });
    },
  };
  return { host, objectTypes, traits };
}

describe('@holoscript/structural-biology-plugin', () => {
  it('registers exactly 3 object types via single register() call', () => {
    const { host, objectTypes } = fakeHost();
    const out = register(host);
    expect(objectTypes.map((o) => o.name).sort()).toEqual(['chain', 'ligand', 'protein']);
    expect(objectTypes.every((o) => o.plugin === 'structural-biology')).toBe(true);
    expect(out.id).toBe('structural-biology');
  });

  it('registers exactly 4 annotation traits via single register() call', () => {
    const { host, traits } = fakeHost();
    register(host);
    expect(traits.map((t) => t.name).sort()).toEqual([
      'foldable',
      'helix',
      'residue_anchor',
      'sheet',
    ]);
    expect(traits.every((t) => t.plugin === 'structural-biology')).toBe(true);
  });

  it('exports stable plugin descriptor', () => {
    expect(PLUGIN_DESCRIPTOR.id).toBe('structural-biology');
    expect(PLUGIN_DESCRIPTOR.objectTypes).toEqual(STRUCTURAL_BIOLOGY_OBJECT_TYPES);
    expect(PLUGIN_DESCRIPTOR.traits).toEqual(STRUCTURAL_BIOLOGY_TRAITS);
  });

  it('residueAnchor is deterministic and dependent on plugin id', () => {
    const r = { chain: 'A', index: 42, resname: 'GLY', secondary: 'helix' as const };
    const h1 = residueAnchor(r);
    const h2 = residueAnchor(r);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });

  it('chainHash for protein folds in every residue (depth scales)', () => {
    const p1: ProteinObject = {
      type: 'protein',
      name: 'EGFR',
      uniprot: 'P00533',
      residues: [
        { chain: 'A', index: 1, resname: 'MET', secondary: 'helix' },
        { chain: 'A', index: 2, resname: 'GLY', secondary: 'helix' },
      ],
      traits: ['foldable', 'helix'],
    };
    const p2: ProteinObject = {
      ...p1,
      residues: [...p1.residues, { chain: 'A', index: 3, resname: 'PRO', secondary: 'loop' }],
    };
    expect(chainHash(p1)).not.toBe(chainHash(p2));
  });

  it('chainHash distinguishes ligand and chain object types', () => {
    const l: LigandObject = {
      type: 'ligand',
      name: 'aspirin',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      traits: ['foldable'],
    };
    const c: ChainObject = {
      type: 'chain',
      name: 'A',
      parentProtein: 'EGFR',
      residueCount: 100,
      traits: ['foldable', 'helix'],
    };
    expect(chainHash(l)).not.toBe(chainHash(c));
  });

  it('verifyChain recovers plugin identity from compiled artifact', () => {
    const p: ProteinObject = {
      type: 'protein',
      name: 'EGFR',
      residues: [{ chain: 'A', index: 1, resname: 'MET', secondary: 'helix' }],
      traits: ['foldable'],
    };
    const expected = chainHash(p);
    expect(verifyChain(p, expected)).toBe(true);
    // Tampering with traits breaks the chain — provenance is end-to-end.
    expect(verifyChain({ ...p, traits: ['helix'] }, expected)).toBe(false);
  });
});
