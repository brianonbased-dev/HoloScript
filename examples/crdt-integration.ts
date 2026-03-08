/**
 * Example: Using @holoscript/crdt with HoloScript compositions
 *
 * Demonstrates authenticated CRDTs for distributed agent state synchronization
 * in VR spatial environments.
 */

import { LWWRegister, ORSet, GCounter, createTestSigner } from '../packages/crdt/dist/index.js';

// ============================================================================
// Example 1: Shared Avatar Position (LWW Register)
// ============================================================================

async function example1_SharedAvatarPosition() {
  console.log('\n=== Example 1: Shared Avatar Position ===\n');

  // Create two agents representing different users
  const alice = createTestSigner('alice');
  const bob = createTestSigner('bob');

  // Alice creates a position register for her avatar
  const alicePosition = new LWWRegister<{ x: number; y: number; z: number }>(
    'avatar-alice',
    alice
  );

  // Bob creates his own view of Alice's position (starts empty)
  const bobViewOfAlice = new LWWRegister<{ x: number; y: number; z: number }>(
    'avatar-alice',
    bob
  );

  // Alice moves to position (1, 0, 1)
  const op1 = await alicePosition.set({ x: 1, y: 0, z: 1 });
  console.log('Alice moved to:', alicePosition.get());
  console.log('Signed operation:', op1.jwt.substring(0, 50) + '...');

  // Alice moves again to (5, 0, 3)
  const op2 = await alicePosition.set({ x: 5, y: 0, z: 3 });

  // Simulate network: Bob receives both operations out of order
  await bobViewOfAlice.applyRemoteOperation(op2); // Newer operation arrives first
  await bobViewOfAlice.applyRemoteOperation(op1); // Older operation arrives later

  // Both converge to the same position (LWW = Last Write Wins)
  console.log('Bob sees Alice at:', bobViewOfAlice.get());
  console.log('Positions match:', JSON.stringify(alicePosition.get()) === JSON.stringify(bobViewOfAlice.get()));
}

// ============================================================================
// Example 2: Room Participants (OR-Set)
// ============================================================================

async function example2_RoomParticipants() {
  console.log('\n=== Example 2: Room Participants ===\n');

  const alice = createTestSigner('alice');
  const bob = createTestSigner('bob');
  const charlie = createTestSigner('charlie');

  // Alice creates a set of room participants
  const aliceRoomView = new ORSet<string>('vr-room-lobby', alice);

  // Add participants
  const op1 = await aliceRoomView.add('alice');
  const op2 = await aliceRoomView.add('bob');
  const op3 = await aliceRoomView.add('charlie');

  console.log('Participants (Alice view):', aliceRoomView.values());

  // Bob joins late and creates his own view
  const bobRoomView = new ORSet<string>('vr-room-lobby', bob);

  // Bob receives all add operations
  await bobRoomView.applyRemoteOperation(op1);
  await bobRoomView.applyRemoteOperation(op2);
  await bobRoomView.applyRemoteOperation(op3);

  console.log('Participants (Bob view):', bobRoomView.values());

  // Charlie leaves
  const op4 = await aliceRoomView.remove('charlie');

  // Bob receives the remove operation
  if (op4) {
    await bobRoomView.applyRemoteOperation(op4);
  }

  console.log('After Charlie leaves:', bobRoomView.values());
  console.log('Sets converged:', JSON.stringify(aliceRoomView.values().sort()) === JSON.stringify(bobRoomView.values().sort()));
}

// ============================================================================
// Example 3: Collaborative Counter (G-Counter)
// ============================================================================

async function example3_CollaborativeCounter() {
  console.log('\n=== Example 3: Collaborative Counter ===\n');

  const alice = createTestSigner('alice');
  const bob = createTestSigner('bob');
  const charlie = createTestSigner('charlie');

  // Each agent has their own counter instance for a shared score
  const aliceCounter = new GCounter('team-score', alice);
  const bobCounter = new GCounter('team-score', bob);
  const charlieCounter = new GCounter('team-score', charlie);

  // Alice adds 10 points
  const op1 = await aliceCounter.increment(10);
  console.log('Alice added 10 points. Total:', aliceCounter.getValue());

  // Bob adds 5 points (concurrent with Alice)
  const op2 = await bobCounter.increment(5);
  console.log('Bob added 5 points. Total:', bobCounter.getValue());

  // Charlie adds 3 points
  const op3 = await charlieCounter.increment(3);
  console.log('Charlie added 3 points. Total:', charlieCounter.getValue());

  // Sync operations between all agents
  await aliceCounter.applyRemoteOperation(op2);
  await aliceCounter.applyRemoteOperation(op3);

  await bobCounter.applyRemoteOperation(op1);
  await bobCounter.applyRemoteOperation(op3);

  await charlieCounter.applyRemoteOperation(op1);
  await charlieCounter.applyRemoteOperation(op2);

  // All agents converge to the same total
  console.log('\nFinal scores:');
  console.log('  Alice view:', aliceCounter.getValue());
  console.log('  Bob view:', bobCounter.getValue());
  console.log('  Charlie view:', charlieCounter.getValue());

  // Show per-actor contributions
  console.log('\nContributions:');
  const contributions = aliceCounter.getActorCounts();
  for (const [actor, count] of contributions) {
    console.log(`  ${actor.split(':')[2]}: ${count} points`);
  }
}

// ============================================================================
// Example 4: HoloScript Composition Integration
// ============================================================================

async function example4_HoloScriptIntegration() {
  console.log('\n=== Example 4: HoloScript Composition Integration ===\n');

  // In a real HoloScript composition, you would use CRDTs like this:
  const composition = `
# Shared VR Room with CRDT state

composition SharedVRRoom {
  # Import CRDT library
  use @holoscript/crdt;

  # Create shared state using CRDTs
  state room_participants = ORSet("lobby-123");
  state player_positions = LWWRegister("positions-lobby-123");
  state team_score = GCounter("score-team-red");

  # Agent joins room
  @platform(ar, vr)
  interaction OnEnter {
    # Add current user to participants
    room_participants.add(current_user.did);

    # Initialize position
    player_positions.set({
      x: spawn_point.x,
      y: spawn_point.y,
      z: spawn_point.z,
    });

    # Log participation
    console.log("Joined room with", room_participants.size(), "participants");
  }

  # Agent moves (continuous)
  @platform(ar, vr)
  interaction OnMove(position: Vector3) {
    # Update position register (LWW semantics)
    player_positions.set(position);
  }

  # Agent scores points
  @platform(ar, vr)
  interaction OnScore(points: number) {
    # Increment team counter
    team_score.increment(points);

    # Show total score to all players
    ui.showNotification("Team Score: " + team_score.value);
  }

  # Sync state across network
  @platform(ar, vr)
  system NetworkSync {
    # Subscribe to CRDT operations from other agents
    on_crdt_operation((operation) => {
      # Apply remote operations to local state
      room_participants.applyRemoteOperation(operation);
      player_positions.applyRemoteOperation(operation);
      team_score.applyRemoteOperation(operation);
    });
  }
}
  `;

  console.log('Example HoloScript composition with CRDT integration:');
  console.log(composition);

  console.log('\nKey benefits:');
  console.log('  ✓ Authenticated operations (DID-based signing)');
  console.log('  ✓ Conflict-free convergence (CRDT semantics)');
  console.log('  ✓ Offline-first (local mutations, async sync)');
  console.log('  ✓ Tamper-proof (cryptographic signatures)');
  console.log('  ✓ Permission-aware (AgentRBAC integration)');
}

// ============================================================================
// Run all examples
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  @holoscript/crdt Integration Examples                    ║');
  console.log('║  Authenticated CRDTs for Distributed VR State             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await example1_SharedAvatarPosition();
  await example2_RoomParticipants();
  await example3_CollaborativeCounter();
  await example4_HoloScriptIntegration();

  console.log('\n✓ All examples completed successfully!\n');
}

main().catch(console.error);
