/**
 * compile-holo-quantum.mts -- HoloScript-native quantum front end.
 *
 * Authors a HoloScript composition carrying a `@quantumCircuit` trait and lowers it
 * to OpenQASM 3.0 through the REAL in-repo QuantumCircuitCompiler — no hand-written
 * QASM. The emitted .qasm is then run on the Jetson GPU by
 * `.ai-ecosystem/scripts/quantum-scaleup/jetson_qasm_gpu_exec.py`.
 *
 *   @quantumCircuit (trait)  ->  QuantumCircuitCompiler  ->  OpenQASM 3.0  ->  Jetson GPU
 *
 * Run from the HoloScript repo root:
 *   pnpm exec tsx scripts/quantum/compile-holo-quantum.mts [vqe-h2|qaoa-tri] [outFile]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { QuantumCircuitCompiler } from '../../packages/core/src/compiler/QuantumCircuitCompiler';
import { createTestCompilerToken } from '../../packages/core/src/compiler/CompilerBase';
import type { HoloComposition } from '../../packages/core/src/parser/HoloCompositionTypes';

type Kind = 'vqe-h2' | 'qaoa-tri';
const kind = (process.argv[2] as Kind) ?? 'vqe-h2';
const outFile = (process.argv[3] ?? `C:/tmp/holo-quantum/${kind}.qasm`).replace(/\\/g, '/');

/** A HoloScript composition whose single object carries the @quantumCircuit trait. */
function quantumComposition(k: Kind): HoloComposition {
  const config =
    k === 'vqe-h2'
      ? {
          // VQE: H2 molecule (sto-3g -> 4 qubits), 1 ansatz layer (Ry + linear CNOT).
          molecule: {
            value: [
              { symbol: 'H', x: 0, y: 0, z: 0 },
              { symbol: 'H', x: 0, y: 0, z: 0.74 },
            ],
          },
          moleculeName: { value: 'H2' },
          ansatzLayers: { value: 1 },
        }
      : {
          // QAOA: 3-node fully-connected graph (triangle) Max-Cut, p=1, fixed angles.
          numNodes: { value: 3 },
          p: { value: 1 },
          gamma: { value: 0.5 },
          beta: { value: 0.5 },
        };

  return {
    type: 'Composition',
    name: k === 'vqe-h2' ? 'QuantumH2' : 'QuantumTriangle',
    templates: [],
    objects: [
      {
        type: 'ObjectDecl',
        name: 'circuit',
        traits: [{ type: 'ObjectTrait', name: 'quantumCircuit', config }],
        children: [],
      },
    ],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    traits: [],
  } as unknown as HoloComposition;
}

const composition = quantumComposition(kind);
const out = new QuantumCircuitCompiler().compile(composition, createTestCompilerToken());

console.log(
  `[compile-holo-quantum] ${kind}: type=${out.circuitType} qubits=${out.numQubits} ` +
    `depth=${out.estimatedDepth} backend=${out.recommendedBackend}`
);
if (out.warnings.length) console.log('[compile-holo-quantum] warnings:', out.warnings);

mkdirSync(outFile.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(outFile, out.qasm, 'utf-8');
console.log(`[compile-holo-quantum] wrote QASM -> ${outFile}`);
console.log('--- QASM (head) ---');
console.log(out.qasm.split('\n').slice(0, 14).join('\n'));
