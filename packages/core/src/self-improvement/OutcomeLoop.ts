/**
 * OutcomeLoop
 *
 * Rubric-driven quality gate for iterative artifact improvement.
 * The implementer and grader receive separate contexts, and every run
 * produces an OutcomeReceipt with artifact hashes and validation evidence.
 */

import { createHash } from 'node:crypto';

export const OUTCOME_SCHEMA_VERSION = '1.0.0';

export type OutcomeArtifactKind = 'code' | 'docs' | 'test' | 'data' | 'other';
export type OutcomeStopReason = 'pass' | 'iteration_cap' | 'circuit_breaker_failure';

export interface OutcomeArtifact {
  path: string;
  kind: OutcomeArtifactKind;
  content: string;
}

export interface OutcomeArtifactHash {
  path: string;
  kind: OutcomeArtifactKind;
  algorithm: 'sha256';
  hash: string;
}

export interface OutcomeCriterion {
  id: string;
  description: string;
  weight?: number;
  threshold?: number;
}

export interface OutcomeCriterionGrade {
  criterionId: string;
  score: number;
  passed: boolean;
  gap?: string;
}

export interface OutcomeGraderIdentity {
  id: string;
  kind: 'agent' | 'model' | 'human' | 'tool';
  label?: string;
}

export interface OutcomeValidationCommand {
  id?: string;
  command: string;
  required?: boolean;
}

export interface OutcomeValidationResult extends OutcomeValidationCommand {
  passed: boolean;
  exitCode?: number;
  stdoutHash?: string;
  stderrHash?: string;
}

export interface OutcomeCircuitBreakerConfig {
  maxConsecutiveFailures?: number;
  minScoreProgress?: number;
}

export interface OutcomeSpec {
  id: string;
  rubric: OutcomeCriterion[];
  threshold: number;
  maxIterations: number;
  artifacts: OutcomeArtifact[];
  grader: OutcomeGraderIdentity;
  validationCommands: OutcomeValidationCommand[];
  circuitBreaker?: OutcomeCircuitBreakerConfig;
  metadata?: Record<string, unknown>;
}

export interface OutcomeLoopContext {
  role: 'implementer' | 'grader' | 'validator';
  contextId: string;
  iteration: number;
}

export interface OutcomeImplementerInput {
  spec: OutcomeSpec;
  artifacts: OutcomeArtifact[];
  previousGaps: OutcomeCriterionGrade[];
  context: OutcomeLoopContext;
}

export interface OutcomeImplementerResult {
  artifacts: OutcomeArtifact[];
  notes?: string;
}

export interface OutcomeGraderInput {
  spec: OutcomeSpec;
  artifacts: OutcomeArtifact[];
  artifactHashes: OutcomeArtifactHash[];
  validationResults: OutcomeValidationResult[];
  context: OutcomeLoopContext;
}

export interface OutcomeGraderResult {
  score?: number;
  criteria: OutcomeCriterionGrade[];
  summary?: string;
}

export interface OutcomeIterationReceipt {
  iteration: number;
  score: number;
  passed: boolean;
  criteria: OutcomeCriterionGrade[];
  gaps: OutcomeCriterionGrade[];
  artifactHashes: OutcomeArtifactHash[];
  validationResults: OutcomeValidationResult[];
  implementerContextId: string;
  graderContextId: string;
  notes?: string;
  summary?: string;
}

export interface OutcomeReceipt {
  schemaVersion: typeof OUTCOME_SCHEMA_VERSION;
  specId: string;
  status: OutcomeStopReason;
  passed: boolean;
  score: number;
  threshold: number;
  iterations: number;
  iterationCap: number;
  artifactHashes: OutcomeArtifactHash[];
  graderIdentity: OutcomeGraderIdentity;
  validationCommands: OutcomeValidationCommand[];
  criteria: OutcomeCriterionGrade[];
  iterationReceipts: OutcomeIterationReceipt[];
  stoppedReason: string;
  timestamp: string;
}

export interface OutcomeLoopOptions {
  implementer: (input: OutcomeImplementerInput) => OutcomeImplementerResult | Promise<OutcomeImplementerResult>;
  grader: (input: OutcomeGraderInput) => OutcomeGraderResult | Promise<OutcomeGraderResult>;
  validationRunner?: (
    command: OutcomeValidationCommand,
    context: OutcomeLoopContext
  ) => OutcomeValidationResult | Promise<OutcomeValidationResult>;
  now?: () => Date;
}

export function artifactHash(artifact: OutcomeArtifact): OutcomeArtifactHash {
  return {
    path: artifact.path,
    kind: artifact.kind,
    algorithm: 'sha256',
    hash: createHash('sha256').update(artifact.content).digest('hex'),
  };
}

export function artifactHashes(artifacts: OutcomeArtifact[]): OutcomeArtifactHash[] {
  return artifacts.map(artifactHash);
}

export function validateOutcomeSpec(spec: OutcomeSpec): string[] {
  const errors: string[] = [];
  if (!spec.id) errors.push('OutcomeSpec.id is required.');
  if (!Array.isArray(spec.rubric) || spec.rubric.length === 0) {
    errors.push('OutcomeSpec.rubric must include at least one criterion.');
  }
  if (!Number.isFinite(spec.threshold) || spec.threshold <= 0 || spec.threshold > 1) {
    errors.push('OutcomeSpec.threshold must be in (0, 1].');
  }
  if (!Number.isInteger(spec.maxIterations) || spec.maxIterations < 1) {
    errors.push('OutcomeSpec.maxIterations must be a positive integer.');
  }
  if (!Array.isArray(spec.artifacts) || spec.artifacts.length === 0) {
    errors.push('OutcomeSpec.artifacts must include at least one artifact.');
  }
  if (!spec.grader?.id) errors.push('OutcomeSpec.grader.id is required.');
  if (!Array.isArray(spec.validationCommands)) {
    errors.push('OutcomeSpec.validationCommands must be an array.');
  }
  return errors;
}

function cloneArtifacts(artifacts: OutcomeArtifact[]): OutcomeArtifact[] {
  return artifacts.map((artifact) => ({ ...artifact }));
}

function cloneSpec(spec: OutcomeSpec): OutcomeSpec {
  return {
    ...spec,
    rubric: spec.rubric.map((criterion) => ({ ...criterion })),
    artifacts: cloneArtifacts(spec.artifacts),
    validationCommands: spec.validationCommands.map((command) => ({ ...command })),
    grader: { ...spec.grader },
    circuitBreaker: spec.circuitBreaker ? { ...spec.circuitBreaker } : undefined,
    metadata: spec.metadata ? { ...spec.metadata } : undefined,
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function scoreFromCriteria(spec: OutcomeSpec, criteria: OutcomeCriterionGrade[]): number {
  if (criteria.length === 0) return 0;
  const weights = new Map(spec.rubric.map((criterion) => [criterion.id, criterion.weight ?? 1]));
  const totalWeight = criteria.reduce((sum, criterion) => sum + Math.max(0, weights.get(criterion.criterionId) ?? 1), 0);
  if (totalWeight === 0) return 0;
  const weighted = criteria.reduce((sum, criterion) => {
    const weight = Math.max(0, weights.get(criterion.criterionId) ?? 1);
    return sum + clampScore(criterion.score) * weight;
  }, 0);
  return Math.round((weighted / totalWeight) * 10000) / 10000;
}

function normalizeGrade(spec: OutcomeSpec, grade: OutcomeGraderResult): OutcomeGraderResult & { score: number } {
  const returned = new Map(
    grade.criteria.map((criterion) => [
      criterion.criterionId,
      {
        ...criterion,
        score: clampScore(criterion.score),
      },
    ])
  );
  const criteria = spec.rubric.map((rubricCriterion) => {
    const criterion = returned.get(rubricCriterion.id);
    if (criterion) return criterion;
    return {
      criterionId: rubricCriterion.id,
      score: 0,
      passed: false,
      gap: 'No grade returned for this rubric criterion.',
    };
  });
  return {
    ...grade,
    criteria,
    score: clampScore(grade.score ?? scoreFromCriteria(spec, criteria)),
  };
}

function makeContext(specId: string, role: OutcomeLoopContext['role'], iteration: number): OutcomeLoopContext {
  return {
    role,
    iteration,
    contextId: `${specId}:${role}:${iteration}`,
  };
}

function validationFallback(command: OutcomeValidationCommand): OutcomeValidationResult {
  return {
    ...command,
    passed: true,
    exitCode: 0,
  };
}

function requiredValidationFailed(results: OutcomeValidationResult[]): boolean {
  return results.some((result) => result.required !== false && !result.passed);
}

function circuitBreakerTripped(
  spec: OutcomeSpec,
  receipts: OutcomeIterationReceipt[],
  consecutiveFailures: number
): string | null {
  const config = spec.circuitBreaker;
  if (!config) return null;
  if (
    config.maxConsecutiveFailures !== undefined &&
    consecutiveFailures >= config.maxConsecutiveFailures
  ) {
    return `Circuit breaker tripped after ${consecutiveFailures} consecutive failed iteration(s).`;
  }
  if (config.minScoreProgress !== undefined && receipts.length >= 2) {
    const latest = receipts[receipts.length - 1];
    const previous = receipts[receipts.length - 2];
    if (latest.score - previous.score < config.minScoreProgress) {
      return `Circuit breaker tripped because score progress ${latest.score - previous.score} was below ${config.minScoreProgress}.`;
    }
  }
  return null;
}

export class OutcomeLoop {
  private readonly options: OutcomeLoopOptions;

  constructor(options: OutcomeLoopOptions) {
    this.options = options;
  }

  async run(specInput: OutcomeSpec): Promise<OutcomeReceipt> {
    const errors = validateOutcomeSpec(specInput);
    if (errors.length) {
      throw new Error(`Invalid OutcomeSpec:\n${errors.join('\n')}`);
    }

    const spec = cloneSpec(specInput);
    const receipts: OutcomeIterationReceipt[] = [];
    let artifacts = cloneArtifacts(spec.artifacts);
    let previousGaps: OutcomeCriterionGrade[] = [];
    let consecutiveFailures = 0;

    for (let iteration = 1; iteration <= spec.maxIterations; iteration += 1) {
      const implementerContext = makeContext(spec.id, 'implementer', iteration);
      const implementation = await this.options.implementer({
        spec: cloneSpec(spec),
        artifacts: cloneArtifacts(artifacts),
        previousGaps: previousGaps.map((gap) => ({ ...gap })),
        context: implementerContext,
      });
      artifacts = cloneArtifacts(implementation.artifacts);
      const hashes = artifactHashes(artifacts);

      const validationResults = await Promise.all(
        spec.validationCommands.map((command) => {
          const validationContext = makeContext(spec.id, 'validator', iteration);
          return this.options.validationRunner
            ? this.options.validationRunner({ ...command }, validationContext)
            : validationFallback(command);
        })
      );

      const graderContext = makeContext(spec.id, 'grader', iteration);
      const grade = normalizeGrade(
        spec,
        await this.options.grader({
          spec: cloneSpec(spec),
          artifacts: cloneArtifacts(artifacts),
          artifactHashes: hashes.map((hash) => ({ ...hash })),
          validationResults: validationResults.map((result) => ({ ...result })),
          context: graderContext,
        })
      );

      const gaps = grade.criteria.filter((criterion) => !criterion.passed);
      const passed = grade.score >= spec.threshold && !requiredValidationFailed(validationResults);
      consecutiveFailures = passed ? 0 : consecutiveFailures + 1;

      const iterationReceipt: OutcomeIterationReceipt = {
        iteration,
        score: grade.score,
        passed,
        criteria: grade.criteria,
        gaps,
        artifactHashes: hashes,
        validationResults,
        implementerContextId: implementerContext.contextId,
        graderContextId: graderContext.contextId,
        notes: implementation.notes,
        summary: grade.summary,
      };
      receipts.push(iterationReceipt);

      if (passed) {
        return this.buildReceipt(spec, receipts, 'pass', 'Outcome threshold passed.');
      }

      const breakerReason = circuitBreakerTripped(spec, receipts, consecutiveFailures);
      if (breakerReason) {
        return this.buildReceipt(spec, receipts, 'circuit_breaker_failure', breakerReason);
      }

      previousGaps = gaps.map((gap) => ({ ...gap }));
    }

    return this.buildReceipt(
      spec,
      receipts,
      'iteration_cap',
      `Outcome loop stopped at iteration cap ${spec.maxIterations}.`
    );
  }

  private buildReceipt(
    spec: OutcomeSpec,
    receipts: OutcomeIterationReceipt[],
    status: OutcomeStopReason,
    stoppedReason: string
  ): OutcomeReceipt {
    const latest = receipts[receipts.length - 1];
    return {
      schemaVersion: OUTCOME_SCHEMA_VERSION,
      specId: spec.id,
      status,
      passed: status === 'pass',
      score: latest?.score ?? 0,
      threshold: spec.threshold,
      iterations: receipts.length,
      iterationCap: spec.maxIterations,
      artifactHashes: latest?.artifactHashes ?? artifactHashes(spec.artifacts),
      graderIdentity: { ...spec.grader },
      validationCommands: spec.validationCommands.map((command) => ({ ...command })),
      criteria: latest?.criteria ?? [],
      iterationReceipts: receipts,
      stoppedReason,
      timestamp: (this.options.now?.() ?? new Date()).toISOString(),
    };
  }
}

export function runOutcomeLoop(spec: OutcomeSpec, options: OutcomeLoopOptions): Promise<OutcomeReceipt> {
  return new OutcomeLoop(options).run(spec);
}
