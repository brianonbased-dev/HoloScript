/**
 * Integration example: MVC objects with @holoscript/crdt
 *
 * Demonstrates how to use MVC schema types with authenticated CRDT operations
 * for distributed agent state synchronization.
 */

import {
  LWWRegister,
  ORSet,
  DIDSigner,
  createTestSigner,
} from '@holoscript/crdt';

import type {
  DecisionHistory,
  ActiveTaskState,
  UserPreferences,
  DecisionEntry,
  TaskEntry,
} from '@holoscript/mvc-schema';

import {
  compressMVCFull,
  decompressMVCFull,
  validateDecisionHistory,
  validateTaskState,
} from '@holoscript/mvc-schema';

/**
 * Example 1: DecisionHistory with G-Set semantics
 *
 * Append-only decision log using authenticated operations.
 */
async function exampleDecisionHistory() {
  console.log('\n=== DecisionHistory Example ===\n');

  // Create DID signer for authenticated operations
  const signer = createTestSigner('agent-1');

  // Initialize DecisionHistory
  const history: DecisionHistory = {
    crdtType: 'g-set',
    crdtId: 'history-123',
    decisions: [],
    vectorClock: {},
    lastUpdated: Date.now(),
  };

  // Add decision (simulating G-Set add operation)
  const decision: DecisionEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'task',
    description: 'Choose spatial anchoring system',
    choice: 'Use WGS84 coordinates for cross-reality compatibility',
    confidence: 0.95,
    agentDid: signer.getDID(),
  };

  history.decisions.push(decision);
  history.vectorClock[signer.getDID()] = 1;
  history.lastUpdated = Date.now();

  // Validate
  const validation = validateDecisionHistory(history);
  console.log('Validation:', validation.valid ? 'PASSED' : 'FAILED');

  // Compress
  const compressed = compressMVCFull(history);
  console.log(`Original size: ${compressed.originalSize}B`);
  console.log(`Compressed size: ${compressed.finalSize}B`);
  console.log(
    `Compression ratio: ${(compressed.totalCompressionRatio * 100).toFixed(1)}%`
  );

  // Decompress and verify
  const restored = decompressMVCFull<DecisionHistory>(compressed.compressed);
  console.log('Round-trip successful:', JSON.stringify(restored) === JSON.stringify(history));
}

/**
 * Example 2: ActiveTaskState with OR-Set + LWW-Register
 *
 * Task collection (OR-Set) with per-task status (LWW-Register).
 */
async function exampleActiveTaskState() {
  console.log('\n=== ActiveTaskState Example ===\n');

  const signer = createTestSigner('agent-2');

  // Initialize ActiveTaskState
  const taskState: ActiveTaskState = {
    crdtType: 'or-set+lww',
    crdtId: 'tasks-456',
    tasks: [],
    taskTags: {},
    statusRegisters: {},
    vectorClock: {},
    lastUpdated: Date.now(),
  };

  // Add task (OR-Set add operation)
  const taskId = crypto.randomUUID();
  const task: TaskEntry = {
    id: taskId,
    title: 'Implement MVC compression pipeline',
    status: 'in_progress',
    priority: 'high',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assignedTo: signer.getDID(),
  };

  taskState.tasks.push(task);

  // OR-Set tags (for add/remove tracking)
  taskState.taskTags[taskId] = {
    addTags: [crypto.randomUUID()],
    removeTags: [],
  };

  // LWW status register
  taskState.statusRegisters[taskId] = {
    taskId,
    status: 'in_progress',
    timestamp: Date.now(),
    actorDid: signer.getDID(),
    operationId: crypto.randomUUID(),
  };

  taskState.vectorClock[signer.getDID()] = 1;
  taskState.lastUpdated = Date.now();

  // Validate
  const validation = validateTaskState(taskState);
  console.log('Validation:', validation.valid ? 'PASSED' : 'FAILED');

  // Compress
  const compressed = compressMVCFull(taskState);
  console.log(`Compressed size: ${compressed.finalSize}B (<2KB)`);
  console.log(`Size target met: ${compressed.validation.valid}`);
}

/**
 * Example 3: UserPreferences with LWW-Register per field
 *
 * Each preference field is an independent LWW-Register.
 */
async function exampleUserPreferences() {
  console.log('\n=== UserPreferences Example ===\n');

  const signer = createTestSigner('agent-3');

  // Create LWW-Register for each preference field
  const movementSpeedReg = new LWWRegister<number>(
    'pref-movement-speed',
    signer,
    2.5
  );

  // Update preference
  await movementSpeedReg.set(3.0);

  // Build UserPreferences object
  const prefs: UserPreferences = {
    crdtType: 'lww-map',
    crdtId: 'prefs-789',
    agentDid: signer.getDID(),
    spatial: {
      movementSpeed: movementSpeedReg.get()!,
      personalSpaceRadius: 1.5,
    },
    communication: {
      style: 'technical',
      language: 'en',
    },
    lwwMetadata: {
      'spatial.movementSpeed': {
        timestamp: Date.now(),
        actorDid: signer.getDID(),
        operationId: crypto.randomUUID(),
      },
    },
    lastUpdated: Date.now(),
  };

  console.log('Movement speed preference:', prefs.spatial?.movementSpeed);

  // Compress
  const compressed = compressMVCFull(prefs);
  console.log(`Compressed size: ${compressed.finalSize}B`);
}

/**
 * Example 4: Cross-reality synchronization
 *
 * Simulate agent state sync across VR and traditional platforms.
 */
async function exampleCrossRealitySync() {
  console.log('\n=== Cross-Reality Sync Example ===\n');

  // Agent in VR headset
  const vrSigner = createTestSigner('vr-agent');
  const vrHistory: DecisionHistory = {
    crdtType: 'g-set',
    crdtId: 'shared-history',
    decisions: [
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'spatial',
        description: 'Moved to new workspace anchor',
        choice: 'WGS84: 37.7749, -122.4194',
        agentDid: vrSigner.getDID(),
      },
    ],
    vectorClock: { [vrSigner.getDID()]: 1 },
    lastUpdated: Date.now(),
  };

  // Compress for transmission
  const compressed = compressMVCFull(vrHistory);
  console.log(`VR → Network: ${compressed.finalSize}B`);

  // Agent on traditional platform receives and decompresses
  const desktopAgent = createTestSigner('desktop-agent');
  const received = decompressMVCFull<DecisionHistory>(compressed.compressed);

  // Merge (G-Set union)
  const desktopDecision: DecisionEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'task',
    description: 'Acknowledged VR agent movement',
    choice: 'Update shared spatial context',
    agentDid: desktopAgent.getDID(),
  };

  received.decisions.push(desktopDecision);
  received.vectorClock[desktopAgent.getDID()] = 1;
  received.lastUpdated = Date.now();

  console.log('Merged decisions:', received.decisions.length);
  console.log('Vector clock:', received.vectorClock);
  console.log('\nCross-reality sync complete!');
}

/**
 * Run all examples
 */
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('MVC SCHEMA + CRDT INTEGRATION EXAMPLES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await exampleDecisionHistory();
  await exampleActiveTaskState();
  await exampleUserPreferences();
  await exampleCrossRealitySync();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('All examples completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  exampleDecisionHistory,
  exampleActiveTaskState,
  exampleUserPreferences,
  exampleCrossRealitySync,
};
