/**
 * Example: HoloLand NPC using the JEPAPredictor control loop wiring
 *
 * Run with: tsx packages/hololand-platform/src/npc/example-npc-jepa-loop.ts
 *
 * Demonstrates the full "V-JEPA 2-AC" pattern in a tiny simulated NPC:
 * - Sense current state
 * - Consider candidate actions
 * - Call the wired planAndAnchorNPCAction (uses real JEPAPredictor.plan)
 * - Receive chosen action + predicted embedding + receipt
 * - "Act" and repeat
 *
 * Every decision produces a WorldModelReceipt-shaped record that can be:
 * - Anchored via SimulationContract
 * - Shown in the World Build Cockpit trust gate (previous slice)
 * - Published to the agent's D.055 public profile
 * - Used as training corpus for further JEPA (Paper 26)
 */

import { planAndAnchorNPCAction } from './jepa-predictor-adapter';

function simulateNPCStep(step: number, currentState: string) {
  const candidates = ['move_forward', 'turn_left', 'turn_right', 'wait', 'interact'];

  const result = planAndAnchorNPCAction({
    currentState,
    candidateActions: candidates,
    worldId: 'world_demo_001',
  }, (state, actions) => {
    // In a real system this would be the loaded JEPAPredictor instance
    // Here we use a deterministic stub so the example is runnable without full weights
    const idx = step % actions.length;
    return {
      action: actions[idx],
      predicted: new Float32Array([0.1 * step, 0.2, 0.3]),
      confidence: 0.8 + (step % 5) * 0.03,
    };
  });

  console.log(`Step ${step}: state="${currentState}"`);
  console.log(`  → NPC chose: ${result.chosenAction} (confidence ${result.confidence.toFixed(2)})`);
  console.log(`  → Receipt: solver=${result.receipt.solverType}, world=${result.receipt.worldId}`);
  console.log('');

  // Simple state transition for the demo
  const newState = `${currentState} | after ${result.chosenAction}`;
  return newState;
}

function main() {
  console.log('=== HoloLand JEPA NPC Control Loop Demo (V-JEPA 2-AC wiring) ===\n');

  let state = 'NPC at (0,0,0) in empty room, goal: reach the door';

  for (let i = 0; i < 5; i++) {
    state = simulateNPCStep(i, state);
  }

  console.log('Demo complete. In a real HoloLand NPC this loop runs every tick,');
  console.log('with the real JEPAPredictor weights, live sensor observations,');
  console.log('and full SimulationContract anchoring of every prediction.');
  console.log('Receipts flow to the cockpit trust gate and the public HoloMesh surface (D.055).');
}

main();