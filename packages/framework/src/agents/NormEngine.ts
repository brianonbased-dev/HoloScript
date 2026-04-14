/**
 * @fileoverview Norm Engine — CRSEC Norm Lifecycle Manager
 * @module @holoscript/core/agents
 *
 * Implements the complete CRSEC norm lifecycle:
 * C - Creation: Agents propose new norms
 * R - Representation: Norms stored as structured objects
 * S - Spreading: Norms propagate through agent populations
 * E - Evaluation: Agents assess norm compliance
 * C - Compliance: Enforcement and feedback loops
 *
 * Key research findings implemented:
 * - Critical mass dynamics: 2% (weak) to 25-67% (strong) for norm change
 * - Metanorms: norms about enforcing norms (cultural ratchet)
 * - Model identity as cultural DNA (different base models → different cultures)
 * - The Governance Goldilocks Zone: structure without content
 *
 * @version 1.0.0
 */

import type {
  NormEnforcement,
  NormScope,
  NormCategory,
  CulturalNorm,
} from '@holoscript/core';

/**
 * VR Effect alias. 
 * Re-defined locally to resolve persistent TS2305 error in dts build.
 */
type VREffect = string;

export const BUILTIN_NORMS: CulturalNorm[] = [
  {
    id: 'no_griefing',
    name: 'No Griefing',
    category: 'safety',
    description: 'Do not cause harm to others',
    enforcement: 'hard',
    scope: 'world',
    activationThreshold: 0.1,
    strength: 'strong',
    forbiddenEffects: ['agent:kill', 'inventory:steal'],
  },
  {
    id: 'resource_sharing',
    name: 'Resource Sharing',
    category: 'cooperation',
    description: 'Share resources when abundant',
    enforcement: 'soft',
    scope: 'world',
    activationThreshold: 0.5,
    strength: 'moderate',
    forbiddenEffects: ['inventory:hoard', 'inventory:horde'],
  },
  {
    id: 'fair_trade',
    name: 'Fair Trade',
    category: 'economy',
    description: 'Trade at mutually agreeable values',
    enforcement: 'soft',
    scope: 'world',
    activationThreshold: 0.3,
    strength: 'weak',
    forbiddenEffects: ['trade:scam', 'trade:extort'],
  },
];

export function criticalMassForChange(norm: CulturalNorm, populationSize: number): number {
  if (norm.strength === 'strong') return populationSize * 0.5;
  if (norm.strength === 'moderate') return populationSize * 0.25;
  return populationSize * 0.02;
}

export type { NormEnforcement, NormScope, NormCategory, CulturalNorm, VREffect };

export class EffectRow {
  private effects: Set<VREffect>;
  constructor(effects: VREffect[]) {
    this.effects = new Set(effects);
  }
  has(effect: VREffect): boolean {
    return this.effects.has(effect);
  }
}

// =============================================================================
// NORM STATE
// =============================================================================

/** Per-agent norm adoption state */
export interface AgentNormState {
  agentId: string;
  /** Norms this agent has adopted */
  adopted: Set<string>;
  /** Compliance score per norm (0-1) */
  compliance: Map<string, number>;
  /** Norms this agent is currently violating */
  violations: Set<string>;
  /** Norms this agent has proposed */
  proposed: Set<string>;
  /** Number of times this agent has enforced norms on others */
  enforcementCount: number;
}

/** A norm violation event */
export interface NormViolation {
  normId: string;
  agentId: string;
  effect: VREffect;
  timestamp: number;
  severity: NormEnforcement;
  witnessed: string[]; // Agent IDs who witnessed
}

/** A norm proposal from an agent */
export interface NormProposal {
  id: string;
  proposerId: string;
  norm: CulturalNorm;
  votes: Map<string, boolean>; // agentId → approve/reject
  timestamp: number;
  status: 'pending' | 'adopted' | 'rejected';
}

// =============================================================================
// NORM ENGINE
// =============================================================================

export interface NormEngineConfig {
  /** Minimum adoption rate for a norm to be "active" (0-1) */
  activationThreshold: number;
  /** Compliance score increase per compliant action */
  complianceReward: number;
  /** Compliance score decrease per violation */
  violationPenalty: number;
  /** Minimum vote ratio for a proposal to be adopted */
  proposalThreshold: number;
  /** Enable metanorm tracking */
  enableMetanorms: boolean;
}

const DEFAULT_CONFIG: NormEngineConfig = {
  activationThreshold: 0.3,
  complianceReward: 0.05,
  violationPenalty: 0.15,
  proposalThreshold: 0.6,
  enableMetanorms: true,
};

/**
 * NormEngine — manages the full CRSEC lifecycle for cultural norms.
 */
export class NormEngine {
  private config: NormEngineConfig;
  private norms: Map<string, CulturalNorm> = new Map();
  private agents: Map<string, AgentNormState> = new Map();
  private proposals: Map<string, NormProposal> = new Map();
  private violationLog: NormViolation[] = [];
  private adoptionHistory: { normId: string; tick: number; rate: number }[] = [];
  private currentTick: number = 0;

  constructor(config: Partial<NormEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Register built-in norms
    for (const norm of BUILTIN_NORMS) {
      this.norms.set(norm.id, norm);
    }
  }

  // ── C: Creation ──────────────────────────────────────────────────────────

  /**
   * Register a custom norm.
   */
  registerNorm(norm: CulturalNorm): void {
    this.norms.set(norm.id, norm);
  }

  /**
   * Agent proposes a new norm.
   */
  proposeNorm(proposerId: string, norm: CulturalNorm): NormProposal {
    const proposal: NormProposal = {
      id: `prop_${this.currentTick}_${proposerId}`,
      proposerId,
      norm,
      votes: new Map(),
      timestamp: this.currentTick,
      status: 'pending',
    };
    this.proposals.set(proposal.id, proposal);
    // Track in agent state
    const state = this.getOrCreateAgent(proposerId);
    state.proposed.add(proposal.id);
    return proposal;
  }

  /**
   * Vote on a pending proposal.
   */
  vote(proposalId: string, agentId: string, approve: boolean): boolean {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'pending') return false;
    proposal.votes.set(agentId, approve);

    // Check if threshold reached
    const totalAgents = this.agents.size;
    if (totalAgents === 0) return true;
    const approvals = [...proposal.votes.values()].filter((v) => v).length;
    const ratio = approvals / totalAgents;

    if (ratio >= this.config.proposalThreshold) {
      proposal.status = 'adopted';
      this.norms.set(proposal.norm.id, proposal.norm);
    } else if (proposal.votes.size >= totalAgents) {
      proposal.status = 'rejected';
    }

    return true;
  }

  // ── R: Representation ────────────────────────────────────────────────────

  /**
   * Get a norm by ID.
   */
  getNorm(normId: string): CulturalNorm | undefined {
    return this.norms.get(normId);
  }

  /**
   * List all registered norms.
   */
  listNorms(): CulturalNorm[] {
    return [...this.norms.values()];
  }

  // ── S: Spreading ─────────────────────────────────────────────────────────

  /**
   * Agent adopts a norm.
   */
  adopt(agentId: string, normId: string): boolean {
    if (!this.norms.has(normId)) return false;
    const state = this.getOrCreateAgent(agentId);
    state.adopted.add(normId);
    state.compliance.set(normId, 1.0);
    return true;
  }

  /**
   * Agent abandons a norm.
   */
  abandon(agentId: string, normId: string): boolean {
    const state = this.agents.get(agentId);
    if (!state) return false;
    state.adopted.delete(normId);
    state.compliance.delete(normId);
    return true;
  }

  /**
   * Get adoption rate for a norm (0-1).
   */
  adoptionRate(normId: string): number {
    if (this.agents.size === 0) return 0;
    let adopters = 0;
    for (const state of this.agents.values()) {
      if (state.adopted.has(normId)) adopters++;
    }
    return adopters / this.agents.size;
  }

  /**
   * Check if a norm is active (adoption > threshold).
   */
  isActive(normId: string): boolean {
    const norm = this.norms.get(normId);
    if (!norm) return false;
    return (
      this.adoptionRate(normId) >= (norm.activationThreshold || this.config.activationThreshold)
    );
  }

  // ── E: Evaluation ────────────────────────────────────────────────────────

  /**
   * Check if an agent's intended effects comply with active norms.
   * Returns violations found.
   */
  evaluate(agentId: string, effects: VREffect[], zoneId?: string): NormViolation[] {
    const violations: NormViolation[] = [];
    const effectRow = new EffectRow(effects);

    for (const norm of this.norms.values()) {
      if (!this.isActive(norm.id)) continue;
      // Check scope
      if (norm.scope === 'zone' && !zoneId) continue;

      // Check forbidden effects
      if (norm.forbiddenEffects) {
        for (const forbidden of norm.forbiddenEffects) {
          if (effectRow.has(forbidden as VREffect)) {
            violations.push({
              normId: norm.id,
              agentId,
              effect: forbidden as VREffect,
              timestamp: this.currentTick,
              severity: norm.enforcement,
              witnessed: this.witnessesIn(zoneId),
            });
          }
        }
      }
    }

    return violations;
  }

  // ── C: Compliance ────────────────────────────────────────────────────────

  /**
   * Record that an agent complied with a norm.
   */
  recordCompliance(agentId: string, normId: string): void {
    const state = this.getOrCreateAgent(agentId);
    const current = state.compliance.get(normId) || 0.5;
    state.compliance.set(normId, Math.min(1, current + this.config.complianceReward));
    state.violations.delete(normId);
  }

  /**
   * Record that an agent violated a norm.
   */
  recordViolation(violation: NormViolation): void {
    const state = this.getOrCreateAgent(violation.agentId);
    const current = state.compliance.get(violation.normId) || 0.5;
    state.compliance.set(violation.normId, Math.max(0, current - this.config.violationPenalty));
    state.violations.add(violation.normId);
    this.violationLog.push(violation);

    // Metanorm tracking: witnesses should enforce
    if (this.config.enableMetanorms) {
      for (const witnessId of violation.witnessed) {
        const witnessState = this.getOrCreateAgent(witnessId);
        witnessState.enforcementCount++;
      }
    }
  }

  /**
   * Get compliance score for an agent on a norm.
   */
  getCompliance(agentId: string, normId: string): number {
    return this.agents.get(agentId)?.compliance.get(normId) ?? 0.5;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Register an agent in the norm engine.
   */
  registerAgent(agentId: string, adoptNorms?: string[]): AgentNormState {
    const state = this.getOrCreateAgent(agentId);
    if (adoptNorms) {
      for (const normId of adoptNorms) this.adopt(agentId, normId);
    }
    return state;
  }

  /**
   * Advance one tick: record adoption history, snapshot state.
   */
  tick(): void {
    this.currentTick++;
    for (const norm of this.norms.values()) {
      this.adoptionHistory.push({
        normId: norm.id,
        tick: this.currentTick,
        rate: this.adoptionRate(norm.id),
      });
    }
  }

  /**
   * Get adoption curve data for a norm.
   */
  adoptionCurve(normId: string): { tick: number; rate: number }[] {
    return this.adoptionHistory.filter((h) => h.normId === normId);
  }

  /**
   * Get the cultural health score for the whole population (0-1).
   * High = norms well-adopted, low violations. Low = cultural breakdown.
   */
  culturalHealth(): number {
    if (this.agents.size === 0) return 1;
    let totalCompliance = 0;
    let count = 0;
    for (const state of this.agents.values()) {
      for (const score of state.compliance.values()) {
        totalCompliance += score;
        count++;
      }
    }
    return count > 0 ? totalCompliance / count : 1;
  }

  /**
   * Get statistics.
   */
  stats(): {
    norms: number;
    agents: number;
    activeNorms: number;
    violations: number;
    proposals: number;
    culturalHealth: number;
  } {
    return {
      norms: this.norms.size,
      agents: this.agents.size,
      activeNorms: [...this.norms.keys()].filter((id) => this.isActive(id)).length,
      violations: this.violationLog.length,
      proposals: this.proposals.size,
      culturalHealth: this.culturalHealth(),
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private getOrCreateAgent(agentId: string): AgentNormState {
    let state = this.agents.get(agentId);
    if (!state) {
      state = {
        agentId,
        adopted: new Set(),
        compliance: new Map(),
        violations: new Set(),
        proposed: new Set(),
        enforcementCount: 0,
      };
      this.agents.set(agentId, state);
    }
    return state;
  }

  private witnessesIn(_zoneId?: string): string[] {
    // In a full implementation, this would check spatial proximity.
    // For now, return all agents as potential witnesses.
    return [...this.agents.keys()].slice(0, 5);
  }
}
