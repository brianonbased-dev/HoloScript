import { StateSynchronizer } from '../core/src/networking/StateSynchronizer';
import { StateDelta } from '../core/src/networking/DeltaCompressor';

async function runPrivacyTest() {
  console.log('=== Phase 10: Privacy-Preserving Mesh Test ===\n');

  const sync = StateSynchronizer.getInstance();

  let publicPacketsReceived = 0;

  // Agent Viewer acting as a Global P2P Subscriber
  sync.subscribeGlobal((deltas) => {
    publicPacketsReceived += deltas.length;
  });

  console.log('➜ 1. Emitting public spatial events and private internal monologue to the Mesh.');

  // Public move event
  const publicEvent: StateDelta = {
    entityId: 'brittney',
    field: 'position_x',
    oldValue: 0,
    newValue: 10,
    timestamp: Date.now(),
  };

  // Private cognitive state
  const privateEvent: StateDelta = {
    entityId: 'brittney',
    field: 'private_monologue',
    oldValue: 'Thinking...',
    newValue: "The user's secret code is 1234",
    timestamp: Date.now(),
  };

  // Secure operational key
  const secureEvent: StateDelta = {
    entityId: 'brittney',
    field: 'api_key_secure',
    oldValue: null,
    newValue: 'sk-xyz123',
    timestamp: Date.now(),
  };

  sync.broadcastDeltas([publicEvent, privateEvent, secureEvent]);

  // Force flush the 50ms batch window
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(`   - Public Agent Listener Received: ${publicPacketsReceived} Packets`);

  if (publicPacketsReceived === 1) {
    console.log('\n✔ Differential Privacy Scrubbing succeeded!');
    console.log(
      "  - The 'private_' and '_secure' tagged fields were completely filtered from the global broadcast layer."
    );
  } else {
    console.error(
      `\n✖ Privacy filter failed. Expected 1 public packet but listener caught ${publicPacketsReceived}.`
    );
    process.exit(1);
  }

  console.log('\n=== Integration Passed! ===');
}

runPrivacyTest().catch(console.error);
