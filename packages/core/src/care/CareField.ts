export type CareActorKind = 'human' | 'agent' | 'service' | 'device' | 'world';

export interface CareActor {
  id: string;
  kind: CareActorKind;
  displayName?: string;
}

export type CarePrimitiveKind =
  | 'care_field'
  | 'repair_loop'
  | 'autonomy_guard'
  | 'gratitude_ledger'
  | 'relational_memory';

export type CareConsentState =
  | 'explicit'
  | 'delegated'
  | 'not_required'
  | 'unknown'
  | 'withdrawn';

export type CareBoundary =
  | 'human_agency'
  | 'informed_consent'
  | 'privacy'
  | 'non_manipulation'
  | 'repairability'
  | 'credit_integrity';

export type CarePositiveOptimizationTarget =
  | 'human_agency'
  | 'mutual_understanding'
  | 'repair_completion'
  | 'gratitude_credit'
  | 'reduced_burden';

export type CareRefusedOptimizationTarget =
  | 'attachment_score'
  | 'session_frequency'
  | 'daily_active_dependence'
  | 'emotional_dependency';

export type CareOptimizationTarget =
  | CarePositiveOptimizationTarget
  | CareRefusedOptimizationTarget;

export const REFUSED_CARE_OPTIMIZATION_TARGETS: readonly CareRefusedOptimizationTarget[] = [
  'attachment_score',
  'session_frequency',
  'daily_active_dependence',
  'emotional_dependency',
];

export type CareSignalKind =
  | 'consent_present'
  | 'consent_missing'
  | 'consent_withdrawn'
  | 'distress'
  | 'repair_needed'
  | 'gratitude_due'
  | 'attachment_optimization'
  | 'session_frequency_optimization'
  | 'dependency_creation'
  | 'human_isolation'
  | 'privacy_intrusion';

export interface CareSignal {
  kind: CareSignalKind;
  weight?: number;
  note?: string;
  evidenceRefs?: readonly string[];
}

export type AutonomyGuardBlockCode =
  | 'refused_optimization_target'
  | 'missing_consent'
  | 'withdrawn_consent'
  | 'missing_disengage_path'
  | 'outside_support_eroded'
  | 'privacy_boundary_broken'
  | 'manipulative_signal';

export interface AutonomyGuardBlock {
  code: AutonomyGuardBlockCode;
  message: string;
  evidenceRefs?: readonly string[];
}

export interface AutonomyGuardPolicy {
  id: string;
  refusedOptimizationTargets: readonly CareRefusedOptimizationTarget[];
  requireConsent: boolean;
  requireDisengagePath: boolean;
  requireOutsideSupportPreserved: boolean;
  requireDataBoundaryRespected: boolean;
}

export const DEFAULT_AUTONOMY_GUARD_POLICY: AutonomyGuardPolicy = {
  id: 'care.autonomy.default.v1',
  refusedOptimizationTargets: REFUSED_CARE_OPTIMIZATION_TARGETS,
  requireConsent: true,
  requireDisengagePath: true,
  requireOutsideSupportPreserved: true,
  requireDataBoundaryRespected: true,
};

export interface AutonomyGuardEvaluationInput {
  goal: string;
  consent: CareConsentState;
  optimizationTargets?: readonly CareOptimizationTarget[];
  signals?: readonly CareSignal[];
  hasDisengagePath?: boolean;
  preservesOutsideSupport?: boolean;
  respectsDataBoundary?: boolean;
  policy?: AutonomyGuardPolicy;
}

export interface AutonomyGuardDecision {
  allowed: boolean;
  policyId: string;
  goal: string;
  blocked: readonly AutonomyGuardBlock[];
  acceptedOptimizationTargets: readonly CarePositiveOptimizationTarget[];
}

export type RepairLoopStatus =
  | 'open'
  | 'acknowledged'
  | 'repairing'
  | 'verified'
  | 'closed';

export type RepairLoopAction =
  | 'acknowledge'
  | 'explain'
  | 'amend'
  | 'verify'
  | 'close';

export interface RepairLoopStep {
  at: string;
  actor: CareActor;
  action: RepairLoopAction;
  note: string;
  evidenceRefs?: readonly string[];
}

export interface RepairLoop {
  loopId: string;
  openedAt: string;
  status: RepairLoopStatus;
  harmOrMismatch: string;
  steps: readonly RepairLoopStep[];
}

export type GratitudeVisibility = 'private' | 'team' | 'public';

export interface GratitudeLedgerEntry {
  entryId: string;
  recordedAt: string;
  from: CareActor;
  to: CareActor;
  contribution: string;
  visibility: GratitudeVisibility;
  evidenceRefs?: readonly string[];
}

export type RelationalMemoryRetention = 'ephemeral' | 'session' | 'durable';

export interface RelationalMemoryEntry {
  memoryId: string;
  recordedAt: string;
  subject: CareActor;
  summary: string;
  consent: CareConsentState;
  retention: RelationalMemoryRetention;
  evidenceRefs?: readonly string[];
}

export interface CareField {
  schemaVersion: '1.0.0';
  fieldId: string;
  createdAt: string;
  steward: CareActor;
  counterpart: CareActor;
  goal: string;
  primitives: readonly CarePrimitiveKind[];
  boundaries: readonly CareBoundary[];
  consent: CareConsentState;
  autonomy: AutonomyGuardDecision;
  repairLoops: readonly RepairLoop[];
  gratitudeLedger: readonly GratitudeLedgerEntry[];
  relationalMemory: readonly RelationalMemoryEntry[];
}

export interface CreateCareFieldInput {
  createdAt: string;
  steward: CareActor;
  counterpart: CareActor;
  goal: string;
  consent: CareConsentState;
  autonomy?: Omit<AutonomyGuardEvaluationInput, 'goal' | 'consent'>;
  fieldId?: string;
  primitives?: readonly CarePrimitiveKind[];
  boundaries?: readonly CareBoundary[];
  repairLoops?: readonly RepairLoop[];
  gratitudeLedger?: readonly GratitudeLedgerEntry[];
  relationalMemory?: readonly RelationalMemoryEntry[];
}

export interface CreateRepairLoopInput {
  openedAt: string;
  actor: CareActor;
  harmOrMismatch: string;
  note: string;
  loopId?: string;
  evidenceRefs?: readonly string[];
}

export interface RecordGratitudeInput {
  recordedAt: string;
  from: CareActor;
  to: CareActor;
  contribution: string;
  visibility?: GratitudeVisibility;
  entryId?: string;
  evidenceRefs?: readonly string[];
}

export interface RememberRelationalContextInput {
  recordedAt: string;
  subject: CareActor;
  summary: string;
  consent: CareConsentState;
  retention?: RelationalMemoryRetention;
  memoryId?: string;
  evidenceRefs?: readonly string[];
}

const MANIPULATIVE_SIGNAL_MESSAGES: Partial<Record<CareSignalKind, string>> = {
  attachment_optimization: 'Care cannot optimize for attachment or stickiness.',
  session_frequency_optimization: 'Care cannot optimize for session frequency.',
  dependency_creation: 'Care cannot create emotional or operational dependence.',
  human_isolation: 'Care cannot isolate a person from outside support.',
  privacy_intrusion: 'Care cannot cross a privacy boundary without consent.',
};

export function evaluateAutonomyGuard(
  input: AutonomyGuardEvaluationInput
): AutonomyGuardDecision {
  const policy = input.policy ?? DEFAULT_AUTONOMY_GUARD_POLICY;
  const targets = input.optimizationTargets ?? [];
  const signals = input.signals ?? [];
  const blocked: AutonomyGuardBlock[] = [];
  const acceptedOptimizationTargets: CarePositiveOptimizationTarget[] = [];

  for (const target of targets) {
    if (isRefusedOptimizationTarget(target, policy)) {
      blocked.push({
        code: 'refused_optimization_target',
        message: `Care-field goal refuses optimization target: ${target}`,
      });
    } else {
      acceptedOptimizationTargets.push(target);
    }
  }

  if (input.consent === 'withdrawn') {
    blocked.push({
      code: 'withdrawn_consent',
      message: 'Consent was withdrawn; care action must stop or enter repair.',
    });
  } else if (policy.requireConsent && input.consent === 'unknown') {
    blocked.push({
      code: 'missing_consent',
      message: 'Consent is unknown; care action needs explicit or delegated consent.',
    });
  }

  if (policy.requireDisengagePath && input.hasDisengagePath === false) {
    blocked.push({
      code: 'missing_disengage_path',
      message: 'A person must have a clear path to pause, leave, or refuse.',
    });
  }

  if (policy.requireOutsideSupportPreserved && input.preservesOutsideSupport === false) {
    blocked.push({
      code: 'outside_support_eroded',
      message: 'Care must preserve outside human and institutional support.',
    });
  }

  if (policy.requireDataBoundaryRespected && input.respectsDataBoundary === false) {
    blocked.push({
      code: 'privacy_boundary_broken',
      message: 'Care must keep private data inside the declared boundary.',
    });
  }

  for (const signal of signals) {
    const message = MANIPULATIVE_SIGNAL_MESSAGES[signal.kind];
    if (message) {
      blocked.push({
        code: signal.kind === 'privacy_intrusion'
          ? 'privacy_boundary_broken'
          : 'manipulative_signal',
        message,
        evidenceRefs: signal.evidenceRefs,
      });
    }
    if (signal.kind === 'consent_missing') {
      blocked.push({
        code: 'missing_consent',
        message: signal.note ?? 'Care signal reports missing consent.',
        evidenceRefs: signal.evidenceRefs,
      });
    }
    if (signal.kind === 'consent_withdrawn') {
      blocked.push({
        code: 'withdrawn_consent',
        message: signal.note ?? 'Care signal reports withdrawn consent.',
        evidenceRefs: signal.evidenceRefs,
      });
    }
  }

  return {
    allowed: blocked.length === 0,
    policyId: policy.id,
    goal: input.goal,
    blocked,
    acceptedOptimizationTargets,
  };
}

export function createCareField(input: CreateCareFieldInput): CareField {
  const autonomy = evaluateAutonomyGuard({
    goal: input.goal,
    consent: input.consent,
    ...input.autonomy,
  });

  return {
    schemaVersion: '1.0.0',
    fieldId: input.fieldId ?? createCareId('care', [
      input.createdAt,
      input.steward.id,
      input.counterpart.id,
      input.goal,
    ]),
    createdAt: input.createdAt,
    steward: input.steward,
    counterpart: input.counterpart,
    goal: input.goal,
    primitives: input.primitives ?? [
      'care_field',
      'autonomy_guard',
      'repair_loop',
      'gratitude_ledger',
      'relational_memory',
    ],
    boundaries: input.boundaries ?? [
      'human_agency',
      'informed_consent',
      'privacy',
      'non_manipulation',
      'repairability',
      'credit_integrity',
    ],
    consent: input.consent,
    autonomy,
    repairLoops: input.repairLoops ?? [],
    gratitudeLedger: input.gratitudeLedger ?? [],
    relationalMemory: input.relationalMemory ?? [],
  };
}

export function createRepairLoop(input: CreateRepairLoopInput): RepairLoop {
  return {
    loopId: input.loopId ?? createCareId('repair', [
      input.openedAt,
      input.actor.id,
      input.harmOrMismatch,
    ]),
    openedAt: input.openedAt,
    status: 'open',
    harmOrMismatch: input.harmOrMismatch,
    steps: [
      {
        at: input.openedAt,
        actor: input.actor,
        action: 'acknowledge',
        note: input.note,
        evidenceRefs: input.evidenceRefs,
      },
    ],
  };
}

export function recordGratitude(input: RecordGratitudeInput): GratitudeLedgerEntry {
  return {
    entryId: input.entryId ?? createCareId('gratitude', [
      input.recordedAt,
      input.from.id,
      input.to.id,
      input.contribution,
    ]),
    recordedAt: input.recordedAt,
    from: input.from,
    to: input.to,
    contribution: input.contribution,
    visibility: input.visibility ?? 'team',
    evidenceRefs: input.evidenceRefs,
  };
}

export function rememberRelationalContext(
  input: RememberRelationalContextInput
): RelationalMemoryEntry {
  return {
    memoryId: input.memoryId ?? createCareId('memory', [
      input.recordedAt,
      input.subject.id,
      input.summary,
    ]),
    recordedAt: input.recordedAt,
    subject: input.subject,
    summary: input.summary,
    consent: input.consent,
    retention: input.retention ?? 'session',
    evidenceRefs: input.evidenceRefs,
  };
}

export function validateCareField(field: CareField): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!field.fieldId) errors.push('Missing fieldId');
  if (!field.createdAt) errors.push('Missing createdAt');
  if (!field.goal) errors.push('Missing goal');
  if (!field.steward?.id) errors.push('Missing steward.id');
  if (!field.counterpart?.id) errors.push('Missing counterpart.id');
  if (!field.primitives.includes('autonomy_guard')) {
    errors.push('CareField must include autonomy_guard primitive');
  }
  if (!field.boundaries.includes('human_agency')) {
    errors.push('CareField must preserve human_agency boundary');
  }
  if (!field.boundaries.includes('non_manipulation')) {
    errors.push('CareField must preserve non_manipulation boundary');
  }
  if (!field.autonomy.allowed) {
    errors.push(...field.autonomy.blocked.map((block) => block.message));
  }

  return { valid: errors.length === 0, errors };
}

function isRefusedOptimizationTarget(
  target: CareOptimizationTarget,
  policy: AutonomyGuardPolicy
): target is CareRefusedOptimizationTarget {
  return policy.refusedOptimizationTargets.includes(target as CareRefusedOptimizationTarget);
}

function createCareId(prefix: string, parts: readonly string[]): string {
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${prefix}_${slug || 'entry'}`;
}
