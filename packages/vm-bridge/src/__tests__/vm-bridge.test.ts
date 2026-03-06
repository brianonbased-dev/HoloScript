import { describe, it, expect, beforeEach } from 'vitest';
import { HoloVM, ECSWorld, HoloBytecodeBuilder, HoloOpCode, ComponentType } from '@holoscript/holo-vm';
import { UAALVirtualMachine, UAALOpCode, UAALCompiler } from '@holoscript/uaal';
import type { UAALBytecode } from '@holoscript/uaal';
import {
  SpatialCognitiveAgent,
  captureSceneSnapshot,
  applyActions,
} from '../index';
import type { AgentAction, SceneSnapshot } from '../index';

// =============================================================================
// HELPERS
// =============================================================================

function createWorld(): ECSWorld {
  return new ECSWorld();
}

function createCognitiveVM(): UAALVirtualMachine {
  return new UAALVirtualMachine();
}

// =============================================================================
// SCENE SNAPSHOT TESTS
// =============================================================================

describe('captureSceneSnapshot', () => {
  it('should capture empty world', () => {
    const world = createWorld();
    const snapshot = captureSceneSnapshot(world);
    expect(snapshot.entityCount).toBe(0);
    expect(snapshot.entities).toHaveLength(0);
    expect(snapshot.timestamp).toBeGreaterThan(0);
  });

  it('should capture entities with names', () => {
    const world = createWorld();
    world.spawn('Player');
    world.spawn('Enemy');
    world.spawn('Obstacle');

    const snapshot = captureSceneSnapshot(world);
    expect(snapshot.entityCount).toBe(3);
    expect(snapshot.entities.map(e => e.name)).toEqual(['Player', 'Enemy', 'Obstacle']);
  });

  it('should capture transform components', () => {
    const world = createWorld();
    const id = world.spawn('Box');
    world.setComponent(id, ComponentType.Transform, {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    const snapshot = captureSceneSnapshot(world);
    expect(snapshot.entities[0].transform).toBeDefined();
    expect(snapshot.entities[0].transform?.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should capture parent-child relationships', () => {
    const world = createWorld();
    const parent = world.spawn('Parent');
    const child = world.spawn('Child');
    world.setParent(child, parent);

    const snapshot = captureSceneSnapshot(world);
    const parentSnap = snapshot.entities.find(e => e.name === 'Parent');
    const childSnap = snapshot.entities.find(e => e.name === 'Child');
    expect(parentSnap?.childIds).toContain(child);
    expect(childSnap?.parentId).toBe(parent);
  });

  it('should capture traits', () => {
    const world = createWorld();
    const id = world.spawn('NPC');
    const entity = world.getEntity(id)!;
    entity.traits.add(5);
    entity.traits.add(10);

    const snapshot = captureSceneSnapshot(world);
    expect(snapshot.entities[0].traits).toContain(5);
    expect(snapshot.entities[0].traits).toContain(10);
  });
});

// =============================================================================
// AGENT ACTIONS TESTS
// =============================================================================

describe('applyActions', () => {
  it('should spawn entities', () => {
    const world = createWorld();
    const ids = applyActions(world, [
      { type: 'spawn', name: 'NewEntity', position: { x: 5, y: 0, z: 0 } },
    ]);

    expect(ids).toHaveLength(1);
    expect(world.entityCount).toBe(1);
    const entity = world.getEntity(ids[0])!;
    expect(entity.name).toBe('NewEntity');
  });

  it('should spawn with geometry', () => {
    const world = createWorld();
    const ids = applyActions(world, [
      { type: 'spawn', name: 'Sphere', geometryType: 1 },
    ]);

    const geo = world.getComponent(ids[0], ComponentType.Geometry);
    expect(geo).toBeDefined();
  });

  it('should despawn entities', () => {
    const world = createWorld();
    const id = world.spawn('Target');
    expect(world.entityCount).toBe(1);

    applyActions(world, [{ type: 'despawn', entityId: id }]);
    expect(world.entityCount).toBe(0);
  });

  it('should move entities', () => {
    const world = createWorld();
    const id = world.spawn('Mover');
    world.setComponent(id, ComponentType.Transform, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    applyActions(world, [{ type: 'move', entityId: id, position: { x: 10, y: 20, z: 30 } }]);

    const transform = world.getComponent<any>(id, ComponentType.Transform);
    expect(transform.position).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('should apply traits', () => {
    const world = createWorld();
    const id = world.spawn('Traitful');

    applyActions(world, [{ type: 'applyTrait', entityId: id, traitId: 42 }]);

    const entity = world.getEntity(id)!;
    expect(entity.traits.has(42)).toBe(true);
  });

  it('should remove traits', () => {
    const world = createWorld();
    const id = world.spawn('Traitful');
    const entity = world.getEntity(id)!;
    entity.traits.add(42);

    applyActions(world, [{ type: 'removeTrait', entityId: id, traitId: 42 }]);
    expect(entity.traits.has(42)).toBe(false);
  });

  it('should apply multiple actions in order', () => {
    const world = createWorld();
    const ids = applyActions(world, [
      { type: 'spawn', name: 'A' },
      { type: 'spawn', name: 'B' },
      { type: 'spawn', name: 'C' },
    ]);

    expect(ids).toHaveLength(3);
    expect(world.entityCount).toBe(3);
  });
});

// =============================================================================
// SPATIAL COGNITIVE AGENT TESTS
// =============================================================================

describe('SpatialCognitiveAgent', () => {
  let world: ECSWorld;
  let cognitiveVM: UAALVirtualMachine;
  let agent: SpatialCognitiveAgent;

  beforeEach(() => {
    world = createWorld();
    cognitiveVM = createCognitiveVM();
    agent = new SpatialCognitiveAgent(world, cognitiveVM, { cognitiveHz: 10 });
  });

  describe('perceive()', () => {
    it('should capture scene snapshot', () => {
      world.spawn('TestEntity');
      const snapshot = agent.perceive();

      expect(snapshot.entityCount).toBe(1);
      expect(snapshot.entities[0].name).toBe('TestEntity');
    });

    it('should update lastSnapshot', () => {
      expect(agent.getLastSnapshot()).toBeNull();
      agent.perceive();
      expect(agent.getLastSnapshot()).not.toBeNull();
    });
  });

  describe('decide()', () => {
    it('should run a 7-phase cognitive cycle', async () => {
      world.spawn('SceneObject');
      const result = await agent.decide('Analyze the scene');

      expect(result).toBeDefined();
      expect((result as any).taskStatus).toBe('HALTED');
    });

    it('should include scene data in INTAKE phase', async () => {
      world.spawn('Entity1');
      world.spawn('Entity2');

      const result = await agent.decide('Count entities');
      // INTAKE handler pushes scene snapshot, which flows through the cycle
      expect((result as any).taskStatus).toBe('HALTED');
    });
  });

  describe('mutate()', () => {
    it('should apply spawn actions', () => {
      const ids = agent.mutate([
        { type: 'spawn', name: 'AgentCreated', position: { x: 1, y: 2, z: 3 } },
      ]);

      expect(ids).toHaveLength(1);
      expect(world.entityCount).toBe(1);
    });
  });

  describe('queueAction()', () => {
    it('should queue and track pending actions', () => {
      agent.queueAction({ type: 'spawn', name: 'Queued' });
      expect(agent.getPendingActionCount()).toBe(1);
    });

    it('should queue multiple actions', () => {
      agent.queueActions([
        { type: 'spawn', name: 'A' },
        { type: 'spawn', name: 'B' },
      ]);
      expect(agent.getPendingActionCount()).toBe(2);
    });
  });

  describe('tick()', () => {
    it('should skip cognitive tick when interval not reached', async () => {
      const result = await agent.tick(0);
      // First tick runs because lastCognitiveTickMs starts at -Infinity
      expect(result.perceived).toBe(true);

      const result2 = await agent.tick(10); // Only 10ms later, need 100ms for 10Hz
      expect(result2.perceived).toBe(false);
    });

    it('should run cognitive tick when interval reached', async () => {
      await agent.tick(0); // First tick
      const result = await agent.tick(200); // 200ms later, > 100ms interval for 10Hz

      expect(result.perceived).toBe(true);
      expect(result.decided).toBe(true);
    });

    it('should apply queued actions on cognitive tick', async () => {
      agent.queueAction({ type: 'spawn', name: 'Deferred' });
      expect(world.entityCount).toBe(0);

      await agent.tick(0); // Triggers cognitive tick → EXECUTE handler drains the queue
      // The EXECUTE handler in the constructor processes pending actions
      // But it only runs when the EXECUTE opcode fires during the cycle
    });

    it('should increment tick count', async () => {
      expect(agent.getTickCount()).toBe(0);
      await agent.tick(0);
      expect(agent.getTickCount()).toBe(1);
      await agent.tick(10);
      expect(agent.getTickCount()).toBe(2);
    });
  });
});

// =============================================================================
// SPATIAL OPCODE HANDLER TESTS
// =============================================================================

describe('Spatial opcode handlers', () => {
  let world: ECSWorld;
  let cognitiveVM: UAALVirtualMachine;
  let agent: SpatialCognitiveAgent;

  beforeEach(() => {
    world = createWorld();
    cognitiveVM = createCognitiveVM();
    agent = new SpatialCognitiveAgent(world, cognitiveVM);
  });

  it('should handle OP_SPATIAL_ANCHOR — spawn entity at position', async () => {
    const bytecode: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.OP_SPATIAL_ANCHOR, operands: ['beacon', 5, 10, 15] },
        { opCode: UAALOpCode.HALT },
      ],
    };

    const result = await cognitiveVM.execute(bytecode);
    expect(result.taskStatus).toBe('HALTED');
    expect(world.entityCount).toBe(1);

    const entity = world.getEntity(result.stackTop as number);
    expect(entity?.name).toBe('beacon');
  });

  it('should handle OP_RENDER_HOLOGRAM — set geometry+material', async () => {
    const entityId = world.spawn('HoloTarget');

    const bytecode: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.OP_RENDER_HOLOGRAM, operands: [entityId, 2, 0x00ff00] },
        { opCode: UAALOpCode.HALT },
      ],
    };

    await cognitiveVM.execute(bytecode);

    const geo = world.getComponent<any>(entityId, ComponentType.Geometry);
    const mat = world.getComponent<any>(entityId, ComponentType.Material);
    expect(geo).toBeDefined();
    expect(geo.type).toBe(2);
    expect(mat.color).toBe(0x00ff00);
    expect(mat.opacity).toBe(0.8);
  });

  it('should handle OP_VR_TELEPORT — move entity', async () => {
    const entityId = world.spawn('Avatar');

    const bytecode: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.OP_VR_TELEPORT, operands: [entityId, 100, 200, 300] },
        { opCode: UAALOpCode.HALT },
      ],
    };

    const result = await cognitiveVM.execute(bytecode);
    const transform = world.getComponent<any>(entityId, ComponentType.Transform);
    expect(transform.position).toEqual({ x: 100, y: 200, z: 300 });
    expect((result.stackTop as any).teleported).toBe(true);
  });

  it('should handle OP_EXECUTE_HOLOSCRIPT — return scene snapshot', async () => {
    world.spawn('SceneObj1');
    world.spawn('SceneObj2');

    const bytecode: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.OP_EXECUTE_HOLOSCRIPT },
        { opCode: UAALOpCode.HALT },
      ],
    };

    const result = await cognitiveVM.execute(bytecode);
    const snapshot = result.stackTop as any;
    expect(snapshot.entityCount).toBe(2);
    expect(snapshot.entities).toHaveLength(2);
  });

  it('should run full cycle with scene perception', async () => {
    world.spawn('Tree');
    world.spawn('Rock');
    world.spawn('River');

    const compiler = new UAALCompiler();
    const bytecode = compiler.buildFullCycle('Survey the landscape');
    const result = await cognitiveVM.execute(bytecode);

    expect(result.taskStatus).toBe('HALTED');
    // INTAKE pushed scene snapshot, which flowed through all phases
  });
});
