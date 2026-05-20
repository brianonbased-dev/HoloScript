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

import { JEPANPCController } from './jepa-npc-controller';
import { JEPAPredictor } from '../../../core/src/traits/JEPAPredictor';

// Real sovereign JEPAPredictor — latentDim=16, condDim=8
const jepaPredictor = new JEPAPredictor({ latentDim: 16, condDim: 8 });

function simulateNPCStep(step: number, currentState: string, controller: JEPANPCController) {
  const candidates = ['move_forward', 'turn_left', 'turn_right', 'wait', 'interact'];

  // Production path: real HoloLand NPCs call the controller
  const result = controller.step(currentState, candidates, 'world_demo_001');

  console.log(`Step ${step}: state="${currentState}"`);
  console.log(`  → NPC chose: ${result.chosenAction} (confidence ${result.confidence.toFixed(2)})`);
  console.log(`  → Receipt emitted to cockpit gate (D.055 ready)`);
  console.log('');

  const newState = `${currentState} | after ${result.chosenAction}`;
  return newState;
}

function main() {
  console.log('=== HoloLand JEPA NPC Control Loop Demo (V-JEPA 2-AC wiring) ===\n');

  // Production controller (what real NPC brains use)
  const controller = new JEPANPCController({ npcId: 'demo-npc-001', predictor: jepaPredictor });

  let state = 'NPC at (0,0,0) in empty room, goal: reach the door';

  for (let i = 0; i < 5; i++) {
    state = simulateNPCStep(i, state, controller);
  }

  console.log('Demo complete. In a real HoloLand NPC this loop runs every tick,');
  console.log('with the real JEPAPredictor weights, live sensor observations,');
  console.log('and full SimulationContract anchoring of every prediction.');
  console.log('Receipts flow to the World Build Cockpit trust gate and the public HoloMesh surface (D.055).');
}

main();