import { describe, expect, it } from 'vitest';
import {
  buildTwoAgentHandoffCatchTrajectory,
  runTwoAgentHandoffCatchReplay,
  TWO_AGENT_HANDOFF_CATCH_CONTRACT,
  TWO_AGENT_HANDOFF_CATCH_SCENE_ID,
} from '../TwoAgentHandoffCatchScene';

describe('TwoAgentHandoffCatchScene', () => {
  it('emits deterministic release, catch, ownership, and receipt events', () => {
    const replay = runTwoAgentHandoffCatchReplay({ seed: 5151 });
    const replayAgain = runTwoAgentHandoffCatchReplay({ seed: 5151 });
    const eventTypes = replay.events.map((event) => event.type);

    expect(replay.sceneId).toBe(TWO_AGENT_HANDOFF_CATCH_SCENE_ID);
    expect(replay.sceneHash).toBe(replayAgain.sceneHash);
    expect(replay.eventLogHash).toBe(replayAgain.eventLogHash);
    expect(eventTypes).toContain('release_constraint_detached');
    expect(eventTypes).toContain('catch_volume_entered');
    expect(eventTypes).toContain('catch_constraint_attached');
    expect(eventTypes).toContain('ownership_transferred');
    expect(eventTypes).toContain('receipt_emitted');
    expect(replay.contactCount).toBe(1);
    expect(replay.predicateViolationCount).toBe(0);
    expect(replay.invalidActionCount).toBe(0);
  });

  it('builds a replayable trajectory handle with the handoff contract', () => {
    const { result, trajectory } = buildTwoAgentHandoffCatchTrajectory({ seed: 5151 });

    expect(trajectory.simulationContract).toEqual(TWO_AGENT_HANDOFF_CATCH_CONTRACT);
    expect(trajectory.caelReceiptHash).toBe(result.eventLogHash);
    expect(trajectory.status).toBe('open');
    expect(trajectory.replayHandle.replayCommand).toContain(
      'holoscript world-model replay --scene two-agent-handoff-catch-v1'
    );
    expect(trajectory.predicateScore.violation).toBe(0);
    expect(trajectory.predicateScore.invalidity).toBe(0);
  });
});
