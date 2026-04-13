/**
 * Agent Inspector
 * Sprint 4 Priority 8 - Agent Debugging & Telemetry
 *
 * Provides real-time inspection of agent states and activities.
 */

import { EventEmitter } from 'events';
import type { AgentManifest, AgentCapability } from '@holoscript/framework/agents';
import type { AgentInspection, InspectedTask, BreakpointInfo } from './TelemetryTypes';
import type { TelemetryCollector } from './TelemetryCollector';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Agent state snapshot
 */
export interface AgentState {
  /** Agent ID */
  agentId: string;
  /** State values */
  values: Record<string, unknown>;
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * State change event
 */
export interface StateChange {
  /** Agent ID */
  agentId: string;
  /** Property path that changed */
  property: string;
  /** Previous value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
  /** Change timestamp */
  timestamp: number;
}

/**
 * Inspector configuration
 */
export interface InspectorConfig {
  /** Maximum state history per agent */
  maxStateHistory: number;
  /** Track state changes */
  trackChanges: boolean;
  /** Maximum events to show per agent */
  maxRecentEvents: number;
}

const DEFAULT_INSPECTOR_CONFIG: InspectorConfig = {
  maxStateHistory: 100,
  trackChanges: true,
  maxRecentEvents: 50,
};

// =============================================================================
// AGENT INSPECTOR
// =============================================================================

/**
 * AgentInspector - Provides real-time agent state inspection
 */
export class AgentInspector extends EventEmitter {
  private config: InspectorConfig;
  private telemetryCollector?: TelemetryCollector;
  private agentStates: Map<string, AgentState> = new Map();
  private agentManifests: Map<string, AgentManifest> = new Map();
  private stateHistory: Map<string, StateChange[]> = new Map();
  private activeTasks: Map<string, InspectedTask> = new Map();
  private breakpoints: Map<string, BreakpointInfo[]> = new Map();

  constructor(
    options: {
      config?: Partial<InspectorConfig>;
      telemetryCollector?: TelemetryCollector;
    } = {}
  ) {
    super();
    this.config = { ...DEFAULT_INSPECTOR_CONFIG, ...options.config };
    this.telemetryCollector = options.telemetryCollector;
  }

  // ===========================================================================
  // AGENT REGISTRATION
  // ===========================================================================

  /**
   * Register an agent for inspection
   */
  registerAgent(manifest: AgentManifest, initialState: Record<string, unknown> = {}): void {
    this.agentManifests.set(manifest.id, manifest);
    this.agentStates.set(manifest.id, {
      agentId: manifest.id,
      values: { ...initialState },
      lastUpdated: Date.now(),
    });
    this.stateHistory.set(manifest.id, []);
    this.breakpoints.set(manifest.id, []);

    this.emit('agentRegistered', { agentId: manifest.id, manifest });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentManifests.delete(agentId);
    this.agentStates.delete(agentId);
    this.stateHistory.delete(agentId);
    this.activeTasks.delete(agentId);
    this.breakpoints.delete(agentId);

    this.emit('agentUnregistered', { agentId });
  }

  /**
   * Check if agent is registered
   */
  isAgentRegistered(agentId: string): boolean {
    return this.agentManifests.has(agentId);
  }

  /**
   * Get registered agent IDs
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.agentManifests.keys());
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  /**
   * Update agent state
   */
  updateState(agentId: string, updates: Record<string, unknown>): void {
    const state = this.agentStates.get(agentId);
    if (!state) {
      throw new Error(`Agent not registered: ${agentId}`);
    }

    const now = Date.now();

    // Track changes
    if (this.config.trackChanges) {
      for (const [key, newValue] of Object.entries(updates)) {
        const oldValue = state.values[key];
        if (oldValue !== newValue) {
          this.recordStateChange(agentId, key, oldValue, newValue, now);
        }
      }
    }

    // Apply updates
    Object.assign(state.values, updates);
    state.lastUpdated = now;

    this.emit('stateUpdated', { agentId, updates });
  }

  /**
   * Set a single state value
   */
  setState(agentId: string, property: string, value: unknown): void {
    this.updateState(agentId, { [property]: value });
  }

  /**
   * Get agent state
   */
  getState(agentId: string): Record<string, unknown> {
    const state = this.agentStates.get(agentId);
    if (!state) {
      throw new Error(`Agent not registered: ${agentId}`);
    }
    return { ...state.values };
  }

  /**
   * Get a specific state value
   */
  getStateValue(agentId: string, property: string): unknown {
    return this.getState(agentId)[property];
  }

  private recordStateChange(
    agentId: string,
    property: string,
    oldValue: unknown,
    newValue: unknown,
    timestamp: number
  ): void {
    const change: StateChange = {
      agentId,
      property,
      oldValue,
      newValue,
      timestamp,
    };

    const history = this.stateHistory.get(agentId);
    if (history) {
      history.push(change);
      // Trim history
      if (history.length > this.config.maxStateHistory) {
        history.shift();
      }
    }

    this.emit('stateChanged', change);
  }

  /**
   * Get state change history
   */
  getStateHistory(agentId: string): StateChange[] {
    return [...(this.stateHistory.get(agentId) || [])];
  }

  // ===========================================================================
  // TASK TRACKING
  // ===========================================================================

  /**
   * Track a task for an agent
   */
  trackTask(agentId: string, task: InspectedTask): void {
    this.activeTasks.set(agentId, task);
    this.emit('taskTracked', { agentId, task });
  }

  /**
   * Update task progress
   */
  updateTaskProgress(agentId: string, progress: number): void {
    const task = this.activeTasks.get(agentId);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
      task.elapsed = Date.now() - task.startedAt;
      this.emit('taskProgress', { agentId, task });
    }
  }

  /**
   * Complete a task
   */
  completeTask(agentId: string): void {
    this.activeTasks.delete(agentId);
    this.emit('taskCompleted', { agentId });
  }

  /**
   * Get active task for agent
   */
  getActiveTask(agentId: string): InspectedTask | undefined {
    return this.activeTasks.get(agentId);
  }

  // ===========================================================================
  // INSPECTION
  // ===========================================================================

  /**
   * Inspect an agent's current state
   */
  inspect(agentId: string): AgentInspection {
    const manifest = this.agentManifests.get(agentId);
    if (!manifest) {
      throw new Error(`Agent not registered: ${agentId}`);
    }

    const state = this.agentStates.get(agentId);
    const task = this.activeTasks.get(agentId);
    const agentBreakpoints = this.breakpoints.get(agentId) || [];

    // Get recent events from telemetry collector
    const recentEvents = this.telemetryCollector
      ? this.telemetryCollector.getAgentEvents(agentId, this.config.maxRecentEvents)
      : [];

    // Determine agent status
    const status = this.determineAgentStatus(agentId, task, agentBreakpoints);

    const inspection: AgentInspection = {
      agentId,
      name: manifest.name,
      status,
      state: state ? { ...state.values } : {},
      capabilities:
        manifest.capabilities?.map((c: AgentCapability) => `${c.type}:${c.domain}`) || [],
      currentTask: task,
      recentEvents,
      breakpoints: agentBreakpoints,
      inspectedAt: Date.now(),
    };

    this.emit('agentInspected', inspection);
    return inspection;
  }

  /**
   * Inspect multiple agents
   */
  inspectAll(): AgentInspection[] {
    return this.getRegisteredAgents().map((id) => this.inspect(id));
  }

  private determineAgentStatus(
    agentId: string,
    task?: InspectedTask,
    breakpoints?: BreakpointInfo[]
  ): 'active' | 'idle' | 'paused' | 'stopped' {
    // Check for active breakpoint
    if (breakpoints?.some((bp) => bp.enabled && bp.hitCount > 0)) {
      return 'paused';
    }

    // Check for active task
    if (task) {
      return 'active';
    }

    // Default to idle
    return 'idle';
  }

  // ===========================================================================
  // BREAKPOINTS
  // ===========================================================================

  /**
   * Add a breakpoint
   */
  addBreakpoint(agentId: string, condition: string): BreakpointInfo {
    if (!this.agentManifests.has(agentId)) {
      throw new Error(`Agent not registered: ${agentId}`);
    }

    const breakpoint: BreakpointInfo = {
      id: `bp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      condition,
      enabled: true,
      hitCount: 0,
      createdAt: Date.now(),
    };

    const agentBreakpoints = this.breakpoints.get(agentId) || [];
    agentBreakpoints.push(breakpoint);
    this.breakpoints.set(agentId, agentBreakpoints);

    this.emit('breakpointAdded', breakpoint);
    return breakpoint;
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(breakpointId: string): boolean {
    for (const [_agentId, breakpoints] of this.breakpoints.entries()) {
      const index = breakpoints.findIndex((bp) => bp.id === breakpointId);
      if (index !== -1) {
        const removed = breakpoints.splice(index, 1)[0];
        this.emit('breakpointRemoved', removed);
        return true;
      }
    }
    return false;
  }

  /**
   * Enable/disable a breakpoint
   */
  setBreakpointEnabled(breakpointId: string, enabled: boolean): void {
    for (const breakpoints of this.breakpoints.values()) {
      const bp = breakpoints.find((b) => b.id === breakpointId);
      if (bp) {
        bp.enabled = enabled;
        this.emit('breakpointToggled', { breakpoint: bp, enabled });
        return;
      }
    }
    throw new Error(`Breakpoint not found: ${breakpointId}`);
  }

  /**
   * Get breakpoints for an agent
   */
  getBreakpoints(agentId: string): BreakpointInfo[] {
    return [...(this.breakpoints.get(agentId) || [])];
  }

  /**
   * Get all breakpoints
   */
  getAllBreakpoints(): BreakpointInfo[] {
    const all: BreakpointInfo[] = [];
    for (const breakpoints of this.breakpoints.values()) {
      all.push(...breakpoints);
    }
    return all;
  }

  /**
   * Evaluate breakpoint condition
   */
  evaluateBreakpoint(breakpointId: string, context: Record<string, unknown>): boolean {
    let breakpoint: BreakpointInfo | undefined;

    for (const breakpoints of this.breakpoints.values()) {
      breakpoint = breakpoints.find((bp) => bp.id === breakpointId);
      if (breakpoint) break;
    }

    if (!breakpoint || !breakpoint.enabled) {
      return false;
    }

    try {
      // Simple expression evaluation (production would use safe evaluation)
      const fn = new Function(...Object.keys(context), `return ${breakpoint.condition}`);
      const result = fn(...Object.values(context));
      if (result) {
        breakpoint.hitCount++;
        this.emit('breakpointHit', { breakpoint, context });
      }
      return !!result;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Clear all data
   */
  clear(): void {
    this.agentManifests.clear();
    this.agentStates.clear();
    this.stateHistory.clear();
    this.activeTasks.clear();
    this.breakpoints.clear();
  }

  /**
   * Destroy the inspector
   */
  destroy(): void {
    this.clear();
    this.removeAllListeners();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultInspector: AgentInspector | null = null;

/**
 * Get or create the default AgentInspector instance
 */
export function getAgentInspector(options?: {
  config?: Partial<InspectorConfig>;
  telemetryCollector?: TelemetryCollector;
}): AgentInspector {
  if (!defaultInspector) {
    defaultInspector = new AgentInspector(options);
  }
  return defaultInspector;
}

/**
 * Reset the default inspector (mainly for testing)
 */
export function resetAgentInspector(): void {
  if (defaultInspector) {
    defaultInspector.destroy();
    defaultInspector = null;
  }
}
