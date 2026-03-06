/**
 * CulturalCompatibilityChecker — Compile-Time Cultural Profile Validation
 *
 * Analyzes agent compositions for cultural compatibility before runtime.
 * Integrates with TraitComposer and TraitDependencyGraph to detect
 * incompatible agent team compositions at compile time.
 *
 * Checks four dimensions of cultural compatibility:
 * 1. **Cooperation Index** — flags agent pairs with cooperation_index delta > threshold
 * 2. **Cultural Family** — uses compatibility matrix to detect known conflicts
 * 3. **Prompt Dialect** — warns when agents use different communication styles
 * 4. **Norm Set** — detects contradictory norms within a composition
 *
 * Design:
 *  - Pure data: no runtime/DOM dependencies (safe for Worker threads).
 *  - Returns structured diagnostics (errors + warnings) for the compiler pipeline.
 *  - Integrates with TraitDependencyGraph by registering cultural_profile as a trait.
 *  - Called by TraitComposer during composition validation.
 *
 * @module CulturalCompatibilityChecker
 * @version 1.0.0
 */

import type {
  CulturalProfileTrait,
  CulturalFamily,
  PromptDialect,
  CompatibilityRating,
} from '../traits/CultureTraits';
import {
  getFamilyCompatibility,
  getAllContradictoryNorms,
  BUILTIN_NORMS,
} from '../traits/CultureTraits';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Severity level for cultural compatibility diagnostics.
 * - 'error' — composition is invalid and should not proceed
 * - 'warning' — composition may work but has known friction points
 * - 'info' — informational observation about the composition
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Category of the compatibility issue detected.
 */
export type DiagnosticCategory =
  | 'cooperation_mismatch'
  | 'family_incompatible'
  | 'family_cautious'
  | 'dialect_mismatch'
  | 'norm_contradiction'
  | 'norm_unknown'
  | 'cooperation_out_of_range';

/**
 * A single compatibility diagnostic emitted by the checker.
 */
export interface CulturalDiagnostic {
  /** Unique diagnostic code (e.g., 'CULT001') */
  code: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Diagnostic category */
  category: DiagnosticCategory;
  /** Human-readable diagnostic message */
  message: string;
  /** The two agents involved (by name/identifier) */
  agents: [string, string];
  /** Suggestion for resolving the issue */
  suggestion?: string;
}

/**
 * An agent entry with its name and cultural profile.
 * Passed into the checker for validation.
 */
export interface AgentCulturalEntry {
  /** Agent name or identifier */
  name: string;
  /** The agent's cultural_profile trait configuration */
  profile: CulturalProfileTrait;
}

/**
 * Configuration for the compatibility checker.
 */
export interface CulturalCheckerConfig {
  /**
   * Maximum cooperation_index delta before flagging an error.
   * Default: 0.5 (agents with >50% cooperation difference are incompatible).
   */
  cooperationThreshold: number;

  /**
   * Whether to emit warnings for dialect mismatches.
   * Default: true.
   */
  checkDialects: boolean;

  /**
   * Whether to validate that norm_set entries reference known norms.
   * Default: true.
   */
  validateNormReferences: boolean;

  /**
   * Whether family 'cautious' ratings produce warnings or are silenced.
   * Default: true (produces warnings).
   */
  warnOnCautious: boolean;
}

/**
 * Complete result of cultural compatibility analysis.
 */
export interface CulturalCompatibilityResult {
  /** Whether the composition is valid (no errors) */
  compatible: boolean;
  /** All diagnostics emitted */
  diagnostics: CulturalDiagnostic[];
  /** Error-level diagnostics only */
  errors: CulturalDiagnostic[];
  /** Warning-level diagnostics only */
  warnings: CulturalDiagnostic[];
  /** Number of agent pairs checked */
  pairsChecked: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_CONFIG: CulturalCheckerConfig = {
  cooperationThreshold: 0.5,
  checkDialects: true,
  validateNormReferences: true,
  warnOnCautious: true,
};

// =============================================================================
// DIAGNOSTIC CODES
// =============================================================================

const CODES = {
  COOPERATION_OUT_OF_RANGE: 'CULT001',
  COOPERATION_MISMATCH: 'CULT002',
  FAMILY_INCOMPATIBLE: 'CULT003',
  FAMILY_CAUTIOUS: 'CULT004',
  DIALECT_MISMATCH: 'CULT005',
  NORM_CONTRADICTION: 'CULT006',
  NORM_UNKNOWN: 'CULT007',
} as const;

// =============================================================================
// CULTURAL COMPATIBILITY CHECKER
// =============================================================================

export class CulturalCompatibilityChecker {
  private config: CulturalCheckerConfig;

  constructor(config?: Partial<CulturalCheckerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update checker configuration.
   */
  setConfig(config: Partial<CulturalCheckerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current checker configuration.
   */
  getConfig(): Readonly<CulturalCheckerConfig> {
    return { ...this.config };
  }

  /**
   * Check cultural compatibility of a set of agents in a composition.
   *
   * Performs pairwise checks across all four dimensions:
   * 1. Validates individual profiles (cooperation_index range, norm references)
   * 2. Checks cooperation_index deltas between all pairs
   * 3. Checks cultural_family compatibility between all pairs
   * 4. Checks prompt_dialect compatibility between all pairs
   * 5. Checks for contradictory norms across the full composition
   *
   * @param agents Array of agent entries with their cultural profiles
   * @returns Complete compatibility result with diagnostics
   */
  check(agents: AgentCulturalEntry[]): CulturalCompatibilityResult {
    const diagnostics: CulturalDiagnostic[] = [];

    // Phase 1: Validate individual profiles
    for (const agent of agents) {
      diagnostics.push(...this.validateProfile(agent));
    }

    // Phase 2: Pairwise compatibility checks
    let pairsChecked = 0;
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        pairsChecked++;

        diagnostics.push(...this.checkCooperationIndex(a, b));
        diagnostics.push(...this.checkCulturalFamily(a, b));

        if (this.config.checkDialects) {
          diagnostics.push(...this.checkPromptDialect(a, b));
        }
      }
    }

    // Phase 3: Composition-wide norm contradiction check
    diagnostics.push(...this.checkNormContradictions(agents));

    // Partition results
    const errors = diagnostics.filter(d => d.severity === 'error');
    const warnings = diagnostics.filter(d => d.severity === 'warning');

    return {
      compatible: errors.length === 0,
      diagnostics,
      errors,
      warnings,
      pairsChecked,
    };
  }

  /**
   * Quick check — returns true if the composition is compatible (no errors).
   * Use `check()` for full diagnostics.
   */
  isCompatible(agents: AgentCulturalEntry[]): boolean {
    return this.check(agents).compatible;
  }

  // ===========================================================================
  // INDIVIDUAL PROFILE VALIDATION
  // ===========================================================================

  private validateProfile(agent: AgentCulturalEntry): CulturalDiagnostic[] {
    const diagnostics: CulturalDiagnostic[] = [];
    const { profile, name } = agent;

    // Validate cooperation_index range
    if (profile.cooperation_index < 0 || profile.cooperation_index > 1) {
      diagnostics.push({
        code: CODES.COOPERATION_OUT_OF_RANGE,
        severity: 'error',
        category: 'cooperation_out_of_range',
        message: `Agent "${name}" has cooperation_index ${profile.cooperation_index} which is outside the valid range [0, 1].`,
        agents: [name, name],
        suggestion: 'Set cooperation_index to a value between 0.0 and 1.0.',
      });
    }

    // Validate norm references (if enabled)
    if (this.config.validateNormReferences) {
      const builtinIds = new Set(BUILTIN_NORMS.map(n => n.id));
      for (const normId of profile.norm_set) {
        if (!builtinIds.has(normId)) {
          diagnostics.push({
            code: CODES.NORM_UNKNOWN,
            severity: 'warning',
            category: 'norm_unknown',
            message: `Agent "${name}" references unknown norm "${normId}". It may be a custom norm not yet registered.`,
            agents: [name, name],
            suggestion: `Register the norm "${normId}" via BUILTIN_NORMS or ensure it exists in your custom norm registry.`,
          });
        }
      }
    }

    return diagnostics;
  }

  // ===========================================================================
  // COOPERATION INDEX CHECK
  // ===========================================================================

  private checkCooperationIndex(
    a: AgentCulturalEntry,
    b: AgentCulturalEntry,
  ): CulturalDiagnostic[] {
    const delta = Math.abs(a.profile.cooperation_index - b.profile.cooperation_index);

    if (delta > this.config.cooperationThreshold) {
      return [{
        code: CODES.COOPERATION_MISMATCH,
        severity: 'error',
        category: 'cooperation_mismatch',
        message:
          `Agents "${a.name}" (cooperation_index: ${a.profile.cooperation_index}) and ` +
          `"${b.name}" (cooperation_index: ${b.profile.cooperation_index}) have a cooperation delta ` +
          `of ${delta.toFixed(2)} which exceeds the threshold of ${this.config.cooperationThreshold}. ` +
          `These agents are unlikely to cooperate effectively.`,
        agents: [a.name, b.name],
        suggestion:
          'Adjust cooperation_index values to be within ' +
          `${this.config.cooperationThreshold} of each other, or add a mediator agent with a middle cooperation_index.`,
      }];
    }

    return [];
  }

  // ===========================================================================
  // CULTURAL FAMILY CHECK
  // ===========================================================================

  private checkCulturalFamily(
    a: AgentCulturalEntry,
    b: AgentCulturalEntry,
  ): CulturalDiagnostic[] {
    const { rating, reason } = getFamilyCompatibility(
      a.profile.cultural_family,
      b.profile.cultural_family,
    );

    if (rating === 'incompatible') {
      return [{
        code: CODES.FAMILY_INCOMPATIBLE,
        severity: 'error',
        category: 'family_incompatible',
        message:
          `Agents "${a.name}" (family: ${a.profile.cultural_family}) and ` +
          `"${b.name}" (family: ${b.profile.cultural_family}) belong to incompatible cultural families. ` +
          reason,
        agents: [a.name, b.name],
        suggestion:
          `Change one agent's cultural_family to a compatible type, or separate them ` +
          `into different compositions/zones.`,
      }];
    }

    if (rating === 'cautious' && this.config.warnOnCautious) {
      return [{
        code: CODES.FAMILY_CAUTIOUS,
        severity: 'warning',
        category: 'family_cautious',
        message:
          `Agents "${a.name}" (family: ${a.profile.cultural_family}) and ` +
          `"${b.name}" (family: ${b.profile.cultural_family}) have cautious cultural compatibility. ` +
          reason,
        agents: [a.name, b.name],
        suggestion:
          'Consider adding a mediator agent or defining explicit interaction protocols.',
      }];
    }

    return [];
  }

  // ===========================================================================
  // PROMPT DIALECT CHECK
  // ===========================================================================

  private checkPromptDialect(
    a: AgentCulturalEntry,
    b: AgentCulturalEntry,
  ): CulturalDiagnostic[] {
    if (a.profile.prompt_dialect !== b.profile.prompt_dialect) {
      return [{
        code: CODES.DIALECT_MISMATCH,
        severity: 'warning',
        category: 'dialect_mismatch',
        message:
          `Agents "${a.name}" (dialect: ${a.profile.prompt_dialect}) and ` +
          `"${b.name}" (dialect: ${b.profile.prompt_dialect}) use different prompt dialects. ` +
          `Inter-agent communication may be less efficient.`,
        agents: [a.name, b.name],
        suggestion:
          'Align prompt_dialect values for agents that need frequent communication, ' +
          'or add a translator agent that bridges both dialects.',
      }];
    }

    return [];
  }

  // ===========================================================================
  // NORM CONTRADICTION CHECK
  // ===========================================================================

  /**
   * Check for contradictory norms across the entire composition.
   * This is an N-way check (not just pairwise) because norms from
   * different agents can contradict each other.
   */
  private checkNormContradictions(agents: AgentCulturalEntry[]): CulturalDiagnostic[] {
    const diagnostics: CulturalDiagnostic[] = [];
    const contradictions = getAllContradictoryNorms();

    // Build a map: normId -> list of agent names that subscribe to it
    const normAgentMap = new Map<string, string[]>();
    for (const agent of agents) {
      for (const normId of agent.profile.norm_set) {
        if (!normAgentMap.has(normId)) {
          normAgentMap.set(normId, []);
        }
        normAgentMap.get(normId)!.push(agent.name);
      }
    }

    // Check each contradictory pair
    for (const { normA, normB, reason } of contradictions) {
      const agentsWithA = normAgentMap.get(normA) || [];
      const agentsWithB = normAgentMap.get(normB) || [];

      if (agentsWithA.length > 0 && agentsWithB.length > 0) {
        // Find the specific agents that create the contradiction
        for (const agentA of agentsWithA) {
          for (const agentB of agentsWithB) {
            if (agentA !== agentB) {
              diagnostics.push({
                code: CODES.NORM_CONTRADICTION,
                severity: 'error',
                category: 'norm_contradiction',
                message:
                  `Norm contradiction: agent "${agentA}" subscribes to "${normA}" ` +
                  `and agent "${agentB}" subscribes to "${normB}". ${reason}`,
                agents: [agentA, agentB],
                suggestion:
                  `Remove one of the contradictory norms, or separate agents ` +
                  `"${agentA}" and "${agentB}" into different compositions.`,
              });
            }
            // Also check if the same agent subscribes to both contradictory norms
            if (agentA === agentB) {
              diagnostics.push({
                code: CODES.NORM_CONTRADICTION,
                severity: 'error',
                category: 'norm_contradiction',
                message:
                  `Agent "${agentA}" subscribes to contradictory norms "${normA}" and "${normB}". ${reason}`,
                agents: [agentA, agentA],
                suggestion:
                  `Remove one of the contradictory norms from agent "${agentA}".`,
              });
            }
          }
        }
      }
    }

    return diagnostics;
  }
}
