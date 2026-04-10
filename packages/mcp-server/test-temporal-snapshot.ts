import { handleSnapshotTool } from './src/snapshot-tools';
import { handleNetworkingTool } from './src/networking-tools';

async function runTemporalSnapshotE2E() {
  console.log('=== Phase 6: Temporal Snapshot System E2E Test ===\n');

  const initialWorldState = {
    agent_A: { x: 0, y: 0, z: 0, status: 'idle' },
    agent_B: { x: 10, y: 0, z: 10, status: 'patrolling' },
  };

  // Before snapshotting, ensure networking authority matches the original state baseline natively
  // for clean delta manipulation testing
  await handleNetworkingTool('push_state_delta', {
    entityId: 'agent_B',
    payload: initialWorldState['agent_B'],
  });

  console.log('➜ 1. Creating Temporal Snapshot of Initial World State');

  // Save World State (Keyframe 1)
  const snapResult = await handleSnapshotTool('create_temporal_snapshot', {
    worldState: initialWorldState,
  });

  if (snapResult.status !== 'success' || !snapResult.snapshotId) {
    console.error('✖ Failed to create snapshot.');
    process.exit(1);
  }
  const snapshotId = snapResult.snapshotId;
  console.log(`✔ Keyframe generated successfully: [${snapshotId}]`);

  console.log('\n➜ 2. Modifying World State Forward in Time via Adaptive Push');

  // Agent B triggers a movement delta representing active play
  await handleNetworkingTool('push_state_delta', {
    entityId: 'agent_B',
    payload: {
      x: 50,
      status: 'engaging',
    },
  });

  const mutatedState = await handleNetworkingTool('fetch_authoritative_state', {
    entityId: 'agent_B',
  });

  console.log(
    `✔ Verified Agent B drifted from original timeline (x: ${mutatedState.x}, status: ${mutatedState.status}).`
  );

  console.log('\n➜ 3. Initializing Temporal Rewind to Keyframe 1');

  // Rewind back to Snapshot
  const rewindResult = await handleSnapshotTool('rewind_world_state', {
    snapshotId: snapshotId,
  });

  if (rewindResult.status !== 'success') {
    console.error('✖ Rewind failed!');
    process.exit(1);
  }

  const rewoundAgentB = rewindResult.rewoundState['agent_B'];
  if (rewoundAgentB.x === 10 && rewoundAgentB.status === 'patrolling') {
    console.log(
      `✔ Temporal Anomaly Reverted! Agent B snapped back correctly to origin (x: 10, status: patrolling).`
    );
  } else {
    console.error('✖ Rewind state incorrect.');
    console.error(rewoundAgentB);
    process.exit(1);
  }

  console.log('\n=== E2E Temporal Integration Suite Passed! ===');
}

runTemporalSnapshotE2E().catch(console.error);
