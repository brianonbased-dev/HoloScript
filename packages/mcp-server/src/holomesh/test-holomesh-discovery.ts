import { HoloMeshDiscovery } from './discovery.js';
import { HoloMeshWorldState } from './crdt-sync.js';
import * as http from 'http';

// Create a fast, local HTTP server to act as a HoloMesh neighbor
const server = http.createServer((req, res) => {
  // A2A Handshake
  if (req.url === '/.well-known/agent-card.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'did:peer:testnode123' }));
  }
  // Proof-of-Play Challenge
  else if (req.url === '/.well-known/pop-challenge' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      const payload = JSON.parse(body);
      const inputs = payload.inputs;
      // Calculate dot product
      const result = inputs[0] * inputs[3] + inputs[1] * inputs[4] + inputs[2] * inputs[5];

      // Optional: add artificial delay to test rejection?
      // We want it to pass to verify the CRDT pipeline trigger
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: result }));
      }, 10);
    });
  }
  // CRDT Lattice Fetch
  else if (req.url === '/.well-known/crdt-state') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    // Just send a raw empty array to simulate a valid transfer
    res.end(Buffer.from(new Uint8Array([0, 0, 0, 0])));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(4848, async () => {
  console.log('──────────────────────────────────────────────────');
  console.log('[HoloMesh Local Test] Neighbor Node Bound: 4848.');

  // Instantiate our modified CRDT and Discovery layers
  const worldState = {
    mergeNeighborState: (update: Uint8Array) => {
      console.log(`[HoloMesh Local Test] Called mergeNeighborState with ${update.length} bytes.`);
      (globalThis as unknown as Record<string, unknown>).testMerged = true;
    },
  } as unknown as HoloMeshWorldState;
  const discovery = new HoloMeshDiscovery('did:local:agentx', 'http://localhost:4849', worldState);

  console.log('[HoloMesh Local Test] Executing P.SGM.01 Discovery Routine...');
  const result = await discovery.discoverPeer('http://localhost:4848');

  console.log('──────────────────────────────────────────────────');
  console.log(`[HoloMesh Local Test] Discovery Complete: ${result ? 'SUCCESS' : 'FAILED'}`);

  if (result && (globalThis as unknown as Record<string, unknown>).testMerged) {
    console.log(`[HoloMesh Local Test] Fetched insights from gossip merge: SUCCESS`);
  }

  server.close();
  process.exit(result ? 0 : 1);
});
