import { DeltaCompressor, StateDelta } from '../core/src/networking/DeltaCompressor';
import { LWWRegister } from '../core/src/networking/CRDT';

async function runChaosTest() {
  console.log('=== Phase 10: Chaos Mesh Network Partition Test ===\n');

  const serverState = {
    position: new LWWRegister<{ x: number; y: number }>({ x: 0, y: 0 }, 1000),
  };

  console.log('➜ 1. Server initializing at authoritative Timestamp 1000.');
  console.log('   - Base Position:', serverState.position.value);

  // Chaos Simulator Array
  const agentPacketQueue: StateDelta[] = [];

  // T=1500 (Agent calculates an update, but network halts)
  agentPacketQueue.push({
    entityId: 'agent_1',
    field: 'position',
    oldValue: null,
    newValue: new LWWRegister({ x: 10, y: 0 }, 1500),
    timestamp: 1500,
  });

  // T=2000 (Agent keeps moving offline)
  agentPacketQueue.push({
    entityId: 'agent_1',
    field: 'position',
    oldValue: null,
    newValue: new LWWRegister({ x: 20, y: 5 }, 2000),
    timestamp: 2000,
  });

  console.log('\n➜ 2. Network Partition Occurs. Agent buffers updates offline.');

  // Server gets an independent update while Agent is partitioned (Server moves the entity)
  const serverInterveningUpdate: StateDelta[] = [
    {
      entityId: 'agent_1',
      field: 'position',
      oldValue: null,
      newValue: new LWWRegister({ x: 0, y: 25 }, 1800),
      timestamp: 1800,
    },
  ];

  DeltaCompressor.applyDeltas(serverState, serverInterveningUpdate);
  console.log(
    '   - Server actively drifted entity while partitioned to:',
    serverState.position.value
  );

  console.log(
    '\n➜ 3. Partition Heals. Chaos Mesh flushes offline buffering to the Server out-of-order.'
  );

  // Network restores, but packets arrive completely out-of-order due to congestion
  // It pushes the T=2000 FIRST, then the T=1500 LAST.
  const outOfOrderArrivals = [
    agentPacketQueue[1], // T=2000
    agentPacketQueue[0], // T=1500
  ];

  DeltaCompressor.applyDeltas(serverState, [outOfOrderArrivals[0]]);
  console.log('   - Server receives T=2000 Packet. Value:', serverState.position.value);

  DeltaCompressor.applyDeltas(serverState, [outOfOrderArrivals[1]]);
  console.log(
    '   - Server receives T=1500 Packet delayed due to Chaos Mesh. Value:',
    serverState.position.value
  );

  // Final Assertion
  const finalPos = serverState.position.value;
  if (finalPos.x === 20 && finalPos.y === 5 && serverState.position.timestamp === 2000) {
    console.log('\n✔ CRDT Time-Vector Rejection succeeded!');
    console.log(
      '  - The T=1500 packet was properly rejected because T=2000 already mutated the LWW boundary natively.'
    );
  } else {
    console.error('\n✖ Chaos Mesh corrupted data state.');
    process.exit(1);
  }

  console.log('\n=== Integration Passed! ===');
}

runChaosTest().catch(console.error);
