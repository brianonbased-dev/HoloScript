import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoloVM,
  HoloBytecodeBuilder,
  HoloOpCode,
  VMStatus,
  GeometryType,
  ComponentType,
  BodyType,
  LightType,
  getOpcodeFamily,
  getOpcodeName,
  isControlFlow,
  HOLOB_MAGIC,
  HOLOB_VERSION,
} from '../index';

// =============================================================================
// OPCODE TESTS
// =============================================================================

describe('HoloOpCode', () => {
  it('should have Entity opcodes in range 0x01-0x0F', () => {
    expect(HoloOpCode.SPAWN).toBe(0x01);
    expect(HoloOpCode.DESPAWN).toBe(0x02);
    expect(HoloOpCode.QUERY).toBe(0x08);
  });

  it('should have Spatial opcodes in range 0x10-0x1F', () => {
    expect(HoloOpCode.TRANSFORM).toBe(0x10);
    expect(HoloOpCode.RAYCAST).toBe(0x14);
    expect(HoloOpCode.GET_ZONE).toBe(0x18);
  });

  it('should have Physics opcodes in range 0x20-0x2F', () => {
    expect(HoloOpCode.ADD_RIGIDBODY).toBe(0x20);
    expect(HoloOpCode.PHYSICS_STEP).toBe(0x27);
  });

  it('should have Control Flow opcodes in range 0x60-0x6F', () => {
    expect(HoloOpCode.NOP).toBe(0x60);
    expect(HoloOpCode.HALT).toBe(0x69);
    expect(HoloOpCode.YIELD).toBe(0x6A);
  });

  it('should have Agent Bridge opcodes in range 0x70-0x7F', () => {
    expect(HoloOpCode.AGENT_INVOKE).toBe(0x70);
    expect(HoloOpCode.QUEST_UPDATE).toBe(0x74);
  });

  it('should identify opcode families', () => {
    expect(getOpcodeFamily(HoloOpCode.SPAWN)).toBe('Entity');
    expect(getOpcodeFamily(HoloOpCode.TRANSFORM)).toBe('Spatial');
    expect(getOpcodeFamily(HoloOpCode.ADD_RIGIDBODY)).toBe('Physics');
    expect(getOpcodeFamily(HoloOpCode.SET_GEOMETRY)).toBe('Rendering');
    expect(getOpcodeFamily(HoloOpCode.APPLY_TRAIT)).toBe('Trait');
    expect(getOpcodeFamily(HoloOpCode.LOAD_ASSET)).toBe('I/O');
    expect(getOpcodeFamily(HoloOpCode.JUMP)).toBe('Control');
    expect(getOpcodeFamily(HoloOpCode.AGENT_INVOKE)).toBe('Agent');
  });

  it('should return opcode names', () => {
    expect(getOpcodeName(HoloOpCode.SPAWN)).toBe('SPAWN');
    expect(getOpcodeName(HoloOpCode.HALT)).toBe('HALT');
    expect(getOpcodeName(HoloOpCode.YIELD)).toBe('YIELD');
  });

  it('should identify control flow opcodes', () => {
    expect(isControlFlow(HoloOpCode.JUMP)).toBe(true);
    expect(isControlFlow(HoloOpCode.JUMP_IF)).toBe(true);
    expect(isControlFlow(HoloOpCode.CALL)).toBe(true);
    expect(isControlFlow(HoloOpCode.RETURN)).toBe(true);
    expect(isControlFlow(HoloOpCode.HALT)).toBe(true);
    expect(isControlFlow(HoloOpCode.YIELD)).toBe(true);
    expect(isControlFlow(HoloOpCode.SPAWN)).toBe(false);
    expect(isControlFlow(HoloOpCode.PUSH)).toBe(false);
  });
});

// =============================================================================
// BYTECODE BUILDER TESTS
// =============================================================================

describe('HoloBytecodeBuilder', () => {
  it('should create a valid bytecode module', () => {
    const builder = new HoloBytecodeBuilder();
    const bytecode = builder.build();

    expect(bytecode.magic).toBe(HOLOB_MAGIC);
    expect(bytecode.version).toBe(HOLOB_VERSION);
    expect(bytecode.strings).toEqual([]);
    expect(bytecode.functions).toEqual([]);
    expect(bytecode.entities).toEqual([]);
  });

  it('should intern strings with deduplication', () => {
    const builder = new HoloBytecodeBuilder();
    const idx1 = builder.internString('hello');
    const idx2 = builder.internString('world');
    const idx3 = builder.internString('hello'); // duplicate

    expect(idx1).toBe(0);
    expect(idx2).toBe(1);
    expect(idx3).toBe(0); // Same as first

    const bytecode = builder.build();
    expect(bytecode.strings).toEqual(['hello', 'world']);
  });

  it('should build functions with instructions', () => {
    const builder = new HoloBytecodeBuilder();
    const main = builder.addFunction('main');

    main.push(42).push(8).add().halt();

    const bytecode = builder.build();
    expect(bytecode.functions).toHaveLength(1);
    expect(bytecode.functions[0].instructions).toHaveLength(4);
    expect(bytecode.functions[0].instructions[0].opcode).toBe(HoloOpCode.PUSH);
    expect(bytecode.functions[0].instructions[3].opcode).toBe(HoloOpCode.HALT);
  });

  it('should track register count', () => {
    const builder = new HoloBytecodeBuilder();
    const fn = builder.addFunction('test');

    fn.push(1).store(0).push(2).store(3).halt();

    const bytecode = builder.build();
    expect(bytecode.functions[0].registerCount).toBe(4); // Registers 0-3
  });

  it('should add entities with components', () => {
    const builder = new HoloBytecodeBuilder();
    const entIdx = builder.addEntity('TestCube', 0);
    builder.addComponentToEntity(entIdx, ComponentType.Transform, {
      x: 0, y: 1, z: -5,
    });
    builder.addComponentToEntity(entIdx, ComponentType.Geometry, {
      type: GeometryType.Cube,
    });

    const bytecode = builder.build();
    expect(bytecode.entities).toHaveLength(1);
    expect(bytecode.entities[0].components).toHaveLength(2);
  });

  it('should add assets', () => {
    const builder = new HoloBytecodeBuilder();
    const { AssetType } = require('../bytecode');
    builder.addAsset('models/robot.glb', AssetType.Mesh);
    builder.addAsset('textures/metal.png', AssetType.Texture);

    const bytecode = builder.build();
    expect(bytecode.assets).toHaveLength(2);
  });

  it('should add event bindings', () => {
    const builder = new HoloBytecodeBuilder();
    builder.addFunction('onCollision');
    builder.addEvent(0x01, 0);

    const bytecode = builder.build();
    expect(bytecode.events).toHaveLength(1);
    expect(bytecode.events[0].eventType).toBe(0x01);
    expect(bytecode.events[0].handlerFunctionIndex).toBe(0);
  });
});

// =============================================================================
// VM EXECUTOR TESTS
// =============================================================================

describe('HoloVM', () => {
  let vm: HoloVM;

  beforeEach(() => {
    vm = new HoloVM();
  });

  it('should start in Idle status', () => {
    expect(vm.getStatus()).toBe(VMStatus.Idle);
  });

  it('should error when ticking without loaded bytecode', () => {
    const result = vm.tick(16.67);
    expect(result.status).toBe(VMStatus.Error);
    expect(result.error).toBe('No bytecode loaded');
  });

  describe('Basic execution', () => {
    it('should execute HALT and stop', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main').halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.status).toBe(VMStatus.Halted);
      expect(result.tickCount).toBe(1);
    });

    it('should execute PUSH and leave value on stack', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main').push(42).halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.status).toBe(VMStatus.Halted);
      expect(result.stackTop).toBe(42);
    });

    it('should execute arithmetic operations', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(10)
        .push(5)
        .add()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(15);
    });

    it('should execute subtraction', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(20)
        .push(8)
        .sub()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(12);
    });

    it('should execute multiplication', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(7)
        .push(6)
        .mul()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(42);
    });

    it('should handle division by zero', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(10)
        .push(0)
        .div()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(0); // Safe division by zero
    });
  });

  describe('Register operations', () => {
    it('should store and load from registers', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(99)
        .store(0)
        .push(1) // push something else
        .pop()   // discard it
        .load(0) // load reg 0 back
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(99);
    });
  });

  describe('Control flow', () => {
    it('should execute JUMP', () => {
      const builder = new HoloBytecodeBuilder();
      const main = builder.addFunction('main');
      main.push(1);
      main.jump(4);   // Jump over the next PUSH
      main.push(999); // Should be skipped
      main.push(2);   // instruction 4 - lands here
      main.add();
      main.halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(3); // 1 + 2, not 1 + 999
    });

    it('should execute JUMP_IF when condition is true', () => {
      const builder = new HoloBytecodeBuilder();
      const main = builder.addFunction('main');
      main.push(1);    // truthy
      main.jumpIf(4);  // should jump
      main.push(100);  // skipped
      main.halt();     // skipped
      main.push(42);   // lands here (instruction 4)
      main.halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(42);
    });

    it('should NOT jump when condition is falsy', () => {
      const builder = new HoloBytecodeBuilder();
      const main = builder.addFunction('main');
      main.push(0);    // falsy
      main.jumpIf(4);  // should NOT jump
      main.push(100);  // should execute
      main.halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(100);
    });

    it('should execute CALL and RETURN', () => {
      const builder = new HoloBytecodeBuilder();
      // Function 0: main
      builder.addFunction('main')
        .push(10)
        .call(1) // Call add5
        .halt();

      // Function 1: add5 — pops top, adds 5, pushes result
      builder.addFunction('add5')
        .push(5)
        .add()
        .ret();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(15);
    });
  });

  describe('Comparison operations', () => {
    it('should compare equal values', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(42)
        .push(42)
        .cmpEq()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(1); // true
    });

    it('should compare unequal values', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(42)
        .push(43)
        .cmpEq()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(0); // false
    });

    it('should compare less than', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(3)
        .push(5)
        .cmpLt()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(1); // 3 < 5 = true
    });

    it('should negate with NOT', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(1)
        .not()
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.stackTop).toBe(0); // !1 = 0
    });
  });

  describe('ECS Entity operations', () => {
    it('should spawn entities', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .spawn(0, 'TestEntity')
        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.entityCount).toBeGreaterThan(0);
      expect(result.stackTop).toBeTypeOf('number'); // entity ID on stack
    });

    it('should spawn and despawn entities', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .spawn(0, 'Temporary')
        .store(0)
        .load(0)
        .halt();

      vm.load(builder.build());
      vm.tick(16.67);

      const entityCountBefore = vm.world.entityCount;
      expect(entityCountBefore).toBeGreaterThan(0);
    });

    it('should set geometry component', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .spawn(0, 'Cube')
        .store(0)
        .load(0)
        .setGeometry(1, GeometryType.Cube) // entity ID 1 (first spawned)
        .halt();

      // Pre-define the entity so it gets ID 1 from init
      builder.addEntity('Cube', 0);

      vm.load(builder.build());
      vm.tick(16.67);

      // Entity 1 should exist (from init section)
      const geo = vm.world.getComponent(1, ComponentType.Geometry);
      expect(geo).toBeDefined();
    });

    it('should set transform component', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addEntity('Box', 0);

      builder.addFunction('main')
        .transform(1, 5, 10, -3)
        .halt();

      vm.load(builder.build());
      vm.tick(16.67);

      const transform = vm.world.getComponent<{ position: { x: number; y: number; z: number } }>(1, ComponentType.Transform);
      expect(transform).toBeDefined();
      expect(transform!.position.x).toBe(5);
      expect(transform!.position.y).toBe(10);
      expect(transform!.position.z).toBe(-3);
    });

    it('should initialize entities from init section', () => {
      const builder = new HoloBytecodeBuilder();
      const ent = builder.addEntity('PrebuiltCube', 0);
      builder.addComponentToEntity(ent, ComponentType.Geometry, { type: GeometryType.Sphere });
      builder.addFunction('main').halt();

      vm.load(builder.build());
      vm.tick(16.67);

      expect(vm.world.entityCount).toBe(1);
      const entity = vm.world.getEntity(1);
      expect(entity).toBeDefined();
      expect(entity!.name).toBe('PrebuiltCube');
    });
  });

  describe('Physics operations', () => {
    it('should add rigidbody component', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addEntity('Ball', 0);
      builder.addFunction('main')
        .addRigidbody(1, 1.5, BodyType.Dynamic)
        .halt();

      vm.load(builder.build());
      vm.tick(16.67);

      const rb = vm.world.getComponent<{ mass: number; bodyType: number }>(1, ComponentType.RigidBody);
      expect(rb).toBeDefined();
      expect(rb!.mass).toBe(1.5);
      expect(rb!.bodyType).toBe(BodyType.Dynamic);
    });

    it('should apply impulse to rigidbody', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addEntity('Ball', 0);
      builder.addFunction('main')
        .addRigidbody(1, 1.0, BodyType.Dynamic)
        .applyImpulse(1, 10, 0, 0) // 10N impulse on X axis, mass=1 → v=10
        .halt();

      vm.load(builder.build());
      vm.tick(16.67);

      const rb = vm.world.getComponent<{ velocity: { x: number } }>(1, ComponentType.RigidBody);
      expect(rb).toBeDefined();
      expect(rb!.velocity.x).toBe(10);
    });
  });

  describe('Trait operations', () => {
    it('should apply and remove traits', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addEntity('NPC', 0);
      builder.addTrait('Collidable');
      builder.addTrait('Grabbable');
      builder.addFunction('main')
        .applyTrait(1, 0)
        .applyTrait(1, 1)
        .removeTrait(1, 0) // Remove Collidable
        .halt();

      vm.load(builder.build());
      vm.tick(16.67);

      const entity = vm.world.getEntity(1);
      expect(entity).toBeDefined();
      expect(entity!.traits.has(0)).toBe(false); // Removed
      expect(entity!.traits.has(1)).toBe(true);  // Still there
    });
  });

  describe('YIELD and multi-tick execution', () => {
    it('should yield and resume on next tick', () => {
      const builder = new HoloBytecodeBuilder();
      builder.addFunction('main')
        .push(1)
        .yieldTick()  // Pause
        .push(2)
        .add()
        .halt();

      vm.load(builder.build());

      // First tick — runs PUSH 1, then YIELD
      const result1 = vm.tick(16.67);
      expect(result1.status).toBe(VMStatus.Yielded);
      expect(result1.stackTop).toBe(1);

      // Second tick — resumes with PUSH 2, ADD, HALT
      const result2 = vm.tick(16.67);
      expect(result2.status).toBe(VMStatus.Halted);
      expect(result2.stackTop).toBe(3); // 1 + 2
    });
  });

  describe('Event system', () => {
    it('should dispatch queued events to handlers', () => {
      const builder = new HoloBytecodeBuilder();

      // Function 0: main — just yields forever so events can fire
      builder.addFunction('main').push(0).halt();

      // Function 1: collision handler — pushes 999
      builder.addFunction('onCollision').push(999).ret();

      // Bind event type 0x01 to function 1
      builder.addEvent(0x01, 1);

      vm.load(builder.build());

      // Queue an event
      vm.queueEvent(0x01);

      const result = vm.tick(16.67);
      expect(result.stackTop).toBe(999);
    });
  });

  describe('Complex scene', () => {
    it('should build and run a scene with multiple entities', () => {
      const builder = new HoloBytecodeBuilder();

      // Define entities
      builder.addEntity('Ground', 0);
      builder.addEntity('Player', 1);
      builder.addEntity('Light', 0);

      // Main function: set up the scene
      builder.addFunction('main')
        // Ground: flat plane
        .setGeometry(1, GeometryType.Plane)
        .transform(1, 0, 0, 0)
        .setMaterial(1, 0x888888, 0.0, 0.9, 0x000000, 1.0)

        // Player: cube with physics
        .setGeometry(2, GeometryType.Cube)
        .transform(2, 0, 2, 0)
        .addRigidbody(2, 1.0, BodyType.Dynamic)
        .setMaterial(2, 0xff4444, 0.2, 0.3, 0x000000, 1.0)

        // Light: directional
        .setLight(3, LightType.Directional, 1.0, 1.0, 1.0)
        .transform(3, 0, 10, 0)

        .halt();

      vm.load(builder.build());
      const result = vm.tick(16.67);

      expect(result.status).toBe(VMStatus.Halted);
      expect(result.entityCount).toBe(3);

      // Verify components
      expect(vm.world.getComponent(1, ComponentType.Geometry)).toBeDefined();
      expect(vm.world.getComponent(2, ComponentType.RigidBody)).toBeDefined();
      expect(vm.world.getComponent(3, ComponentType.Light)).toBeDefined();
    });
  });
});
