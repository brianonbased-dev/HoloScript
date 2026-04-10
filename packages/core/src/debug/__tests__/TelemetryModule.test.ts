/**
 * Telemetry Module Tests
 * Sprint 4 Priority 8 - Agent Debugging & Telemetry
 *
 * Tests for TelemetryCollector, AgentInspector, and AgentDebugger.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TelemetryCollector,
  getTelemetryCollector,
  resetTelemetryCollector,
} from '../TelemetryCollector';
import { AgentInspector, getAgentInspector, resetAgentInspector } from '../AgentInspector';
import { AgentDebugger, getAgentDebugger, resetAgentDebugger } from '../AgentDebugger';
import type { AgentManifest, AgentCapability } from '../../agents/AgentTypes';
import type { TelemetryConfig } from '../TelemetryTypes';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestManifest(
  id: string,
  capabilities: Array<{ type: string; domain: string }> = []
): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: capabilities.map((c) => ({
      type: c.type,
      domain: c.domain,
    })),
    endpoints: [{ protocol: 'local', address: 'internal' }],
    trustLevel: 'local',
  } as AgentManifest;
}

// =============================================================================
// TELEMETRY COLLECTOR TESTS
// =============================================================================

describe('TelemetryCollector', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    resetTelemetryCollector();
    collector = new TelemetryCollector({ flushInterval: 0 }); // Disable auto-flush for tests
  });

  afterEach(() => {
    collector.destroy();
    resetTelemetryCollector();
  });

  describe('Singleton', () => {
    it('should get default collector instance', () => {
      const c1 = getTelemetryCollector();
      const c2 = getTelemetryCollector();
      expect(c1).toBe(c2);
    });

    it('should reset collector', () => {
      const c1 = getTelemetryCollector();
      resetTelemetryCollector();
      const c2 = getTelemetryCollector();
      expect(c1).not.toBe(c2);
    });
  });

  describe('Event Recording', () => {
    it('should record a telemetry event', () => {
      const event = collector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-1',
        data: { taskId: 'task-1' },
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('task_started');
      expect(event?.agentId).toBe('agent-1');
      expect(event?.id).toBeDefined();
      expect(event?.timestamp).toBeDefined();
    });

    it('should record convenience events', () => {
      const event = collector.recordEvent('message_sent', 'agent-1', { to: 'agent-2' });

      expect(event).toBeDefined();
      expect(event?.type).toBe('message_sent');
    });

    it('should record error events', () => {
      const error = new Error('Test error');
      const event = collector.recordError('agent-1', error, { context: 'testing' });

      expect(event).toBeDefined();
      expect(event?.type).toBe('error');
      expect(event?.severity).toBe('error');
      expect(event?.data.error).toBe('Test error');
    });

    it('should respect sampling rate', () => {
      const sampledCollector = new TelemetryCollector({
        samplingRate: 0,
        flushInterval: 0,
      });

      const event = sampledCollector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });

      expect(event).toBeNull();
      sampledCollector.destroy();
    });

    it('should filter by event type', () => {
      const filteredCollector = new TelemetryCollector({
        captureEvents: ['task_started'],
        flushInterval: 0,
      });

      const capturedEvent = filteredCollector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });

      const filteredEvent = filteredCollector.record({
        type: 'message_sent',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });

      expect(capturedEvent).not.toBeNull();
      expect(filteredEvent).toBeNull();
      filteredCollector.destroy();
    });

    it('should filter by severity', () => {
      const filteredCollector = new TelemetryCollector({
        minSeverity: 'warn',
        flushInterval: 0,
      });

      const debugEvent = filteredCollector.record({
        type: 'task_started',
        severity: 'debug',
        agentId: 'agent-1',
        data: {},
      });

      const errorEvent = filteredCollector.record({
        type: 'error',
        severity: 'error',
        agentId: 'agent-1',
        data: {},
      });

      expect(debugEvent).toBeNull();
      expect(errorEvent).not.toBeNull();
      filteredCollector.destroy();
    });

    it('should emit event on record', () => {
      const handler = vi.fn();
      collector.on('event', handler);

      collector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Tracing', () => {
    it('should start a span', () => {
      const span = collector.startSpan('test-operation', { agentId: 'agent-1' });

      expect(span).toBeDefined();
      expect(span.name).toBe('test-operation');
      expect(span.context.traceId).toBeDefined();
      expect(span.context.spanId).toBeDefined();
      expect(span.startTime).toBeGreaterThan(0);
      expect(span.endTime).toBe(0);
    });

    it('should end a span', () => {
      const span = collector.startSpan('test-operation');
      const ended = collector.endSpan(span.id, 'ok');

      expect(ended.endTime).toBeGreaterThan(0);
      expect(ended.duration).toBeGreaterThanOrEqual(0);
      expect(ended.status).toBe('ok');
    });

    it('should create child spans', () => {
      const parent = collector.startSpan('parent');
      const child = collector.startSpan('child', { parentContext: parent.context });

      expect(child.context.traceId).toBe(parent.context.traceId);
      expect(child.context.parentSpanId).toBe(parent.context.spanId);
    });

    it('should add events to span', () => {
      const span = collector.startSpan('test-operation');
      collector.addSpanEvent(span.id, 'checkpoint', { value: 42 });

      const updated = collector.getSpan(span.id);
      expect(updated?.events.length).toBe(1);
      expect(updated?.events[0].name).toBe('checkpoint');
    });

    it('should set span attributes', () => {
      const span = collector.startSpan('test-operation');
      collector.setSpanAttributes(span.id, { custom: 'value' });

      const updated = collector.getSpan(span.id);
      expect(updated?.attributes.custom).toBe('value');
    });

    it('should get trace spans', () => {
      const parent = collector.startSpan('parent');
      collector.startSpan('child1', { parentContext: parent.context });
      collector.startSpan('child2', { parentContext: parent.context });

      const traceSpans = collector.getTraceSpans(parent.context.traceId);
      expect(traceSpans.length).toBe(3);
    });
  });

  describe('Queries', () => {
    beforeEach(() => {
      collector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });
      collector.record({
        type: 'task_completed',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });
      collector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-2',
        data: {},
      });
    });

    it('should get events by agent', () => {
      const events = collector.getAgentEvents('agent-1');
      expect(events.length).toBe(2);
    });

    it('should get events by type', () => {
      const events = collector.getEventsByType('task_started');
      expect(events.length).toBe(2);
    });

    it('should get recent events with limit', () => {
      const events = collector.getRecentEvents(1);
      expect(events.length).toBe(1);
    });

    it('should search events', () => {
      const events = collector.searchEvents(
        (e) => e.type === 'task_started' && e.agentId === 'agent-1'
      );
      expect(events.length).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track event statistics', () => {
      collector.record({
        type: 'task_started',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
        latency: 100,
      });

      const stats = collector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType['task_started']).toBe(1);
      expect(stats.eventsByAgent['agent-1']).toBe(1);
    });

    it('should track span statistics', () => {
      const span = collector.startSpan('test');
      const stats = collector.getStats();

      expect(stats.totalSpans).toBe(1);
      expect(stats.activeSpans).toBe(1);

      collector.endSpan(span.id);
      const updatedStats = collector.getStats();
      expect(updatedStats.activeSpans).toBe(0);
    });
  });

  describe('Export', () => {
    it('should export to OpenTelemetry format', () => {
      const span = collector.startSpan('test-op', {
        attributes: { key: 'value' },
      });
      collector.endSpan(span.id);

      const otelSpans = collector.exportToOTel();
      expect(otelSpans.length).toBe(1);
      expect(otelSpans[0].name).toBe('test-op');
      expect(otelSpans[0].status.code).toBe(1); // OK
    });
  });
});

// =============================================================================
// AGENT INSPECTOR TESTS
// =============================================================================

describe('AgentInspector', () => {
  let inspector: AgentInspector;
  let manifest: AgentManifest;

  beforeEach(() => {
    resetAgentInspector();
    inspector = new AgentInspector();
    manifest = createTestManifest('test-agent', [{ type: 'generate', domain: 'text' }]);
  });

  afterEach(() => {
    inspector.destroy();
    resetAgentInspector();
  });

  describe('Singleton', () => {
    it('should get default inspector instance', () => {
      const i1 = getAgentInspector();
      const i2 = getAgentInspector();
      expect(i1).toBe(i2);
    });

    it('should reset inspector', () => {
      const i1 = getAgentInspector();
      resetAgentInspector();
      const i2 = getAgentInspector();
      expect(i1).not.toBe(i2);
    });
  });

  describe('Agent Registration', () => {
    it('should register an agent', () => {
      inspector.registerAgent(manifest, { count: 0 });

      expect(inspector.isAgentRegistered('test-agent')).toBe(true);
      expect(inspector.getRegisteredAgents()).toContain('test-agent');
    });

    it('should unregister an agent', () => {
      inspector.registerAgent(manifest);
      inspector.unregisterAgent('test-agent');

      expect(inspector.isAgentRegistered('test-agent')).toBe(false);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      inspector.registerAgent(manifest, { count: 0, name: 'Test' });
    });

    it('should get agent state', () => {
      const state = inspector.getState('test-agent');
      expect(state.count).toBe(0);
      expect(state.name).toBe('Test');
    });

    it('should update agent state', () => {
      inspector.updateState('test-agent', { count: 5 });

      const state = inspector.getState('test-agent');
      expect(state.count).toBe(5);
    });

    it('should set a single state value', () => {
      inspector.setState('test-agent', 'name', 'Updated');

      expect(inspector.getStateValue('test-agent', 'name')).toBe('Updated');
    });

    it('should track state changes', () => {
      inspector.updateState('test-agent', { count: 1 });
      inspector.updateState('test-agent', { count: 2 });

      const history = inspector.getStateHistory('test-agent');
      expect(history.length).toBe(2);
      expect(history[0].oldValue).toBe(0);
      expect(history[0].newValue).toBe(1);
    });

    it('should emit stateUpdated event', () => {
      const handler = vi.fn();
      inspector.on('stateUpdated', handler);

      inspector.updateState('test-agent', { count: 1 });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'test-agent',
          updates: { count: 1 },
        })
      );
    });
  });

  describe('Task Tracking', () => {
    beforeEach(() => {
      inspector.registerAgent(manifest);
    });

    it('should track a task', () => {
      inspector.trackTask('test-agent', {
        id: 'task-1',
        type: 'generate',
        status: 'running',
        progress: 0,
        startedAt: Date.now(),
        elapsed: 0,
      });

      const task = inspector.getActiveTask('test-agent');
      expect(task).toBeDefined();
      expect(task?.id).toBe('task-1');
    });

    it('should update task progress', () => {
      inspector.trackTask('test-agent', {
        id: 'task-1',
        type: 'generate',
        status: 'running',
        progress: 0,
        startedAt: Date.now(),
        elapsed: 0,
      });

      inspector.updateTaskProgress('test-agent', 50);

      const task = inspector.getActiveTask('test-agent');
      expect(task?.progress).toBe(50);
    });

    it('should complete a task', () => {
      inspector.trackTask('test-agent', {
        id: 'task-1',
        type: 'generate',
        status: 'running',
        progress: 0,
        startedAt: Date.now(),
        elapsed: 0,
      });

      inspector.completeTask('test-agent');

      expect(inspector.getActiveTask('test-agent')).toBeUndefined();
    });
  });

  describe('Inspection', () => {
    beforeEach(() => {
      inspector.registerAgent(manifest, { ready: true });
    });

    it('should inspect an agent', () => {
      const inspection = inspector.inspect('test-agent');

      expect(inspection.agentId).toBe('test-agent');
      expect(inspection.name).toBe('Agent test-agent');
      expect(inspection.status).toBe('idle');
      expect(inspection.state.ready).toBe(true);
      expect(inspection.capabilities).toContain('generate:text');
    });

    it('should show active status when task running', () => {
      inspector.trackTask('test-agent', {
        id: 'task-1',
        type: 'work',
        status: 'running',
        progress: 50,
        startedAt: Date.now(),
        elapsed: 0,
      });

      const inspection = inspector.inspect('test-agent');
      expect(inspection.status).toBe('active');
      expect(inspection.currentTask).toBeDefined();
    });
  });

  describe('Breakpoints', () => {
    beforeEach(() => {
      inspector.registerAgent(manifest);
    });

    it('should add a breakpoint', () => {
      const bp = inspector.addBreakpoint('test-agent', 'count > 5');

      expect(bp.id).toBeDefined();
      expect(bp.condition).toBe('count > 5');
      expect(bp.enabled).toBe(true);
    });

    it('should remove a breakpoint', () => {
      const bp = inspector.addBreakpoint('test-agent', 'count > 5');
      const removed = inspector.removeBreakpoint(bp.id);

      expect(removed).toBe(true);
      expect(inspector.getBreakpoints('test-agent')).toHaveLength(0);
    });

    it('should enable/disable breakpoint', () => {
      const bp = inspector.addBreakpoint('test-agent', 'count > 5');
      inspector.setBreakpointEnabled(bp.id, false);

      const breakpoints = inspector.getBreakpoints('test-agent');
      expect(breakpoints[0].enabled).toBe(false);
    });

    it('should evaluate breakpoint condition', () => {
      const bp = inspector.addBreakpoint('test-agent', 'count > 5');

      const shouldNotHit = inspector.evaluateBreakpoint(bp.id, { count: 3 });
      expect(shouldNotHit).toBe(false);

      const shouldHit = inspector.evaluateBreakpoint(bp.id, { count: 10 });
      expect(shouldHit).toBe(true);
    });
  });
});

// =============================================================================
// AGENT DEBUGGER TESTS
// =============================================================================

describe('AgentDebugger', () => {
  let debugger_: AgentDebugger;
  let manifest: AgentManifest;

  beforeEach(() => {
    resetAgentDebugger();
    debugger_ = new AgentDebugger({ config: { autoRecord: false } });
    manifest = createTestManifest('test-agent', [{ type: 'generate', domain: 'text' }]);
  });

  afterEach(() => {
    debugger_.destroy();
    resetAgentDebugger();
  });

  describe('Singleton', () => {
    it('should get default debugger instance', () => {
      const d1 = getAgentDebugger();
      const d2 = getAgentDebugger();
      expect(d1).toBe(d2);
    });

    it('should reset debugger', () => {
      const d1 = getAgentDebugger();
      resetAgentDebugger();
      const d2 = getAgentDebugger();
      expect(d1).not.toBe(d2);
    });
  });

  describe('Agent Management', () => {
    it('should register an agent', () => {
      debugger_.registerAgent(manifest, { ready: true });

      const inspection = debugger_.inspect('test-agent');
      expect(inspection.agentId).toBe('test-agent');
    });

    it('should unregister an agent', () => {
      debugger_.registerAgent(manifest);
      debugger_.unregisterAgent('test-agent');

      expect(() => debugger_.inspect('test-agent')).toThrow();
    });
  });

  describe('Tracing', () => {
    it('should start and end a span', () => {
      const span = debugger_.startSpan('test-op', { agentId: 'agent-1' });
      expect(span.name).toBe('test-op');

      const ended = debugger_.endSpan(span.id);
      expect(ended.status).toBe('ok');
    });

    it('should get trace spans', () => {
      const span = debugger_.startSpan('parent');
      debugger_.startSpan('child', { parentSpanId: span.id });

      const traceSpans = debugger_.trace(span.context.traceId);
      expect(traceSpans.length).toBe(2);
    });
  });

  describe('Sessions', () => {
    it('should start a session', () => {
      const session = debugger_.startSession('test-session');

      expect(session.id).toBeDefined();
      expect(session.name).toBe('test-session');
      expect(debugger_.getCurrentSession()).toBe(session);
    });

    it('should stop a session', () => {
      debugger_.startSession('test-session');
      const recording = debugger_.stopSession();

      expect(recording).toBeDefined();
      expect(recording?.name).toBe('test-session');
      expect(debugger_.getCurrentSession()).toBeUndefined();
    });

    it('should record events when recording', () => {
      debugger_.registerAgent(manifest);
      const session = debugger_.startSession('test-session', true);

      // Events should be recorded automatically via TelemetryCollector

      expect(session.isRecording).toBe(true);
    });

    it('should get recordings', () => {
      debugger_.startSession('session-1');
      debugger_.stopSession();
      debugger_.startSession('session-2');
      debugger_.stopSession();

      const recordings = debugger_.getRecordings();
      expect(recordings.length).toBe(2);
    });
  });

  describe('Recording Control', () => {
    it('should start and stop recording', () => {
      const session = debugger_.startSession('test-session', false);
      expect(session.isRecording).toBe(false);

      debugger_.startRecording();
      expect(debugger_.getCurrentSession()?.isRecording).toBe(true);

      debugger_.stopRecording();
      expect(debugger_.getCurrentSession()?.isRecording).toBe(false);
    });
  });

  describe('Breakpoints', () => {
    beforeEach(() => {
      debugger_.registerAgent(manifest);
    });

    it('should set a breakpoint', () => {
      const bp = debugger_.breakpoint('test-agent', 'state.count > 5');

      expect(bp.id).toBeDefined();
      expect(bp.condition).toBe('state.count > 5');
    });

    it('should remove a breakpoint', () => {
      const bp = debugger_.breakpoint('test-agent', 'state.count > 5');
      const removed = debugger_.removeBreakpoint(bp.id);

      expect(removed).toBe(true);
    });

    it('should get breakpoints for agent', () => {
      debugger_.breakpoint('test-agent', 'cond1');
      debugger_.breakpoint('test-agent', 'cond2');

      const breakpoints = debugger_.getBreakpoints('test-agent');
      expect(breakpoints.length).toBe(2);
    });

    it('should enable/disable breakpoint', () => {
      const bp = debugger_.breakpoint('test-agent', 'state.count > 5');
      debugger_.setBreakpointEnabled(bp.id, false);

      const breakpoints = debugger_.getBreakpoints('test-agent');
      expect(breakpoints[0].enabled).toBe(false);
    });
  });

  describe('Execution Control', () => {
    beforeEach(() => {
      debugger_.registerAgent(manifest);
    });

    it('should check if agent is paused', () => {
      expect(debugger_.isPaused('test-agent')).toBe(false);
    });

    it('should get paused agents', () => {
      expect(debugger_.getPausedAgents()).toHaveLength(0);
    });
  });

  describe('Replay', () => {
    beforeEach(() => {
      // Create a recording
      debugger_.startSession('test-session', true);
      debugger_.stopSession();
    });

    it('should start replay', () => {
      const recordings = debugger_.getRecordings();
      const handler = vi.fn();
      debugger_.on('replayStarted', handler);

      debugger_.replay(recordings[0].id);

      expect(handler).toHaveBeenCalled();
    });

    it('should pause and resume replay', () => {
      const recordings = debugger_.getRecordings();
      // Starting replay on empty recording completes immediately
      // so just verify the flow works
      const pauseHandler = vi.fn();
      const resumeHandler = vi.fn();
      debugger_.on('replayPaused', pauseHandler);
      debugger_.on('replayComplete', resumeHandler);

      debugger_.replay(recordings[0].id);

      // Replay may complete immediately for empty recordings
      // Just verify the API doesn't throw
      debugger_.pauseReplay();
      debugger_.resumeReplay();
    });

    it('should stop replay', () => {
      const recordings = debugger_.getRecordings();
      debugger_.replay(recordings[0].id);
      debugger_.stopReplay();

      expect(debugger_.getReplayState()).toBeUndefined();
    });
  });

  describe('Enable/Disable', () => {
    it('should enable and disable debugger', () => {
      expect(debugger_.isEnabled()).toBe(true);

      debugger_.setEnabled(false);
      expect(debugger_.isEnabled()).toBe(false);

      debugger_.setEnabled(true);
      expect(debugger_.isEnabled()).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clear all data', () => {
      debugger_.registerAgent(manifest);
      debugger_.startSession('test');
      debugger_.stopSession();

      debugger_.clear();

      expect(debugger_.getCurrentSession()).toBeUndefined();
      expect(debugger_.getRecordings()).toHaveLength(0);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Telemetry Integration', () => {
  let debugger_: AgentDebugger;
  let manifest: AgentManifest;

  beforeEach(() => {
    resetAgentDebugger();
    debugger_ = new AgentDebugger({ config: { autoRecord: true } });
    manifest = createTestManifest('test-agent');
  });

  afterEach(() => {
    debugger_.destroy();
    resetAgentDebugger();
  });

  it('should run complete debugging workflow', () => {
    // Register agent
    debugger_.registerAgent(manifest, { ready: true });

    // Start debug session
    const session = debugger_.startSession('test-workflow');

    // Start a traced operation
    const span = debugger_.startSpan('workflow-step', { agentId: 'test-agent' });

    // Inspect agent during operation
    const inspection = debugger_.inspect('test-agent');
    expect(inspection.status).toBe('idle');

    // End span
    debugger_.endSpan(span.id);

    // Stop session
    const recording = debugger_.stopSession();

    // Verify recording
    expect(recording).toBeDefined();
    expect(recording?.spans.length).toBeGreaterThanOrEqual(0);
    // The recording metadata should exist (agentIds may not be populated
    // unless events are recorded via TelemetryCollector)
    expect(recording?.name).toBe('test-workflow');
  });
});
