import { StateSynchronizer } from '../core/src/networking/StateSynchronizer';
import { _DeltaCompressor } from '../core/src/networking/DeltaCompressor';
import { handleNetworkingTool } from './src/networking-tools';

async function runMultiAgentE2E() {
  console.log('=== Phase 5: Multi-Agent Synchronization E2E Test ===\n');

  const synchronizer = StateSynchronizer.getInstance();

  // Mock Agent B subscribing to the Global Sync Mesh (No Culling)
  let receivedDeltas: any[] = [];
  synchronizer.subscribeGlobal((deltas) => {
    receivedDeltas.push(...deltas);
  });

  // Mock Agent C subscribing from far away (Spatial LOD Culling active)
  const receivedDeltasC: any[] = [];
  synchronizer.subscribeGlobal(
    (deltas) => {
      receivedDeltasC.push(...deltas);
    },
    { position: [500, 0, 500], interactionRadius: 50 }
  );

  console.log('➜ 1. Agent A pushes initial state to Server Authority');

  // Agent A initializes itself at coordinates [0,0,0]
  await handleNetworkingTool('push_state_delta', {
    entityId: 'agent_A',
    payload: {
      x: 0,
      y: 0,
      z: 0,
      health: 100,
      status: 'idle',
    },
  });

  await new Promise((r) => setTimeout(r, 200)); // Wait for Adaptive Batching flush

  console.log(
    `✔ Agent B received initial synchronization: ${receivedDeltas.length} fields initialized.`
  );
  receivedDeltas = []; // flush

  console.log('➜ 2. Agent A executes a procedural skill (modifying Z coordinate and status)');

  // Agent A moves forward and casts a spell
  await handleNetworkingTool('push_state_delta', {
    entityId: 'agent_A',
    payload: {
      z: 15.5,
      status: 'casting',
    },
  });

  await new Promise((r) => setTimeout(r, 200)); // Wait for Adaptive Batching flush

  // Agent B should receive ONLY the delta differences (2 fields) rather than the entire object again
  // Agent C should receive 0 fields because they are 700+ units away
  const hasStatus = receivedDeltas.some((d) => d.field === 'status' && d.newValue === 'casting');
  const hasZ = receivedDeltas.some((d) => d.field === 'z' && d.newValue === 15.5);

  if (receivedDeltas.length === 2 && hasStatus && hasZ && receivedDeltasC.length === 0) {
    console.log(
      `✔ Agent B synchronized successfully! Delta Replication diff compressed bandwidth seamlessly.`
    );
    console.log(`   - Diff [z]: 0 -> 15.5`);
    console.log(`   - Diff [status]: idle -> casting`);
    console.log(
      `✔ Agent C successfully pruned payloads via Spatial LOD Interest Management (Received: 0).`
    );
  } else {
    console.error('✖ State Synchronization failed. Deltas mismatched.');
    console.error(receivedDeltas);
    process.exit(1);
  }

  console.log(
    "➜ 3. Agent B calls 'fetch_authoritative_state' to pull the absolute source of truth"
  );

  // Agent B wants to verify the absolute state
  const authoritativeState = await handleNetworkingTool('fetch_authoritative_state', {
    entityId: 'agent_A',
  });

  if (
    authoritativeState.z === 15.5 &&
    authoritativeState.status === 'casting' &&
    authoritativeState.health === 100
  ) {
    console.log('✔ Server-Authoritative Conflict Resolution verified. Consistent state achieved.');
  } else {
    console.error('✖ Authoritative state pull failed.');
    console.error(authoritativeState);
    process.exit(1);
  }

  console.log('\n=== E2E Integration Suite Passed! ===');
}

runMultiAgentE2E().catch(console.error);
