/**
 * Agent Debugger
 * Sprint 4 Priority 8 - Agent Debugging & Telemetry
 *
 * Main debugger interface for inspecting, tracing, and debugging agents.
 */

import { EventEmitter } from 'events';
import { logger } from '../logger';
import type { AgentManifest } from '@holoscript/framework/agents';
import {
  TelemetryCollector,
  getTelemetryCollector,
  resetTelemetryCollector,
} from './TelemetryCollector';
import {
  AgentInspector,
  getAgentInspector,
  resetAgentInspector,
  type StateChange,
} from './AgentInspector';
import type {
  AgentInspection,
  TraceSpan,
  BreakpointInfo,
  BreakpointContext,
  SessionRecording,
  ReplayState,
  TelemetryEvent,
  DebuggerConfig,
} from './TelemetryTypes';
import { DEFAULT_DEBUGGER_CONFIG } from './TelemetryTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Debug session state
 */
export interface DebugSession {
  /** Session ID */
  id: string;
  /** Start time */
  startTime: number;
  /** Session name */
  name: string;
  /** Whether session is recording */
  isRecording: boolean;
  /** Recorded events */
  events: TelemetryEvent[];
  /** Recorded spans */
  spans: TraceSpan[];
  /** Agent IDs in session */
  agentIds: Set<string>;
}

/**
 * Paused execution state
 */
interface PausedState {
  agentId: string;
  breakpoint: BreakpointInfo;
  context: BreakpointContext;
  resumeCallback?: () => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// =============================================================================
// AGENT DEBUGGER
// =============================================================================

/**
 * AgentDebugger - Main interface for debugging agents
 *
 * Provides:
 * - Agent inspection (state, tasks, capabilities)
 * - Distributed tracing (spans, events)
 * - Session recording and replay
 * - Conditional breakpoints
 */
export class AgentDebugger extends EventEmitter {
  private config: DebuggerConfig;
  private collector: TelemetryCollector;
  private inspector: AgentInspector;
  private sessions: Map<string, DebugSession> = new Map();
  private recordings: Map<string, SessionRecording> = new Map();
  private activeSession?: DebugSession;
  private pausedStates: Map<string, PausedState> = new Map();
  private replayState?: ReplayState;

  constructor(
    options: {
      config?: Partial<DebuggerConfig>;
      collector?: TelemetryCollector;
      inspector?: AgentInspector;
    } = {}
  ) {
    super();
    this.config = { ...DEFAULT_DEBUGGER_CONFIG, ...options.config };
    this.collector = options.collector || getTelemetryCollector();
    this.inspector = options.inspector || getAgentInspector({ telemetryCollector: this.collector });

    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Forward telemetry events to active session
    this.collector.on('event', (event: TelemetryEvent) => {
      if (this.activeSession?.isRecording) {
        this.activeSession.events.push(event);
        this.activeSession.agentIds.add(event.agentId);
      }
      this.emit('telemetryEvent', event);
    });

    this.collector.on('spanEnd', (span: TraceSpan) => {
      if (this.activeSession?.isRecording) {
        this.activeSession.spans.push(span);
      }
    });

    // Forward inspector events
    this.inspector.on('breakpointHit', ({ breakpoint, context }) => {
      this.handleBreakpointHit(breakpoint, context);
    });
  }

  // ===========================================================================
  // INSPECTION
  // ===========================================================================

  /**
   * Inspect an agent's current state
   */
  inspect(agentId: string): AgentInspection {
    return this.inspector.inspect(agentId);
  }

  /**
   * Inspect all registered agents
   */
  inspectAll(): AgentInspection[] {
    return this.inspector.inspectAll();
  }

  /**
   * Get state change history for an agent
   */
  getStateHistory(agentId: string): StateChange[] {
    return this.inspector.getStateHistory(agentId);
  }

  /**
   * Register an agent for debugging
   */
  registerAgent(manifest: AgentManifest, initialState: Record<string, unknown> = {}): void {
    this.inspector.registerAgent(manifest, initialState);
    this.collector.recordEvent('agent_registered', manifest.id, {
      name: manifest.name,
      capabilities: manifest.capabilities,
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.collector.recordEvent('agent_deregistered', agentId);
    this.inspector.unregisterAgent(agentId);
  }

  // ===========================================================================
  // TRACING
  // ===========================================================================

  /**
   * Get all spans for a trace/correlation ID
   */
  trace(correlationId: string): TraceSpan[] {
    return this.collector.getTraceSpans(correlationId);
  }

  /**
   * Start a new trace span
   */
  startSpan(
    name: string,
    options: {
      agentId?: string;
      parentSpanId?: string;
      attributes?: Record<string, unknown>;
    } = {}
  ): TraceSpan {
    const parentSpan = options.parentSpanId
      ? this.collector.getSpan(options.parentSpanId)
      : undefined;

    return this.collector.startSpan(name, {
      agentId: options.agentId,
      parentContext: parentSpan?.context,
      attributes: options.attributes,
    });
  }

  /**
   * End a trace span
   */
  endSpan(spanId: string, status: 'ok' | 'error' = 'ok', message?: string): TraceSpan {
    return this.collector.endSpan(spanId, status, message);
  }

  /**
   * Get recent events for an agent
   */
  getAgentEvents(agentId: string, limit?: number): TelemetryEvent[] {
    return this.collector.getAgentEvents(agentId, limit);
  }

  // ===========================================================================
  // SESSION RECORDING & REPLAY
  // ===========================================================================

  /**
   * Start a new debug session
   */
  startSession(name: string, autoRecord: boolean = this.config.autoRecord): DebugSession {
    const session: DebugSession = {
      id: this.generateId(),
      name,
      startTime: Date.now(),
      isRecording: autoRecord,
      events: [],
      spans: [],
      agentIds: new Set(),
    };

    this.sessions.set(session.id, session);
    this.activeSession = session;

    this.emit('sessionStarted', session);
    logger.debug(`[AgentDebugger] Session started: ${session.id} (${name})`);

    return session;
  }

  /**
   * Stop the current session
   */
  stopSession(): SessionRecording | null {
    if (!this.activeSession) return null;

    const session = this.activeSession;
    const endTime = Date.now();

    // Create recording
    const recording: SessionRecording = {
      id: session.id,
      name: session.name,
      startTime: session.startTime,
      endTime,
      duration: endTime - session.startTime,
      events: [...session.events],
      spans: [...session.spans],
      agentIds: Array.from(session.agentIds),
      metadata: {},
    };

    // Store recording
    if (this.recordings.size >= this.config.maxRecordings) {
      // Remove oldest recording
      const oldest = Array.from(this.recordings.keys())[0];
      this.recordings.delete(oldest);
    }
    this.recordings.set(recording.id, recording);

    this.sessions.delete(session.id);
    this.activeSession = undefined;

    this.emit('sessionStopped', recording);
    logger.debug(`[AgentDebugger] Session stopped: ${session.id}`);

    return recording;
  }

  /**
   * Start recording in the current session
   */
  startRecording(): void {
    if (this.activeSession) {
      this.activeSession.isRecording = true;
      this.emit('recordingStarted', { sessionId: this.activeSession.id });
    }
  }

  /**
   * Stop recording in the current session
   */
  stopRecording(): void {
    if (this.activeSession) {
      this.activeSession.isRecording = false;
      this.emit('recordingStopped', { sessionId: this.activeSession.id });
    }
  }

  /**
   * Get a session recording
   */
  getRecording(sessionId: string): SessionRecording | undefined {
    return this.recordings.get(sessionId);
  }

  /**
   * Get all recordings
   */
  getRecordings(): SessionRecording[] {
    return Array.from(this.recordings.values());
  }

  /**
   * Replay a recorded session
   */
  replay(sessionId: string, options: { speed?: number; startPosition?: number } = {}): void {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      throw new Error(`Recording not found: ${sessionId}`);
    }

    this.replayState = {
      sessionId,
      position: options.startPosition || 0,
      currentTime: recording.startTime,
      speed: options.speed || 1.0,
      paused: false,
      eventIndex: 0,
    };

    this.emit('replayStarted', {
      sessionId,
      recording,
      state: this.replayState,
    });

    this.executeReplay(recording);
  }

  /**
   * Pause replay
   */
  pauseReplay(): void {
    if (this.replayState) {
      this.replayState.paused = true;
      this.emit('replayPaused', this.replayState);
    }
  }

  /**
   * Resume replay
   */
  resumeReplay(): void {
    if (this.replayState && this.replayState.paused) {
      this.replayState.paused = false;
      const recording = this.recordings.get(this.replayState.sessionId);
      if (recording) {
        this.executeReplay(recording);
      }
    }
  }

  /**
   * Stop replay
   */
  stopReplay(): void {
    if (this.replayState) {
      const state = this.replayState;
      this.replayState = undefined;
      this.emit('replayStopped', state);
    }
  }

  /**
   * Seek to a position in replay (0-100)
   */
  seekReplay(position: number): void {
    if (!this.replayState) return;

    const recording = this.recordings.get(this.replayState.sessionId);
    if (!recording) return;

    const normalizedPosition = Math.min(100, Math.max(0, position));
    const targetTime = recording.startTime + (recording.duration * normalizedPosition) / 100;

    this.replayState.position = normalizedPosition;
    this.replayState.currentTime = targetTime;

    // Find matching event index
    this.replayState.eventIndex = recording.events.findIndex((e) => e.timestamp >= targetTime);
    if (this.replayState.eventIndex === -1) {
      this.replayState.eventIndex = recording.events.length;
    }

    this.emit('replaySeek', this.replayState);
  }

  private async executeReplay(recording: SessionRecording): Promise<void> {
    if (!this.replayState) return;

    const events = recording.events;
    const speed = this.replayState.speed;

    while (
      this.replayState &&
      !this.replayState.paused &&
      this.replayState.eventIndex < events.length
    ) {
      const event = events[this.replayState.eventIndex];

      // Calculate delay
      const prevEvent = events[this.replayState.eventIndex - 1];
      if (prevEvent) {
        const delay = (event.timestamp - prevEvent.timestamp) / speed;
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 1000)));
        }
      }

      if (!this.replayState || this.replayState.paused) break;

      // Emit replayed event
      this.emit('replayEvent', {
        event,
        index: this.replayState.eventIndex,
        total: events.length,
      });

      this.replayState.eventIndex++;
      this.replayState.currentTime = event.timestamp;
      this.replayState.position =
        ((event.timestamp - recording.startTime) / recording.duration) * 100;
    }

    // Replay complete
    if (this.replayState && this.replayState.eventIndex >= events.length) {
      this.emit('replayComplete', this.replayState);
      this.replayState = undefined;
    }
  }

  // ===========================================================================
  // BREAKPOINTS
  // ===========================================================================

  /**
   * Set a breakpoint on an agent
   */
  breakpoint(agentId: string, condition: string): BreakpointInfo {
    const agentBreakpoints = this.inspector.getBreakpoints(agentId);

    if (agentBreakpoints.length >= this.config.maxBreakpoints) {
      throw new Error(
        `Maximum breakpoints (${this.config.maxBreakpoints}) reached for agent: ${agentId}`
      );
    }

    return this.inspector.addBreakpoint(agentId, condition);
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(breakpointId: string): boolean {
    return this.inspector.removeBreakpoint(breakpointId);
  }

  /**
   * Get all breakpoints for an agent
   */
  getBreakpoints(agentId: string): BreakpointInfo[] {
    return this.inspector.getBreakpoints(agentId);
  }

  /**
   * Get all breakpoints
   */
  getAllBreakpoints(): BreakpointInfo[] {
    return this.inspector.getAllBreakpoints();
  }

  /**
   * Enable/disable a breakpoint
   */
  setBreakpointEnabled(breakpointId: string, enabled: boolean): void {
    this.inspector.setBreakpointEnabled(breakpointId, enabled);
  }

  /**
   * Check breakpoints for an agent (call from agent code)
   */
  checkBreakpoints(context: BreakpointContext): Promise<void> {
    if (!this.config.enabled) return Promise.resolve();

    const breakpoints = this.inspector.getBreakpoints(context.agentId);

    for (const bp of breakpoints) {
      if (!bp.enabled) continue;

      const hit = this.inspector.evaluateBreakpoint(bp.id, {
        ...context.state,
        ...context.variables,
        event: context.event,
      });

      if (hit) {
        return this.pauseAtBreakpoint(context.agentId, bp, context);
      }
    }

    return Promise.resolve();
  }

  private handleBreakpointHit(breakpoint: BreakpointInfo, _context: Record<string, unknown>): void {
    this.collector.recordEvent('breakpoint_hit', breakpoint.agentId, {
      breakpointId: breakpoint.id,
      condition: breakpoint.condition,
      hitCount: breakpoint.hitCount,
    });
  }

  private pauseAtBreakpoint(
    agentId: string,
    breakpoint: BreakpointInfo,
    context: BreakpointContext
  ): Promise<void> {
    return new Promise((resolve) => {
      const pausedState: PausedState = {
        agentId,
        breakpoint,
        context,
        resumeCallback: resolve,
      };

      // Auto-resume timeout
      if (this.config.breakpointTimeout > 0) {
        pausedState.timeoutHandle = setTimeout(() => {
          this.resumeExecution(agentId);
        }, this.config.breakpointTimeout);
      }

      this.pausedStates.set(agentId, pausedState);

      this.emit('executionPaused', {
        agentId,
        breakpoint,
        context,
      });

      logger.info(`[AgentDebugger] Execution paused at breakpoint: ${breakpoint.id}`);
    });
  }

  /**
   * Resume execution for a paused agent
   */
  resumeExecution(agentId: string): void {
    const pausedState = this.pausedStates.get(agentId);
    if (!pausedState) return;

    // Clear timeout
    if (pausedState.timeoutHandle) {
      clearTimeout(pausedState.timeoutHandle);
    }

    // Resume
    this.pausedStates.delete(agentId);

    if (pausedState.resumeCallback) {
      pausedState.resumeCallback();
    }

    this.emit('executionResumed', { agentId });
    logger.info(`[AgentDebugger] Execution resumed for agent: ${agentId}`);
  }

  /**
   * Check if an agent is paused
   */
  isPaused(agentId: string): boolean {
    return this.pausedStates.has(agentId);
  }

  /**
   * Get all paused agents
   */
  getPausedAgents(): string[] {
    return Array.from(this.pausedStates.keys());
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Get current session
   */
  getCurrentSession(): DebugSession | undefined {
    return this.activeSession;
  }

  /**
   * Get replay state
   */
  getReplayState(): ReplayState | undefined {
    return this.replayState ? { ...this.replayState } : undefined;
  }

  /**
   * Enable or disable the debugger
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if debugger is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Clear all sessions and recordings
   */
  clear(): void {
    this.sessions.clear();
    this.recordings.clear();
    this.activeSession = undefined;
    this.pausedStates.clear();
    this.replayState = undefined;
  }

  /**
   * Destroy the debugger
   */
  destroy(): void {
    // Resume all paused agents
    for (const agentId of this.pausedStates.keys()) {
      this.resumeExecution(agentId);
    }

    this.clear();
    this.removeAllListeners();
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private generateId(): string {
    return `debug-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultDebugger: AgentDebugger | null = null;

/**
 * Get or create the default AgentDebugger instance
 */
export function getAgentDebugger(options?: { config?: Partial<DebuggerConfig> }): AgentDebugger {
  if (!defaultDebugger) {
    defaultDebugger = new AgentDebugger(options);
  }
  return defaultDebugger;
}

/**
 * Reset the default debugger (mainly for testing)
 */
export function resetAgentDebugger(): void {
  if (defaultDebugger) {
    defaultDebugger.destroy();
    defaultDebugger = null;
  }
  // Also reset dependencies
  resetAgentInspector();
  resetTelemetryCollector();
}
