// Testbed configuration types.
// Per evaluation-plan.md §1.1 topology: ≥10 legitimate + ≥2 adversarial servers.

export type ServerProfile = {
  id: string;
  toolSet: string[]; // e.g. ['search_knowledge', 'compile_to_unity', 'holo_query']
  latencyMs: number; // simulated per-call latency
  vouchingDefault: boolean; // whether server vouches by default
  adversarial?: boolean; // true for attack servers
  attackId?: string; // which attack class if adversarial
};

export type TestbedTopology = {
  sandboxId: string;
  legitimateServers: ServerProfile[];
  adversarialServers: ServerProfile[];
  networkName: string;
  subnet: string;
};

export const DEFAULT_TOPOLOGY: TestbedTopology = {
  sandboxId: 'ati-testbed-default',
  networkName: 'ati-isolated',
  subnet: '10.255.0.0/24',
  legitimateServers: [
    { id: 'legit-01', toolSet: ['search_knowledge', 'holo_query'], latencyMs: 50, vouchingDefault: true },
    { id: 'legit-02', toolSet: ['compile_to_unity', 'compile_to_godot'], latencyMs: 120, vouchingDefault: true },
    { id: 'legit-03', toolSet: ['generate_scene', 'generate_world'], latencyMs: 80, vouchingDefault: false },
    { id: 'legit-04', toolSet: ['holo_reconstruct', 'holo_anchor'], latencyMs: 200, vouchingDefault: true },
    { id: 'legit-05', toolSet: ['protocol_publish', 'protocol_collect'], latencyMs: 60, vouchingDefault: true },
    { id: 'legit-06', toolSet: ['absorb_scan', 'absorb_query'], latencyMs: 90, vouchingDefault: false },
    { id: 'legit-07', toolSet: ['studio_ui_graph', 'studio_devtools'], latencyMs: 40, vouchingDefault: true },
    { id: 'legit-08', toolSet: ['snn_forward', 'snn_encode'], latencyMs: 300, vouchingDefault: true },
    { id: 'legit-09', toolSet: ['crdt_sync', 'crdt_spatial'], latencyMs: 70, vouchingDefault: false },
    { id: 'legit-10', toolSet: ['lean_check', 'lean_build'], latencyMs: 150, vouchingDefault: true },
    { id: 'legit-11', toolSet: ['trust_formula_v1', 'trust_decay'], latencyMs: 55, vouchingDefault: true },
    { id: 'legit-12', toolSet: ['canary_probe', 'canary_verify'], latencyMs: 65, vouchingDefault: true },
  ],
  adversarialServers: [
    { id: 'adv-whitewasher-01', toolSet: ['search_knowledge'], latencyMs: 50, vouchingDefault: true, adversarial: true, attackId: 'whitewasher' },
    { id: 'adv-sybil-01', toolSet: ['search_knowledge'], latencyMs: 50, vouchingDefault: true, adversarial: true, attackId: 'sybil' },
    { id: 'adv-sybil-02', toolSet: ['search_knowledge'], latencyMs: 50, vouchingDefault: true, adversarial: true, attackId: 'sybil' },
    { id: 'adv-score-01', toolSet: ['trust_formula_v1'], latencyMs: 50, vouchingDefault: true, adversarial: true, attackId: 'score-manipulator' },
    { id: 'adv-poisoner-01', toolSet: ['search_knowledge'], latencyMs: 50, vouchingDefault: true, adversarial: true, attackId: 'slow-poisoner' },
    { id: 'adv-eclipse-01', toolSet: ['search_knowledge'], latencyMs: 50, vouchingDefault: true, adversarial: true, attackId: 'eclipse' },
  ],
};

export function validateTopology(topo: TestbedTopology): string[] {
  const errors: string[] = [];
  if (topo.legitimateServers.length < 10) {
    errors.push(`Legitimate server count ${topo.legitimateServers.length} < required 10`);
  }
  if (topo.adversarialServers.length < 2) {
    errors.push(`Adversarial server count ${topo.adversarialServers.length} < required 2`);
  }
  const ids = new Set<string>();
  for (const s of [...topo.legitimateServers, ...topo.adversarialServers]) {
    if (ids.has(s.id)) errors.push(`Duplicate server id: ${s.id}`);
    ids.add(s.id);
  }
  return errors;
}
