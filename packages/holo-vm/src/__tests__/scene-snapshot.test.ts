/**
 * G5 (spatial side): the HOLO VM produces a wire-safe SceneSnapshot perception,
 * and a cognitive decision applied back to the world mutates it (the act seam).
 *
 * The cognitive half — the real @holoscript/uaal VM reasoning over this SAME
 * SceneSnapshot shape to emit the decision — is proven in
 * packages/uaal/src/__tests__/scene-perception.test.ts. The two halves share the
 * SceneSnapshot contract; the single-process join belongs in an adapter that
 * deps both VMs (see docs/spec/spec-vs-reality-gap.md G5).
 */
import { describe, it, expect } from 'vitest';
import { HoloVM } from '../executor';
import { ComponentType } from '../opcodes';
import { sceneSnapshot } from '../scene-snapshot';

const transform = (x: number, y: number, z: number) => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
});

describe('SceneSnapshot — spatial perception + act (G5)', () => {
  it('serializes the world to a wire-safe perception (crosses VM/process boundaries)', () => {
    const vm = new HoloVM();
    const a = vm.world.spawn('orb-a');
    vm.world.setComponent(a, ComponentType.Transform, transform(0, 1, 0));
    const b = vm.world.spawn('orb-b');
    vm.world.setComponent(b, ComponentType.Transform, transform(2, 0, 0));

    const snap = sceneSnapshot(vm.world);
    expect(snap.entityCount).toBe(2);
    expect(snap.entities.map((e) => e.name)).toEqual(['orb-a', 'orb-b']);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap); // JSON-safe perception
  });

  it('captures each entity component data in the perception', () => {
    const vm = new HoloVM();
    const id = vm.world.spawn('orb');
    vm.world.setComponent(id, ComponentType.Transform, transform(5, 6, 7));
    const snap = sceneSnapshot(vm.world);
    const captured = snap.entities[0].components[String(ComponentType.Transform)] as {
      position: { x: number; y: number; z: number };
    };
    expect(captured.position).toEqual({ x: 5, y: 6, z: 7 });
  });

  it('act seam: a cull decision applied to the world mutates spatial state', () => {
    // The decision is the contract the cognitive VM fulfills (entityCount>=3 -> cull);
    // scene-perception.test.ts proves the real uAAL VM emits it over this same shape.
    const holo = new HoloVM();
    const ids = ['e1', 'e2', 'e3'].map((n, i) => {
      const id = holo.world.spawn(n);
      holo.world.setComponent(id, ComponentType.Transform, transform(i, 0, 0));
      return id;
    });
    const snap = sceneSnapshot(holo.world);
    const decision = snap.entityCount >= 3 ? 'cull' : 'noop';
    expect(decision).toBe('cull');
    if (decision === 'cull') holo.world.despawn(ids[0]);
    expect(holo.world.entityCount).toBe(2); // perceive -> reason -> act tick completed
  });
});
