/**
 * @fileoverview HoloLand Culture Runtime — Live Norm + Memory Engine
 * @module @holoscript/core/runtime
 *
 * Wires the CulturalMemory and NormEngine into HoloLand's tick loop.
 * Manages the full lifecycle of emergent culture within a running world:
 *
 * - Agent registration and norm adoption on join
 * - Per-tick memory decay and trace evaporation
 * - Effect-based norm compliance evaluation (real-time)
 * - SOP consolidation on tick intervals
 * - Cultural health monitoring for world operators
 * - Event bus for culture-related notifications
 *
 * @version 1.0.0
 */

import {
  CulturalMemory,
  EpisodicMemory,
  StigmergicTrace,
  SemanticSOP,
} from '@holoscript/core';
import { NormEngine, NormViolation, NormProposal } from '@holoscript/core';
import { CulturalNorm, NormEnforcement, BUILTIN_NORMS } from '@holoscript/core';
import { VREffect } from '@holoscript/core';

// =============================================================================
// CULTURE RUNTIME
// =============================================================================

/** A culture event emitted by the runtime */
export interface CultureEvent {
  type:
    | 'violation'
    | 'norm_adopted'
    | 'norm_proposed'
    | 'sop_formed'
    | 'cultural_shift'
    | 'trace_reinforced';
  agentId: string;
  normId?: string;
  details: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
}

/** Culture runtime configuration */
export interface CultureRuntimeConfig {
  /** Ticks between SOP consolidation runs */
  consolidationInterval: number;
  /** Ticks between adoption curve snapshots */
  snapshotInterval: number;
  /** Default norms all agents must adopt */
  defaultNorms: string[];
  /** Cultural health warning threshold (0-1) */
  healthWarningThreshold: number;
  /** Max events to retain */
  maxEventHistory: number;
  /** Enable auto-enforcement (block hard violations) */
  autoEnforce: boolean;
}

const DEFAULT_CONFIG: CultureRuntimeConfig = {
  consolidationInterval: 100,
  snapshotInterval: 10,
  defaultNorms: ['no_griefing', 'fair_trade'],
  healthWarningThreshold: 0.5,
  maxEventHistory: 500,
  autoEnforce: true,
};

/**
 * CultureRuntime — manages emergent culture within a HoloLand world.
 */
export class CultureRuntime {
  private config: CultureRuntimeConfig;
  private memory: CulturalMemory;
  private norms: NormEngine;
  private events: CultureEvent[] = [];
  private tickCount: number = 0;
  private agents: Set<string> = new Set();
  private lastHealthScore: number = 1;

  constructor(config: Partial<CultureRuntimeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memory = new CulturalMemory();
    this.norms = new NormEngine();
  }

  // ── Agent Lifecycle ──────────────────────────────────────────────────────

  /**
   * Agent joins the world.
   */
  agentJoin(agentId: string, adoptNorms?: string[]): void {
    this.agents.add(agentId);
    const normsToAdopt = adoptNorms || this.config.defaultNorms;
    this.norms.registerAgent(agentId, normsToAdopt);
    this.emit({
      type: 'norm_adopted',
      agentId,
      details: `Agent joined, adopted ${normsToAdopt.length} norms`,
      timestamp: this.tickCount,
      severity: 'info',
    });
  }

  /**
   * Agent leaves the world (consolidate their knowledge first).
   */
  agentLeave(agentId: string): SemanticSOP[] {
    const sops = this.memory.consolidate(agentId);
    this.agents.delete(agentId);
    return sops;
  }

  // ── Tick Loop ────────────────────────────────────────────────────────────

  /**
   * Main tick: advance the culture simulation.
   * Call this once per world tick.
   */
  tick(): { decayed: ReturnType<CulturalMemory['tick']>; events: CultureEvent[] } {
    this.tickCount++;
    const tickEvents: CultureEvent[] = [];

    // 1. Decay memories and traces
    const decayed = this.memory.tick();

    // 2. Advance norms (record adoption snapshots)
    if (this.tickCount % this.config.snapshotInterval === 0) {
      this.norms.tick();
    }

    // 3. Periodic SOP consolidation
    if (this.tickCount % this.config.consolidationInterval === 0) {
      for (const agentId of this.agents) {
        const sops = this.memory.consolidate(agentId);
        for (const sop of sops) {
          const event: CultureEvent = {
            type: 'sop_formed',
            agentId,
            normId: sop.normId,
            details: `Formed SOP: ${sop.description}`,
            timestamp: this.tickCount,
            severity: 'info',
          };
          tickEvents.push(event);
          this.emit(event);
        }
      }
    }

    // 4. Cultural health monitoring
    const health = this.norms.culturalHealth();
    if (
      health < this.config.healthWarningThreshold &&
      this.lastHealthScore >= this.config.healthWarningThreshold
    ) {
      const event: CultureEvent = {
        type: 'cultural_shift',
        agentId: 'system',
        details: `Cultural health dropped below ${this.config.healthWarningThreshold} (current: ${health.toFixed(2)})`,
        timestamp: this.tickCount,
        severity: 'warning',
      };
      tickEvents.push(event);
      this.emit(event);
    }
    this.lastHealthScore = health;

    return { decayed, events: tickEvents };
  }

  // ── Effect Evaluation ────────────────────────────────────────────────────

  /**
   * Evaluate an agent's intended effects against active norms.
   * Called before allowing the agent to execute an action.
   *
   * @returns Whether the action is allowed (true) or blocked (false)
   */
  evaluateAction(
    agentId: string,
    effects: VREffect[],
    zoneId?: string
  ): {
    allowed: boolean;
    violations: NormViolation[];
    blocked: VREffect[];
  } {
    const violations = this.norms.evaluate(agentId, effects, zoneId);

    // Record violations and compliance
    for (const v of violations) {
      this.norms.recordViolation(v);
      this.memory.record(agentId, `Violated norm '${v.normId}' via effect '${v.effect}'`, {
        normId: v.normId,
        valence: -0.8,
        importance: 0.9,
        tags: ['violation'],
      });
      this.emit({
        type: 'violation',
        agentId,
        normId: v.normId,
        details: `Violated '${v.normId}' with effect '${v.effect}'`,
        timestamp: this.tickCount,
        severity: v.severity === 'hard' ? 'critical' : 'warning',
      });
    }

    // Determine if action is blocked (hard enforcement)
    const hardViolations = violations.filter((v) => v.severity === 'hard');
    const blocked = this.config.autoEnforce ? hardViolations.map((v) => v.effect) : [];
    const allowed = this.config.autoEnforce ? hardViolations.length === 0 : true;

    // Record compliance for non-violated norms
    if (violations.length === 0) {
      for (const normId of this.config.defaultNorms) {
        this.norms.recordCompliance(agentId, normId);
      }
    }

    return { allowed, violations, blocked };
  }

  // ── Memory Operations ────────────────────────────────────────────────────

  /**
   * Record an experience for an agent.
   */
  recordExperience(
    agentId: string,
    event: string,
    opts: {
      normId?: string;
      valence?: number;
      importance?: number;
      participants?: string[];
      tags?: string[];
    } = {}
  ): EpisodicMemory {
    return this.memory.record(agentId, event, opts);
  }

  /**
   * Leave a trace in the world.
   */
  leaveTrace(
    agentId: string,
    zoneId: string,
    label: string,
    position: { x: number; y: number; z: number }
  ): StigmergicTrace {
    return this.memory.leaveTrace(agentId, zoneId, label, position);
  }

  /**
   * Perceive nearby traces.
   */
  perceiveTraces(zoneId: string, position: { x: number; y: number; z: number }): StigmergicTrace[] {
    return this.memory.perceiveTraces(zoneId, position);
  }

  // ── Norm Operations ──────────────────────────────────────────────────────

  /**
   * Propose a new norm.
   */
  proposeNorm(agentId: string, norm: CulturalNorm): NormProposal {
    const proposal = this.norms.proposeNorm(agentId, norm);
    this.emit({
      type: 'norm_proposed',
      agentId,
      normId: norm.id,
      details: `Proposed norm '${norm.name}'`,
      timestamp: this.tickCount,
      severity: 'info',
    });
    return proposal;
  }

  // ── Monitoring ───────────────────────────────────────────────────────────

  /**
   * Get cultural dashboard data.
   */
  dashboard(): {
    health: number;
    agents: number;
    normStats: ReturnType<NormEngine['stats']>;
    memoryStats: ReturnType<CulturalMemory['stats']>;
    recentEvents: CultureEvent[];
    tickCount: number;
  } {
    return {
      health: this.norms.culturalHealth(),
      agents: this.agents.size,
      normStats: this.norms.stats(),
      memoryStats: this.memory.stats(),
      recentEvents: this.events.slice(-20),
      tickCount: this.tickCount,
    };
  }

  /**
   * Get event history.
   */
  getEvents(filter?: { type?: CultureEvent['type']; agentId?: string }): CultureEvent[] {
    let events = this.events;
    if (filter?.type) events = events.filter((e) => e.type === filter.type);
    if (filter?.agentId) events = events.filter((e) => e.agentId === filter.agentId);
    return events;
  }

  /**
   * Export full culture state (for world save).
   */
  exportState(): { memory: ReturnType<CulturalMemory['exportState']>; tickCount: number } {
    return { memory: this.memory.exportState(), tickCount: this.tickCount };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private emit(event: CultureEvent): void {
    this.events.push(event);
    if (this.events.length > this.config.maxEventHistory) {
      this.events = this.events.slice(-this.config.maxEventHistory);
    }
  }
}
