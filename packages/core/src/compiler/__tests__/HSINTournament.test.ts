/**
 * HSI N3 falsification harness — acceptance tests (board task ghmo, Stage D first layer).
 *
 * Proves the deterministic tournament battery discriminates structural competence WITHOUT any
 * trained model: the exact-oracle arm passes; the edge-blind arm is CAUGHT (structureBlind=true),
 * i.e. an arm that drops edge/opacity structure cannot pass silently. Real 20-50M arms plug into
 * the same TournamentArm interface and are scored against this battery on GPU (follow-on).
 */

import { describe, it, expect } from 'vitest';
import {
  generateBarrierWorldSource,
  generateTournamentBattery,
  oracleLabel,
  scoreArm,
  runTournament,
  exactOracleArm,
  edgeBlindArm,
  dynamicsOnlyArm,
  createCheckpointPredictionBundle,
  checkpointBundleToTournamentArm,
  HSI_N3_TOURNAMENT_SCHEMA_VERSION,
  type HSINWorldParams,
} from '../HSINTournament';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import { lowerCompositionToHSIIR } from '../HSIIRCompiler';

const BASE: HSINWorldParams = {
  worldName: 'HSCoreBarrierWorld',
  agent: 'Scout',
  target: 'Beacon',
  barriers: [
    { name: 'GlassPane', opacity: 'transparent' },
    { name: 'StoneSlab', opacity: 'opaque' },
    { name: 'VeilPanel', opacity: 'unknown' },
  ],
};

function irFor(params: HSINWorldParams) {
  const src = generateBarrierWorldSource(params);
  return lowerCompositionToHSIIR(parseHoloStrict(src), { sourceText: src });
}

describe('HSI N3 falsification harness (task ghmo)', () => {
  describe('parameterized world generator + oracle', () => {
    it('generates HS-Core source that lowers, with three-state opacity preserved', () => {
      const ir = irFor(BASE);
      const opacities = Object.fromEntries(
        ir.entities.filter((e) => e.role === 'barrier').map((e) => [e.name, e.opacity])
      );
      expect(opacities['GlassPane']).toBe('transparent');
      expect(opacities['StoneSlab']).toBe('opaque');
      expect(opacities['VeilPanel']).toBe('unknown');
    });

    it('oracle: opaque mediator blocks (aggregate access blocked), traverse reaches goal', () => {
      const o = oracleLabel(irFor(BASE));
      expect(o.access).toBe('blocked');
      expect(o.mediatorCount).toBe(3);
      expect(o.goalReached).toBe(true);
    });

    it('oracle: all-unknown mediators aggregate to unknown; all-transparent to visible', () => {
      const allUnknown = oracleLabel(
        irFor({ ...BASE, worldName: 'U', barriers: [{ name: 'VeilPanel', opacity: 'unknown' }] })
      );
      expect(allUnknown.access).toBe('unknown');
      const allClear = oracleLabel(
        irFor({
          ...BASE,
          worldName: 'C',
          barriers: [{ name: 'GlassPane', opacity: 'transparent' }],
        })
      );
      expect(allClear.access).toBe('visible');
    });
  });

  describe('battery', () => {
    it('produces train + OOD variants across all axes and metamorphic pairs', () => {
      const b = generateTournamentBattery();
      const axes = new Set(b.variants.map((v) => v.axis));
      expect(axes.has('train')).toBe(true);
      expect(axes.has('ood-object-count')).toBe(true);
      expect(axes.has('ood-opacity-composition')).toBe(true);
      expect(axes.has('ood-rename')).toBe(true);
      const kinds = new Set(b.metamorphic.map((m) => m.kind));
      expect(kinds.has('rename-invariant')).toBe(true);
      expect(kinds.has('edge-removal-sensitive')).toBe(true);
      expect(kinds.has('opacity-flip-sensitive')).toBe(true);
    });

    it('sensitive metamorphic cases genuinely change the oracle; invariant cases do not', () => {
      const b = generateTournamentBattery();
      for (const mm of b.metamorphic) {
        const changed = JSON.stringify(mm.baseOracle) !== JSON.stringify(mm.transformedOracle);
        if (mm.expectation === 'sensitive') expect(changed).toBe(true);
        else expect(changed).toBe(false);
      }
    });

    it('battery data digest is deterministic across regenerations', () => {
      expect(generateTournamentBattery().dataDigest).toBe(generateTournamentBattery().dataDigest);
    });
  });

  describe('falsification: the battery catches a structure-blind arm', () => {
    it('exact-oracle arm passes (not structure-blind), perfect access + sensitivity + invariance', () => {
      const s = scoreArm(exactOracleArm, generateTournamentBattery());
      expect(s.accessAccuracy).toBe(1);
      expect(s.dynamicsAccuracy).toBe(1);
      expect(s.structuralSensitivity).toBe(1);
      expect(s.invariance).toBe(1);
      expect(s.structureBlind).toBe(false);
    });

    it('edge-blind arm is CAUGHT: zero structural sensitivity -> structureBlind=true, low access accuracy', () => {
      const s = scoreArm(edgeBlindArm, generateTournamentBattery());
      expect(s.structuralSensitivity).toBe(0);
      expect(s.structureBlind).toBe(true);
      expect(s.accessAccuracy).toBeLessThan(1);
    });

    it('the harness ranks the exact-oracle arm above the edge-blind arm', () => {
      const receipt = runTournament(
        [edgeBlindArm, exactOracleArm, dynamicsOnlyArm],
        generateTournamentBattery()
      );
      expect(receipt.ranking[0]).toBe('ref:exact-oracle');
      expect(receipt.ranking[receipt.ranking.length - 1]).toBe('ref:edge-blind');
    });
  });

  describe('receipt', () => {
    it('emits a deterministic receipt identifying data/verifiers/device', () => {
      const battery = generateTournamentBattery();
      const a = runTournament([exactOracleArm, edgeBlindArm], battery);
      const b = runTournament([exactOracleArm, edgeBlindArm], battery);
      expect(a.deterministicDigest).toBe(b.deterministicDigest);
      expect(a.schemaVersion).toBe(HSI_N3_TOURNAMENT_SCHEMA_VERSION);
      expect(a.device).toBe('cpu-reference');
      expect(a.verifiers).toContain('structural-sensitivity');
      expect(a.deterministicDigest.startsWith('sha256:')).toBe(true);
    });
  });

  describe('offline trained-checkpoint adapter', () => {
    function checkpointBundleForBattery() {
      const battery = generateTournamentBattery();
      const byDigest = new Map<string, ReturnType<typeof oracleLabel>>();
      for (const variant of battery.variants) {
        byDigest.set(variant.ir.provenance.deterministicDigest, variant.oracle);
      }
      for (const mm of battery.metamorphic) {
        byDigest.set(mm.baseIr.provenance.deterministicDigest, mm.baseOracle);
        byDigest.set(mm.transformedIr.provenance.deterministicDigest, mm.transformedOracle);
      }
      const bundle = createCheckpointPredictionBundle({
        armId: 'checkpoint:sem:s20260721',
        checkpoint: {
          sha256: `sha256:${'a'.repeat(64)}`,
          trainingArm: 'sem',
          seed: 20260721,
        },
        batteryDataDigest: battery.dataDigest,
        predictions: [...byDigest].map(([irDigest, oracle]) => ({
          irDigest,
          prediction: {
            access: 'unknown' as const,
            mediatorCount: 0,
            goalReached: oracle.goalReached,
          },
          decodedFinalDigest: `sha256:${'b'.repeat(64)}`,
        })),
      });
      return { battery, bundle };
    }

    it('scores checkpoint-derived dynamics through the TournamentArm contract', () => {
      const { battery, bundle } = checkpointBundleForBattery();
      const arm = checkpointBundleToTournamentArm(bundle, battery);
      const score = scoreArm(arm, battery);
      expect(score.armId).toBe('checkpoint:sem:s20260721');
      expect(score.dynamicsAccuracy).toBe(1);
      expect(score.accessAccuracy).toBeLessThan(1);
      expect(score.structureBlind).toBe(true);
      expect(bundle.decisionAuthority).toBe('diagnostic-only');
    });

    it('fails closed when the bundle is stale, incomplete, or tampered', () => {
      const { battery, bundle } = checkpointBundleForBattery();
      expect(() =>
        checkpointBundleToTournamentArm(
          { ...bundle, batteryDataDigest: `sha256:${'c'.repeat(64)}` },
          battery
        )
      ).toThrow(/battery digest/);
      const incomplete = createCheckpointPredictionBundle({
        armId: bundle.armId,
        checkpoint: bundle.checkpoint,
        batteryDataDigest: bundle.batteryDataDigest,
        predictions: bundle.predictions.slice(1),
      });
      expect(() => checkpointBundleToTournamentArm(incomplete, battery)).toThrow(
        /coverage mismatch/
      );
      expect(() =>
        checkpointBundleToTournamentArm(
          {
            ...bundle,
            armId: 'tampered',
          },
          battery
        )
      ).toThrow(/deterministic digest mismatch/);
    });

    it('rejects invented perception predictions from a dynamics-only checkpoint', () => {
      const { battery, bundle } = checkpointBundleForBattery();
      expect(() =>
        createCheckpointPredictionBundle({
          armId: bundle.armId,
          checkpoint: bundle.checkpoint,
          batteryDataDigest: bundle.batteryDataDigest,
          predictions: [
            {
              ...bundle.predictions[0],
              prediction: {
                access: 'visible',
                mediatorCount: 1,
                goalReached: true,
              },
            },
          ],
        })
      ).toThrow(/unsupported perception sentinels/);
    });
  });
});
