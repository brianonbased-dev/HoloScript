/**
 * NormLifecycleCompilerMixin.ts
 *
 * Shared utilities for compiling norm lifecycle blocks (CRSEC model)
 * and metanorm governance declarations to target platform code.
 * Any compiler can import these helpers to support norm-based
 * cultural engineering in spatial compositions.
 *
 * CRSEC Model Phases:
 *   C - Creation:       How the norm is proposed and authored
 *   R - Representation: Formal encoding of the norm's rules
 *   S - Spreading:      How the norm propagates through agents
 *   E - Evaluation:     Acceptance criteria and voting rules
 *   C - Compliance:     Enforcement, violations, and sanctions
 *
 * @version 4.5.0
 */

import type {
  HoloNormBlock,
  HoloNormCreation,
  HoloNormRepresentation,
  HoloNormSpreading,
  HoloNormEvaluation,
  HoloNormCompliance,
  HoloMetanorm,
  HoloMetanormRules,
  HoloMetanormEscalation,
  HoloValue,
  NormStatus,
  NormVotingMechanism,
  NormViolationSeverity,
  NormSanctionType,
  NormSpreadingMechanism,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// Compiled Norm Types
// =============================================================================

/**
 * Compiled creation phase — origin and authorship of the norm.
 */
export interface CompiledNormCreation {
  /** Author agent or system that proposed the norm */
  author?: string;
  /** Rationale / justification for the norm */
  rationale?: string;
  /** Initial status upon creation */
  initialStatus?: NormStatus;
  /** Timestamp or epoch when the norm was created */
  createdAt?: number;
  /** Additional creation properties */
  properties: Record<string, any>;
}

/**
 * Compiled representation phase — formal rule encoding.
 */
export interface CompiledNormRepresentation {
  /** Boolean condition expression that defines compliance */
  condition?: string;
  /** Scope of agents the norm applies to */
  scope?: string;
  /** Named exceptions that bypass the norm */
  exceptions?: string[];
  /** Temporal bounds (start/end validity) */
  validFrom?: number;
  validUntil?: number;
  /** Additional representation properties */
  properties: Record<string, any>;
}

/**
 * Compiled spreading phase — propagation mechanics.
 */
export interface CompiledNormSpreading {
  /** Primary spreading mechanism */
  mechanism?: NormSpreadingMechanism;
  /** Visibility level */
  visibility?: 'public' | 'private' | 'restricted';
  /** Incentive value for adoption */
  adoptionIncentive?: number;
  /** Channels through which the norm is communicated */
  channels?: string[];
  /** Additional spreading properties */
  properties: Record<string, any>;
}

/**
 * Compiled evaluation phase — voting and acceptance criteria.
 */
export interface CompiledNormEvaluation {
  /** Voting mechanism used for norm adoption */
  voting?: NormVotingMechanism;
  /** Minimum participation ratio (0-1) */
  quorum?: number;
  /** Approval threshold (0-1) */
  approvalThreshold?: number;
  /** Review period in seconds */
  reviewPeriod?: number;
  /** Whether to auto-adopt after review period without objections */
  autoAdopt?: boolean;
  /** Maximum number of voting rounds */
  maxRounds?: number;
  /** Additional evaluation properties */
  properties: Record<string, any>;
}

/**
 * Compiled compliance phase — enforcement and sanctions.
 */
export interface CompiledNormCompliance {
  /** Monitoring strategy */
  monitoring?: 'continuous' | 'periodic' | 'on_report' | 'sampling';
  /** Number of violations before sanctions apply */
  violationThreshold?: number;
  /** Severity of violations */
  severity?: NormViolationSeverity;
  /** Ordered list of sanction escalation */
  sanctions?: NormSanctionType[];
  /** Whether appeal is allowed */
  appealAllowed?: boolean;
  /** Grace period in seconds before enforcement begins */
  gracePeriod?: number;
  /** Cooldown period between sanction escalations */
  sanctionCooldown?: number;
  /** Additional compliance properties */
  properties: Record<string, any>;
}

/**
 * Fully compiled norm with all CRSEC lifecycle phases resolved.
 */
export interface CompiledNorm {
  /** Norm name */
  name: string;
  /** Trait decorators */
  traits: string[];
  /** Top-level properties (description, category, priority, etc.) */
  description?: string;
  category?: string;
  priority?: number;
  status?: NormStatus;
  properties: Record<string, any>;
  /** CRSEC lifecycle phases */
  creation?: CompiledNormCreation;
  representation?: CompiledNormRepresentation;
  spreading?: CompiledNormSpreading;
  evaluation?: CompiledNormEvaluation;
  compliance?: CompiledNormCompliance;
  /** Whether the norm has event handlers */
  hasEventHandlers: boolean;
}

// =============================================================================
// Compiled Metanorm Types
// =============================================================================

/**
 * Compiled metanorm governance rules.
 */
export interface CompiledMetanormRules {
  /** Quorum required for norm amendments */
  amendmentQuorum?: number;
  /** Voting mechanism for amendments */
  amendmentVoting?: NormVotingMechanism;
  /** Cooldown period between amendment cycles (seconds) */
  cooldownPeriod?: number;
  /** Maximum amendments per governance cycle */
  maxAmendmentsPerCycle?: number;
  /** Whether retroactive norm changes are allowed */
  retroactiveAllowed?: boolean;
  /** Additional rules properties */
  properties: Record<string, any>;
}

/**
 * Compiled metanorm escalation configuration.
 */
export interface CompiledMetanormEscalation {
  /** Escalation authority (agent or council ID) */
  authority?: string;
  /** Override threshold (0-1) for authority override */
  overrideThreshold?: number;
  /** Number of appeal levels */
  appealLevels?: number;
  /** Additional escalation properties */
  properties: Record<string, any>;
}

/**
 * Fully compiled metanorm with governance rules.
 */
export interface CompiledMetanorm {
  /** Metanorm name */
  name: string;
  /** Trait decorators */
  traits: string[];
  /** Top-level properties */
  description?: string;
  appliesTo?: string;
  properties: Record<string, any>;
  /** Governance rules sub-block */
  rules?: CompiledMetanormRules;
  /** Escalation configuration */
  escalation?: CompiledMetanormEscalation;
  /** Whether the metanorm has event handlers */
  hasEventHandlers: boolean;
}

// =============================================================================
// Compilation Functions
// =============================================================================

/**
 * Compile a norm AST block into a resolved CompiledNorm.
 */
export function compileNormBlock(block: HoloNormBlock): CompiledNorm {
  const creation = block.creation ? compileNormCreation(block.creation) : undefined;
  const representation = block.representation ? compileNormRepresentation(block.representation) : undefined;
  const spreading = block.spreading ? compileNormSpreading(block.spreading) : undefined;
  const evaluation = block.evaluation ? compileNormEvaluation(block.evaluation) : undefined;
  const compliance = block.compliance ? compileNormCompliance(block.compliance) : undefined;

  return {
    name: block.name,
    traits: block.traits || [],
    description: block.properties.description as string | undefined,
    category: block.properties.category as string | undefined,
    priority: block.properties.priority as number | undefined,
    status: (block.properties.status as NormStatus) || 'draft',
    properties: block.properties || {},
    creation,
    representation,
    spreading,
    evaluation,
    compliance,
    hasEventHandlers: (block.eventHandlers?.length ?? 0) > 0,
  };
}

/**
 * Compile a creation phase sub-block.
 */
export function compileNormCreation(phase: HoloNormCreation): CompiledNormCreation {
  const p = phase.properties || {};
  return {
    author: p.author as string | undefined,
    rationale: p.rationale as string | undefined,
    initialStatus: p.initial_status as NormStatus | undefined,
    createdAt: p.created_at as number | undefined,
    properties: p,
  };
}

/**
 * Compile a representation phase sub-block.
 */
export function compileNormRepresentation(phase: HoloNormRepresentation): CompiledNormRepresentation {
  const p = phase.properties || {};
  return {
    condition: p.condition as string | undefined,
    scope: p.scope as string | undefined,
    exceptions: Array.isArray(p.exceptions) ? (p.exceptions as string[]) : undefined,
    validFrom: p.valid_from as number | undefined,
    validUntil: p.valid_until as number | undefined,
    properties: p,
  };
}

/**
 * Compile a spreading phase sub-block.
 */
export function compileNormSpreading(phase: HoloNormSpreading): CompiledNormSpreading {
  const p = phase.properties || {};
  return {
    mechanism: p.mechanism as NormSpreadingMechanism | undefined,
    visibility: p.visibility as 'public' | 'private' | 'restricted' | undefined,
    adoptionIncentive: p.adoption_incentive as number | undefined,
    channels: Array.isArray(p.channels) ? (p.channels as string[]) : undefined,
    properties: p,
  };
}

/**
 * Compile an evaluation phase sub-block.
 */
export function compileNormEvaluation(phase: HoloNormEvaluation): CompiledNormEvaluation {
  const p = phase.properties || {};
  return {
    voting: p.voting as NormVotingMechanism | undefined,
    quorum: p.quorum as number | undefined,
    approvalThreshold: p.approval_threshold as number | undefined,
    reviewPeriod: p.review_period as number | undefined,
    autoAdopt: p.auto_adopt as boolean | undefined,
    maxRounds: p.max_rounds as number | undefined,
    properties: p,
  };
}

/**
 * Compile a compliance phase sub-block.
 */
export function compileNormCompliance(phase: HoloNormCompliance): CompiledNormCompliance {
  const p = phase.properties || {};
  return {
    monitoring: p.monitoring as 'continuous' | 'periodic' | 'on_report' | 'sampling' | undefined,
    violationThreshold: p.violation_threshold as number | undefined,
    severity: p.severity as NormViolationSeverity | undefined,
    sanctions: Array.isArray(p.sanctions) ? (p.sanctions as NormSanctionType[]) : undefined,
    appealAllowed: p.appeal_allowed as boolean | undefined,
    gracePeriod: p.grace_period as number | undefined,
    sanctionCooldown: p.sanction_cooldown as number | undefined,
    properties: p,
  };
}

/**
 * Compile a metanorm AST block into a resolved CompiledMetanorm.
 */
export function compileMetanormBlock(block: HoloMetanorm): CompiledMetanorm {
  const rules = block.rules ? compileMetanormRules(block.rules) : undefined;
  const escalation = block.escalation ? compileMetanormEscalation(block.escalation) : undefined;

  return {
    name: block.name,
    traits: block.traits || [],
    description: block.properties.description as string | undefined,
    appliesTo: block.properties.applies_to as string | undefined,
    properties: block.properties || {},
    rules,
    escalation,
    hasEventHandlers: (block.eventHandlers?.length ?? 0) > 0,
  };
}

/**
 * Compile metanorm governance rules.
 */
export function compileMetanormRules(rules: HoloMetanormRules): CompiledMetanormRules {
  const p = rules.properties || {};
  return {
    amendmentQuorum: p.amendment_quorum as number | undefined,
    amendmentVoting: p.amendment_voting as NormVotingMechanism | undefined,
    cooldownPeriod: p.cooldown_period as number | undefined,
    maxAmendmentsPerCycle: p.max_amendments_per_cycle as number | undefined,
    retroactiveAllowed: p.retroactive_allowed as boolean | undefined,
    properties: p,
  };
}

/**
 * Compile metanorm escalation configuration.
 */
export function compileMetanormEscalation(esc: HoloMetanormEscalation): CompiledMetanormEscalation {
  const p = esc.properties || {};
  return {
    authority: p.authority as string | undefined,
    overrideThreshold: p.override_threshold as number | undefined,
    appealLevels: p.appeal_levels as number | undefined,
    properties: p,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a compiled norm for completeness and consistency.
 * Returns an array of validation issues (empty = valid).
 */
export function validateCompiledNorm(norm: CompiledNorm): string[] {
  const issues: string[] = [];

  if (!norm.name || norm.name === 'unnamed') {
    issues.push('Norm must have a name');
  }

  // Evaluation phase: check voting config consistency
  if (norm.evaluation) {
    if (norm.evaluation.quorum !== undefined && (norm.evaluation.quorum < 0 || norm.evaluation.quorum > 1)) {
      issues.push(`Norm "${norm.name}": evaluation quorum must be between 0 and 1, got ${norm.evaluation.quorum}`);
    }
    if (norm.evaluation.approvalThreshold !== undefined &&
        (norm.evaluation.approvalThreshold < 0 || norm.evaluation.approvalThreshold > 1)) {
      issues.push(`Norm "${norm.name}": approval_threshold must be between 0 and 1`);
    }
  }

  // Compliance phase: sanctions should be ordered by severity
  if (norm.compliance?.sanctions && norm.compliance.sanctions.length > 0) {
    const severityOrder: NormSanctionType[] = ['warn', 'restrict', 'penalize', 'suspend', 'quarantine', 'ban', 'escalate'];
    let lastIdx = -1;
    for (const sanction of norm.compliance.sanctions) {
      const idx = severityOrder.indexOf(sanction);
      if (idx !== -1 && idx < lastIdx) {
        issues.push(`Norm "${norm.name}": sanctions should be ordered by severity (${sanction} appears after a more severe sanction)`);
        break;
      }
      if (idx !== -1) lastIdx = idx;
    }
  }

  // Compliance: violation threshold should be positive
  if (norm.compliance?.violationThreshold !== undefined && norm.compliance.violationThreshold < 1) {
    issues.push(`Norm "${norm.name}": violation_threshold must be at least 1`);
  }

  return issues;
}

/**
 * Validate a compiled metanorm for completeness.
 */
export function validateCompiledMetanorm(metanorm: CompiledMetanorm): string[] {
  const issues: string[] = [];

  if (!metanorm.name || metanorm.name === 'unnamed') {
    issues.push('Metanorm must have a name');
  }

  if (metanorm.rules) {
    if (metanorm.rules.amendmentQuorum !== undefined &&
        (metanorm.rules.amendmentQuorum < 0 || metanorm.rules.amendmentQuorum > 1)) {
      issues.push(`Metanorm "${metanorm.name}": amendment_quorum must be between 0 and 1`);
    }
    if (metanorm.rules.maxAmendmentsPerCycle !== undefined && metanorm.rules.maxAmendmentsPerCycle < 1) {
      issues.push(`Metanorm "${metanorm.name}": max_amendments_per_cycle must be at least 1`);
    }
  }

  if (metanorm.escalation) {
    if (metanorm.escalation.overrideThreshold !== undefined &&
        (metanorm.escalation.overrideThreshold < 0 || metanorm.escalation.overrideThreshold > 1)) {
      issues.push(`Metanorm "${metanorm.name}": override_threshold must be between 0 and 1`);
    }
  }

  return issues;
}

// =============================================================================
// Code Generation Helpers
// =============================================================================

/**
 * Generate a runtime norm enforcement check as a code string.
 * Target-agnostic template that compilers can adapt.
 */
export function generateNormEnforcementCode(norm: CompiledNorm): string {
  const lines: string[] = [];
  lines.push(`// Norm: ${norm.name}`);
  if (norm.description) {
    lines.push(`// ${norm.description}`);
  }

  lines.push(`const norm_${sanitizeIdentifier(norm.name)} = {`);
  lines.push(`  name: "${norm.name}",`);
  if (norm.category) lines.push(`  category: "${norm.category}",`);
  if (norm.priority !== undefined) lines.push(`  priority: ${norm.priority},`);
  lines.push(`  status: "${norm.status || 'draft'}",`);

  // Representation — condition check
  if (norm.representation?.condition) {
    lines.push(`  check: (agent, context) => ${norm.representation.condition},`);
  }
  if (norm.representation?.scope) {
    lines.push(`  scope: "${norm.representation.scope}",`);
  }

  // Evaluation — voting config
  if (norm.evaluation) {
    lines.push(`  evaluation: {`);
    if (norm.evaluation.voting) lines.push(`    voting: "${norm.evaluation.voting}",`);
    if (norm.evaluation.quorum !== undefined) lines.push(`    quorum: ${norm.evaluation.quorum},`);
    if (norm.evaluation.approvalThreshold !== undefined) lines.push(`    approvalThreshold: ${norm.evaluation.approvalThreshold},`);
    lines.push(`  },`);
  }

  // Compliance — enforcement config
  if (norm.compliance) {
    lines.push(`  compliance: {`);
    if (norm.compliance.monitoring) lines.push(`    monitoring: "${norm.compliance.monitoring}",`);
    if (norm.compliance.violationThreshold !== undefined) lines.push(`    violationThreshold: ${norm.compliance.violationThreshold},`);
    if (norm.compliance.severity) lines.push(`    severity: "${norm.compliance.severity}",`);
    if (norm.compliance.sanctions) {
      lines.push(`    sanctions: [${norm.compliance.sanctions.map(s => `"${s}"`).join(', ')}],`);
    }
    if (norm.compliance.appealAllowed !== undefined) lines.push(`    appealAllowed: ${norm.compliance.appealAllowed},`);
    if (norm.compliance.gracePeriod !== undefined) lines.push(`    gracePeriod: ${norm.compliance.gracePeriod},`);
    lines.push(`  },`);
  }

  lines.push(`};`);
  return lines.join('\n');
}

/**
 * Generate metanorm governance code as a code string.
 */
export function generateMetanormGovernanceCode(metanorm: CompiledMetanorm): string {
  const lines: string[] = [];
  lines.push(`// Metanorm: ${metanorm.name}`);
  if (metanorm.description) {
    lines.push(`// ${metanorm.description}`);
  }

  lines.push(`const metanorm_${sanitizeIdentifier(metanorm.name)} = {`);
  lines.push(`  name: "${metanorm.name}",`);
  if (metanorm.appliesTo) lines.push(`  appliesTo: "${metanorm.appliesTo}",`);

  if (metanorm.rules) {
    lines.push(`  rules: {`);
    if (metanorm.rules.amendmentQuorum !== undefined) lines.push(`    amendmentQuorum: ${metanorm.rules.amendmentQuorum},`);
    if (metanorm.rules.amendmentVoting) lines.push(`    amendmentVoting: "${metanorm.rules.amendmentVoting}",`);
    if (metanorm.rules.cooldownPeriod !== undefined) lines.push(`    cooldownPeriod: ${metanorm.rules.cooldownPeriod},`);
    if (metanorm.rules.maxAmendmentsPerCycle !== undefined) lines.push(`    maxAmendmentsPerCycle: ${metanorm.rules.maxAmendmentsPerCycle},`);
    if (metanorm.rules.retroactiveAllowed !== undefined) lines.push(`    retroactiveAllowed: ${metanorm.rules.retroactiveAllowed},`);
    lines.push(`  },`);
  }

  if (metanorm.escalation) {
    lines.push(`  escalation: {`);
    if (metanorm.escalation.authority) lines.push(`    authority: "${metanorm.escalation.authority}",`);
    if (metanorm.escalation.overrideThreshold !== undefined) lines.push(`    overrideThreshold: ${metanorm.escalation.overrideThreshold},`);
    if (metanorm.escalation.appealLevels !== undefined) lines.push(`    appealLevels: ${metanorm.escalation.appealLevels},`);
    lines.push(`  },`);
  }

  lines.push(`};`);
  return lines.join('\n');
}

/**
 * Sanitize a name for use as a JavaScript identifier.
 */
function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}
