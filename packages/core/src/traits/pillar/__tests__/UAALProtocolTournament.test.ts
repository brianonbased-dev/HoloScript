import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_ARMS,
  TOURNAMENT_BANDWIDTH_BITS,
  TOURNAMENT_FRAME_BYTES,
  runUAALProtocolTournament,
} from '../UAALProtocolTournament';

describe('uAAL equal-bandwidth cross-model protocol tournament', () => {
  it('holds bandwidth, family, training, intervention, and custody gates fixed', async () => {
    const result = await runUAALProtocolTournament();
    const byArm = new Map(result.arms.map((arm) => [arm.arm, arm]));

    expect(result.frozen).toMatchObject({
      trainFamilies: ['A', 'B'],
      testFamily: 'C',
      trainEpisodesPerFamily: 256,
      testEpisodes: 512,
      optimizerSteps: 256,
      pairAdapterForC: false,
      communicatingFrameBytes: TOURNAMENT_FRAME_BYTES,
      communicatingBandwidthBits: TOURNAMENT_BANDWIDTH_BITS,
    });
    expect(result.arms.map((arm) => arm.arm)).toEqual(TOURNAMENT_ARMS);
    for (const arm of result.arms) {
      expect(arm.bandwidthBits).toBe(arm.arm === 'no_comm' ? 0 : 512);
      expect(arm.peakFrameBytes).toBe(arm.arm === 'no_comm' ? 0 : 64);
    }

    expect(byArm.get('text')?.actionSuccess).toBe(1);
    expect(byArm.get('same_fields_json')?.actionSuccess).toBe(1);
    expect(byArm.get('pillar_slice')?.actionSuccess).toBe(1);
    expect(byArm.get('typed_uaal')?.actionSuccess).toBe(1);
    expect(byArm.get('typed_uaal_residual')?.actionSuccess).toBe(1);
    expect(byArm.get('typed_uaal')?.recoverableTextRate).toBe(1);

    expect(result.interventions.riskAblationDrop).toBeGreaterThanOrEqual(0.2);
    expect(result.interventions.opportunityAblationDrop).toBeGreaterThanOrEqual(0.2);
    expect(result.interventions.jointAxisValuePermutationDelta).toBeLessThanOrEqual(0.02);
    expect(result.interventions.positionPermutationDrop).toBeGreaterThanOrEqual(0.2);

    expect(result.custody).toMatchObject({
      tamperDetection: true,
      replayRejection: true,
      recipientBinding: true,
      schemaVersionRejection: true,
      actionPayloadConsistencyRejection: true,
      passed: 5,
      total: 5,
    });
    expect(result.verdict).toMatchObject({
      typedCognitivePromotionPassed: false,
      typedOutperformsLearnedAlignment: true,
      schemaReplayAbiAdmitted: true,
      cognitiveCoordinateClaimRetired: true,
      hiddenAlignmentClaimRetired: true,
    });
    expect(result.deterministicDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.replay).toMatchObject({
      firstDigest: result.deterministicDigest,
      secondDigest: result.deterministicDigest,
      agreement: true,
    });

    console.log(`UAAL_PROTOCOL_TOURNAMENT_RESULT=${JSON.stringify(result)}`);
  });
});
