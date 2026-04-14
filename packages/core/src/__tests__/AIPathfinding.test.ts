import { describe, it, expect, beforeEach } from 'vitest';
import { NavMesh } from '@holoscript/framework/ai';
import { SteeringBehavior, type SteeringAgent } from '@holoscript/framework/ai';
import { BehaviorTree } from '@holoscript/framework/ai';
import { SequenceNode, SelectorNode, ActionNode, ConditionNode, InverterNode } from '@holoscript/framework/ai';
import { Blackboard } from '@holoscript/framework/ai';

describe('AI & Pathfinding (Cycle 180)', () => {
  describe('NavMesh', () => {
    let nav: NavMesh;

    beforeEach(() => {
      nav = new NavMesh();
      // Create a simple 3-node path: A → B → C
      const a = nav.addPolygon([
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 1, z: 2 },
      ]);
      const b = nav.addPolygon([
        { x: 2, z: 0 },
        { x: 4, z: 0 },
        { x: 3, z: 2 },
      ]);
      const c = nav.addPolygon([
        { x: 4, z: 0 },
        { x: 6, z: 0 },
        { x: 5, z: 2 },
      ]);
      nav.connect(a, b);
      nav.connect(b, c);
    });

    it('should add polygons and compute centers', () => {
      expect(nav.getPolygonCount()).toBe(3);
      const p = nav.getPolygon(0)!;
      expect(p.center[0]).toBeCloseTo(1, 0);
    });

    it('should find a path between connected polygons', () => {
      const path = nav.findPath(0, 2);
      expect(path).not.toBeNull();
      expect(path!.polygonIds).toEqual([0, 1, 2]);
    });

    it('should return null for disconnected polygons', () => {
      const isolated = nav.addPolygon([
        { x: 100, z: 100 },
        { x: 102, z: 100 },
        { x: 101, z: 102 },
      ]);
      expect(nav.findPath(0, isolated)).toBeNull();
    });

    it('should respect non-walkable polygons', () => {
      nav.setWalkable(1, false);
      expect(nav.findPath(0, 2)).toBeNull();
    });

    it('should smooth paths', () => {
      const path = nav.findPath(0, 2)!;
      const smoothed = nav.smoothPath(path);
      expect(smoothed.waypoints.length).toBeLessThanOrEqual(path.waypoints.length);
    });
  });

  describe('SteeringBehavior', () => {
    let agent: SteeringAgent;

    beforeEach(() => {
      agent = {
        position: { x: 0, z: 0 },
        velocity: { x: 1, z: 0 },
        maxSpeed: 5,
        maxForce: 10,
        mass: 1,
      };
    });

    it('should seek toward a target', () => {
      const force = SteeringBehavior.seek(agent, { x: 10, z: 0 });
      expect(force[0]).toBeGreaterThan(0);
    });

    it('should flee away from a target', () => {
      const force = SteeringBehavior.flee(agent, { x: 10, z: 0 });
      expect(force[0]).toBeLessThan(0);
    });

    it('should arrive and decelerate near target', () => {
      agent.position = { x: 9, z: 0 };
      const force = SteeringBehavior.arrive(agent, { x: 10, z: 0 }, 5);
      expect(Math.abs(force[0])).toBeLessThan(agent.maxSpeed);
    });

    it('should avoid obstacles', () => {
      const force = SteeringBehavior.avoid(agent, [{ position: { x: 3, z: 0 }, radius: 1 }], 5);
      expect(force[0]).toBeLessThan(0); // pushed away
    });

    it('should blend multiple steering outputs', () => {
      const result = SteeringBehavior.blend(
        [
          { force: { x: 5, z: 0 }, type: 'seek', weight: 0.5 },
          { force: { x: 0, z: 5 }, type: 'avoid', weight: 0.5 },
        ],
        10
      );
      expect(result.x).toBeGreaterThan(0);
      expect(result.z).toBeGreaterThan(0);
    });
  });

  describe('BehaviorTree (existing)', () => {
    it('should create and tick a tree', () => {
      const bt = new BehaviorTree();
      const bb = new Blackboard();
      const root = new ActionNode('succeed', () => 'success');
      bt.createTree('test', root, 'entity1', bb);
      const status = bt.tick('test', 0.016);
      expect(status).toBe('success');
    });

    it('should run a sequence', () => {
      const bt = new BehaviorTree();
      let counter = 0;
      const seq = new SequenceNode('seq', [
        new ActionNode('inc1', () => {
          counter++;
          return 'success';
        }),
        new ActionNode('inc2', () => {
          counter++;
          return 'success';
        }),
      ]);
      bt.createTree('t', seq, 'e1');
      bt.tick('t', 0.016);
      expect(counter).toBe(2);
    });

    it('should run a selector (fallback)', () => {
      const bt = new BehaviorTree();
      const sel = new SelectorNode('sel', [
        new ActionNode('fail', () => 'failure'),
        new ActionNode('succeed', () => 'success'),
      ]);
      bt.createTree('t', sel, 'e1');
      expect(bt.tick('t', 0.016)).toBe('success');
    });

    it('should invert node results', () => {
      const bt = new BehaviorTree();
      const inv = new InverterNode('inv', new ActionNode('succeed', () => 'success'));
      bt.createTree('t', inv, 'e1');
      expect(bt.tick('t', 0.016)).toBe('failure');
    });

    it('should use blackboard for conditions', () => {
      const bt = new BehaviorTree();
      const bb = new Blackboard();
      bb.set('health', 50);

      const root = new SelectorNode('root', [
        new SequenceNode('low-health', [
          new ConditionNode('check-hp', (ctx) => (ctx.blackboard.get('health') as number) < 30),
          new ActionNode('heal', () => 'success'),
        ]),
        new ActionNode('attack', () => 'success'),
      ]);

      bt.createTree('t', root, 'e1', bb);
      expect(bt.tick('t', 0.016)).toBe('success'); // falls through to attack
    });
  });
});
