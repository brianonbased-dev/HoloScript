/**
 * @fileoverview Cultural Memory — Dual Memory Architecture
 * @module @holoscript/core/agents
 *
 * Implements the dual memory model for emergent agent culture:
 * - Episodic Memory: Personal experiences with temporal decay
 * - Stigmergic Memory: Environmental traces visible to all agents
 *
 * Memory consolidation converts repeated episodic patterns into
 * Semantic SOPs (Standard Operating Procedures) — the mechanism
 * by which culture persists across sessions.
 *
 * Based on:
 * - P.025.03: Lifelong Team Memory Pattern
 * - MemAgents (ICLR 2026): Memory for LLM-Based Agentic Systems
 * - CRSEC Framework: Norm spreading through shared memory
 *
 * @version 1.0.0
 */

// =============================================================================
// MEMORY TYPES
// =============================================================================

/** An episodic memory entry — a single experience */
export interface EpisodicMemory {
  id: string;
  agentId: string;
  /** What happened */
  event: string;
  /** Who was involved */
  participants: string[];
  /** Emotional valence (-1 = negative, 0 = neutral, 1 = positive) */
  valence: number;
  /** Importance score (0-1) */
  importance: number;
  /** When it happened (tick number) */
  timestamp: number;
  /** Current strength (decays over time) */
  strength: number;
  /** Associated norm (if this experience relates to a norm) */
  normId?: string;
  /** Tags for retrieval */
  tags: string[];
}

/** A stigmergic trace — environmental memory visible to all */
export interface StigmergicTrace {
  id: string;
  /** Creator */
  creatorId: string;
  /** Spatial position */
  position: { x: number; y: number; z: number };
  /** Zone the trace belongs to */
  zoneId: string;
  /** Type of trace */
  type: 'marker' | 'path' | 'signal' | 'artifact' | 'boundary';
  /** What this trace communicates */
  label: string;
  /** Current intensity (decays toward 0) */
  intensity: number;
  /** Initial intensity */
  initialIntensity: number;
  /** Decay rate per tick */
  decayRate: number;
  /** Perception radius */
  radius: number;
  /** When created */
  timestamp: number;
  /** Reinforcement count (how many agents have "validated" this trace) */
  reinforcements: number;
}

/** A semantic SOP — consolidated cultural knowledge */
export interface SemanticSOP {
  id: string;
  /** The norm or convention this SOP encodes */
  normId: string;
  /** Human-readable description */
  description: string;
  /** Conditions under which this SOP applies */
  conditions: string[];
  /** Recommended actions */
  actions: string[];
  /** Confidence (0-1, increases with more supporting episodes) */
  confidence: number;
  /** Number of episodes that contributed to this SOP */
  episodeCount: number;
  /** When consolidated */
  createdAt: number;
  /** Last updated */
  updatedAt: number;
}

// =============================================================================
// CULTURAL MEMORY
// =============================================================================

export interface CulturalMemoryConfig {
  /** Max episodic memories per agent */
  episodicCapacity: number;
  /** Decay rate per tick (0-1) */
  episodicDecayRate: number;
  /** Max stigmergic traces per zone */
  stigmergicCapacity: number;
  /** Default trace decay rate */
  traceDecayRate: number;
  /** Min episodes before SOP consolidation */
  consolidationThreshold: number;
  /** Min confidence for SOP retention */
  sopRetentionThreshold: number;
}

const DEFAULT_CONFIG: CulturalMemoryConfig = {
  episodicCapacity: 100,
  episodicDecayRate: 0.01,
  stigmergicCapacity: 500,
  traceDecayRate: 0.005,
  consolidationThreshold: 5,
  sopRetentionThreshold: 0.3,
};

/**
 * CulturalMemory — dual memory system for emergent agent culture.
 *
 * Manages three memory tiers:
 * 1. Episodic (per-agent, decaying personal experiences)
 * 2. Stigmergic (spatial, shared environmental traces)
 * 3. Semantic (consolidated SOPs from repeated patterns)
 */
export class CulturalMemory {
  private config: CulturalMemoryConfig;
  private episodic: Map<string, EpisodicMemory[]> = new Map(); // agentId → memories
  private stigmergic: Map<string, StigmergicTrace[]> = new Map(); // zoneId → traces
  private sops: Map<string, SemanticSOP> = new Map(); // sopId → SOP
  private currentTick: number = 0;

  constructor(config: Partial<CulturalMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Episodic Memory ──────────────────────────────────────────────────────

  /**
   * Record an episodic memory for an agent.
   */
  record(
    agentId: string,
    event: string,
    opts: Partial<Omit<EpisodicMemory, 'id' | 'agentId' | 'event' | 'strength' | 'timestamp'>> = {}
  ): EpisodicMemory {
    const memories = this.episodic.get(agentId) || [];
    const memory: EpisodicMemory = {
      id: `ep_${agentId}_${this.currentTick}_${memories.length}`,
      agentId,
      event,
      participants: opts.participants || [],
      valence: opts.valence ?? 0,
      importance: opts.importance ?? 0.5,
      timestamp: this.currentTick,
      strength: 1.0,
      normId: opts.normId,
      tags: opts.tags || [],
    };

    memories.push(memory);

    // Evict oldest if over capacity
    if (memories.length > this.config.episodicCapacity) {
      memories.sort((a, b) => b.strength * b.importance - a.strength * a.importance);
      memories.length = this.config.episodicCapacity;
    }

    this.episodic.set(agentId, memories);
    return memory;
  }

  /**
   * Recall memories for an agent, optionally filtered.
   */
  recall(
    agentId: string,
    filter?: { normId?: string; tags?: string[]; minStrength?: number }
  ): EpisodicMemory[] {
    const memories = this.episodic.get(agentId) || [];
    return memories
      .filter((m) => {
        if (filter?.minStrength && m.strength < filter.minStrength) return false;
        if (filter?.normId && m.normId !== filter.normId) return false;
        if (filter?.tags && !filter.tags.some((t) => m.tags.includes(t))) return false;
        return true;
      })
      .sort((a, b) => b.strength * b.importance - a.strength * a.importance);
  }

  /**
   * Get the number of memories for an agent.
   */
  memoryCount(agentId: string): number {
    return (this.episodic.get(agentId) || []).length;
  }

  // ── Stigmergic Memory ────────────────────────────────────────────────────

  /**
   * Leave a stigmergic trace in the environment.
   */
  leaveTrace(
    creatorId: string,
    zoneId: string,
    label: string,
    position: { x: number; y: number; z: number },
    opts: Partial<
      Omit<
        StigmergicTrace,
        'id' | 'creatorId' | 'zoneId' | 'label' | 'position' | 'timestamp' | 'reinforcements'
      >
    > = {}
  ): StigmergicTrace {
    const traces = this.stigmergic.get(zoneId) || [];
    const intensity = opts.intensity ?? opts.initialIntensity ?? 1.0;
    const trace: StigmergicTrace = {
      id: `st_${zoneId}_${this.currentTick}_${traces.length}`,
      creatorId,
      position,
      zoneId,
      type: opts.type || 'marker',
      label,
      intensity,
      initialIntensity: intensity,
      decayRate: opts.decayRate ?? this.config.traceDecayRate,
      radius: opts.radius ?? 10,
      timestamp: this.currentTick,
      reinforcements: 0,
    };

    traces.push(trace);

    // Evict weakest if over capacity
    if (traces.length > this.config.stigmergicCapacity) {
      traces.sort((a, b) => b.intensity - a.intensity);
      traces.length = this.config.stigmergicCapacity;
    }

    this.stigmergic.set(zoneId, traces);
    return trace;
  }

  /**
   * Perceive nearby traces from a position.
   */
  perceiveTraces(zoneId: string, position: { x: number; y: number; z: number }): StigmergicTrace[] {
    const traces = this.stigmergic.get(zoneId) || [];
    return traces
      .filter((t) => {
        const dx = t.position.x - position.x;
        const dy = t.position.y - position.y;
        const dz = t.position.z - position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist <= t.radius && t.intensity > 0.01;
      })
      .sort((a, b) => b.intensity - a.intensity);
  }

  /**
   * Reinforce a trace (another agent validates it).
   * Increases intensity and slows decay.
   */
  reinforceTrace(traceId: string, zoneId: string): boolean {
    const traces = this.stigmergic.get(zoneId) || [];
    const trace = traces.find((t) => t.id === traceId);
    if (!trace) return false;
    trace.reinforcements++;
    trace.intensity = Math.min(trace.initialIntensity * 2, trace.intensity + 0.1);
    trace.decayRate *= 0.95; // Slow decay with each reinforcement
    return true;
  }

  /**
   * Get all traces in a zone.
   */
  zoneTraces(zoneId: string): StigmergicTrace[] {
    return (this.stigmergic.get(zoneId) || []).filter((t) => t.intensity > 0.01);
  }

  // ── Semantic SOPs ────────────────────────────────────────────────────────

  /**
   * Attempt to consolidate episodic memories into a semantic SOP.
   * Finds repeated patterns (same normId, high frequency) and forms SOPs.
   */
  consolidate(agentId: string): SemanticSOP[] {
    const memories = this.episodic.get(agentId) || [];
    const newSops: SemanticSOP[] = [];

    // Group by normId
    const byNorm = new Map<string, EpisodicMemory[]>();
    for (const m of memories) {
      if (m.normId) {
        const group = byNorm.get(m.normId) || [];
        group.push(m);
        byNorm.set(m.normId, group);
      }
    }

    for (const [normId, episodes] of byNorm) {
      if (episodes.length < this.config.consolidationThreshold) continue;

      const existing = this.sops.get(`sop_${agentId}_${normId}`);
      if (existing) {
        // Update existing SOP
        existing.episodeCount = episodes.length;
        existing.confidence = Math.min(
          1,
          episodes.length / (this.config.consolidationThreshold * 3)
        );
        existing.updatedAt = this.currentTick;
        continue;
      }

      // Create new SOP
      const avgValence = episodes.reduce((s, e) => s + e.valence, 0) / episodes.length;
      const sop: SemanticSOP = {
        id: `sop_${agentId}_${normId}`,
        normId,
        description: `Learned behavior for norm '${normId}' from ${episodes.length} experiences (avg valence: ${avgValence.toFixed(2)})`,
        conditions: [...new Set(episodes.flatMap((e) => e.tags))],
        actions: avgValence > 0 ? ['comply', 'reinforce'] : ['avoid', 'report'],
        confidence: Math.min(1, episodes.length / (this.config.consolidationThreshold * 3)),
        episodeCount: episodes.length,
        createdAt: this.currentTick,
        updatedAt: this.currentTick,
      };

      this.sops.set(sop.id, sop);
      newSops.push(sop);
    }

    return newSops;
  }

  /**
   * Get all SOPs for an agent.
   */
  getSOPs(agentId: string): SemanticSOP[] {
    const prefix = `sop_${agentId}_`;
    return [...this.sops.values()].filter((s) => s.id.startsWith(prefix));
  }

  /**
   * Get a specific SOP by agent and norm.
   */
  getSOP(agentId: string, normId: string): SemanticSOP | undefined {
    return this.sops.get(`sop_${agentId}_${normId}`);
  }

  // ── Tick / Lifecycle ─────────────────────────────────────────────────────

  /**
   * Advance one tick: decay memories and traces, prune dead entries.
   */
  tick(): { decayedMemories: number; evaporatedTraces: number } {
    this.currentTick++;
    let decayedMemories = 0;
    let evaporatedTraces = 0;

    // Decay episodic memories
    for (const [agentId, memories] of this.episodic) {
      for (const m of memories) {
        m.strength *= 1 - this.config.episodicDecayRate;
      }
      const before = memories.length;
      const alive = memories.filter((m) => m.strength > 0.01);
      decayedMemories += before - alive.length;
      this.episodic.set(agentId, alive);
    }

    // Decay stigmergic traces
    for (const [zoneId, traces] of this.stigmergic) {
      for (const t of traces) {
        t.intensity -= t.decayRate;
      }
      const before = traces.length;
      const alive = traces.filter((t) => t.intensity > 0.01);
      evaporatedTraces += before - alive.length;
      this.stigmergic.set(zoneId, alive);
    }

    // Prune low-confidence SOPs
    for (const [id, sop] of this.sops) {
      if (sop.confidence < this.config.sopRetentionThreshold) {
        this.sops.delete(id);
      }
    }

    return { decayedMemories, evaporatedTraces };
  }

  /**
   * Get current tick.
   */
  getTick(): number {
    return this.currentTick;
  }

  /**
   * Get global statistics.
   */
  stats(): {
    agents: number;
    totalMemories: number;
    totalTraces: number;
    totalSOPs: number;
    zones: number;
  } {
    let totalMemories = 0;
    let totalTraces = 0;
    for (const mems of this.episodic.values()) totalMemories += mems.length;
    for (const traces of this.stigmergic.values()) totalTraces += traces.length;
    return {
      agents: this.episodic.size,
      totalMemories,
      totalTraces,
      totalSOPs: this.sops.size,
      zones: this.stigmergic.size,
    };
  }

  /**
   * Export full state for persistence / cross-session continuity.
   */
  exportState(): {
    episodic: Record<string, EpisodicMemory[]>;
    stigmergic: Record<string, StigmergicTrace[]>;
    sops: SemanticSOP[];
    tick: number;
  } {
    const episodic: Record<string, EpisodicMemory[]> = {};
    for (const [k, v] of this.episodic) episodic[k] = v;
    const stigmergic: Record<string, StigmergicTrace[]> = {};
    for (const [k, v] of this.stigmergic) stigmergic[k] = v;
    return { episodic, stigmergic, sops: [...this.sops.values()], tick: this.currentTick };
  }

  /**
   * Import state from persistence.
   */
  importState(state: ReturnType<CulturalMemory['exportState']>): void {
    for (const [k, v] of Object.entries(state.episodic)) this.episodic.set(k, v);
    for (const [k, v] of Object.entries(state.stigmergic)) this.stigmergic.set(k, v);
    for (const sop of state.sops) this.sops.set(sop.id, sop);
    this.currentTick = state.tick;
  }
}
