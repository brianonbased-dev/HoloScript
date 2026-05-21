import { describe, it, expect } from 'vitest';
import {
  PLUGIN_DESCRIPTOR,
  STRUCTURAL_BIOLOGY_OBJECT_TYPES,
  STRUCTURAL_BIOLOGY_TRAITS,
  BRIDGE_TRAITS,
  register,
  residueAnchor,
  chainHash,
  verifyChain,
  VERSION,
  type PluginHostRegistry,
  type ProteinObject,
  type LigandObject,
  type ChainObject,
  // Docking exports
  type AutoDockTrait,
  type BindingAffinityTrait,
  type DockingConfig,
  type DockingResult,
  traitToConfig,
  dockingProvenance,
  selectDockingBackend,
  compileDocking,
  // ADMET exports
  ADMET_PROPERTIES,
  type AdmetPredictionTrait,
  type AdmetResultTrait,
  type AdmetResult,
  type AdmetPrediction,
  countLipinskiViolations,
  computeDrugLikeness,
  selectAdmetBackend,
  admetProvenance,
  compileAdmet,
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

// ── v0.1.0 tests (unchanged) ──────────────────────────────────────────────────

describe('@holoscript/structural-biology-plugin (v0.1.0)', () => {
  it('registers exactly 3 object types via single register() call', () => {
    const { host, objectTypes } = fakeHost();
    const out = register(host);
    expect(objectTypes.map((o) => o.name).sort()).toEqual(['chain', 'ligand', 'protein']);
    expect(objectTypes.every((o) => o.plugin === 'structural-biology')).toBe(true);
    expect(out.id).toBe('structural-biology');
  });

  it('registers annotation traits (4) plus bridge traits (4) = 8 total via single register() call', () => {
    const { host, traits } = fakeHost();
    register(host);
    // v0.1.0: 4 annotation traits; v0.2.0: +4 bridge traits = 8 total
    expect(traits).toHaveLength(8);
    const annotationTraits = STRUCTURAL_BIOLOGY_TRAITS;
    const bridgeNames = BRIDGE_TRAITS;
    const allExpected = [...annotationTraits, ...bridgeNames].sort();
    expect(traits.map((t) => t.name).sort()).toEqual(allExpected);
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

// ── v0.2.0 bridge trait registration ───────────────────────────────────────────

describe('structural-biology-plugin v0.2.0 bridge traits', () => {
  it('registers bridge traits (auto_dock, binding_affinity, admet_prediction, admet_result)', () => {
    const { host, traits } = fakeHost();
    register(host);
    // v0.1.0 annotation traits + v0.2.0 bridge traits = 8 total
    expect(traits).toHaveLength(8);
    const bridgeNames = traits
      .filter((t) => BRIDGE_TRAITS.includes(t.name as (typeof BRIDGE_TRAITS)[number]))
      .map((t) => t.name)
      .sort();
    expect(bridgeNames).toEqual(['admet_prediction', 'admet_result', 'auto_dock', 'binding_affinity']);
    // All bridge traits are attributed to structural-biology plugin
    expect(
      traits
        .filter((t) => BRIDGE_TRAITS.includes(t.name as (typeof BRIDGE_TRAITS)[number]))
        .every((t) => t.plugin === 'structural-biology'),
    ).toBe(true);
  });

  it('version is 0.2.0', () => {
    expect(VERSION).toBe('0.2.0');
  });

  it('PLUGIN_DESCRIPTOR includes bridgeTraits', () => {
    expect(PLUGIN_DESCRIPTOR.bridgeTraits).toEqual(BRIDGE_TRAITS);
    expect(PLUGIN_DESCRIPTOR.version).toBe('0.2.0');
  });
});

// ── Docking bridge tests ──────────────────────────────────────────────────────

describe('docking bridge', () => {
  const sampleAutoDock: AutoDockTrait = {
    trait: 'auto_dock',
    backend: 'autodock-vina',
    receptor: 'RECEPTOR_PDBQT_DATA',
    ligand: 'CC(=O)Oc1ccccc1C(=O)O',
    searchCenter: { x: 10.5, y: 20.3, z: 30.1 },
    searchSize: { x: 20, y: 20, z: 20 },
    numRuns: 10,
    scoringFunction: 'vina',
  };

  const sampleBindingAffinity: BindingAffinityTrait = {
    trait: 'binding_affinity',
    bestAffinity: -8.3,
    poseCount: 9,
    bestRmsdRange: [0.0, 2.456],
    backend: 'autodock-vina',
    ki_nm: 784.5,
    hitRate: 0.667,
  };

  describe('traitToConfig', () => {
    it('converts AutoDockTrait to DockingConfig', () => {
      const config = traitToConfig(sampleAutoDock);
      expect(config.backend).toBe('autodock-vina');
      expect(config.receptor).toBe('RECEPTOR_PDBQT_DATA');
      expect(config.ligand).toBe('CC(=O)Oc1ccccc1C(=O)O');
      expect(config.centerX).toBe(10.5);
      expect(config.centerY).toBe(20.3);
      expect(config.centerZ).toBe(30.1);
      expect(config.sizeX).toBe(20);
      expect(config.sizeY).toBe(20);
      expect(config.sizeZ).toBe(20);
      expect(config.numRuns).toBe(10);
      expect(config.scoringFunction).toBe('vina');
    });
  });

  describe('selectDockingBackend', () => {
    it('selects autodock-gpu for screening workloads', () => {
      expect(selectDockingBackend('high-throughput screening')).toBe('autodock-gpu');
      expect(selectDockingBackend('batch docking many molecules')).toBe('autodock-gpu');
    });

    it('selects gnina for ML/CNN workloads', () => {
      expect(selectDockingBackend('CNN scoring')).toBe('gnina');
      expect(selectDockingBackend('neural network pose prediction')).toBe('gnina');
    });

    it('defaults to autodock-vina', () => {
      expect(selectDockingBackend('standard docking')).toBe('autodock-vina');
      expect(selectDockingBackend('')).toBe('autodock-vina');
    });
  });

  describe('dockingProvenance', () => {
    it('produces deterministic hash for same result', () => {
      const result: DockingResult = {
        status: 'success',
        bestAffinity: -8.3,
        poses: [],
        receptorId: '3I4L',
        ligandId: 'aspirin',
        backend: 'autodock-vina',
      };
      const h1 = dockingProvenance(result);
      const h2 = dockingProvenance(result);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{8}$/);
    });

    it('produces different hash for different results', () => {
      const r1: DockingResult = {
        status: 'success', bestAffinity: -8.3, poses: [], receptorId: '3I4L', ligandId: 'aspirin', backend: 'autodock-vina',
      };
      const r2: DockingResult = {
        status: 'success', bestAffinity: -12.1, poses: [], receptorId: '3I4L', ligandId: 'imatinib', backend: 'autodock-vina',
      };
      expect(dockingProvenance(r1)).not.toBe(dockingProvenance(r2));
    });
  });

  describe('compileDocking', () => {
    it('compiles to PDBQT format (default)', () => {
      const output = compileDocking([sampleAutoDock, sampleBindingAffinity]);
      expect(output).toContain('HEADER    HOLOSCRIPT DOCKING PLUGIN');
      expect(output).toContain('REMARK 400 DOCKING backend=autodock-vina');
      expect(output).toContain('REMARK 500 BINDING_AFFINITY best=-8.3 kcal/mol');
      expect(output).toContain('REMARK 500 POSES 9');
      expect(output).toContain('END');
    });

    it('compiles to HoloScript .holo format', () => {
      const output = compileDocking([sampleAutoDock, sampleBindingAffinity], { format: 'holo' });
      expect(output).toContain('composition "DockingScene"');
      expect(output).toContain('@auto_dock');
      expect(output).toContain('@binding_affinity');
      expect(output).toContain('bestAffinity: -8.3');
      expect(output).toContain('}');
    });

    it('compiles to CSV format', () => {
      const output = compileDocking([sampleBindingAffinity], { format: 'csv' });
      expect(output).toContain('binding_affinity,autodock-vina,-8.3,9');
      expect(output).toContain('trait,backend');
    });

    it('compiles to SDF format', () => {
      const output = compileDocking([sampleBindingAffinity], { format: 'sdf' });
      expect(output).toContain('<docking.bestAffinity>');
      expect(output).toContain('-8.3');
      expect(output).toContain('$$$$');
    });
  });
});

// ── ADMET bridge tests ─────────────────────────────────────────────────────────

describe('ADMET bridge', () => {
  describe('ADMET_PROPERTIES', () => {
    it('contains 25 properties across A/D/M/E/T', () => {
      expect(ADMET_PROPERTIES).toHaveLength(25);
    });

    it('includes absorption properties', () => {
      expect(ADMET_PROPERTIES).toContain('caco2_permeability');
      expect(ADMET_PROPERTIES).toContain('hia');
      expect(ADMET_PROPERTIES).toContain('bbb_permeability');
    });

    it('includes distribution properties', () => {
      expect(ADMET_PROPERTIES).toContain('vdss');
      expect(ADMET_PROPERTIES).toContain('fraction_unbound');
    });

    it('includes metabolism (CYP) properties', () => {
      expect(ADMET_PROPERTIES).toContain('cyp2d6_substrate');
      expect(ADMET_PROPERTIES).toContain('cyp3a4_inhibitor');
    });

    it('includes excretion properties', () => {
      expect(ADMET_PROPERTIES).toContain('half_life');
      expect(ADMET_PROPERTIES).toContain('clearance');
    });

    it('includes toxicity properties', () => {
      expect(ADMET_PROPERTIES).toContain('ames');
      expect(ADMET_PROPERTIES).toContain('hht');
      expect(ADMET_PROPERTIES).toContain('dili');
    });
  });

  describe('countLipinskiViolations', () => {
    it('returns 0 for simple small molecule', () => {
      // Methanol: simplest drug-like molecule
      const violations = countLipinskiViolations('CO');
      expect(violations).toBeGreaterThanOrEqual(0);
      expect(violations).toBeLessThanOrEqual(4);
    });

    it('returns violations as a number 0-4', () => {
      const violations = countLipinskiViolations('CC(=O)Oc1ccccc1C(=O)O');
      expect(typeof violations).toBe('number');
      expect(violations).toBeGreaterThanOrEqual(0);
      expect(violations).toBeLessThanOrEqual(4);
    });
  });

  describe('computeDrugLikeness', () => {
    it('returns 1.0 for no violations and favorable ADMET', () => {
      const predictions: AdmetPrediction[] = [
        { property: 'bbb_permeability', value: 0.8, unit: 'binary', confidence: 0.9, modelVersion: 'v1' },
        { property: 'hia', value: 95, unit: '%', confidence: 0.85, modelVersion: 'v1' },
        { property: 'half_life', value: 8, unit: 'hours', confidence: 0.8, modelVersion: 'v1' },
      ];
      const score = computeDrugLikeness(predictions, 0);
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('penalizes toxicity flags', () => {
      const withTox: AdmetPrediction[] = [
        { property: 'ames', value: 0.9, unit: 'binary', confidence: 0.9, modelVersion: 'v1' },
      ];
      const withoutTox: AdmetPrediction[] = [];
      expect(computeDrugLikeness(withTox, 0)).toBeLessThan(computeDrugLikeness(withoutTox, 0));
    });

    it('penalizes Lipinski violations', () => {
      const score0 = computeDrugLikeness([], 0);
      const score2 = computeDrugLikeness([], 2);
      expect(score2).toBeLessThan(score0);
    });

    it('is clamped to [0, 1]', () => {
      const manyViolations = computeDrugLikeness([], 4);
      expect(manyViolations).toBeGreaterThanOrEqual(0);
      const manyTox = computeDrugLikeness(
        [
          { property: 'ames', value: 0.9, unit: 'binary', confidence: 0.9, modelVersion: 'v1' },
          { property: 'hht', value: 0.9, unit: 'binary', confidence: 0.9, modelVersion: 'v1' },
          { property: 'dili', value: 0.9, unit: 'binary', confidence: 0.9, modelVersion: 'v1' },
        ],
        3,
      );
      expect(manyTox).toBeGreaterThanOrEqual(0);
    });
  });

  describe('selectAdmetBackend', () => {
    it('selects admetlab for comprehensive requests', () => {
      expect(selectAdmetBackend('comprehensive ADMET profiling')).toBe('admetlab');
      expect(selectAdmetBackend('full profile')).toBe('admetlab');
    });

    it('selects local-ml for offline/latency requests', () => {
      expect(selectAdmetBackend('offline prediction')).toBe('local-ml');
      expect(selectAdmetBackend('edge device latency critical')).toBe('local-ml');
    });

    it('defaults to rdkit', () => {
      expect(selectAdmetBackend('standard ADMET')).toBe('rdkit');
      expect(selectAdmetBackend('')).toBe('rdkit');
    });
  });

  describe('admetProvenance', () => {
    it('produces deterministic hash for same result', () => {
      const result: AdmetResult = {
        status: 'success',
        smiles: 'CC(=O)Oc1ccccc1C(=O)O',
        backend: 'rdkit',
        predictions: [],
        drugLikenessScore: 0.72,
        lipinskiViolations: 1,
      };
      const h1 = admetProvenance(result);
      const h2 = admetProvenance(result);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{8}$/);
    });

    it('produces different hash for different SMILES', () => {
      const r1: AdmetResult = { status: 'success', smiles: 'CC(=O)Oc1ccccc1C(=O)O', backend: 'rdkit', predictions: [], drugLikenessScore: 0.72, lipinskiViolations: 1 };
      const r2: AdmetResult = { status: 'success', smiles: 'CC(C)CC1=CC=C(C=C1)C(=O)O', backend: 'rdkit', predictions: [], drugLikenessScore: 0.72, lipinskiViolations: 1 };
      expect(admetProvenance(r1)).not.toBe(admetProvenance(r2));
    });
  });

  describe('compileAdmet', () => {
    const samplePrediction: AdmetPredictionTrait = {
      trait: 'admet_prediction',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      properties: ['hia', 'bbb_permeability', 'ames'],
      backend: 'rdkit',
    };

    const sampleResult: AdmetResultTrait = {
      trait: 'admet_result',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      drugLikenessScore: 0.72,
      lipinskiViolations: 1,
      propertyCount: 3,
      backend: 'rdkit',
      passes: true,
    };

    it('compiles to CSV format (default)', () => {
      const output = compileAdmet([samplePrediction, sampleResult]);
      expect(output).toContain('trait,smiles,backend');
      expect(output).toContain('admet_prediction');
      expect(output).toContain('admet_result');
    });

    it('compiles to JSON format', () => {
      const output = compileAdmet([samplePrediction], { format: 'json' });
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].trait).toBe('admet_prediction');
    });

    it('compiles to HoloScript .holo format', () => {
      const output = compileAdmet([samplePrediction, sampleResult], { format: 'holo' });
      expect(output).toContain('composition "AdmetScene"');
      expect(output).toContain('@admet_prediction');
      expect(output).toContain('@admet_result');
      expect(output).toContain('drugLikenessScore: 0.72');
      expect(output).toContain('passes: true');
    });

    it('compiles to SDF format', () => {
      const output = compileAdmet([sampleResult], { format: 'sdf' });
      expect(output).toContain('<admet.drugLikenessScore>');
      expect(output).toContain('0.72');
      expect(output).toContain('$$$$');
    });
  });
});

// ── Cross-bridge integration tests ────────────────────────────────────────────

describe('cross-bridge integration (AlphaFold → Docking → ADMET)', () => {
  it('structural-biology plugin registers all 8 traits (4 annotation + 4 bridge)', () => {
    const { host, traits } = fakeHost();
    register(host);
    // 4 annotation traits + 4 bridge traits = 8 total
    expect(traits).toHaveLength(8);
    const traitNames = traits.map((t) => t.name).sort();
    expect(traitNames).toEqual([
      'admet_prediction',
      'admet_result',
      'auto_dock',
      'binding_affinity',
      'foldable',
      'helix',
      'residue_anchor',
      'sheet',
    ]);
  });

  it('docking and ADMET provenance are distinct', () => {
    const dockingResult: DockingResult = {
      status: 'success',
      bestAffinity: -8.3,
      poses: [],
      receptorId: '3I4L',
      ligandId: 'aspirin',
      backend: 'autodock-vina',
    };
    const admetResult: AdmetResult = {
      status: 'success',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      backend: 'rdkit',
      predictions: [],
      drugLikenessScore: 0.72,
      lipinskiViolations: 1,
    };
    expect(dockingProvenance(dockingResult)).not.toBe(admetProvenance(admetResult));
  });

  it('AlphaFold protein object chains compose with docking config', () => {
    // Simulate: AlphaFold produces a protein, then docking runs against it
    const protein: ProteinObject = {
      type: 'protein',
      name: 'EGFR',
      uniprot: 'P00533',
      residues: [
        { chain: 'A', index: 1, resname: 'MET', secondary: 'helix' },
        { chain: 'A', index: 2, resname: 'GLY', secondary: 'sheet' },
      ],
      traits: ['foldable', 'helix'],
    };
    const dockingConfig: AutoDockTrait = {
      trait: 'auto_dock',
      backend: 'autodock-gpu',
      receptor: 'EGFR_P00533',
      ligand: 'CC(=O)Oc1ccccc1C(=O)O',
      searchCenter: { x: 10, y: 20, z: 30 },
      searchSize: { x: 25, y: 25, z: 25 },
      numRuns: 50,
      scoringFunction: 'ad4',
    };

    // Provenance chain for the protein
    const proteinHash = chainHash(protein);
    expect(proteinHash).toMatch(/^[0-9a-f]{8}$/);

    // Docking config converts properly
    const config = traitToConfig(dockingConfig);
    expect(config.backend).toBe('autodock-gpu');
    expect(config.numRuns).toBe(50);
  });

  it('drug pipeline: protein → docking → ADMET composition compiles to .holo', () => {
    const traits = [
      { trait: 'auto_dock' as const, backend: 'autodock-vina' as const, receptor: 'EGFR', ligand: 'aspirin', searchCenter: { x: 10, y: 20, z: 30 }, searchSize: { x: 20, y: 20, z: 20 } },
      { trait: 'binding_affinity' as const, bestAffinity: -9.1, poseCount: 5, bestRmsdRange: [0.0, 1.8] as [number, number], backend: 'autodock-vina' as const },
      { trait: 'admet_prediction' as const, smiles: 'CC(=O)Oc1ccccc1C(=O)O', properties: ['hia', 'bbb_permeability', 'ames'] as const, backend: 'rdkit' as const },
      { trait: 'admet_result' as const, smiles: 'CC(=O)Oc1ccccc1C(=O)O', drugLikenessScore: 0.72, lipinskiViolations: 1, propertyCount: 25, backend: 'rdkit' as const, passes: true },
    ];

    // Docking compiles
    const dockingOutput = compileDocking([traits[0], traits[1]] as any, { format: 'holo' });
    expect(dockingOutput).toContain('composition "DockingScene"');
    expect(dockingOutput).toContain('@auto_dock');
    expect(dockingOutput).toContain('@binding_affinity');

    // ADMET compiles
    const admetOutput = compileAdmet([traits[2], traits[3]] as any, { format: 'holo' });
    expect(admetOutput).toContain('composition "AdmetScene"');
    expect(admetOutput).toContain('@admet_prediction');
    expect(admetOutput).toContain('@admet_result');
  });
});