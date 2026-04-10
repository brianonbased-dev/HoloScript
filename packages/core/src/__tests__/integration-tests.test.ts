/**
 * Sprint 4 Integration Tests
 *
 * End-to-end tests for Agentic Choreography features.
 * Tests cross-module integration scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Consensus
import { ConsensusManager } from '../consensus/ConsensusManager';

// Spatial
import { distance } from '../spatial/SpatialTypes';

// Debug/Telemetry
import {
  TelemetryCollector,
  resetTelemetryCollector,
  AgentInspector,
  resetAgentInspector,
  AgentDebugger,
  resetAgentDebugger,
} from '../debug';

// Agent manifest helpers
import type { AgentManifest } from '../agents/AgentTypes';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestManifest(id: string): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: [{ type: 'test', domain: 'integration' }],
    endpoints: [{ protocol: 'local', address: 'internal' }],
    trustLevel: 'local',
  } as AgentManifest;
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration Tests, () => {
  describe('Consensus Manager', () => {
    let consensus: ConsensusManager;

    beforeEach(() => {
      consensus = new ConsensusManager('test-node', { mechanism: 'simple_majority' });
      consensus.start();
    });

    afterEach(() => {
      consensus.stop();
    });

    it('should propose and accept values', async () => {
      const accepted = await consensus.propose('test-key', 'test-value');

      expect(accepted).toBe(true);
      expect(consensus.get('test-key')).toBe('test-value');
    });

    it('should maintain state across proposals', async () => {
      await consensus.propose('key1', 'value1');
      await consensus.propose('key2', 'value2');

      const state = consensus.getState();

      expect(state.get('key1')).toBe('value1');
      expect(state.get('key2')).toBe('value2');
    });

    it('should support subscriptions', async () => {
      const updates: unknown[] = [];

      // Subscribe to a specific key
      const unsubscribe = consensus.subscribe<string>('subscribed-key', (value) => {
        updates.push(value);
      });

      // Propose the value
      await consensus.propose('subscribed-key', 'subscribed-value');

      // Check that we got the value
      expect(updates).toContain('subscribed-value');

      // Cleanup
      unsubscribe();
    });
  });

  describe('Spatial Utilities', () => {
    it('should calculate 3D distance correctly', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };

      const dist = distance(a, b);

      expect(dist).toBe(5); // 3-4-5 triangle
    });

    it('should handle 3D distances', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 1, y: 2, z: 2 }; // sqrt(1+4+4) = 3

      const dist = distance(a, b);

      expect(dist).toBe(3);
    });

    it('should handle negative coordinates', () => {
      const a = { x: -1, y: -1, z: -1 };
      const b = { x: 1, y: 1, z: 1 };

      const dist = distance(a, b);

      // sqrt((2)^2 + (2)^2 + (2)^2) = sqrt(12) â‰ˆ 3.464
      expect(dist).toBeCloseTo(3.464, 2);
    });
  });

  describe('Telemetry & Inspector Integration', () => {
    let telemetry: TelemetryCollector;
    let inspector: AgentInspector;

    beforeEach(() => {
      resetTelemetryCollector();
      resetAgentInspector();
      telemetry = new TelemetryCollector({ flushInterval: 0 });
      inspector = new AgentInspector({ telemetryCollector: telemetry });
    });

    afterEach(() => {
      telemetry.destroy();
      resetTelemetryCollector();
      resetAgentInspector();
    });

    it('should record telemetry events', () => {
      const event = telemetry.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'test-agent',
        data: { action: 'test' },
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('task_started');
      expect(event?.agentId).toBe('test-agent');
    });

    it('should register and inspect agents', () => {
      const manifest = createTestManifest('agent-1');
      inspector.registerAgent(manifest, { status: 'idle' });

      expect(inspector.isAgentRegistered('agent-1')).toBe(true);

      const state = inspector.getState('agent-1');
      expect(state.status).toBe('idle');
    });

    it('should track state changes', () => {
      const manifest = createTestManifest('agent-2');
      inspector.registerAgent(manifest, { counter: 0 });

      inspector.updateState('agent-2', { counter: 1 });
      inspector.updateState('agent-2', { counter: 2 });

      const state = inspector.getState('agent-2');
      expect(state.counter).toBe(2);
    });

    it('should combine telemetry with inspection', () => {
      const manifest = createTestManifest('integrated-agent');
      inspector.registerAgent(manifest, { status: 'starting' });

      // Record start event
      telemetry.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'integrated-agent',
        data: { task: 'integration-test' },
      });

      // Update state
      inspector.updateState('integrated-agent', { status: 'running' });

      // Record completion
      telemetry.record({
        type: 'task_completed',
        severity: 'info',
        agentId: 'integrated-agent',
        data: { task: 'integration-test', result: 'success' },
      });

      inspector.updateState('integrated-agent', { status: 'idle' });

      // Verify final state
      const state = inspector.getState('integrated-agent');
      expect(state.status).toBe('idle');

      // Verify agent was tracked
      expect(inspector.getRegisteredAgents()).toContain('integrated-agent');
    });
  });

  describe('Debugger Integration', () => {
    let telemetry: TelemetryCollector;
    let inspector: AgentInspector;
    let debugger_: AgentDebugger;

    beforeEach(() => {
      resetTelemetryCollector();
      resetAgentInspector();
      resetAgentDebugger();
      telemetry = new TelemetryCollector({ flushInterval: 0 });
      inspector = new AgentInspector({ telemetryCollector: telemetry });
      debugger_ = new AgentDebugger({ telemetryCollector: telemetry, agentInspector: inspector });
    });

    afterEach(() => {
      debugger_.stopSession();
      telemetry.destroy();
      resetTelemetryCollector();
      resetAgentInspector();
      resetAgentDebugger();
    });

    it('should start and stop debug sessions', () => {
      const session = debugger_.startSession('test-session', true);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.name).toBe('test-session');
      expect(session.isRecording).toBe(true);

      const recording = debugger_.stopSession();
      expect(recording).toBeDefined();
      expect(recording?.id).toBe(session.id);
    });

    it('should capture events during session', () => {
      const session = debugger_.startSession('event-capture-session', true);

      // Generate some events
      telemetry.record({
        type: 'message_sent',
        severity: 'info',
        agentId: 'debug-test-agent',
        data: { to: 'other-agent' },
      });

      telemetry.record({
        type: 'message_received',
        severity: 'info',
        agentId: 'other-agent',
        data: { from: 'debug-test-agent' },
      });

      // Session should be recording
      expect(session.isRecording).toBe(true);

      const recording = debugger_.stopSession();
      expect(recording).toBeDefined();
    });
  });

  describe('Multi-Module Workflow', () => {
    let telemetry: TelemetryCollector;
    let inspector: AgentInspector;
    let consensus: ConsensusManager;

    beforeEach(() => {
      resetTelemetryCollector();
      resetAgentInspector();
      telemetry = new TelemetryCollector({ flushInterval: 0 });
      inspector = new AgentInspector({ telemetryCollector: telemetry });
      consensus = new ConsensusManager('workflow-node', { mechanism: 'simple_majority' });
      consensus.start();
    });

    afterEach(() => {
      consensus.stop();
      telemetry.destroy();
      resetTelemetryCollector();
      resetAgentInspector();
    });

    it('should execute workflow: register â†’ propose â†’ track', async () => {
      // 1. Register agents
      const agent1 = createTestManifest('workflow-agent-1');
      const agent2 = createTestManifest('workflow-agent-2');

      inspector.registerAgent(agent1, { role: 'proposer' });
      inspector.registerAgent(agent2, { role: 'voter' });

      telemetry.record({
        type: 'custom',
        severity: 'info',
        agentId: 'system',
        data: { event: 'agents_registered', count: 2 },
      });

      // 2. Propose via consensus
      const accepted = await consensus.propose('workflow-decision', { approved: true });
      expect(accepted).toBe(true);

      telemetry.record({
        type: 'custom',
        severity: 'info',
        agentId: 'workflow-agent-1',
        data: { event: 'consensus_reached', decision: 'approved' },
      });

      // 3. Update agent states
      inspector.updateState('workflow-agent-1', { lastAction: 'proposed' });
      inspector.updateState('workflow-agent-2', { lastAction: 'voted' });

      // 4. Verify workflow completed
      const state1 = inspector.getState('workflow-agent-1');
      const state2 = inspector.getState('workflow-agent-2');

      expect(state1.lastAction).toBe('proposed');
      expect(state2.lastAction).toBe('voted');
      expect(consensus.get('workflow-decision')).toEqual({ approved: true });
    });

    it('should handle multi-round consensus with telemetry', async () => {
      // Register participants
      for (let i = 1; i <= 3; i++) {
        inspector.registerAgent(createTestManifest(`voter-${i}`), { votes: 0 });
      }

      // Multiple consensus rounds
      for (let round = 1; round <= 3; round++) {
        const key = `round-${round}`;
        const value = { round, timestamp: Date.now() };

        const accepted = await consensus.propose(key, value);
        expect(accepted).toBe(true);

        telemetry.record({
          type: 'custom',
          severity: 'info',
          agentId: 'consensus-coordinator',
          data: { event: 'round_complete', round },
        });
      }

      // Verify all rounds were recorded
      const state = consensus.getState();
      expect(state.size).toBe(3);
      expect(state.has('round-1')).toBe(true);
      expect(state.has('round-2')).toBe(true);
      expect(state.has('round-3')).toBe(true);
    });
  });
});

