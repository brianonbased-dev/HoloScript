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

export interface WeightDelta {
  id: string;
  artifact: WeightArtifactRef;
  compatibility: WeightCompatibility;
  provides: string[];
  mustPreserve: string[];
  producerRef: string;
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
  | 'satisfied';

export interface AdmissionRequirementPlan {
  requirementId: string;
  status: AdmissionRequirementStatus;
  receipt?: EvaluationReceiptRef;
}

export type WeightExecutionStep =
  | {
      kind: 'select-base';
      artifact: WeightArtifactRef;
      architecture: string;
      tokenizerDigest: ContentDigest;
    }
  | { kind: 'apply-delta'; deltaId: string; artifact: WeightArtifactRef }
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
    left.seedCount === right.seedCount &&
    left.passed === right.passed
  );
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

function validateGraph(
  graph: WeightDeltaGraph,
  issues: WeightPlanIssue[]
): {
  provides: string[];
  mustPreserve: string[];
  receiptsByRequirement: Map<string, EvaluationReceiptRef>;
} {
  if (graph.schema !== 'holoweight.graph.v1') {
    issue(
      issues,
      'INVALID_GRAPH_SCHEMA',
      'schema',
      'Expected the holoweight.graph.v1 schema.'
    );
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

  const receiptsByRequirement = new Map<string, EvaluationReceiptRef>();
  for (const [requirementId, group] of receiptGroups) {
    const first = group[0];
    if (!first) continue;
    if (group.some(({ receipt }) => !receiptEquals(receipt, first.receipt))) {
      issue(
        issues,
        'CONFLICTING_REQUIREMENT_RECEIPTS',
        `receipts[${first.index}]`,
        `Requirement "${requirementId}" has non-identical duplicate receipts.`
      );
      continue;
    }
    receiptsByRequirement.set(requirementId, first.receipt);
  }

  if (
    graph.previousAdmittedHead !== undefined &&
    !validDigest(graph.previousAdmittedHead)
  ) {
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
  receiptsByRequirement: Map<string, EvaluationReceiptRef>
): AdmissionRequirementPlan[] {
  return graph.requirements.map((requirement) => {
    const receipt = receiptsByRequirement.get(requirement.id);
    if (!receipt) {
      return { requirementId: requirement.id, status: 'missing' };
    }
    if (
      !validDigest(receipt.receiptDigest) ||
      !nonEmpty(receipt.evaluatorRef) ||
      !Number.isInteger(receipt.seedCount) ||
      receipt.seedCount < 0
    ) {
      return { requirementId: requirement.id, status: 'invalid_receipt', receipt };
    }
    if (receipt.candidateDigest !== graph.candidateDigest) {
      return { requirementId: requirement.id, status: 'candidate_mismatch', receipt };
    }
    if (!receipt.passed) {
      return { requirementId: requirement.id, status: 'failed', receipt };
    }
    if (receipt.seedCount < requirement.minSeeds) {
      return { requirementId: requirement.id, status: 'under_seeded', receipt };
    }
    return { requirementId: requirement.id, status: 'satisfied', receipt };
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
