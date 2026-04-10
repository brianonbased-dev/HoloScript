import { describe, it, expect, beforeEach } from 'vitest';
import { GizmoSystem } from '../../editor/GizmoSystem';
import { World } from '../../ecs/World';
import { SelectionManager } from '../../editor/SelectionManager';

function makeSetup() {
  const world = new World();
  const selection = new SelectionManager(); // no args
  const gizmo = new GizmoSystem(world, selection);
  return { world, selection, gizmo };
}

// Let the reactive effect queue flush (effects are batched via microtask)
async function tick() {
  await Promise.resolve();
}

describe('GizmoSystem — Production Tests', () => {
  describe('initialization', () => {
    it('creates without throwing', () => {
      expect(() => makeSetup()).not.toThrow();
    });

    it('starts with no gizmo entities for empty selection', () => {
      const { world } = makeSetup();
      const tagged = world.getAllEntities().filter((e) => world.hasTag(e, 'Gizmo'));
      expect(tagged.length).toBe(0);
    });
  });

  describe('gizmo creation on selection', () => {
    it('creates at least one gizmo entity when an entity is selected', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick(); // wait for reactive effect to fire
      const gizmoEntities = world.getAllEntities().filter((e) => world.hasTag(e, 'Gizmo'));
      expect(gizmoEntities.length).toBeGreaterThan(0);
    });

    it('creates a GizmoRoot entity', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      const roots = world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoRoot'));
      expect(roots.length).toBe(1);
    });

    it('creates X, Y, Z axis handle entities', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      expect(world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoAxisX')).length).toBe(1);
      expect(world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoAxisY')).length).toBe(1);
      expect(world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoAxisZ')).length).toBe(1);
    });

    it('GizmoRoot has NoSelect tag', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      const roots = world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoRoot'));
      expect(world.hasTag(roots[0], 'NoSelect')).toBe(true);
    });

    it('axis handles have NoSelect tag', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      const axes = world
        .getAllEntities()
        .filter(
          (e) =>
            world.hasTag(e, 'GizmoAxisX') ||
            world.hasTag(e, 'GizmoAxisY') ||
            world.hasTag(e, 'GizmoAxisZ')
        );
      axes.forEach((ax) => expect(world.hasTag(ax, 'NoSelect')).toBe(true));
    });

    it('gizmo root has a Transform component', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      const roots = world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoRoot'));
      expect(world.getComponent(roots[0], 'Transform')).toBeDefined();
    });
  });

  describe('gizmo rebuild on selection change', () => {
    it('destroys gizmo entities when selection is cleared', async () => {
      const { world, selection } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick(); // create gizmos
      selection.clear();
      await tick(); // destroy gizmos
      const gizmos = world.getAllEntities().filter((e) => world.hasTag(e, 'Gizmo'));
      expect(gizmos.length).toBe(0);
    });
  });

  describe('update() — position sync', () => {
    it('syncs gizmo root position to target transform', async () => {
      const { world, selection, gizmo } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 3, y: 4, z: 5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      gizmo.update(0.016);
      const roots = world.getAllEntities().filter((e) => world.hasTag(e, 'GizmoRoot'));
      const rootTf = world.getComponent<any>(roots[0], 'Transform');
      expect(rootTf.position).toEqual({ x: 3, y: 4, z: 5 });
    });

    it('does nothing when nothing is selected', () => {
      const { gizmo } = makeSetup();
      expect(() => gizmo.update(0.016)).not.toThrow();
    });
  });

  describe('dragHandle()', () => {
    it('moves target on x axis by delta', async () => {
      const { world, selection, gizmo } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      gizmo.dragHandle('x', 2.5);
      const tf = world.getComponent<any>(entity, 'Transform');
      expect(tf.position.x).toBeCloseTo(2.5);
    });

    it('moves target on y axis by delta', async () => {
      const { world, selection, gizmo } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      gizmo.dragHandle('y', -1.0);
      const tf = world.getComponent<any>(entity, 'Transform');
      expect(tf.position.y).toBeCloseTo(-1.0);
    });

    it('moves target on z axis by delta', async () => {
      const { world, selection, gizmo } = makeSetup();
      const entity = world.createEntity();
      world.addComponent(entity, 'Transform', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });
      selection.select(entity);
      await tick();
      gizmo.dragHandle('z', 3.0);
      const tf = world.getComponent<any>(entity, 'Transform');
      expect(tf.position.z).toBeCloseTo(3.0);
    });

    it('does nothing when no primary selection', () => {
      const { gizmo } = makeSetup();
      expect(() => gizmo.dragHandle('z', 5)).not.toThrow();
    });

    it('gizmoScale property is configurable', () => {
      const { gizmo } = makeSetup();
      gizmo.gizmoScale = 2.0;
      expect(gizmo.gizmoScale).toBe(2.0);
    });

    it('axisLength property is configurable', () => {
      const { gizmo } = makeSetup();
      gizmo.axisLength = 2.5;
      expect(gizmo.axisLength).toBe(2.5);
    });
  });
});
