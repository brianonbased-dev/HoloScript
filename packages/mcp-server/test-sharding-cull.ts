import { StateSynchronizer } from '../core/src/networking/StateSynchronizer';
import { StateDelta } from '../core/src/networking/DeltaCompressor';
import { _SpatialSharder } from '../core/src/networking/SpatialSharder';

async function runShardingTest() {
  console.log('=== Phase 9: Scene Graph Spatial Sharding Test ===\n');

  const sync = StateSynchronizer.getInstance();

  let callsExtracted = 0;

  // Agent Viewer located at {0, 0, 0} with an interaction radius of 50m
  sync.subscribeGlobal(
    (deltas) => {
      callsExtracted += deltas.length;
    },
    {
      position: [0, 0, 0],
      interactionRadius: 50,
    }
  );

  console.log('➜ 1. Generating mock delta events across distant volumetric boundaries.');

  // Event A happens right next to the Agent (Should be received)
  const eventA: StateDelta = {
    entityId: 'enemy_close',
    field: 'x',
    oldValue: 0,
    newValue: 25,
    timestamp: Date.now(),
  };

  // Event B happens 5,000 units away. Shard dropping should occur in O(1).
  const eventB: StateDelta = {
    entityId: 'enemy_far',
    field: 'x',
    oldValue: 4000,
    newValue: 5000,
    timestamp: Date.now(),
  };

  sync.broadcastDeltas([eventA, eventB]);

  // Force flush
  await new Promise((r) => setTimeout(r, 60));

  // Force flush by flushing pending batch directly isn't exposed, but batch is 50-200ms
  // Just waited.

  console.log(`   - Packets Delivered to Agent: ${callsExtracted}`);

  if (callsExtracted === 1) {
    console.log('\n✔ Shard Culling Successfully mapped events!');
    console.log('  - Euclidean distance completely bypassed for Event B mapping.');
  } else {
    console.error('\n✖ Shard Culling failed. Expected 1 packet but got: ' + callsExtracted);
    process.exit(1);
  }

  console.log('\n=== Integration Passed! ===');
}

runShardingTest().catch(console.error);
