/**
 * Simple CRDT Examples - @holoscript/crdt
 *
 * Demonstrates basic CRDT usage for VR/AR state management
 */

import { LWWRegister, ORSet, GCounter, createTestSigner } from '../packages/crdt/dist/index.js';

// ============================================================================
// Example 1: Last-Write-Wins Register (Avatar Position)
// ============================================================================

async function example1_LWWRegister() {
  console.log('\n=== Example 1: LWW Register (Avatar Position) ===\n');

  const alice = createTestSigner('alice');

  // Create a register to store avatar position
  const position = new LWWRegister<{ x: number; y: number; z: number }>('avatar-position', alice);

  // Set initial position
  const op1 = await position.set({ x: 0, y: 0, z: 0 });
  console.log('✓ Initial position:', position.get());
  console.log('  Signed operation JWT (first 60 chars):', op1.jwt.substring(0, 60) + '...');

  // Move avatar
  await position.set({ x: 5, y: 0, z: 3 });
  console.log('✓ After move:', position.get());

  // Get metadata (timestamp, actor DID)
  const metadata = position.getWithMetadata();
  console.log('✓ Metadata:');
  console.log('  - Timestamp:', new Date(metadata.timestamp).toISOString());
  console.log('  - Actor DID:', metadata.actorDid);

  // Serialize state
  const serialized = position.serialize();
  console.log('✓ Serialized state:', serialized);
}

// ============================================================================
// Example 2: Observed-Remove Set (Room Participants)
// ============================================================================

async function example2_ORSet() {
  console.log('\n=== Example 2: OR-Set (Room Participants) ===\n');

  const host = createTestSigner('host');

  // Create set to track room participants
  const participants = new ORSet<string>('vr-room-123', host);

  // Add participants
  await participants.add('alice');
  await participants.add('bob');
  await participants.add('charlie');

  console.log('✓ Participants:', participants.values());
  console.log('✓ Count:', participants.size());
  console.log('✓ Has alice?', participants.has('alice'));

  // Remove participant
  await participants.remove('bob');
  console.log('✓ After bob leaves:', participants.values());

  // Re-add participant (supported in OR-Set)
  await participants.add('bob');
  console.log('✓ After bob returns:', participants.values());

  // Serialize state
  const serialized = participants.serialize();
  console.log('✓ Serialized state size:', serialized.length, 'bytes');
}

// ============================================================================
// Example 3: Grow-Only Counter (Team Score)
// ============================================================================

async function example3_GCounter() {
  console.log('\n=== Example 3: G-Counter (Team Score) ===\n');

  const player1 = createTestSigner('player1');
  const player2 = createTestSigner('player2');

  // Each player has their own counter instance
  const score1 = new GCounter('team-score', player1);
  const score2 = new GCounter('team-score', player2);

  // Player 1 scores points
  await score1.increment(10);
  console.log('✓ Player 1 scored 10 points. Total:', score1.value());

  // Player 2 scores points
  await score2.increment(5);
  console.log('✓ Player 2 scored 5 points. Total:', score2.value());

  // Merge scores (in production, would sync over network)
  score1.merge(score2);
  score2.merge(score1);

  console.log('✓ After merge:');
  console.log('  - Player 1 view:', score1.value());
  console.log('  - Player 2 view:', score2.value());

  // Show per-player contributions
  console.log('✓ Contributions:');
  for (const [actor, count] of score1.getActorCounts()) {
    const name = actor.split(':').pop();
    console.log(`  - ${name}: ${count} points`);
  }

  // Vector clock (for debugging causality)
  console.log('✓ Vector clock:', score1.getVectorClock());
}

// ============================================================================
// Example 4: Security Features
// ============================================================================

async function example4_Security() {
  console.log('\n=== Example 4: Security Features ===\n');

  const alice = createTestSigner('alice');
  const mallory = createTestSigner('mallory');

  // Alice creates a register
  const secret = new LWWRegister<string>('secret-data', alice);
  await secret.set('confidential');

  console.log('✓ Security properties:');
  console.log('  - All operations are cryptographically signed with agent DIDs');
  console.log('  - JWT signatures ensure non-repudiation');
  console.log('  - Operations include actor DID:', alice.getDID());
  console.log('  - Timestamps prevent replay attacks');
  console.log('  - Integrates with AgentRBAC for permission checking');

  console.log('\n✓ Agent identities:');
  console.log('  - Alice DID:', alice.getDID());
  console.log('  - Mallory DID:', mallory.getDID());
  console.log('  - DIDs are unique and tamper-proof');
}

// ============================================================================
// Example 5: HoloScript Integration Pattern
// ============================================================================

async function example5_HoloScriptIntegration() {
  console.log('\n=== Example 5: HoloScript Integration Pattern ===\n');

  const composition = `
# VR Room with Collaborative State
composition VRCollaborativeRoom {
  # Import CRDT library
  use @holoscript/crdt;

  # Shared state (CRDTs)
  state participants = ORSet("room-123");
  state player_positions = Map<DID, LWWRegister<Vector3>>();
  state team_scores = Map<Team, GCounter>();

  # When player joins
  @platform(ar, vr)
  interaction OnJoin {
    # Add to participant set
    participants.add(agent.did);

    # Initialize position register
    player_positions[agent.did] = LWWRegister(agent.did + "-pos");
    player_positions[agent.did].set(spawn_point);

    # Broadcast join event
    network.broadcast({
      type: "player_joined",
      did: agent.did,
      position: spawn_point
    });
  }

  # When player moves
  @platform(ar, vr)
  interaction OnMove(new_position: Vector3) {
    # Update position (LWW semantics handle conflicts)
    player_positions[agent.did].set(new_position);

    # Send update to peers
    network.broadcast({
      type: "position_update",
      did: agent.did,
      position: new_position,
      timestamp: Date.now()
    });
  }

  # When player scores
  @platform(ar, vr)
  interaction OnScore(team: Team, points: number) {
    # Increment team counter (commutative, conflict-free)
    team_scores[team].increment(points);

    # Update UI for all players
    ui.updateScore(team, team_scores[team].value);
  }

  # Network sync handler
  @platform(ar, vr)
  system NetworkSync {
    # Apply remote CRDT operations
    network.on("crdt_operation", (operation) => {
      match operation.type {
        "or_set_add" => participants.applyRemoteAdd(operation),
        "lww_set" => player_positions[operation.actor].applyRemote(operation),
        "g_counter_increment" => team_scores[operation.team].applyRemote(operation),
      }
    });
  }
}
  `.trim();

  console.log(composition);

  console.log('\n✓ Key benefits for VR/AR:');
  console.log('  - Offline-first: local mutations, async sync');
  console.log('  - Low latency: no server round-trip for state updates');
  console.log('  - Conflict-free: CRDTs guarantee convergence');
  console.log('  - Decentralized: peer-to-peer sync without central authority');
  console.log('  - Secure: DID-based authentication, tamper-proof operations');
}

// ============================================================================
// Run all examples
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  @holoscript/crdt - Simple Examples                     ║');
  console.log('║  Authenticated CRDTs for VR/AR State Management          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  await example1_LWWRegister();
  await example2_ORSet();
  await example3_GCounter();
  await example4_Security();
  await example5_HoloScriptIntegration();

  console.log('\n✓ All examples completed!\n');
}

main().catch(console.error);
