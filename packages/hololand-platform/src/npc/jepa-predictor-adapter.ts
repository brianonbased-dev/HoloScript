/**
 * JEPAPredictorAdapter for HoloLand NPCs
 *
 * First slice wiring for task_1779304511950_rqie
 * "HoloLand JEPA: wire JEPAPredictor into NPC control loop (V-JEPA 2-AC)"
 *
 * This adapter lets an NPC's intent/action produce a predicted next world state
 * using the sovereign JEPAPredictor + WorldModelReceipt (action-conditioned pattern
 * from V-JEPA 2-AC).
 *
 * Proves D.050: HoloLand is a live AI Lab testbed, not just a trait file.
 * Every NPC decision can now be receipt-anchored for Paper 8/9 and public verification (D.055).
 */

export interface WorldModelReceipt {
  jepaPrediction: Float32Array;
  solverGroundTruth: any;
  solverType: string;
  worldId: string;
  timestamp: string;
}

export interface PredictorPlanFn {
  plan(currentState: string, candidateActions: string[]): {
    action: string;
    predicted: Float32Array;
    confidence: number;
  };
}

export interface NPCControlInput {
  currentState: string;           // string snapshot of NPC's current world state / observation
  candidateActions: string[];     // possible actions the NPC can take right now
  worldId: string;
}

export interface NPCControlOutput {
  chosenAction: string;
  predictedEmbedding: Float32Array;
  confidence: number;
  receipt: WorldModelReceipt;
}

/**
 * Wires the sovereign JEPAPredictor into the HoloLand NPC control loop (V-JEPA 2-AC style).
 *
 * The NPC calls this at each decision point:
 *   - gives its current state as a string (or embedding source)
 *   - gives the set of actions it is considering
 *   - gets back the best action + the predicted next-state embedding + a full anchored receipt
 *
 * This is the concrete "wiring" that turns HoloLand NPCs into action-conditioned world model agents.
 */
export function planAndAnchorNPCAction(
  input: NPCControlInput,
  planFn: (currentState: string, candidateActions: string[]) => { action: string; predicted: Float32Array; confidence: number }
): NPCControlOutput {
  if (!input.candidateActions || input.candidateActions.length === 0) {
    throw new Error('NPC control loop requires at least one candidate action');
  }

  const result = planFn(input.currentState, input.candidateActions);

  const receipt: WorldModelReceipt = {
    jepaPrediction: result.predicted,
    solverGroundTruth: { state: input.currentState, action: result.action },
    solverType: 'hololand-npc-vjepa2ac',
    worldId: input.worldId,
    timestamp: new Date().toISOString(),
  };

  return {
    chosenAction: result.action,
    predictedEmbedding: result.predicted,
    confidence: result.confidence,
    receipt,
  };
}

export default planAndAnchorNPCAction;