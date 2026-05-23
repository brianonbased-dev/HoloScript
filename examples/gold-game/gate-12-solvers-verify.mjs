// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 12: multi-physics SOLVER in the vault world (REPRODUCIBLE).
//
// Runs a GENUINE HoloScript solver (StructuralSolver TET4 FEM, one of the 15+
// shipped multi-physics solvers, S.SIM) over the vault world: a tetrahedral
// "keystone" of the vault is fixed at one node and bears a load at another (the
// weight a curated entry puts on the structure). The real FEM solve produces a
// non-zero von-Mises stress + displacement field, driven through the real
// StructuralSolverAdapter (SimSolver interface) and digested by the REAL
// computeStateDigest from packages/engine/src/simulation/hashes.ts — the same
// contract spine every other gate uses.
//
//   node_modules/.bin/tsx examples/gold-game/gate-12-solvers-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-12-solvers-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const sim = join(repo, 'packages', 'engine', 'src', 'simulation');
const { computeStateDigest } = await imp(join(sim, 'hashes.ts'));
const { StructuralSolver } = await imp(join(sim, 'StructuralSolver.ts'));
const { StructuralSolverAdapter } = await imp(join(sim, 'adapters', 'SolverAdapters.ts'));
const receiptPath = join(here, 'GATE-12-SOLVERS-receipt.json');
const HASH = 'sha256';

// The vault keystone: one tetrahedron (4 nodes). Node 0 is anchored (the bedrock),
// node 3 bears a load (the curation weight). Real TET4 FEM responds with stress.
function makeAdapter() {
  const config = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    tetrahedra: new Uint32Array([0, 1, 2, 3]),
    material: { density: 7850, youngs_modulus: 2.0e11, poisson_ratio: 0.3, yield_strength: 2.5e8 },
    constraints: [{ id: 'bedrock', type: 'fixed', nodes: [0] }],
    loads: [{ id: 'curation-weight', type: 'point', nodeIndex: 3, force: [0, 0, 1000] }],
  };
  return new StructuralSolverAdapter(new StructuralSolver(config));
}

function run() {
  const adapter = makeAdapter();
  const fields = [...(adapter.fieldNames || [])];
  const hasStress = fields.includes('von_mises_stress');
  const hasDisp = fields.includes('displacements');
  adapter.solve();
  const stress = adapter.getField('von_mises_stress');
  const disp = adapter.getField('displacements');
  const digest = computeStateDigest(adapter, HASH);
  return { adapter, hasStress, hasDisp, stress, disp, digest };
}

const r1 = run();
const stress = r1.stress;
const disp = r1.disp;
const r4 = (n) => Number(n.toFixed(6));
const maxStress = stress ? Math.max(...stress) : null;
const loadedNodeDisp = disp ? Math.hypot(disp[9] || 0, disp[10] || 0, disp[11] || 0) : null; // node 3 = dof 9,10,11

const realSolver = r1.hasStress && r1.hasDisp && stress instanceof Float32Array && disp instanceof Float32Array;
const stressed = maxStress !== null && maxStress > 0;        // structure genuinely responds to the load
const displaced = loadedNodeDisp !== null && loadedNodeDisp > 0; // loaded node actually moves
const r2 = run();
const deterministic = r1.digest === r2.digest && r1.digest.length > 0;

const receipt = {
  gate: 12,
  track: 'flagship',
  name: 'multi-physics solver — real StructuralSolver (TET4 FEM) over the vault keystone',
  verifier: 'examples/gold-game/gate-12-solvers-verify.mjs',
  solver: { name: 'StructuralSolver (TET4)', adapter: 'StructuralSolverAdapter (SimSolver interface)', source: 'packages/engine/src/simulation/StructuralSolver.ts', tier: 'CPU (sim-tier)' },
  scene: { meaning: 'a vault keystone tetrahedron; node 0 anchored (bedrock), node 3 bears the curation-weight load', tetrahedra: 1, nodes: 4, loadN: 1000, material: 'steel (E=200GPa, ν=0.3)' },
  result: { stressFieldLen: stress?.length, dispFieldLen: disp?.length, maxVonMisesStress: r4(maxStress), loadedNodeDisplacement: r4(loadedNodeDisp), stressed, displaced, deterministic },
  contract: { spine: 'REAL computeStateDigest(adapter, hashMode) — same fn SimulationContract pushes on solve()', stateDigest: r1.digest, reproducible: 'run the verifier to re-derive' },
  honestScope: 'Runs the GENUINE StructuralSolver (TET4 FEM — one of the 15+ shipped multi-physics solvers, S.SIM) via the real StructuralSolverAdapter on a CPU sim-tier; the state digest is the real computeStateDigest. PROVEN: a real HoloScript physics solver executes over a vault-world element, the structure genuinely responds to load (non-zero von-Mises stress + displacement), and the contract digest reproduces deterministically. NOT proven here: full CouplingManagerV2 multi-domain coupling (structural+thermal+fluid in one coupled step) and GPU-backed solves — available in the stack, they deepen later. (Note: the ThermalSolver source-field path does not inject heat in step(), so this gate uses the structural solver, which evolves under load.)',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-12 RECEIPT EMITTED ->', receiptPath);
  console.log('  realSolver=' + realSolver, 'stressed=' + stressed, 'displaced=' + displaced, 'deterministic=' + deterministic);
  console.log('  maxVonMises=' + r4(maxStress), 'loadedNodeDisp=' + r4(loadedNodeDisp));
  console.log('  stateDigest=' + r1.digest);
} else {
  let existing; try { existing = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { console.error('No Gate-12 receipt. Run --emit first.'); process.exit(2); }
  const checks = [
    ['REAL StructuralSolver via adapter (von_mises_stress + displacements fields)', realSolver === true],
    ['structure responds to the curation load (max von-Mises stress > 0)', stressed === true],
    ['loaded node genuinely displaces (FEM solved, not static)', displaced === true],
    ['deterministic: identical state digest across independent solves', deterministic === true],
    ['state digest reproduces vs receipt (real computeStateDigest)', r1.digest === existing.contract.stateDigest],
  ];
  let ok = true;
  console.log('GATE-12 (MULTI-PHYSICS SOLVER) VERIFICATION:');
  for (const [label, pass] of checks) { console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label); ok = ok && pass; }
  console.log('  => GATE 12', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
