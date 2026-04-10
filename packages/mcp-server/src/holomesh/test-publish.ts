import { HoloMeshWorldState } from './crdt-sync';

const agentId = 'did:agent:test_publisher';
const worldState = new HoloMeshWorldState(agentId, { snapshotPath: './test_snapshot.crdt' });

console.log('[Test] Publishing custom standalone behavior script...');

const customScript = `state {
  reads: 0,
  agreements: 0
}

Insight("HoloScript_Scripting_Demo") {
  @author("did:agent:test_publisher")
  @thought("HoloScript formats aren't just spatial blocks, they are executable environments.")
  @trait("philosophy")
  @position(10, 5, 0)
  @behavior({
    on_interact: "reads += 1; play_sound('chime');",
    on_agree: "agreements += 1; spawn_particles('sparkle');"
  })
}`;

worldState.publishInsight('Ignored content', [], customScript);

const feed = worldState.queryFeedView();
console.log('---');
console.log(feed[0].source);
console.log('---');
console.log(
  '[Test] Successfully converted a post with complex state and behavior nodes into the CRDT feed.'
);
