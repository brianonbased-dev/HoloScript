// Seed-legit: spins up the legitimate server population in the testbed.
// In Docker mode (§1.2), this script is the ENTRYPOINT for the seed-legit
// container. In local/dev mode, it validates the topology and emits a
// manifest that runner.ts uses to wire the mesh.

import { DEFAULT_TOPOLOGY, validateTopology, type TestbedTopology, type ServerProfile } from './testbed-config.js';

export type ServerManifest = {
  servers: ServerProfile[];
  sandboxId: string;
  networkName: string;
};

export function seedLegit(topo: TestbedTopology = DEFAULT_TOPOLOGY): ServerManifest {
  const errors = validateTopology(topo);
  if (errors.length > 0) {
    throw new Error(`Testbed topology invalid:\n${errors.join('\n')}`);
  }

  // Per evaluation-plan.md §1.3: wallets are fresh keypairs per testbed run.
  // Deterministic from (sandboxId, serverIndex) via BIP-39 derivation path.
  // This stub documents the derivation; actual wallet generation lives in
  // the orchestrator that provisions testbed containers.
  const servers = [...topo.legitimateServers, ...topo.adversarialServers];

  return {
    servers,
    sandboxId: topo.sandboxId,
    networkName: topo.networkName,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const topo = seedLegit();
  console.log(JSON.stringify(topo, null, 2));
}
