/**
 * agent-monitor.scenario.ts — Agent Monitor Store State Machine
 *
 * Persona: Dev — verifying agentStore transitions, cycle log, and stop/clear.
 * Pure Zustand store tests (no React, no UI).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from '@/lib/stores/agentStore';

// Reset store before each test to ensure isolation
function resetStore() {
  useAgentStore.setState({
    isRunning: false,
    currentPhase: 'idle',
    currentAction: '',
    cycleCount: 0,
    recentCycles: [],
    lastError: null,
  });
}

describe('Scenario: Agent Monitor — agentStore state machine', () => {
  beforeEach(resetStore);

  it('starts in idle state', () => {
    const s = useAgentStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.currentPhase).toBe('idle');
    expect(s.cycleCount).toBe(0);
    expect(s.recentCycles).toHaveLength(0);
  });

  it('startCycle transitions to running/intake', () => {
    useAgentStore.getState().startCycle(1);
    const s = useAgentStore.getState();
    expect(s.isRunning).toBe(true);
    expect(s.currentPhase).toBe('intake');
    expect(s.recentCycles).toHaveLength(1);
    expect(s.recentCycles[0].cycleId).toBe(1);
    expect(s.recentCycles[0].status).toBe('running');
  });

  it('setPhase updates current phase and active cycle entry', () => {
    useAgentStore.getState().startCycle(2);
    useAgentStore.getState().setPhase('execute', 'Generating scene...');
    const s = useAgentStore.getState();
    expect(s.currentPhase).toBe('execute');
    expect(s.currentAction).toBe('Generating scene...');
    expect(s.recentCycles[0].phase).toBe('execute');
    expect(s.recentCycles[0].action).toBe('Generating scene...');
  });

  it('completeCycle increments cycleCount and marks done', () => {
    useAgentStore.getState().startCycle(3);
    useAgentStore.getState().completeCycle(3, 1234);
    const s = useAgentStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.currentPhase).toBe('idle');
    expect(s.cycleCount).toBe(1);
    expect(s.recentCycles[0].status).toBe('done');
    expect(s.recentCycles[0].durationMs).toBe(1234);
  });

  it('failCycle records error and sets isRunning=false', () => {
    useAgentStore.getState().startCycle(4);
    useAgentStore.getState().failCycle(4, 'Timeout after 30s');
    const s = useAgentStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.lastError).toBe('Timeout after 30s');
    expect(s.recentCycles[0].status).toBe('error');
    // cycleCount does NOT increment on failure
    expect(s.cycleCount).toBe(0);
  });

  it('stopAgent halts without modifying cycle log', () => {
    useAgentStore.getState().startCycle(5);
    const logBefore = useAgentStore.getState().recentCycles.length;
    useAgentStore.getState().stopAgent();
    const s = useAgentStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.currentPhase).toBe('idle');
    // Log is unchanged by stopAgent
    expect(s.recentCycles.length).toBe(logBefore);
  });

  it('clearHistory resets cycles and error', () => {
    useAgentStore.getState().startCycle(6);
    useAgentStore.getState().failCycle(6, 'error');
    useAgentStore.getState().clearHistory();
    const s = useAgentStore.getState();
    expect(s.recentCycles).toHaveLength(0);
    expect(s.cycleCount).toBe(0);
    expect(s.lastError).toBeNull();
  });

  it('caps recentCycles at 50 entries', () => {
    // Rapidly start 55 cycles
    for (let i = 1; i <= 55; i++) {
      useAgentStore.getState().startCycle(i);
    }
    const s = useAgentStore.getState();
    expect(s.recentCycles.length).toBeLessThanOrEqual(50);
  });
});
