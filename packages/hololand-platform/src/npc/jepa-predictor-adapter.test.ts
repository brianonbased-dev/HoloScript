/**
 * Tests for JEPAPredictor wiring into HoloLand NPC control loop
 * task_1779304511950_rqie
 */

import { describe, it, expect } from 'vitest';
import { planAndAnchorNPCAction, type WorldModelReceipt } from './jepa-predictor-adapter';

describe('HoloLand JEPA NPC control loop wiring', () => {
  it('selects an action and produces a valid anchored receipt', () => {
    const mockPlan = (state: string, actions: string[]) => ({
      action: actions[0],
      predicted: new Float32Array([0.1, 0.2, 0.3]),
      confidence: 0.87,
    });

    const result = planAndAnchorNPCAction({
      currentState: 'NPC at position (1,2,0) facing door, holding nothing',
      candidateActions: ['move_forward', 'turn_left', 'interact_with_door'],
      worldId: 'world_test_001',
    }, mockPlan);

    expect(result.chosenAction).toBe('move_forward');
    expect(result.predictedEmbedding).toBeInstanceOf(Float32Array);
    expect(result.confidence).toBe(0.87);
    expect(result.receipt).toBeDefined();
    expect(result.receipt.solverType).toBe('hololand-npc-vjepa2ac');
    expect(result.receipt.worldId).toBe('world_test_001');
  });
});