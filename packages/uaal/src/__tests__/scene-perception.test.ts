/**
 * G5 (cognitive side): the real uAAL VM reasons over a SceneSnapshot perception
 * and emits a decision. Paired with the spatial side in
 * packages/holo-vm/src/__tests__/scene-snapshot.test.ts (which produces the
 * snapshot and applies the decision back to the world). Together they prove the
 * cognitive <-> spatial join across the shared SceneSnapshot contract.
 *
 * The SceneSnapshot shape is mirrored structurally here (not imported) to keep
 * @holoscript/uaal dependency-free; the in-process join lives in an adapter that
 * deps both VMs. See docs/spec/spec-vs-reality-gap.md G5.
 */
import { describe, it, expect } from 'vitest';
import { UAALVirtualMachine, UAALOpCode } from '../index';
import type { UAALOperand } from '../index';

// Structural mirror of @holoscript/holo-vm SceneSnapshot (the cross-VM contract).
interface ScenePerception {
  entityCount: number;
  entities: { id: number; name: string; components: Record<string, unknown> }[];
}

function cullBrain() {
  const brain = new UAALVirtualMachine();
  brain.registerHandler(UAALOpCode.EXECUTE, (proxy) => {
    const scene = proxy.getState().context.scene as unknown as ScenePerception;
    proxy.push(scene.entityCount >= 3 ? 'cull' : 'noop');
  });
  return brain;
}
const BYTECODE = {
  version: 2,
  instructions: [{ opCode: UAALOpCode.EXECUTE }, { opCode: UAALOpCode.HALT }],
};
const perceive = (scene: ScenePerception) => ({ scene: scene as unknown as UAALOperand });

describe('uAAL reasons over a SceneSnapshot perception (G5)', () => {
  it('emits "cull" when the perceived world is dense', async () => {
    const dense: ScenePerception = {
      entityCount: 3,
      entities: [
        { id: 1, name: 'e1', components: {} },
        { id: 2, name: 'e2', components: {} },
        { id: 3, name: 'e3', components: {} },
      ],
    };
    const result = await cullBrain().execute(BYTECODE, perceive(dense));
    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe('cull');
  });

  it('emits "noop" when the perceived world is sparse (non-vacuous: perception drives it)', async () => {
    const sparse: ScenePerception = {
      entityCount: 1,
      entities: [{ id: 1, name: 'solo', components: {} }],
    };
    const result = await cullBrain().execute(BYTECODE, perceive(sparse));
    expect(result.stackTop).toBe('noop');
  });
});
