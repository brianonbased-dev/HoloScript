import { IKSolver, type IKChain } from '../IKSolver';

export interface IKProbeSpec {
  chains: IKChain[];
  targetSequence: ReadonlyArray<readonly [number, number, number]>;
}

export function runIKDeterminismProbe(spec: IKProbeSpec): Uint8Array {
  const solver = new IKSolver();
  for (const chain of spec.chains) {
    const clonedChain: IKChain = {
      ...chain,
      target: [...chain.target],
      poleTarget: chain.poleTarget ? [...chain.poleTarget] : undefined,
      bones: chain.bones.map((b) => ({
        ...b,
        position: [...b.position],
        rotation: { ...b.rotation },
      })),
    };
    solver.addChain(clonedChain);
  }

  const numTargets = spec.targetSequence.length;
  const numChains = spec.chains.length;
  const buffer = new Float32Array(numTargets * numChains * 3);
  let idx = 0;

  for (const target of spec.targetSequence) {
    for (const chain of spec.chains) {
      solver.setTarget(chain.id, target[0], target[1], target[2]);
    }
    solver.solveAll();

    for (const chain of spec.chains) {
      const solverChain = solver.getChain(chain.id);
      if (solverChain) {
        const endEffector = solverChain.bones[solverChain.bones.length - 1];
        buffer[idx++] = endEffector.position[0];
        buffer[idx++] = endEffector.position[1];
        buffer[idx++] = endEffector.position[2];
      }
    }
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export const PAPER_P2_IK_CANONICAL_SPEC: Readonly<IKProbeSpec> = Object.freeze({
  chains: [
    {
      id: 'chain-1',
      target: [0, 0, 0] as [number, number, number],
      weight: 1.0,
      iterations: 10,
      bones: [
        { id: 'b1', position: [0, 0, 0] as [number, number, number], rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 1.0 },
        { id: 'b2', position: [0, 1, 0] as [number, number, number], rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 1.0 },
        { id: 'b3', position: [0, 2, 0] as [number, number, number], rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 1.0 },
      ],
    },
  ],
  targetSequence: Object.freeze([
    [1, 1, 1],
    [-1, 2, 0],
    [0, 0.5, 0.5],
    [2, 2, 2],
  ]) as ReadonlyArray<[number, number, number]>,
});
