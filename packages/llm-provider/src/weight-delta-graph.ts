/**
 * HoloWeight v1 — backend-neutral planning for contract-carrying model-weight changes.
 *
 * This module never loads tensors, trains a model, mutates serving state, or pretends an
 * empirical behavior claim is statically proven. It validates physical compatibility and graph
 * integrity, then exposes the behavioral receipts still required for an external admission
 * transaction.
 */

export type ContentDigest = `sha256:${string}`;

export type WeightArtifactFormat = 'safetensors' | 'gguf' | 'onnx' | 'peft' | 'other';

export interface WeightArtifactRef {
  digest: ContentDigest;
  format: WeightArtifactFormat;
}

export interface WeightCompatibility {
  baseDigest: ContentDigest;
  architecture: string;
  tokenizerDigest: ContentDigest;
  targetModules: string[];
  dtype?: string;
  rank?: number;
}

export type WeightDeltaRole = 'generator' | 'critic' | 'router' | 'teacher';

export type WeightActivationMode = 'global' | 'task_scoped' | 'shadow_only';

/**
 * Declares what a weight delta is allowed to do at runtime. The planner defaults
 * legacy deltas to a global, user-visible generator. Any narrower activation
 * scope must fail closed to an immutable previously admitted head.
 */
export interface WeightRoleContract {
  role: WeightDeltaRole;
  activation: {
    mode: WeightActivationMode;
    taskTags?: string[];
    minRouterConfidence?: number;
    allowUserVisibleOutput: boolean;
    fallbackHead?: ContentDigest;
  };
}

export interface WeightDelta {
  id: string;
  artifact: WeightArtifactRef;
  compatibility: WeightCompatibility;
  provides: string[];
  mustPreserve: string[];
  producerRef: string;
  roleContract?: WeightRoleContract;
}

export type EvaluationRule =
  | { kind: 'minimum'; value: number }
  | { kind: 'maximum'; value: number }
  | { kind: 'improves_by'; value: number }
  | { kind: 'non_regression'; tolerance: number };

export type EvaluatorPolicy = 'deterministic' | 'provenance_independent' | 'cross_family';

export interface EvaluationRequirement {
  id: string;
  subject: string;
  metric: string;
  suiteDigest: ContentDigest;
  rule: EvaluationRule;
  minSeeds: number;
  evaluatorPolicy: EvaluatorPolicy;
}

export interface EvaluationReceiptRef {
  requirementId: string;
  candidateDigest: ContentDigest;
  receiptDigest: ContentDigest;
  evaluatorRef: string;
  /**
   * Consensus metadata is optional for deterministic evaluators, but is required by
   * provenance_independent and cross_family policies. `signatureVerified` is asserted by the
   * receipt-verification boundary (for example HoloTune's EIP-191 verifier), not by this planner.
   */
  evaluatorFamily?: string;
  signerAddress?: string;
  signatureVerified?: boolean;
  seed?: number;
  seedCount: number;
  passed: boolean;
}

export type WeightCompositionMethod = 'linear' | 'concat' | 'ties' | 'dare_ties' | 'custom';

export interface WeightComposition {
  id: string;
  inputs: string[];
  method: WeightCompositionMethod;
  parameters?: Record<string, number | string | boolean>;
}

export interface WeightDeltaGraph {
  schema: 'holoweight.graph.v1';
  id: string;
  /**
   * Exact content identity supplied by the materialization/content-addressing layer.
   * V1 validates and binds this digest but deliberately does not generate it.
   */
  candidateDigest: ContentDigest;
  base: {
    artifact: WeightArtifactRef;
    architecture: string;
    tokenizerDigest: ContentDigest;
  };
  deltas: WeightDelta[];
  compositions: WeightComposition[];
  requirements: EvaluationRequirement[];
  receipts?: EvaluationReceiptRef[];
  previousAdmittedHead?: ContentDigest;
}

export type WeightGraphReadiness = 'invalid' | 'candidate' | 'ready';

export type WeightPlanIssueCode =
  | 'INVALID_GRAPH_SCHEMA'
  | 'GRAPH_ID_REQUIRED'
  | 'CANDIDATE_DIGEST_INVALID'
  | 'BASE_DIGEST_INVALID'
  | 'BASE_ARCHITECTURE_REQUIRED'
  | 'BASE_TOKENIZER_DIGEST_INVALID'
  | 'DELTA_ID_REQUIRED'
  | 'DUPLICATE_NODE_ID'
  | 'DELTA_ARTIFACT_DIGEST_INVALID'
  | 'DELTA_PRODUCER_REQUIRED'
  | 'WEIGHT_BASE_MISMATCH'
  | 'WEIGHT_ARCHITECTURE_MISMATCH'
  | 'WEIGHT_TOKENIZER_MISMATCH'
  | 'TARGET_MODULES_REQUIRED'
  | 'TARGET_MODULE_REQUIRED'
  | 'DUPLICATE_TARGET_MODULE'
  | 'INVALID_ADAPTER_RANK'
  | 'SEMANTIC_LABEL_REQUIRED'
  | 'WEIGHT_ROLE_INVALID'
  | 'ACTIVATION_MODE_INVALID'
  | 'ACTIVATION_TASK_TAG_REQUIRED'
  | 'ACTIVATION_TASK_TAG_INVALID'
  | 'DUPLICATE_ACTIVATION_TASK_TAG'
  | 'ACTIVATION_TASK_TAGS_FORBIDDEN'
  | 'ACTIVATION_ROUTER_CONFIDENCE_REQUIRED'
  | 'ACTIVATION_ROUTER_CONFIDENCE_INVALID'
  | 'ROLE_OUTPUT_VISIBILITY_INVALID'
  | 'ROLE_OUTPUT_VISIBILITY_FORBIDDEN'
  | 'ROLE_FALLBACK_HEAD_REQUIRED'
  | 'ROLE_FALLBACK_HEAD_INVALID'
  | 'ROLE_FALLBACK_HEAD_MISMATCH'
  | 'COMPOSITION_ID_REQUIRED'
  | 'COMPOSITION_INPUT_REQUIRED'
  | 'DUPLICATE_COMPOSITION_INPUT'
  | 'COMPOSITION_INPUT_FORWARD_REFERENCE'
  | 'COMPOSITION_INPUT_NOT_FOUND'
  | 'REQUIREMENT_REQUIRED'
  | 'REQUIREMENT_ID_REQUIRED'
  | 'DUPLICATE_REQUIREMENT_ID'
  | 'REQUIREMENT_SUBJECT_REQUIRED'
  | 'REQUIREMENT_SUBJECT_NOT_DECLARED'
  | 'REQUIREMENT_METRIC_REQUIRED'
  | 'REQUIREMENT_SUITE_DIGEST_INVALID'
  | 'REQUIREMENT_MIN_SEEDS_INVALID'
  | 'REQUIREMENT_RULE_INVALID'
  | 'RECEIPT_REQUIREMENT_NOT_FOUND'
  | 'RECEIPT_DIGEST_INVALID'
  | 'RECEIPT_EVALUATOR_REQUIRED'
  | 'RECEIPT_SEED_COUNT_INVALID'
  | 'CONFLICTING_REQUIREMENT_RECEIPTS'
  | 'PREVIOUS_HEAD_DIGEST_INVALID';

export interface WeightPlanIssue {
  code: WeightPlanIssueCode;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export type AdmissionRequirementStatus =
  | 'missing'
  | 'candidate_mismatch'
  | 'under_seeded'
  | 'failed'
  | 'invalid_receipt'
  | 'unverified_evaluator'
  | 'insufficient_independence'
  | 'insufficient_families'
  | 'satisfied';

export interface AdmissionRequirementPlan {
  requirementId: string;
  status: AdmissionRequirementStatus;
  receipt?: EvaluationReceiptRef;
  receipts?: EvaluationReceiptRef[];
  evaluatorEvidence?: {
    verifiedSigners: string[];
    evaluatorFamilies: string[];
    seedCount: number;
  };
}

export type WeightExecutionStep =
  | {
      kind: 'select-base';
      artifact: WeightArtifactRef;
      architecture: string;
      tokenizerDigest: ContentDigest;
    }
  | {
      kind: 'apply-delta';
      deltaId: string;
      artifact: WeightArtifactRef;
      roleContract: WeightRoleContract;
    }
  | {
      kind: 'compose';
      compositionId: string;
      inputs: string[];
      method: WeightCompositionMethod;
      parameters?: Record<string, number | string | boolean>;
    }
  | {
      kind: 'evaluate';
      requirementId: string;
      candidateDigest: ContentDigest;
      suiteDigest: ContentDigest;
      minSeeds: number;
      evaluatorPolicy: EvaluatorPolicy;
    }
  | { kind: 'admit'; candidateDigest: ContentDigest; ready: boolean }
  | { kind: 'select-rollback-head'; head: ContentDigest };

export interface WeightExecutionPlan {
  graphId: string;
  candidateDigest: ContentDigest;
  readiness: WeightGraphReadiness;
  issues: WeightPlanIssue[];
  steps: WeightExecutionStep[];
  semanticLabels: {
    provides: string[];
    mustPreserve: string[];
  };
  admissionRequirements: AdmissionRequirementPlan[];
  rollbackHead?: ContentDigest;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const WEIGHT_DELTA_ROLES = new Set<WeightDeltaRole>(['generator', 'critic', 'router', 'teacher']);
const WEIGHT_ACTIVATION_MODES = new Set<WeightActivationMode>([
  'global',
  'task_scoped',
  'shadow_only',
]);

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validDigest(value: string): value is ContentDigest {
  return SHA256_RE.test(value);
}

function receiptEquals(left: EvaluationReceiptRef, right: EvaluationReceiptRef): boolean {
  return (
    left.requirementId === right.requirementId &&
    left.candidateDigest === right.candidateDigest &&
    left.receiptDigest === right.receiptDigest &&
    left.evaluatorRef === right.evaluatorRef &&
    left.evaluatorFamily === right.evaluatorFamily &&
    left.signerAddress === right.signerAddress &&
    left.signatureVerified === right.signatureVerified &&
    left.seed === right.seed &&
    left.seedCount === right.seedCount &&
    left.passed === right.passed
  );
}

function evaluatorIdentity(receipt: EvaluationReceiptRef): string {
  return receipt.signerAddress || receipt.evaluatorRef;
}

function validRule(rule: EvaluationRule): boolean {
  if (rule.kind === 'non_regression') {
    return Number.isFinite(rule.tolerance) && rule.tolerance >= 0;
  }
  return Number.isFinite(rule.value);
}

function issue(
  issues: WeightPlanIssue[],
  code: WeightPlanIssueCode,
  path: string,
  message: string,
  severity: WeightPlanIssue['severity'] = 'error'
): void {
  issues.push({ code, severity, path, message });
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function normalizedRoleContract(delta: WeightDelta): WeightRoleContract {
  if (!delta.roleContract) {
    return {
      role: 'generator',
      activation: {
        mode: 'global',
        allowUserVisibleOutput: true,
      },
    };
  }
  const activation = delta.roleContract.activation;
  return {
    role: delta.roleContract.role,
    activation: {
      mode: activation.mode,
      ...(activation.taskTags
        ? { taskTags: sortedUnique(activation.taskTags.map((tag) => tag.trim())) }
        : {}),
      ...(activation.minRouterConfidence !== undefined
        ? { minRouterConfidence: activation.minRouterConfidence }
        : {}),
      allowUserVisibleOutput: activation.allowUserVisibleOutput,
      ...(activation.fallbackHead ? { fallbackHead: activation.fallbackHead } : {}),
    },
  };
}

function validateGraph(
  graph: WeightDeltaGraph,
  issues: WeightPlanIssue[]
): {
  provides: string[];
  mustPreserve: string[];
  receiptsByRequirement: Map<string, EvaluationReceiptRef[]>;
} {
  if (graph.schema !== 'holoweight.graph.v1') {
    issue(issues, 'INVALID_GRAPH_SCHEMA', 'schema', 'Expected the holoweight.graph.v1 schema.');
  }
  if (!nonEmpty(graph.id)) {
    issue(issues, 'GRAPH_ID_REQUIRED', 'id', 'Graph id must be non-empty.');
  }
  if (!validDigest(graph.candidateDigest)) {
    issue(
      issues,
      'CANDIDATE_DIGEST_INVALID',
      'candidateDigest',
      'Candidate digest must be a lowercase sha256 content digest.'
    );
  }
  if (!validDigest(graph.base.artifact.digest)) {
    issue(
      issues,
      'BASE_DIGEST_INVALID',
      'base.artifact.digest',
      'Base artifact digest must be a lowercase sha256 content digest.'
    );
  }
  if (!nonEmpty(graph.base.architecture)) {
    issue(
      issues,
      'BASE_ARCHITECTURE_REQUIRED',
      'base.architecture',
      'Base architecture must be non-empty.'
    );
  }
  if (!validDigest(graph.base.tokenizerDigest)) {
    issue(
      issues,
      'BASE_TOKENIZER_DIGEST_INVALID',
      'base.tokenizerDigest',
      'Base tokenizer digest must be a lowercase sha256 content digest.'
    );
  }

  const nodeIds = new Set<string>();
  const provides: string[] = [];
  const mustPreserve: string[] = [];

  for (const [deltaIndex, delta] of graph.deltas.entries()) {
    const deltaPath = `deltas[${deltaIndex}]`;
    if (!nonEmpty(delta.id)) {
      issue(issues, 'DELTA_ID_REQUIRED', `${deltaPath}.id`, 'Delta id must be non-empty.');
    } else if (nodeIds.has(delta.id)) {
      issue(
        issues,
        'DUPLICATE_NODE_ID',
        `${deltaPath}.id`,
        `Node id "${delta.id}" is already declared.`
      );
    } else {
      nodeIds.add(delta.id);
    }

    if (!validDigest(delta.artifact.digest)) {
      issue(
        issues,
        'DELTA_ARTIFACT_DIGEST_INVALID',
        `${deltaPath}.artifact.digest`,
        'Delta artifact digest must be a lowercase sha256 content digest.'
      );
    }
    if (!nonEmpty(delta.producerRef)) {
      issue(
        issues,
        'DELTA_PRODUCER_REQUIRED',
        `${deltaPath}.producerRef`,
        'Delta producer reference must be non-empty.'
      );
    }
    if (delta.compatibility.baseDigest !== graph.base.artifact.digest) {
      issue(
        issues,
        'WEIGHT_BASE_MISMATCH',
        `${deltaPath}.compatibility.baseDigest`,
        'Delta base digest does not match the graph base artifact.'
      );
    }
    if (delta.compatibility.architecture !== graph.base.architecture) {
      issue(
        issues,
        'WEIGHT_ARCHITECTURE_MISMATCH',
        `${deltaPath}.compatibility.architecture`,
        'Delta architecture does not match the graph base architecture.'
      );
    }
    if (delta.compatibility.tokenizerDigest !== graph.base.tokenizerDigest) {
      issue(
        issues,
        'WEIGHT_TOKENIZER_MISMATCH',
        `${deltaPath}.compatibility.tokenizerDigest`,
        'Delta tokenizer digest does not match the graph base tokenizer.'
      );
    }

    const targetModules = delta.compatibility.targetModules;
    if (targetModules.length === 0) {
      issue(
        issues,
        'TARGET_MODULES_REQUIRED',
        `${deltaPath}.compatibility.targetModules`,
        'At least one target module is required.'
      );
    }
    const seenTargets = new Set<string>();
    for (const [targetIndex, target] of targetModules.entries()) {
      const targetPath = `${deltaPath}.compatibility.targetModules[${targetIndex}]`;
      if (!nonEmpty(target)) {
        issue(issues, 'TARGET_MODULE_REQUIRED', targetPath, 'Target module must be non-empty.');
      } else if (seenTargets.has(target)) {
        issue(
          issues,
          'DUPLICATE_TARGET_MODULE',
          targetPath,
          `Target module "${target}" is declared more than once.`
        );
      } else {
        seenTargets.add(target);
      }
    }
    if (
      delta.compatibility.rank !== undefined &&
      (!Number.isInteger(delta.compatibility.rank) || delta.compatibility.rank <= 0)
    ) {
      issue(
        issues,
        'INVALID_ADAPTER_RANK',
        `${deltaPath}.compatibility.rank`,
        'Adapter rank must be a positive integer when declared.'
      );
    }

    const roleContract = delta.roleContract;
    if (roleContract !== undefined) {
      const rolePath = `${deltaPath}.roleContract`;
      if (!WEIGHT_DELTA_ROLES.has(roleContract.role)) {
        issue(
          issues,
          'WEIGHT_ROLE_INVALID',
          `${rolePath}.role`,
          'Weight role must be generator, critic, router, or teacher.'
        );
      }
      const activation = roleContract.activation;
      if (!activation || typeof activation !== 'object') {
        issue(
          issues,
          'ACTIVATION_MODE_INVALID',
          `${rolePath}.activation`,
          'Role contract activation must be an object.'
        );
      } else {
        const activationPath = `${rolePath}.activation`;
        const validMode = WEIGHT_ACTIVATION_MODES.has(activation.mode);
        if (!validMode) {
          issue(
            issues,
            'ACTIVATION_MODE_INVALID',
            `${activationPath}.mode`,
            'Activation mode must be global, task_scoped, or shadow_only.'
          );
        }

        const taskTags = activation.taskTags;
        if (taskTags !== undefined && !Array.isArray(taskTags)) {
          issue(
            issues,
            'ACTIVATION_TASK_TAG_INVALID',
            `${activationPath}.taskTags`,
            'Activation task tags must be an array.'
          );
        } else if (Array.isArray(taskTags)) {
          const seenTags = new Set<string>();
          for (const [tagIndex, tag] of taskTags.entries()) {
            const tagPath = `${activationPath}.taskTags[${tagIndex}]`;
            if (typeof tag !== 'string' || !nonEmpty(tag)) {
              issue(
                issues,
                'ACTIVATION_TASK_TAG_INVALID',
                tagPath,
                'Activation task tags must be non-empty strings.'
              );
              continue;
            }
            const normalizedTag = tag.trim();
            if (seenTags.has(normalizedTag)) {
              issue(
                issues,
                'DUPLICATE_ACTIVATION_TASK_TAG',
                tagPath,
                `Activation task tag "${normalizedTag}" is declared more than once.`
              );
            }
            seenTags.add(normalizedTag);
          }
        }

        if (validMode && activation.mode === 'global' && (taskTags?.length ?? 0) > 0) {
          issue(
            issues,
            'ACTIVATION_TASK_TAGS_FORBIDDEN',
            `${activationPath}.taskTags`,
            'Global activation cannot also declare task tags.'
          );
        }
        if (
          validMode &&
          activation.mode !== 'global' &&
          (!Array.isArray(taskTags) || taskTags.length === 0)
        ) {
          issue(
            issues,
            'ACTIVATION_TASK_TAG_REQUIRED',
            `${activationPath}.taskTags`,
            'Task-scoped and shadow-only activation require at least one task tag.'
          );
        }

        const confidence = activation.minRouterConfidence;
        if (validMode && activation.mode !== 'global' && confidence === undefined) {
          issue(
            issues,
            'ACTIVATION_ROUTER_CONFIDENCE_REQUIRED',
            `${activationPath}.minRouterConfidence`,
            'Task-scoped and shadow-only activation require a router confidence threshold.'
          );
        } else if (
          confidence !== undefined &&
          (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
        ) {
          issue(
            issues,
            'ACTIVATION_ROUTER_CONFIDENCE_INVALID',
            `${activationPath}.minRouterConfidence`,
            'Router confidence must be a finite number between 0 and 1.'
          );
        }

        if (typeof activation.allowUserVisibleOutput !== 'boolean') {
          issue(
            issues,
            'ROLE_OUTPUT_VISIBILITY_INVALID',
            `${activationPath}.allowUserVisibleOutput`,
            'Role output visibility must be an explicit boolean.'
          );
        } else if (
          activation.allowUserVisibleOutput &&
          (roleContract.role !== 'generator' || activation.mode === 'shadow_only')
        ) {
          issue(
            issues,
            'ROLE_OUTPUT_VISIBILITY_FORBIDDEN',
            `${activationPath}.allowUserVisibleOutput`,
            'Only a non-shadow generator may emit user-visible output.'
          );
        }

        const fallbackHead = activation.fallbackHead;
        if (validMode && activation.mode !== 'global' && fallbackHead === undefined) {
          issue(
            issues,
            'ROLE_FALLBACK_HEAD_REQUIRED',
            `${activationPath}.fallbackHead`,
            'Task-scoped and shadow-only activation require an immutable fallback head.'
          );
        } else if (fallbackHead !== undefined && !validDigest(fallbackHead)) {
          issue(
            issues,
            'ROLE_FALLBACK_HEAD_INVALID',
            `${activationPath}.fallbackHead`,
            'Role fallback head must be a lowercase sha256 content digest.'
          );
        } else if (fallbackHead !== undefined && fallbackHead !== graph.previousAdmittedHead) {
          issue(
            issues,
            'ROLE_FALLBACK_HEAD_MISMATCH',
            `${activationPath}.fallbackHead`,
            'Role fallback head must match the graph previous admitted head.'
          );
        }
      }
    }

    for (const [labelIndex, label] of delta.provides.entries()) {
      if (!nonEmpty(label)) {
        issue(
          issues,
          'SEMANTIC_LABEL_REQUIRED',
          `${deltaPath}.provides[${labelIndex}]`,
          'Provided semantic label must be non-empty.'
        );
      } else {
        provides.push(label);
      }
    }
    for (const [labelIndex, label] of delta.mustPreserve.entries()) {
      if (!nonEmpty(label)) {
        issue(
          issues,
          'SEMANTIC_LABEL_REQUIRED',
          `${deltaPath}.mustPreserve[${labelIndex}]`,
          'Preserved semantic label must be non-empty.'
        );
      } else {
        mustPreserve.push(label);
      }
    }
  }

  const allCompositionIds = new Set(graph.compositions.map((composition) => composition.id));
  const availableInputs = new Set(nodeIds);
  for (const [compositionIndex, composition] of graph.compositions.entries()) {
    const compositionPath = `compositions[${compositionIndex}]`;
    allCompositionIds.delete(composition.id);

    if (!nonEmpty(composition.id)) {
      issue(
        issues,
        'COMPOSITION_ID_REQUIRED',
        `${compositionPath}.id`,
        'Composition id must be non-empty.'
      );
    } else if (nodeIds.has(composition.id)) {
      issue(
        issues,
        'DUPLICATE_NODE_ID',
        `${compositionPath}.id`,
        `Node id "${composition.id}" is already declared.`
      );
    } else {
      nodeIds.add(composition.id);
    }

    if (composition.inputs.length === 0) {
      issue(
        issues,
        'COMPOSITION_INPUT_REQUIRED',
        `${compositionPath}.inputs`,
        'At least one composition input is required.'
      );
    }
    const seenInputs = new Set<string>();
    for (const [inputIndex, input] of composition.inputs.entries()) {
      const inputPath = `${compositionPath}.inputs[${inputIndex}]`;
      if (!nonEmpty(input)) {
        issue(issues, 'COMPOSITION_INPUT_REQUIRED', inputPath, 'Composition input is required.');
      } else if (seenInputs.has(input)) {
        issue(
          issues,
          'DUPLICATE_COMPOSITION_INPUT',
          inputPath,
          `Composition input "${input}" is declared more than once.`
        );
      } else if (!availableInputs.has(input)) {
        if (allCompositionIds.has(input)) {
          issue(
            issues,
            'COMPOSITION_INPUT_FORWARD_REFERENCE',
            inputPath,
            `Composition input "${input}" is declared later in the graph.`
          );
        } else {
          issue(
            issues,
            'COMPOSITION_INPUT_NOT_FOUND',
            inputPath,
            `Composition input "${input}" does not reference a delta or earlier composition.`
          );
        }
      }
      seenInputs.add(input);
    }
    if (nonEmpty(composition.id)) {
      availableInputs.add(composition.id);
    }
  }

  const semanticLabels = new Set([...provides, ...mustPreserve]);
  if (graph.requirements.length === 0) {
    issue(
      issues,
      'REQUIREMENT_REQUIRED',
      'requirements',
      'At least one behavioral evaluation requirement is required.'
    );
  }
  const requirementIds = new Set<string>();
  for (const [requirementIndex, requirement] of graph.requirements.entries()) {
    const requirementPath = `requirements[${requirementIndex}]`;
    if (!nonEmpty(requirement.id)) {
      issue(
        issues,
        'REQUIREMENT_ID_REQUIRED',
        `${requirementPath}.id`,
        'Requirement id must be non-empty.'
      );
    } else if (requirementIds.has(requirement.id)) {
      issue(
        issues,
        'DUPLICATE_REQUIREMENT_ID',
        `${requirementPath}.id`,
        `Requirement id "${requirement.id}" is already declared.`
      );
    } else {
      requirementIds.add(requirement.id);
    }
    if (!nonEmpty(requirement.subject)) {
      issue(
        issues,
        'REQUIREMENT_SUBJECT_REQUIRED',
        `${requirementPath}.subject`,
        'Requirement subject must be non-empty.'
      );
    } else if (!semanticLabels.has(requirement.subject)) {
      issue(
        issues,
        'REQUIREMENT_SUBJECT_NOT_DECLARED',
        `${requirementPath}.subject`,
        `Requirement subject "${requirement.subject}" is not declared by a delta.`
      );
    }
    if (!nonEmpty(requirement.metric)) {
      issue(
        issues,
        'REQUIREMENT_METRIC_REQUIRED',
        `${requirementPath}.metric`,
        'Requirement metric must be non-empty.'
      );
    }
    if (!validDigest(requirement.suiteDigest)) {
      issue(
        issues,
        'REQUIREMENT_SUITE_DIGEST_INVALID',
        `${requirementPath}.suiteDigest`,
        'Evaluation suite digest must be a lowercase sha256 content digest.'
      );
    }
    if (!Number.isInteger(requirement.minSeeds) || requirement.minSeeds < 1) {
      issue(
        issues,
        'REQUIREMENT_MIN_SEEDS_INVALID',
        `${requirementPath}.minSeeds`,
        'Minimum seed count must be a positive integer.'
      );
    }
    if (!validRule(requirement.rule)) {
      issue(
        issues,
        'REQUIREMENT_RULE_INVALID',
        `${requirementPath}.rule`,
        'Evaluation rule must contain a finite value and a non-negative tolerance.'
      );
    }
  }

  const receiptGroups = new Map<string, Array<{ receipt: EvaluationReceiptRef; index: number }>>();
  for (const [receiptIndex, receipt] of (graph.receipts ?? []).entries()) {
    const receiptPath = `receipts[${receiptIndex}]`;
    if (!requirementIds.has(receipt.requirementId)) {
      issue(
        issues,
        'RECEIPT_REQUIREMENT_NOT_FOUND',
        `${receiptPath}.requirementId`,
        `Receipt references undeclared requirement "${receipt.requirementId}".`
      );
    }
    if (!validDigest(receipt.receiptDigest)) {
      issue(
        issues,
        'RECEIPT_DIGEST_INVALID',
        `${receiptPath}.receiptDigest`,
        'Receipt digest must be a lowercase sha256 content digest.',
        'warning'
      );
    }
    if (!nonEmpty(receipt.evaluatorRef)) {
      issue(
        issues,
        'RECEIPT_EVALUATOR_REQUIRED',
        `${receiptPath}.evaluatorRef`,
        'Receipt evaluator reference must be non-empty.',
        'warning'
      );
    }
    if (!Number.isInteger(receipt.seedCount) || receipt.seedCount < 0) {
      issue(
        issues,
        'RECEIPT_SEED_COUNT_INVALID',
        `${receiptPath}.seedCount`,
        'Receipt seed count must be a non-negative integer.',
        'warning'
      );
    }
    const group = receiptGroups.get(receipt.requirementId) ?? [];
    group.push({ receipt, index: receiptIndex });
    receiptGroups.set(receipt.requirementId, group);
  }

  const receiptsByRequirement = new Map<string, EvaluationReceiptRef[]>();
  for (const [requirementId, group] of receiptGroups) {
    const byEvaluator = new Map<string, Array<{ receipt: EvaluationReceiptRef; index: number }>>();
    for (const entry of group) {
      const identity = evaluatorIdentity(entry.receipt);
      const evaluatorGroup = byEvaluator.get(identity) ?? [];
      evaluatorGroup.push(entry);
      byEvaluator.set(identity, evaluatorGroup);
    }
    let conflicting = false;
    for (const evaluatorGroup of byEvaluator.values()) {
      const first = evaluatorGroup[0];
      if (!first) continue;
      if (evaluatorGroup.some(({ receipt }) => !receiptEquals(receipt, first.receipt))) {
        issue(
          issues,
          'CONFLICTING_REQUIREMENT_RECEIPTS',
          `receipts[${first.index}]`,
          `Requirement "${requirementId}" has conflicting receipts from evaluator "${evaluatorIdentity(first.receipt)}".`
        );
        conflicting = true;
      }
    }
    if (conflicting) continue;
    receiptsByRequirement.set(
      requirementId,
      [...byEvaluator.values()].flatMap((entries) => (entries[0] ? [entries[0].receipt] : []))
    );
  }

  if (graph.previousAdmittedHead !== undefined && !validDigest(graph.previousAdmittedHead)) {
    issue(
      issues,
      'PREVIOUS_HEAD_DIGEST_INVALID',
      'previousAdmittedHead',
      'Previous admitted head must be a lowercase sha256 content digest.'
    );
  }

  return {
    provides: sortedUnique(provides),
    mustPreserve: sortedUnique(mustPreserve),
    receiptsByRequirement,
  };
}

function admissionPlan(
  graph: WeightDeltaGraph,
  receiptsByRequirement: Map<string, EvaluationReceiptRef[]>
): AdmissionRequirementPlan[] {
  return graph.requirements.map((requirement) => {
    const receipts = receiptsByRequirement.get(requirement.id) ?? [];
    if (receipts.length === 0) {
      return { requirementId: requirement.id, status: 'missing' };
    }
    const result = (status: AdmissionRequirementStatus): AdmissionRequirementPlan => ({
      requirementId: requirement.id,
      status,
      receipt: receipts[0],
      receipts,
      evaluatorEvidence: {
        verifiedSigners: sortedUnique(
          receipts
            .filter((receipt) => receipt.signatureVerified === true && receipt.signerAddress)
            .map((receipt) => receipt.signerAddress!)
        ),
        evaluatorFamilies: sortedUnique(
          receipts
            .filter((receipt) => receipt.signatureVerified === true && receipt.evaluatorFamily)
            .map((receipt) => receipt.evaluatorFamily!)
        ),
        seedCount: receipts.every((receipt) => Number.isInteger(receipt.seed))
          ? new Set(receipts.map((receipt) => receipt.seed)).size
          : Math.max(...receipts.map((receipt) => receipt.seedCount)),
      },
    });
    if (
      receipts.some(
        (receipt) =>
          !validDigest(receipt.receiptDigest) ||
          !nonEmpty(receipt.evaluatorRef) ||
          !Number.isInteger(receipt.seedCount) ||
          receipt.seedCount < 0
      )
    ) {
      return result('invalid_receipt');
    }
    if (receipts.some((receipt) => receipt.candidateDigest !== graph.candidateDigest)) {
      return result('candidate_mismatch');
    }
    if (receipts.some((receipt) => !receipt.passed)) {
      return result('failed');
    }
    const evidence = result('satisfied').evaluatorEvidence!;
    if (evidence.seedCount < requirement.minSeeds) {
      return result('under_seeded');
    }
    if (requirement.evaluatorPolicy !== 'deterministic') {
      const allSigned = receipts.every(
        (receipt) =>
          receipt.signatureVerified === true &&
          nonEmpty(receipt.signerAddress || '') &&
          nonEmpty(receipt.evaluatorFamily || '')
      );
      if (!allSigned) return result('unverified_evaluator');
      if (evidence.verifiedSigners.length < 2) return result('insufficient_independence');
      if (requirement.evaluatorPolicy === 'cross_family' && evidence.evaluatorFamilies.length < 2) {
        return result('insufficient_families');
      }
    }
    return result('satisfied');
  });
}

function executionSteps(
  graph: WeightDeltaGraph,
  ready: boolean,
  rollbackHead: ContentDigest | undefined
): WeightExecutionStep[] {
  const steps: WeightExecutionStep[] = [
    {
      kind: 'select-base',
      artifact: { ...graph.base.artifact },
      architecture: graph.base.architecture,
      tokenizerDigest: graph.base.tokenizerDigest,
    },
    ...graph.deltas.map(
      (delta): WeightExecutionStep => ({
        kind: 'apply-delta',
        deltaId: delta.id,
        artifact: { ...delta.artifact },
        roleContract: normalizedRoleContract(delta),
      })
    ),
    ...graph.compositions.map(
      (composition): WeightExecutionStep => ({
        kind: 'compose',
        compositionId: composition.id,
        inputs: [...composition.inputs],
        method: composition.method,
        ...(composition.parameters ? { parameters: { ...composition.parameters } } : {}),
      })
    ),
    ...graph.requirements.map(
      (requirement): WeightExecutionStep => ({
        kind: 'evaluate',
        requirementId: requirement.id,
        candidateDigest: graph.candidateDigest,
        suiteDigest: requirement.suiteDigest,
        minSeeds: requirement.minSeeds,
        evaluatorPolicy: requirement.evaluatorPolicy,
      })
    ),
    { kind: 'admit', candidateDigest: graph.candidateDigest, ready },
  ];
  if (rollbackHead) {
    steps.push({ kind: 'select-rollback-head', head: rollbackHead });
  }
  return steps;
}

/**
 * Validate a HoloWeight graph and emit the deterministic work/evidence plan for its exact
 * candidate. `ready` means ready for an external admission transaction; this function does not
 * perform that transaction.
 */
export function planWeightDeltaGraph(graph: WeightDeltaGraph): WeightExecutionPlan {
  const issues: WeightPlanIssue[] = [];
  const { provides, mustPreserve, receiptsByRequirement } = validateGraph(graph, issues);
  issues.sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      compareText(left.code, right.code) ||
      compareText(left.severity, right.severity)
  );

  const admissionRequirements = admissionPlan(graph, receiptsByRequirement);
  const invalid = issues.some((entry) => entry.severity === 'error');
  const ready =
    !invalid &&
    admissionRequirements.length > 0 &&
    admissionRequirements.every((requirement) => requirement.status === 'satisfied');
  const readiness: WeightGraphReadiness = invalid ? 'invalid' : ready ? 'ready' : 'candidate';
  const rollbackHead =
    graph.previousAdmittedHead && validDigest(graph.previousAdmittedHead)
      ? graph.previousAdmittedHead
      : undefined;

  return {
    graphId: graph.id,
    candidateDigest: graph.candidateDigest,
    readiness,
    issues,
    steps: invalid ? [] : executionSteps(graph, ready, rollbackHead),
    semanticLabels: { provides, mustPreserve },
    admissionRequirements,
    ...(rollbackHead ? { rollbackHead } : {}),
  };
}
