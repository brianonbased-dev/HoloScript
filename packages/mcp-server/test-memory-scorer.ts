import { MemoryScorer, EpisodicEvent } from '../core/src/learning/MemoryScorer';

async function runMemoryScorerTest() {
  console.log('=== Phase 10: Episodic Memory Importance Scoring ===\n');

  console.log('➜ 1. Evaluating simulated Episodic stream densities.');

  const events: EpisodicEvent[] = [
    {
      agentId: 'agent_a',
      timestamp: Date.now() - 5000,
      action: 'Idle',
      context: {},
      outcome: 'Nothing happened.',
    },
    {
      agentId: 'agent_a',
      timestamp: Date.now() - 4000,
      action: 'Move',
      context: { target: 'forest', speed: 'walking' },
      outcome: 'Moved forward.',
    },
    {
      agentId: 'agent_a',
      timestamp: Date.now() - 3000,
      action: 'Craft_Sword',
      context: { material1: 'iron', material2: 'wood', location: 'forge' },
      outcome: 'Successfully crafted iron sword.',
    },
    {
      agentId: 'agent_a',
      timestamp: Date.now() - 2000,
      action: 'Combat_Attack',
      context: { target: 'goblin', weapon: 'iron_sword', stamina: 50 },
      outcome: 'Major damage dealt.',
    },
    {
      agentId: 'agent_a',
      timestamp: Date.now() - 1000,
      action: 'Wait',
      context: { time: 5 },
      outcome: 'Waiting...',
    },
  ];

  console.log(`   - Input Event Stream: ${events.length} explicit nodes.`);

  // Map native raw scalars
  const scores = events.map((e) => ({
    action: e.action,
    score: MemoryScorer.computeImportance(e),
  }));

  console.log('\n   - Raw Native Scoring:');
  for (const s of scores) {
    console.log(`     [${String(s.score).padStart(3, ' ')}] ${s.action}`);
  }

  console.log('\n➜ 2. Executing Threshold Pruning (Threshold: 0)');

  // Cull any negative score matrices actively
  const culledEvents = MemoryScorer.cullLowImportance(events, 0);

  console.log(`   - Post-Pruning Node Pipeline: ${culledEvents.length} crucial vectors isolated.`);

  const culledActions = culledEvents.map((e) => e.action);
  console.log(`   - Retained: ${culledActions.join(', ')}`);

  if (
    culledActions.includes('Craft_Sword') &&
    culledActions.includes('Combat_Attack') &&
    !culledActions.includes('Idle') &&
    !culledActions.includes('Wait')
  ) {
    console.log('\n✔ Extracted Importance Scoring succeeded!');
    console.log('  - Negative heuristic arrays were purged cleanly.');
    console.log('  - High-density actions mapping achievements were perfectly preserved.');
  } else {
    console.error('\n✖ Explicit Memory Scoring failed to preserve correct thresholds.');
    process.exit(1);
  }

  console.log('\n=== Integration Passed! ===');
}

runMemoryScorerTest().catch(console.error);
