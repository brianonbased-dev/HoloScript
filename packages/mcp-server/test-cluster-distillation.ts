import { EpisodicEvent } from '../core/src/learning/MemoryScorer';
import { SemanticClusterer } from '../core/src/learning/SemanticClusterer';

async function runDistillationTest() {
  console.log('=== Phase 11: Memory Consolidation Distillation Test ===\n');

  const rawSequences: EpisodicEvent[] = [
    {
      agentId: 'agent_b',
      timestamp: 1000,
      action: 'Idle',
      context: { location: 'Spawn_Point' },
      outcome: 'Resting',
    },
    {
      agentId: 'agent_b',
      timestamp: 1050,
      action: 'Idle',
      context: { location: 'Spawn_Point' },
      outcome: 'Resting',
    },
    {
      agentId: 'agent_b',
      timestamp: 1100,
      action: 'Idle',
      context: { location: 'Spawn_Point' },
      outcome: 'Resting',
    },
    {
      agentId: 'agent_b',
      timestamp: 1150,
      action: 'Walk',
      context: { target: 'Forest_Edge' },
      outcome: 'Arrived at Edge',
    },
    {
      agentId: 'agent_b',
      timestamp: 1200,
      action: 'Harvest_Wood',
      context: { target: 'Oak_Tree' },
      outcome: 'Gained 1 Wood',
    },
    {
      agentId: 'agent_b',
      timestamp: 1250,
      action: 'Harvest_Wood',
      context: { target: 'Oak_Tree' },
      outcome: 'Gained 1 Wood',
    },
    {
      agentId: 'agent_b',
      timestamp: 1300,
      action: 'Harvest_Wood',
      context: { target: 'Oak_Tree' },
      outcome: 'Gained 1 Wood',
    },
  ];

  console.log(`➜ 1. Synthesizing explicit episodic inputs over timeline.`);
  console.log(`   - Raw Length: ${rawSequences.length} distinct Memory Nodes.`);

  const distilled = SemanticClusterer.distill(rawSequences);

  console.log(`\n➜ 2. Distillation Semantic Clustering Complete.`);
  console.log(`   - Output Length: ${distilled.length} distilled Nodes.`);

  console.log('\n   - Resulting Sequence Boundaries:');
  distilled.forEach((seq) => {
    const timeDiff = seq.context.timeSpanEnded
      ? seq.context.timeSpanEnded - seq.context.timeSpanStarted
      : 0;
    console.log(`     [${timeDiff}ms span] ${seq.action}: ${seq.outcome}`);
  });

  if (
    distilled.length === 3 &&
    distilled[0].action === 'Idle_Aggregated' &&
    distilled[2].action === 'Harvest_Wood_Aggregated'
  ) {
    console.log('\n✔ Semantic Consolidation successfully squeezed explicit arrays!');
    console.log(
      '  - Distillation natively reduced Database Load and LLM Token count significantly.'
    );
  } else {
    console.error('\n✖ Semantic Clustering failed to properly chunk matching explicit nodes.');
    process.exit(1);
  }

  console.log('\n=== Integration Passed! ===');
}

runDistillationTest().catch(console.error);
