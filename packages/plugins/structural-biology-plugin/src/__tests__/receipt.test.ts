import { describe, it, expect } from 'vitest';
import {
  createDockingReceipt,
  createAdmetReceipt,
  createDrugDiscoveryReceipt,
  runDrugDiscoveryPipeline,
  compileDockingReceiptToHolo,
  compileAdmetReceiptToHolo,
  compileDrugDiscoveryReceiptToHolo,
  type DockingReceipt,
  type AdmetReceipt,
  type DrugDiscoveryReceipt,
} from '../receipt';
import {
  type DockingConfig,
  type DockingResult,
  type DockingPose,
  type AdmetConfig,
  type AdmetResult,
  type AdmetPrediction,
} from '../index';

// ── Test fixtures ──────────────────────────────────────────────────────────────

const sampleDockingConfig: DockingConfig = {
  backend: 'autodock-vina',
  receptor: 'EGFR_P00533',
  ligand: 'CC(=O)Oc1ccccc1C(=O)O',
  centerX: 10.5,
  centerY: 20.3,
  centerZ: 30.1,
  sizeX: 20,
  sizeY: 20,
  sizeZ: 20,
  numRuns: 10,
  scoringFunction: 'vina',
};

const sampleDockingResult: DockingResult = {
  status: 'success',
  bestAffinity: -8.3,
  poses: [
    { affinity: -8.3, rmsdLb: 0.0, rmsdUb: 1.234, poseData: 'POSE_DATA_1' },
    { affinity: -7.1, rmsdLb: 1.5, rmsdUb: 2.456, poseData: 'POSE_DATA_2' },
    { affinity: -6.8, rmsdLb: 2.1, rmsdUb: 3.789, poseData: 'POSE_DATA_3' },
  ] as DockingPose[],
  receptorId: 'EGFR_P00533',
  ligandId: 'aspirin',
  backend: 'autodock-vina',
  executionTimeMs: 4500,
};

const sampleAdmetConfig: AdmetConfig = {
  backend: 'rdkit',
  smiles: 'CC(=O)Oc1ccccc1C(=O)O',
  properties: ['hia', 'bbb_permeability', 'ames'],
};

const sampleAdmetPredictions: AdmetPrediction[] = [
  { property: 'hia', value: 95, unit: '%', confidence: 0.85, modelVersion: 'v1' },
  { property: 'bbb_permeability', value: 0.8, unit: 'binary', confidence: 0.9, modelVersion: 'v1' },
  { property: 'ames', value: 0.1, unit: 'binary', confidence: 0.92, modelVersion: 'v1' },
];

const sampleAdmetResult: AdmetResult = {
  status: 'success',
  smiles: 'CC(=O)Oc1ccccc1C(=O)O',
  backend: 'rdkit',
  predictions: sampleAdmetPredictions,
  drugLikenessScore: 0.72,
  lipinskiViolations: 1,
  executionTimeMs: 200,
};

// ── DockingReceipt tests ──────────────────────────────────────────────────────

describe('DockingReceipt', () => {
  it('creates a receipt with correct fields', () => {
    const receipt = createDockingReceipt(sampleDockingConfig, sampleDockingResult);

    expect(receipt.pluginId).toBe('structural-biology@0.2.0');
    expect(receipt.scale).toBe('atomistic');
    expect(receipt.backend).toBe('autodock-vina');
    expect(receipt.config).toBe(sampleDockingConfig);
    expect(receipt.result).toBe(sampleDockingResult);
    expect(receipt.verified).toBe(true);
    expect(receipt.executionTimeMs).toBe(4500);
    expect(receipt.receiptId).toMatch(/^dock-/);
    expect(receipt.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('produces a deterministic provenance hash', () => {
    const receipt1 = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const receipt2 = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    // Same result → same provenance hash (content-addressable)
    expect(receipt1.provenanceHash).toBe(receipt2.provenanceHash);
    expect(receipt1.provenanceHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different provenance for different results', () => {
    const differentResult: DockingResult = {
      ...sampleDockingResult,
      bestAffinity: -12.1,
      ligandId: 'imatinib',
    };
    const receipt1 = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const receipt2 = createDockingReceipt(sampleDockingConfig, differentResult);
    expect(receipt1.provenanceHash).not.toBe(receipt2.provenanceHash);
  });

  it('marks receipt as not verified for failed docking', () => {
    const failedResult: DockingResult = {
      status: 'failed',
      poses: [],
      receptorId: 'EGFR_P00533',
      ligandId: 'aspirin',
      backend: 'autodock-vina',
      error: 'GPU out of memory',
    };
    const receipt = createDockingReceipt(sampleDockingConfig, failedResult);
    expect(receipt.verified).toBe(false);
  });
});

// ── AdmetReceipt tests ────────────────────────────────────────────────────────

describe('AdmetReceipt', () => {
  it('creates a receipt with correct fields', () => {
    const receipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);

    expect(receipt.pluginId).toBe('structural-biology@0.2.0');
    expect(receipt.scale).toBe('empirical-surrogate');
    expect(receipt.backend).toBe('rdkit');
    expect(receipt.config).toBe(sampleAdmetConfig);
    expect(receipt.result).toBe(sampleAdmetResult);
    expect(receipt.verified).toBe(true);
    expect(receipt.executionTimeMs).toBe(200);
    expect(receipt.receiptId).toMatch(/^admet-/);
  });

  it('produces a deterministic provenance hash for same input', () => {
    const receipt1 = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt2 = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    expect(receipt1.provenanceHash).toBe(receipt2.provenanceHash);
  });

  it('marks receipt as not verified for failed prediction', () => {
    const failedResult: AdmetResult = {
      status: 'failed',
      smiles: 'INVALID',
      backend: 'rdkit',
      predictions: [],
      error: 'Invalid SMILES',
    };
    const receipt = createAdmetReceipt(sampleAdmetConfig, failedResult);
    expect(receipt.verified).toBe(false);
  });
});

// ── DrugDiscoveryReceipt tests ────────────────────────────────────────────────

describe('DrugDiscoveryReceipt', () => {
  it('creates a composite receipt from docking + ADMET receipts', () => {
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    expect(receipt.receiptId).toMatch(/^drug-/);
    expect(receipt.pluginId).toBe('structural-biology@0.2.0');
    expect(receipt.docking).toBe(dockingReceipt);
    expect(receipt.admet).toBe(admetReceipt);
    expect(receipt.compositeProvenanceHash).toMatch(/^[0-9a-f]{8}$/);
    expect(receipt.assessment).toBeDefined();
  });

  it('computes drug-likeness assessment from docking + ADMET', () => {
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    // bestAffinity = -8.3 (strong binding, < -7)
    expect(receipt.assessment.bestAffinity).toBe(-8.3);
    // drugLikenessScore from the ADMET result = 0.72
    expect(receipt.assessment.drugLikenessScore).toBe(0.72);
    // lipinskiViolations = 1
    expect(receipt.assessment.lipinskiViolations).toBe(1);
    // passes: score > 0.5 AND violations <= 1 → true
    expect(receipt.assessment.passes).toBe(true);
    // propertyCount = 3 predictions
    expect(receipt.assessment.propertyCount).toBe(3);
    // summary should contain "strong binding" and "drug-like"
    expect(receipt.assessment.summary).toContain('strong binding');
    expect(receipt.assessment.summary).toContain('drug-like');
  });

  it('fails drug-likeness for high Lipinski violations', () => {
    const badAdmetResult: AdmetResult = {
      ...sampleAdmetResult,
      drugLikenessScore: 0.3,
      lipinskiViolations: 3,
    };
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, badAdmetResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    expect(receipt.assessment.passes).toBe(false);
    expect(receipt.assessment.summary).toContain('not drug-like');
  });

  it('fails drug-likeness for low score even with 0 violations', () => {
    const lowScoreResult: AdmetResult = {
      ...sampleAdmetResult,
      drugLikenessScore: 0.4,
      lipinskiViolations: 0,
    };
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, lowScoreResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    expect(receipt.assessment.passes).toBe(false);
  });

  it('composite provenance is deterministic for same inputs', () => {
    const dockingReceipt1 = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt1 = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt1 = createDrugDiscoveryReceipt(dockingReceipt1, admetReceipt1);

    const dockingReceipt2 = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt2 = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt2 = createDrugDiscoveryReceipt(dockingReceipt2, admetReceipt2);

    // Same docking result + same ADMET result → same composite hash
    expect(receipt1.compositeProvenanceHash).toBe(receipt2.compositeProvenanceHash);
  });

  it('composite provenance differs for different docking results', () => {
    const dockingReceipt1 = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);

    const differentResult: DockingResult = {
      ...sampleDockingResult,
      bestAffinity: -12.1,
    };
    const dockingReceipt2 = createDockingReceipt(sampleDockingConfig, differentResult);

    const receipt1 = createDrugDiscoveryReceipt(dockingReceipt1, admetReceipt);
    const receipt2 = createDrugDiscoveryReceipt(dockingReceipt2, admetReceipt);

    expect(receipt1.compositeProvenanceHash).not.toBe(receipt2.compositeProvenanceHash);
  });
});

// ── Pipeline orchestration ────────────────────────────────────────────────────

describe('runDrugDiscoveryPipeline', () => {
  it('runs full pipeline and produces composite receipt', () => {
    const receipt = runDrugDiscoveryPipeline(
      sampleDockingConfig,
      sampleDockingResult,
      sampleAdmetConfig,
      sampleAdmetResult,
    );

    expect(receipt.receiptId).toMatch(/^drug-/);
    expect(receipt.docking).toBeDefined();
    expect(receipt.admet).toBeDefined();
    expect(receipt.assessment).toBeDefined();
    expect(receipt.docking.backend).toBe('autodock-vina');
    expect(receipt.admet.backend).toBe('rdkit');
  });
});

// ── Compile targets ──────────────────────────────────────────────────────────

describe('Receipt compile targets', () => {
  const dockingReceipt = createDockingReceipt(sampleDockingConfig, sampleDockingResult);
  const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
  const pipelineReceipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

  describe('compileDockingReceiptToHolo', () => {
    it('produces valid .holo composition with receipt metadata', () => {
      const holo = compileDockingReceiptToHolo(dockingReceipt);
      expect(holo).toContain('composition "DockingReceipt"');
      expect(holo).toContain('receiptId:');
      expect(holo).toContain('provenanceHash:');
      expect(holo).toContain('scale: "atomistic"');
      expect(holo).toContain('@auto_dock');
      expect(holo).toContain('@binding_affinity');
      expect(holo).toContain('verified: true');
    });
  });

  describe('compileAdmetReceiptToHolo', () => {
    it('produces valid .holo composition with receipt metadata', () => {
      const holo = compileAdmetReceiptToHolo(admetReceipt);
      expect(holo).toContain('composition "AdmetReceipt"');
      expect(holo).toContain('receiptId:');
      expect(holo).toContain('provenanceHash:');
      expect(holo).toContain('scale: "empirical-surrogate"');
      expect(holo).toContain('@admet_prediction');
      expect(holo).toContain('@admet_result');
    });
  });

  describe('compileDrugDiscoveryReceiptToHolo', () => {
    it('produces valid .holo composition with docking + ADMET + assessment', () => {
      const holo = compileDrugDiscoveryReceiptToHolo(pipelineReceipt);
      expect(holo).toContain('composition "DrugDiscoveryReceipt"');
      expect(holo).toContain('compositeProvenanceHash:');
      expect(holo).toContain('docking {');
      expect(holo).toContain('admet {');
      expect(holo).toContain('assessment {');
      expect(holo).toContain('passes: true');
      expect(holo).toContain('drugLikenessScore:');
      expect(holo).toContain('bestAffinity:');
      expect(holo).toContain('summary:');
    });

    it('includes assessment summary text', () => {
      const holo = compileDrugDiscoveryReceiptToHolo(pipelineReceipt);
      // The summary should contain human-readable text about binding and drug-likeness
      expect(holo).toContain('strong binding');
      expect(holo).toContain('drug-like');
    });
  });
});

// ── Assessment summary formatting ────────────────────────────────────────────

describe('DrugLikenessAssessment summary', () => {
  it('describes strong binding for affinity < -7', () => {
    const strongResult: DockingResult = {
      ...sampleDockingResult,
      bestAffinity: -9.5,
    };
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, strongResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    expect(receipt.assessment.summary).toContain('strong binding');
  });

  it('describes moderate binding for -7 <= affinity < -5', () => {
    const moderateResult: DockingResult = {
      ...sampleDockingResult,
      bestAffinity: -6.2,
    };
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, moderateResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    expect(receipt.assessment.summary).toContain('moderate binding');
  });

  it('describes weak binding for affinity >= -5', () => {
    const weakResult: DockingResult = {
      ...sampleDockingResult,
      bestAffinity: -3.1,
    };
    const dockingReceipt = createDockingReceipt(sampleDockingConfig, weakResult);
    const admetReceipt = createAdmetReceipt(sampleAdmetConfig, sampleAdmetResult);
    const receipt = createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);

    expect(receipt.assessment.summary).toContain('weak binding');
  });
});

// ── End-to-end pipeline: AlphaFold → Docking → ADMET → Receipt ────────────────

describe('End-to-end drug-discovery pipeline', () => {
  it('chains protein structure → docking → ADMET → receipt → .holo compilation', () => {
    // Step 1: AlphaFold produces a protein (this plugin provides the object type)
    // Step 2: Docking runs against the protein
    // Step 3: ADMET predicts drug-likeness
    // Step 4: Receipt ties everything together

    // Docking
    const dockingConfig: DockingConfig = {
      backend: 'autodock-gpu',
      receptor: 'EGFR_P00533_PDBQT',
      ligand: 'CC(=O)Oc1ccccc1C(=O)O',
      centerX: 10,
      centerY: 20,
      centerZ: 30,
      sizeX: 25,
      sizeY: 25,
      sizeZ: 25,
      numRuns: 50,
      scoringFunction: 'ad4',
    };

    const dockingResult: DockingResult = {
      status: 'success',
      bestAffinity: -9.1,
      poses: [
        { affinity: -9.1, rmsdLb: 0.0, rmsdUb: 0.8, poseData: 'P1' },
        { affinity: -7.8, rmsdLb: 1.2, rmsdUb: 2.1, poseData: 'P2' },
        { affinity: -7.2, rmsdLb: 1.8, rmsdUb: 3.0, poseData: 'P3' },
      ],
      receptorId: 'EGFR_P00533',
      ligandId: 'aspirin',
      backend: 'autodock-gpu',
      executionTimeMs: 12000,
      lgaRunsCompleted: 50,
    };

    // ADMET
    const admetConfig: AdmetConfig = {
      backend: 'rdkit',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      properties: ['hia', 'bbb_permeability', 'ames', 'hht', 'half_life'],
    };

    const admetResult: AdmetResult = {
      status: 'success',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      backend: 'rdkit',
      predictions: [
        { property: 'hia', value: 95, unit: '%', confidence: 0.88, modelVersion: 'v1' },
        { property: 'bbb_permeability', value: 0.75, unit: 'binary', confidence: 0.85, modelVersion: 'v1' },
        { property: 'ames', value: 0.05, unit: 'binary', confidence: 0.92, modelVersion: 'v1' },
        { property: 'hht', value: 0.08, unit: 'binary', confidence: 0.87, modelVersion: 'v1' },
        { property: 'half_life', value: 12, unit: 'hours', confidence: 0.80, modelVersion: 'v1' },
      ],
      drugLikenessScore: 0.85,
      lipinskiViolations: 0,
      executionTimeMs: 150,
    };

    // Pipeline
    const receipt = runDrugDiscoveryPipeline(dockingConfig, dockingResult, admetConfig, admetResult);

    // Verify chain integrity
    expect(receipt.docking.backend).toBe('autodock-gpu');
    expect(receipt.admet.backend).toBe('rdkit');
    expect(receipt.docking.verified).toBe(true);
    expect(receipt.admet.verified).toBe(true);

    // Verify assessment
    expect(receipt.assessment.bestAffinity).toBe(-9.1);
    expect(receipt.assessment.drugLikenessScore).toBe(0.85);
    expect(receipt.assessment.lipinskiViolations).toBe(0);
    expect(receipt.assessment.passes).toBe(true);
    expect(receipt.assessment.summary).toContain('strong binding');

    // Verify provenance chain
    expect(receipt.docking.provenanceHash).toMatch(/^[0-9a-f]{8}$/);
    expect(receipt.admet.provenanceHash).toMatch(/^[0-9a-f]{8}$/);
    expect(receipt.compositeProvenanceHash).toMatch(/^[0-9a-f]{8}$/);

    // Verify .holo compilation
    const holo = compileDrugDiscoveryReceiptToHolo(receipt);
    expect(holo).toContain('composition "DrugDiscoveryReceipt"');
    expect(holo).toContain('compositeProvenanceHash:');
    expect(holo).toContain('autodock-gpu');
    expect(holo).toContain('bestAffinity: -9.1');
    expect(holo).toContain('passes: true');
  });

  it('correctly handles pipeline with failed ADMET', () => {
    const failedAdmetResult: AdmetResult = {
      status: 'failed',
      smiles: 'INVALID_SMILES',
      backend: 'rdkit',
      predictions: [],
      error: 'Cannot parse SMILES',
    };

    const receipt = runDrugDiscoveryPipeline(
      sampleDockingConfig,
      sampleDockingResult,
      sampleAdmetConfig,
      failedAdmetResult,
    );

    expect(receipt.admet.verified).toBe(false);
    expect(receipt.docking.verified).toBe(true);
    // Assessment still has docking data but no ADMET data
    expect(receipt.assessment.bestAffinity).toBe(-8.3);
  });
});