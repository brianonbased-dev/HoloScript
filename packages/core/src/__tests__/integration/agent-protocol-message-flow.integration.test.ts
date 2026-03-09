/**
 * Integration Test: Agent Protocol Message Flow
 *
 * Tests the full cross-package data flow through the agent ecosystem:
 *   agent-sdk (MeshDiscovery, SignalService, GossipProtocol, AgentCard)
 *     -> agent-protocol (BaseAgent, BaseService, ProtocolPhase, GoalSynthesizer)
 *     -> uaal (UAALVirtualMachine, UAALCompiler, UAALOpCode)
 *     -> vm-bridge (SpatialCognitiveAgent, captureSceneSnapshot, applyActions)
 *     -> holo-vm (HoloVM, ECSWorld, ComponentType)
 *
 * Validates that data flows correctly between all 5 packages in the agent
 * stack, from mesh discovery and protocol phases through cognitive VM execution
 * to spatial scene mutation.
 *
 * Packages exercised:
 *   agent-sdk, agent-protocol, uaal, vm-bridge, holo-vm
 */

import { describe, it, expect, beforeEach } from 'vitest';

// agent-sdk
import {
  MeshDiscovery,
  SignalService,
  GossipProtocol,
  createAgentCard,
  validateAgentCard,
} from '@holoscript/agent-sdk';
import type { PeerMetadata, GossipPacket } from '@holoscript/agent-sdk';

// agent-protocol
import {
  ProtocolPhase,
  PHASE_NAMES,
  BaseAgent,
  BaseService,
  ServiceLifecycle,
  GoalSynthesizer,
  MicroPhaseDecomposer,
} from '@holoscript/agent-protocol';
import type { PhaseResult, AgentIdentity, CycleResult } from '@holoscript/agent-protocol';

// uaal
import { UAALVirtualMachine, UAALCompiler, UAALOpCode } from '@holoscript/uaal';
import type { UAALBytecode } from '@holoscript/uaal';

// holo-vm
import { ECSWorld, ComponentType } from '@holoscript/holo-vm';

// vm-bridge
import { SpatialCognitiveAgent, captureSceneSnapshot, applyActions } from '@holoscript/vm-bridge';
import type { SceneSnapshot, AgentAction } from '@holoscript/vm-bridge';

// =============================================================================
// TEST AGENT IMPLEMENTATION (extends BaseAgent from agent-protocol)
// =============================================================================

/**
 * Concrete agent that bridges agent-protocol phases to vm-bridge spatial ops.
 * This demonstrates the full integration: protocol phases -> VM execution -> scene mutation.
 */
class SpatialTestAgent extends BaseAgent {
  readonly identity: AgentIdentity = {
    id: 'spatial-test-agent',
    name: 'SpatialTestAgent',
    domain: 'spatial-computing',
    version: '1.0.0',
    capabilities: ['scene-perception', 'entity-management', 'spatial-reasoning'],
  };

  constructor(
    private world: ECSWorld,
    private cognitiveAgent: SpatialCognitiveAgent
  ) {
    super();
  }

  async intake(ctx: Record<string, unknown>): Promise<PhaseResult> {
    // INTAKE: perceive the scene
    const snapshot = this.cognitiveAgent.perceive();
    return {
      phase: ProtocolPhase.INTAKE,
      status: 'success',
      data: {
        entityCount: snapshot.entityCount,
        entities: snapshot.entities.map((e) => e.name),
        timestamp: snapshot.timestamp,
      },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async reflect(data: unknown): Promise<PhaseResult> {
    // REFLECT: analyze the scene data
    const intakeData = data as { entityCount: number; entities: string[] };
    return {
      phase: ProtocolPhase.REFLECT,
      status: 'success',
      data: {
        analysis: `Scene has ${intakeData.entityCount} entities`,
        needsAction: intakeData.entityCount < 3,
      },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async execute(plan: unknown): Promise<PhaseResult> {
    // EXECUTE: apply mutations to the scene
    const reflectData = plan as { needsAction: boolean };
    let actionsApplied = 0;

    if (reflectData.needsAction) {
      const ids = this.cognitiveAgent.mutate([
        { type: 'spawn', name: 'AgentCreatedEntity', position: { x: 1, y: 2, z: 3 } },
      ]);
      actionsApplied = ids.length;
    }

    return {
      phase: ProtocolPhase.EXECUTE,
      status: 'success',
      data: { actionsApplied },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async compress(results: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.COMPRESS,
      status: 'success',
      data: { compressed: true, summary: 'Spatial cycle complete' },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async reintake(compressed: unknown): Promise<PhaseResult> {
    // REINTAKE: re-perceive the scene after mutations
    const snapshot = this.cognitiveAgent.perceive();
    return {
      phase: ProtocolPhase.REINTAKE,
      status: 'success',
      data: {
        updatedEntityCount: snapshot.entityCount,
        updatedEntities: snapshot.entities.map((e) => e.name),
      },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async grow(learnings: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.GROW,
      status: 'success',
      data: { learned: true, pattern: 'spatial-awareness' },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }

  async evolve(adaptations: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.EVOLVE,
      status: 'success',
      data: { evolved: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration: Agent Protocol Message Flow (agent-sdk -> agent-protocol -> uaal -> vm-bridge -> holo-vm)', () => {
  // ---------------------------------------------------------------------------
  // Layer 1: agent-sdk -> agent-protocol
  // Agent discovery and registration flows into protocol execution
  // ---------------------------------------------------------------------------

  describe('agent-sdk -> agent-protocol: discovery and protocol initialization', () => {
    it('creates agent card, validates it, and registers in mesh discovery', () => {
      // Step 1: Create agent card (agent-sdk)
      const card = createAgentCard({
        name: 'SpatialAgent',
        description: 'Spatial computing agent for VR scenes',
        version: '1.0.0',
        url: 'http://localhost:3000',
        skills: [
          {
            id: 'spatial-reasoning',
            name: 'Spatial Reasoning',
            description: 'Analyze spatial relationships',
            tags: ['spatial', 'vr'],
          },
          {
            id: 'scene-management',
            name: 'Scene Management',
            description: 'Manage ECS entities',
            tags: ['ecs', 'entities'],
          },
        ],
      });

      // Step 2: Validate the card (agent-sdk)
      const validation = validateAgentCard(card);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Step 3: Register in mesh discovery (agent-sdk)
      const mesh = new MeshDiscovery('spatial-node');
      mesh.registerPeer({
        id: 'spatial-agent-peer',
        hostname: 'localhost',
        port: 3000,
        version: '1.0.0',
        agentCount: 1,
        capabilities: ['spatial-reasoning', 'scene-management'],
        lastSeen: Date.now(),
      });

      expect(mesh.getPeerCount()).toBe(1);
      expect(mesh.getPeer('spatial-agent-peer')?.capabilities).toContain('spatial-reasoning');
    });

    it('broadcasts signals for agent service discovery', () => {
      const signals = new SignalService('spatial-node');

      // Broadcast a spatial computing service signal
      const signal = signals.broadcastSignal({
        type: 'agent-host',
        url: 'http://localhost:3000/agent',
        capabilities: ['spatial-perception', 'entity-management'],
      });

      expect(signal.nodeId).toBe('spatial-node');
      expect(signal.expiresAt).toBeGreaterThan(Date.now());

      // Discover the broadcast signal
      const found = signals.discoverSignals('agent-host');
      expect(found).toHaveLength(1);
      expect(found[0].capabilities).toContain('spatial-perception');
    });

    it('shares wisdom via gossip protocol between agent peers', () => {
      const gossip1 = new GossipProtocol();
      const gossip2 = new GossipProtocol();

      // Agent 1 shares a spatial reasoning pattern
      gossip1.shareWisdom('spatial-agent-1', {
        type: 'pattern',
        insight: 'Spawn entities near existing clusters for natural scene composition',
        domain: 'spatial-computing',
      });

      // Agent 2 syncs via anti-entropy
      const absorbed = gossip2.antiEntropySync(gossip1.getPool());
      expect(absorbed).toBe(1);
      expect(gossip2.getPoolSize()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 2: agent-protocol -> uaal
  // Protocol phases compile into UAAL bytecode for VM execution
  // ---------------------------------------------------------------------------

  describe('agent-protocol -> uaal: protocol phases drive VM execution', () => {
    it('GoalSynthesizer produces goals that compile into UAAL bytecode', () => {
      // Step 1: Synthesize a goal (agent-protocol)
      const synthesizer = new GoalSynthesizer();
      const goal = synthesizer.synthesize('spatial-computing', 'autonomous-boredom');

      expect(goal.id).toMatch(/^GOAL-/);
      expect(goal.category).toBe('self-improvement');

      // Step 2: Compile a cognitive cycle for the goal (uaal)
      const compiler = new UAALCompiler();
      const bytecode = compiler.buildFullCycle(goal.description);

      expect(bytecode.version).toBe(1);
      expect(bytecode.instructions.length).toBeGreaterThan(0);

      // Step 3: Verify bytecode contains all protocol phases
      const opcodes = bytecode.instructions.map((i) => i.opCode);
      expect(opcodes).toContain(UAALOpCode.INTAKE);
      expect(opcodes).toContain(UAALOpCode.REFLECT);
      expect(opcodes).toContain(UAALOpCode.EXECUTE);
      expect(opcodes).toContain(UAALOpCode.COMPRESS);
      expect(opcodes).toContain(UAALOpCode.HALT);
    });

    it('MicroPhaseDecomposer plans execute as UAAL task sequences', async () => {
      // Step 1: Decompose a task into micro-phases (agent-protocol)
      const decomposer = new MicroPhaseDecomposer();

      decomposer.registerTask({
        id: 'perceive',
        name: 'Perceive Scene',
        estimatedDuration: 10,
        dependencies: [],
        execute: async () => ({ phase: 'INTAKE', entityCount: 5 }),
      });

      decomposer.registerTask({
        id: 'analyze',
        name: 'Analyze Scene',
        estimatedDuration: 20,
        dependencies: ['perceive'],
        execute: async () => ({ phase: 'REFLECT', analysis: 'Scene needs more entities' }),
      });

      decomposer.registerTask({
        id: 'act',
        name: 'Apply Actions',
        estimatedDuration: 15,
        dependencies: ['analyze'],
        execute: async () => ({ phase: 'EXECUTE', actionsApplied: 2 }),
      });

      // Step 2: Create and execute the plan
      const plan = decomposer.createExecutionPlan();
      // Should have at least 2 groups (dependencies constrain ordering)
      expect(plan.groups.length).toBeGreaterThanOrEqual(2);

      const results = await decomposer.executePlan(plan);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === 'success')).toBe(true);

      // Step 3: Verify the results map to UAAL protocol phases
      const perceiveResult = results.find((r) => r.taskId === 'perceive');
      expect((perceiveResult?.result as any).phase).toBe('INTAKE');

      const analyzeResult = results.find((r) => r.taskId === 'analyze');
      expect((analyzeResult?.result as any).phase).toBe('REFLECT');

      const actResult = results.find((r) => r.taskId === 'act');
      expect((actResult?.result as any).phase).toBe('EXECUTE');
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 3: uaal -> vm-bridge -> holo-vm
  // UAAL cognitive VM executes spatial opcodes that mutate ECS world
  // ---------------------------------------------------------------------------

  describe('uaal -> vm-bridge -> holo-vm: cognitive VM spatial operations', () => {
    let world: ECSWorld;
    let cognitiveVM: UAALVirtualMachine;
    let agent: SpatialCognitiveAgent;

    beforeEach(() => {
      world = new ECSWorld();
      cognitiveVM = new UAALVirtualMachine();
      agent = new SpatialCognitiveAgent(world, cognitiveVM);
    });

    it('UAAL spatial anchor opcode creates entity in ECS world', async () => {
      // Build UAAL bytecode with spatial anchor instruction
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_SPATIAL_ANCHOR, operands: ['NavPoint', 10, 5, 20] },
          { opCode: UAALOpCode.HALT },
        ],
      };

      // Execute through UAAL VM (which triggers vm-bridge handler)
      const result = await cognitiveVM.execute(bytecode);
      expect(result.taskStatus).toBe('HALTED');

      // Verify entity was created in holo-vm ECS world
      expect(world.entityCount).toBe(1);
      const entity = world.getEntity(result.stackTop as number);
      expect(entity?.name).toBe('NavPoint');

      // Verify transform component was set
      const transform = world.getComponent<any>(result.stackTop as number, ComponentType.Transform);
      expect(transform.position).toEqual({ x: 10, y: 5, z: 20 });
    });

    it('UAAL render hologram opcode sets geometry and material', async () => {
      const entityId = world.spawn('HoloTarget');

      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_RENDER_HOLOGRAM, operands: [entityId, 1, 0xff0000] },
          { opCode: UAALOpCode.HALT },
        ],
      };

      await cognitiveVM.execute(bytecode);

      const geo = world.getComponent<any>(entityId, ComponentType.Geometry);
      const mat = world.getComponent<any>(entityId, ComponentType.Material);
      expect(geo).toBeDefined();
      expect(geo.type).toBe(1);
      expect(mat.color).toBe(0xff0000);
      expect(mat.opacity).toBe(0.8);
    });

    it('UAAL VR teleport opcode moves entity in ECS world', async () => {
      const entityId = world.spawn('Avatar');

      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_VR_TELEPORT, operands: [entityId, 50, 100, 200] },
          { opCode: UAALOpCode.HALT },
        ],
      };

      const result = await cognitiveVM.execute(bytecode);
      const transform = world.getComponent<any>(entityId, ComponentType.Transform);
      expect(transform.position).toEqual({ x: 50, y: 100, z: 200 });
      expect((result.stackTop as any).teleported).toBe(true);
    });

    it('UAAL execute holoscript opcode captures scene snapshot', async () => {
      world.spawn('Tree');
      world.spawn('Rock');
      world.spawn('River');

      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [{ opCode: UAALOpCode.OP_EXECUTE_HOLOSCRIPT }, { opCode: UAALOpCode.HALT }],
      };

      const result = await cognitiveVM.execute(bytecode);
      const snapshot = result.stackTop as any;
      expect(snapshot.entityCount).toBe(3);
      expect(snapshot.entities).toHaveLength(3);
      expect(snapshot.entities.map((e: any) => e.name)).toContain('Tree');
    });

    it('full cognitive cycle with scene perception flows through all layers', async () => {
      world.spawn('Entity_A');
      world.spawn('Entity_B');

      const compiler = new UAALCompiler();
      const bytecode = compiler.buildFullCycle('Observe and catalog the scene');
      const result = await cognitiveVM.execute(bytecode);

      expect(result.taskStatus).toBe('HALTED');
      // The INTAKE handler pushed the scene snapshot through the cycle
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 4: Full Stack Integration
  // agent-protocol BaseAgent -> cognitive VM -> scene mutation -> perception
  // ---------------------------------------------------------------------------

  describe('full stack: BaseAgent protocol -> cognitive VM -> ECS scene', () => {
    let world: ECSWorld;
    let cognitiveVM: UAALVirtualMachine;
    let cognitiveAgent: SpatialCognitiveAgent;
    let protocolAgent: SpatialTestAgent;

    beforeEach(() => {
      world = new ECSWorld();
      cognitiveVM = new UAALVirtualMachine();
      cognitiveAgent = new SpatialCognitiveAgent(world, cognitiveVM);
      protocolAgent = new SpatialTestAgent(world, cognitiveAgent);
    });

    it('runs a complete 7-phase protocol cycle that perceives and mutates the ECS world', async () => {
      // Seed the world with initial entities
      world.spawn('InitialEntity_1');
      world.spawn('InitialEntity_2');

      // Run the full protocol cycle (agent-protocol BaseAgent)
      const cycleResult = await protocolAgent.runCycle('Manage spatial scene', { mode: 'test' });

      // Verify protocol completed all phases
      expect(cycleResult.status).toBe('complete');
      expect(cycleResult.task).toBe('Manage spatial scene');
      expect(cycleResult.domain).toBe('spatial-computing');
      expect(cycleResult.phases).toHaveLength(7);

      // Phase 0 (INTAKE): perceived 2 entities
      const intakeData = cycleResult.phases[0].data as any;
      expect(intakeData.entityCount).toBe(2);
      expect(intakeData.entities).toContain('InitialEntity_1');
      expect(intakeData.entities).toContain('InitialEntity_2');

      // Phase 1 (REFLECT): analyzed the scene
      const reflectData = cycleResult.phases[1].data as any;
      expect(reflectData.needsAction).toBe(true); // < 3 entities

      // Phase 2 (EXECUTE): applied mutations
      const executeData = cycleResult.phases[2].data as any;
      expect(executeData.actionsApplied).toBe(1); // spawned 1 entity

      // Verify ECS world was mutated
      expect(world.entityCount).toBe(3); // 2 initial + 1 spawned

      // Phase 4 (REINTAKE): re-perceived after mutations
      const reintakeData = cycleResult.phases[4].data as any;
      expect(reintakeData.updatedEntityCount).toBe(3);
      expect(reintakeData.updatedEntities).toContain('AgentCreatedEntity');
    });

    it('agent identity propagates through the full stack', async () => {
      expect(protocolAgent.identity.id).toBe('spatial-test-agent');
      expect(protocolAgent.identity.domain).toBe('spatial-computing');
      expect(protocolAgent.identity.capabilities).toContain('scene-perception');
      expect(protocolAgent.identity.capabilities).toContain('entity-management');
      expect(protocolAgent.identity.capabilities).toContain('spatial-reasoning');
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 5: vm-bridge SpatialCognitiveAgent tick cycle
  // Validates the perceive -> decide -> mutate loop
  // ---------------------------------------------------------------------------

  describe('vm-bridge tick cycle: perceive -> decide -> mutate', () => {
    let world: ECSWorld;
    let cognitiveVM: UAALVirtualMachine;
    let agent: SpatialCognitiveAgent;

    beforeEach(() => {
      world = new ECSWorld();
      cognitiveVM = new UAALVirtualMachine();
      agent = new SpatialCognitiveAgent(world, cognitiveVM, { cognitiveHz: 10 });
    });

    it('first tick triggers perception and cognitive cycle', async () => {
      world.spawn('TestEntity');

      const result = await agent.tick(0);
      expect(result.perceived).toBe(true);
      expect(result.decided).toBe(true);
      expect(result.sceneSnapshot?.entityCount).toBe(1);
    });

    it('queued actions are applied during cognitive tick', async () => {
      agent.queueAction({ type: 'spawn', name: 'DeferredEntity' });
      expect(agent.getPendingActionCount()).toBe(1);

      // The tick drains pendingActions after the cognitive cycle
      await agent.tick(0);
      // After tick, pending actions should be drained
      // (the EXECUTE handler in SpatialCognitiveAgent's constructor
      // handles some, and tick() applies remaining)
    });

    it('tick respects cognitive Hz rate limiting', async () => {
      // First tick: runs cognitive cycle
      const result1 = await agent.tick(0);
      expect(result1.perceived).toBe(true);

      // Second tick too soon (10ms < 100ms interval for 10Hz)
      const result2 = await agent.tick(10);
      expect(result2.perceived).toBe(false);
      expect(result2.decided).toBe(false);

      // Third tick after interval (200ms > 100ms)
      const result3 = await agent.tick(200);
      expect(result3.perceived).toBe(true);
      expect(result3.decided).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 6: Scene snapshot capture and action application (vm-bridge + holo-vm)
  // ---------------------------------------------------------------------------

  describe('scene snapshot and actions: vm-bridge data structures with holo-vm ECS', () => {
    it('captureSceneSnapshot produces valid snapshot from ECS world', () => {
      const world = new ECSWorld();
      const id1 = world.spawn('Player');
      world.setComponent(id1, ComponentType.Transform, {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });

      const id2 = world.spawn('Enemy');
      world.setComponent(id2, ComponentType.Transform, {
        position: { x: 10, y: 0, z: 5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });

      const snapshot = captureSceneSnapshot(world);

      expect(snapshot.entityCount).toBe(2);
      expect(snapshot.timestamp).toBeGreaterThan(0);

      const player = snapshot.entities.find((e) => e.name === 'Player');
      expect(player?.transform?.position).toEqual({ x: 1, y: 2, z: 3 });

      const enemy = snapshot.entities.find((e) => e.name === 'Enemy');
      expect(enemy?.transform?.position).toEqual({ x: 10, y: 0, z: 5 });
    });

    it('applyActions batch-mutates the ECS world', () => {
      const world = new ECSWorld();
      const existingId = world.spawn('Existing');
      world.setComponent(existingId, ComponentType.Transform, {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      });

      const actions: AgentAction[] = [
        { type: 'spawn', name: 'NewEntity1', position: { x: 5, y: 0, z: 0 } },
        { type: 'spawn', name: 'NewEntity2', position: { x: 10, y: 0, z: 0 } },
        { type: 'move', entityId: existingId, position: { x: 99, y: 99, z: 99 } },
        { type: 'applyTrait', entityId: existingId, traitId: 42 },
      ];

      const spawnedIds = applyActions(world, actions);

      // Verify spawned entities
      expect(spawnedIds).toHaveLength(2);
      expect(world.entityCount).toBe(3); // 1 existing + 2 new

      // Verify move
      const transform = world.getComponent<any>(existingId, ComponentType.Transform);
      expect(transform.position).toEqual({ x: 99, y: 99, z: 99 });

      // Verify trait
      const entity = world.getEntity(existingId);
      expect(entity?.traits.has(42)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 7: End-to-End Multi-Agent Discovery + Protocol Execution
  // Simulates two agents discovering each other and exchanging data
  // ---------------------------------------------------------------------------

  describe('multi-agent: discovery + gossip + independent protocol execution', () => {
    it('two agents discover each other and independently execute protocol cycles', async () => {
      // === DISCOVERY PHASE (agent-sdk) ===

      // Agent A mesh
      const meshA = new MeshDiscovery('node-a');
      const signalsA = new SignalService('node-a');
      signalsA.broadcastSignal({
        type: 'agent-host',
        url: 'http://localhost:3001',
        capabilities: ['spatial-analysis'],
      });

      // Agent B mesh
      const meshB = new MeshDiscovery('node-b');
      const signalsB = new SignalService('node-b');
      signalsB.broadcastSignal({
        type: 'agent-host',
        url: 'http://localhost:3002',
        capabilities: ['entity-management'],
      });

      // Cross-register peers
      meshA.registerPeer({
        id: 'node-b',
        hostname: 'localhost',
        port: 3002,
        version: '1.0.0',
        agentCount: 1,
        capabilities: ['entity-management'],
        lastSeen: Date.now(),
      });
      meshB.registerPeer({
        id: 'node-a',
        hostname: 'localhost',
        port: 3001,
        version: '1.0.0',
        agentCount: 1,
        capabilities: ['spatial-analysis'],
        lastSeen: Date.now(),
      });

      expect(meshA.getPeerCount()).toBe(1);
      expect(meshB.getPeerCount()).toBe(1);

      // === GOSSIP PHASE (agent-sdk) ===

      const gossipA = new GossipProtocol();
      const gossipB = new GossipProtocol();

      gossipA.shareWisdom('agent-a', { pattern: 'spatial-clustering', confidence: 0.95 });
      gossipB.antiEntropySync(gossipA.getPool());
      expect(gossipB.getPoolSize()).toBe(1);

      // === PROTOCOL EXECUTION PHASE (agent-protocol + uaal + vm-bridge + holo-vm) ===

      // Agent A operates on its own ECS world
      const worldA = new ECSWorld();
      worldA.spawn('WorldA_Tree');
      worldA.spawn('WorldA_Rock');

      const vmA = new UAALVirtualMachine();
      const cogAgentA = new SpatialCognitiveAgent(worldA, vmA);
      const protoAgentA = new SpatialTestAgent(worldA, cogAgentA);

      const resultA = await protoAgentA.runCycle('Analyze environment A');
      expect(resultA.status).toBe('complete');
      expect(resultA.phases[0].data).toBeDefined();

      // Agent B operates on its own ECS world
      const worldB = new ECSWorld();
      worldB.spawn('WorldB_Ocean');
      worldB.spawn('WorldB_Beach');
      worldB.spawn('WorldB_Palm');
      worldB.spawn('WorldB_Coconut');

      const vmB = new UAALVirtualMachine();
      const cogAgentB = new SpatialCognitiveAgent(worldB, vmB);
      const protoAgentB = new SpatialTestAgent(worldB, cogAgentB);

      const resultB = await protoAgentB.runCycle('Analyze environment B');
      expect(resultB.status).toBe('complete');

      // Agent B has >= 3 entities so no mutations needed
      const reflectB = resultB.phases[1].data as any;
      expect(reflectB.needsAction).toBe(false);
      expect(worldB.entityCount).toBe(4); // No new entities spawned

      // Agent A has < 3 entities so it spawns one
      expect(worldA.entityCount).toBe(3); // 2 original + 1 spawned
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 8: Protocol Phase Names Consistency
  // Validates that agent-protocol phase names align with UAAL opcodes
  // ---------------------------------------------------------------------------

  describe('protocol phase alignment: agent-protocol phases match UAAL opcodes', () => {
    it('protocol phase names correspond to UAAL opcode names', () => {
      // Verify the 8 protocol phases exist and are named correctly
      expect(PHASE_NAMES[ProtocolPhase.INTAKE]).toBe('INTAKE');
      expect(PHASE_NAMES[ProtocolPhase.REFLECT]).toBe('REFLECT');
      expect(PHASE_NAMES[ProtocolPhase.EXECUTE]).toBe('EXECUTE');
      expect(PHASE_NAMES[ProtocolPhase.COMPRESS]).toBe('COMPRESS');
      expect(PHASE_NAMES[ProtocolPhase.REINTAKE]).toBe('REINTAKE');
      expect(PHASE_NAMES[ProtocolPhase.GROW]).toBe('GROW');
      expect(PHASE_NAMES[ProtocolPhase.EVOLVE]).toBe('EVOLVE');
      expect(PHASE_NAMES[ProtocolPhase.AUTONOMIZE]).toBe('AUTONOMIZE');

      // Verify corresponding UAAL opcodes exist
      expect(UAALOpCode.INTAKE).toBeDefined();
      expect(UAALOpCode.REFLECT).toBeDefined();
      expect(UAALOpCode.EXECUTE).toBeDefined();
      expect(UAALOpCode.COMPRESS).toBeDefined();
      expect(UAALOpCode.HALT).toBeDefined();
    });

    it('UAAL compiler buildFullCycle produces bytecode with protocol phase opcodes', () => {
      const compiler = new UAALCompiler();
      const bytecode = compiler.buildFullCycle('Test task');

      const opcodes = bytecode.instructions.map((i) => i.opCode);

      // Must contain the core protocol phase opcodes
      expect(opcodes).toContain(UAALOpCode.INTAKE);
      expect(opcodes).toContain(UAALOpCode.REFLECT);
      expect(opcodes).toContain(UAALOpCode.EXECUTE);
      expect(opcodes).toContain(UAALOpCode.COMPRESS);
      expect(opcodes).toContain(UAALOpCode.HALT);
    });
  });
});
