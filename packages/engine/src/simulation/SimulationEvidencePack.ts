import type { CAELTrace } from './CAELTrace';
import { encodeCAELValue, verifyCAELHashChain } from './CAELTrace';
import type {
  InteractionEvent,
  ScaleEnvelope,
  SimulationProvenance,
  SimulationScale,
  SubgridAttestation,
} from './SimulationContract';
import { quantumForField } from './hashes';
import { sha256Bytes, type HashMode } from './sha256';

export const SIMULATION_EVIDENCE_PACK_SCHEMA_VERSION = '0.1.0' as const;

export type EvidenceJsonValue =
  | string
  | number
  | boolean
  | null
  | EvidenceJsonValue[]
  | { [key: string]: EvidenceJsonValue };

export interface SimulationEvidenceRequirements {
  requirementId: string;
  requirementText: string;
  requirementSource: string;
  verificationMethod: 'simulation' | 'hil-replay' | 'mbse-trace' | string;
  acceptanceCriteria: Record<string, number>;
}

export interface SimulationEvidenceReplayRecord {
  config: Record<string, unknown>;
  solverType: string;
  geometryHash: string;
  contractId: string;
  subgridAttestation?: SubgridAttestation;
  scale: SimulationScale;
  scaleEnvelope: ScaleEnvelope;
  interactions: InteractionEvent[];
  fixedDt: number;
  totalSteps: number;
  useCryptographicHash: boolean;
  continuesFrom?: unknown;
}

export interface SimulationEvidenceSolverConfig {
  solverType: string;
  scale: SimulationScale;
  fixedDt: number;
  useCryptographicHash: boolean;
  hashMode: HashMode;
  geometryHash: string;
  contractId: string;
  config: EvidenceJsonValue;
  contractConfig?: EvidenceJsonValue;
}

export interface SimulationEvidenceFieldTolerance {
  quantum: number;
  unit: string;
  relativeTolerance: number;
  acceptanceBound: number;
}

export interface SimulationEvidenceToleranceTable {
  scale: SimulationScale;
  scaleTolerance: number;
  replayAllowed: boolean;
  fieldTolerances: Record<string, SimulationEvidenceFieldTolerance>;
  vvCriteria: Record<string, number>;
  projectionsTo: Partial<Record<SimulationScale, string>>;
}

export interface SimulationEvidenceGeneratedArtifact {
  artifactId: string;
  kind: string;
  path: string;
  hash: string;
  source?: string;
}

export interface SimulationEvidenceHardwareValidation {
  status: 'pass' | 'simulated' | 'not-run' | 'fail';
  device: string;
  runtime: string;
  checkedAt: string;
  adapterFingerprint?: string;
  benchmark?: {
    name: string;
    value: number;
    unit: string;
  };
  notes?: string;
}

export interface SimulationEvidenceVerificationResult {
  status: 'pass' | 'fail';
  verifier: string;
  checkedAt: string;
  checks: Record<string, boolean>;
  reasons: string[];
  traceHashChainValid?: boolean;
  followUpAffordances: {
    studioMbseRequirementsLinkUi: string;
    hilReplayHarness: string;
  };
}

export interface SimulationEvidencePack {
  packId: string;
  schemaVersion: typeof SIMULATION_EVIDENCE_PACK_SCHEMA_VERSION;
  createdAt: string;
  simulationRunId: string;
  contractId: string;
  requirements: SimulationEvidenceRequirements;
  solverConfig: SimulationEvidenceSolverConfig;
  replay: SimulationEvidenceReplayRecord;
  provenance: SimulationProvenance;
  toleranceTable: SimulationEvidenceToleranceTable;
  generatedArtifacts: SimulationEvidenceGeneratedArtifact[];
  hardwareValidation: SimulationEvidenceHardwareValidation;
  verificationResult: SimulationEvidenceVerificationResult;
}

export interface BuildSimulationEvidencePackInput {
  requirements: SimulationEvidenceRequirements;
  replay: SimulationEvidenceReplayRecord;
  provenance: SimulationProvenance;
  generatedArtifacts: readonly SimulationEvidenceGeneratedArtifact[];
  hardwareValidation: SimulationEvidenceHardwareValidation;
  trace?: CAELTrace;
  contractConfig?: Record<string, unknown>;
  createdAt?: string;
  packId?: string;
  verificationResult?: Partial<SimulationEvidenceVerificationResult>;
}

export interface SimulationEvidencePackValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  verificationResult: SimulationEvidenceVerificationResult;
}

const REQUIRED_TOP_LEVEL_KEYS = [
  'packId',
  'schemaVersion',
  'createdAt',
  'simulationRunId',
  'contractId',
  'requirements',
  'solverConfig',
  'replay',
  'provenance',
  'toleranceTable',
  'generatedArtifacts',
  'hardwareValidation',
  'verificationResult',
] as const;

export function buildSimulationEvidencePack(
  input: BuildSimulationEvidencePackInput
): SimulationEvidencePack {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const packId =
    input.packId ??
    stableDigest(
      {
        runId: input.provenance.runId,
        contractId: input.provenance.contractId,
        createdAt,
      },
      'simulation-evidence-pack'
    );
  const toleranceTable = buildToleranceTable(input.replay.scaleEnvelope, input.requirements);
  const traceVerification = input.trace
    ? verifyCAELHashChain(input.trace, input.replay.useCryptographicHash ? 'sha256' : 'fnv1a')
    : undefined;
  const checks = {
    requirementsLinked: hasRequirementsLink(input.requirements),
    replayPresent: hasReplay(input.replay),
    toleranceTablePresent: Object.keys(toleranceTable.fieldTolerances).length > 0,
    artifactHashesPresent:
      input.generatedArtifacts.length > 0 &&
      input.generatedArtifacts.every((artifact) => Boolean(artifact.hash)),
    hardwareValidationPresent: hasHardwareValidation(input.hardwareValidation),
    provenanceMatchesReplay:
      input.provenance.contractId === input.replay.contractId &&
      input.provenance.geometryHash === input.replay.geometryHash,
    traceHashChainValid: traceVerification?.valid ?? true,
  };
  const reasons = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${name} failed`);

  return {
    packId,
    schemaVersion: SIMULATION_EVIDENCE_PACK_SCHEMA_VERSION,
    createdAt,
    simulationRunId: input.provenance.runId,
    contractId: input.provenance.contractId,
    requirements: clonePack(input.requirements),
    solverConfig: {
      solverType: input.replay.solverType,
      scale: input.replay.scale,
      fixedDt: input.replay.fixedDt,
      useCryptographicHash: input.replay.useCryptographicHash,
      hashMode: input.replay.useCryptographicHash ? 'sha256' : 'fnv1a',
      geometryHash: input.replay.geometryHash,
      contractId: input.replay.contractId,
      config: canonicalPackValue(input.replay.config),
      ...(input.contractConfig ? { contractConfig: canonicalPackValue(input.contractConfig) } : {}),
    },
    replay: clonePack(input.replay),
    provenance: clonePack(input.provenance),
    toleranceTable,
    generatedArtifacts: input.generatedArtifacts.map((artifact) => clonePack(artifact)),
    hardwareValidation: clonePack(input.hardwareValidation),
    verificationResult: {
      status: reasons.length === 0 ? 'pass' : 'fail',
      verifier: 'CAELRecorder SimulationEvidencePack v0.1.0',
      checkedAt: createdAt,
      checks,
      reasons,
      ...(traceVerification ? { traceHashChainValid: traceVerification.valid } : {}),
      followUpAffordances: defaultFollowUpAffordances(),
      ...input.verificationResult,
    },
  };
}

export function createGeneratedArtifactReceipt(input: {
  artifactId: string;
  kind: string;
  path: string;
  content: string | Uint8Array;
  source?: string;
}): SimulationEvidenceGeneratedArtifact {
  return {
    artifactId: input.artifactId,
    kind: input.kind,
    path: input.path,
    hash: hashEvidenceArtifact(input.content),
    ...(input.source ? { source: input.source } : {}),
  };
}

export function hashEvidenceArtifact(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return `artifact-sha-${sha256Bytes(bytes)}`;
}

export function verifySimulationEvidencePackJson(json: string): SimulationEvidencePackValidation {
  try {
    return verifySimulationEvidencePack(JSON.parse(json));
  } catch (error) {
    return {
      valid: false,
      errors: [`invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      verificationResult: failedVerificationResult('simulation:verify', [
        'invalid JSON evidence pack',
      ]),
    };
  }
}

export function verifySimulationEvidencePack(pack: unknown): SimulationEvidencePackValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(pack)) {
    return {
      valid: false,
      errors: ['evidence pack must be a JSON object'],
      warnings,
      verificationResult: failedVerificationResult('simulation:verify', [
        'evidence pack must be a JSON object',
      ]),
    };
  }

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in pack)) errors.push(`missing top-level key: ${key}`);
  }
  if (pack.schemaVersion !== SIMULATION_EVIDENCE_PACK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SIMULATION_EVIDENCE_PACK_SCHEMA_VERSION}`);
  }

  const requirements = pack.requirements;
  if (!isRecord(requirements)) {
    errors.push('requirements must be an object');
  } else {
    if (!hasNonEmptyString(requirements.requirementId)) {
      errors.push('requirements.requirementId is required');
    }
    if (!hasNonEmptyString(requirements.requirementSource)) {
      errors.push('requirements.requirementSource is required');
    }
    if (!isRecord(requirements.acceptanceCriteria)) {
      errors.push('requirements.acceptanceCriteria is required');
    } else {
      const numericCriteria = Object.entries(requirements.acceptanceCriteria).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value)
      );
      if (numericCriteria.length === 0) {
        errors.push('requirements.acceptanceCriteria must include at least one numeric bound');
      }
    }
  }

  const replay = pack.replay;
  if (!isRecord(replay)) {
    errors.push('replay must be an object');
  } else {
    if (!hasNonEmptyString(replay.contractId)) errors.push('replay.contractId is required');
    if (!hasNonEmptyString(replay.geometryHash)) errors.push('replay.geometryHash is required');
    if (typeof replay.totalSteps !== 'number') errors.push('replay.totalSteps is required');
    if (!Array.isArray(replay.interactions)) errors.push('replay.interactions is required');
  }

  const provenance = pack.provenance;
  if (!isRecord(provenance)) {
    errors.push('provenance must be an object');
  } else {
    if (pack.simulationRunId !== provenance.runId) {
      errors.push('simulationRunId must match provenance.runId');
    }
    if (pack.contractId !== provenance.contractId) {
      errors.push('contractId must match provenance.contractId');
    }
    if (isRecord(replay) && replay.contractId !== provenance.contractId) {
      errors.push('replay.contractId must match provenance.contractId');
    }
    if (isRecord(replay) && replay.geometryHash !== provenance.geometryHash) {
      errors.push('replay.geometryHash must match provenance.geometryHash');
    }
  }

  const toleranceTable = pack.toleranceTable;
  if (!isRecord(toleranceTable)) {
    errors.push('toleranceTable must be an object');
  } else if (!isRecord(toleranceTable.fieldTolerances)) {
    errors.push('toleranceTable.fieldTolerances is required');
  } else if (isRecord(requirements) && isRecord(requirements.acceptanceCriteria)) {
    for (const key of Object.keys(requirements.acceptanceCriteria)) {
      if (!(key in toleranceTable.fieldTolerances)) {
        errors.push(`toleranceTable.fieldTolerances missing requirement field: ${key}`);
      }
    }
  }

  if (!Array.isArray(pack.generatedArtifacts) || pack.generatedArtifacts.length === 0) {
    errors.push('generatedArtifacts must include at least one artifact');
  } else {
    for (const [index, artifact] of pack.generatedArtifacts.entries()) {
      if (!isRecord(artifact)) {
        errors.push(`generatedArtifacts[${index}] must be an object`);
        continue;
      }
      if (!hasNonEmptyString(artifact.artifactId)) {
        errors.push(`generatedArtifacts[${index}].artifactId is required`);
      }
      if (!hasNonEmptyString(artifact.path)) {
        errors.push(`generatedArtifacts[${index}].path is required`);
      }
      if (!hasNonEmptyString(artifact.hash)) {
        errors.push(`generatedArtifacts[${index}].hash is required`);
      } else if (!/^artifact-sha-[0-9a-f]{64}$/.test(artifact.hash)) {
        warnings.push(`generatedArtifacts[${index}].hash is not artifact-sha-<sha256>`);
      }
    }
  }

  if (!isRecord(pack.hardwareValidation)) {
    errors.push('hardwareValidation must be an object');
  } else if (!hasHardwareValidation(pack.hardwareValidation)) {
    errors.push('hardwareValidation requires status, device, runtime, and checkedAt');
  }

  const checks = {
    requirementsLinked: !errors.some((error) => error.startsWith('requirements.')),
    replayPresent: !errors.some((error) => error.startsWith('replay.')),
    toleranceTablePresent: !errors.some((error) => error.startsWith('toleranceTable.')),
    artifactHashesPresent: !errors.some((error) => error.startsWith('generatedArtifacts')),
    hardwareValidationPresent: !errors.some((error) => error.startsWith('hardwareValidation')),
    provenanceMatchesReplay: !errors.some(
      (error) => error.includes('must match provenance') || error.includes('must match replay')
    ),
  };

  const verificationResult: SimulationEvidenceVerificationResult = {
    status: errors.length === 0 ? 'pass' : 'fail',
    verifier: 'simulation:verify',
    checkedAt: new Date().toISOString(),
    checks,
    reasons: errors,
    followUpAffordances: defaultFollowUpAffordances(),
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    verificationResult,
  };
}

function buildToleranceTable(
  envelope: ScaleEnvelope,
  requirements: SimulationEvidenceRequirements
): SimulationEvidenceToleranceTable {
  const fieldTolerances: Record<string, SimulationEvidenceFieldTolerance> = {};
  for (const [field, bound] of Object.entries(requirements.acceptanceCriteria)) {
    if (!Number.isFinite(bound)) continue;
    fieldTolerances[field] = {
      quantum: quantumForField(field),
      unit: inferUnit(field),
      relativeTolerance: envelope.tolerance,
      acceptanceBound: bound,
    };
  }

  return {
    scale: envelope.scale,
    scaleTolerance: envelope.tolerance,
    replayAllowed: envelope.replayAllowed,
    fieldTolerances,
    vvCriteria: clonePack(envelope.vvCriteria),
    projectionsTo: clonePack(envelope.projectionsTo),
  };
}

function hasRequirementsLink(requirements: SimulationEvidenceRequirements): boolean {
  return (
    hasNonEmptyString(requirements.requirementId) &&
    hasNonEmptyString(requirements.requirementSource) &&
    Object.values(requirements.acceptanceCriteria).some(
      (value) => typeof value === 'number' && Number.isFinite(value)
    )
  );
}

function hasReplay(replay: SimulationEvidenceReplayRecord): boolean {
  return (
    hasNonEmptyString(replay.contractId) &&
    hasNonEmptyString(replay.geometryHash) &&
    typeof replay.totalSteps === 'number' &&
    Array.isArray(replay.interactions)
  );
}

function hasHardwareValidation(value: unknown): value is SimulationEvidenceHardwareValidation {
  return (
    isRecord(value) &&
    hasNonEmptyString(value.status) &&
    hasNonEmptyString(value.device) &&
    hasNonEmptyString(value.runtime) &&
    hasNonEmptyString(value.checkedAt)
  );
}

function failedVerificationResult(
  verifier: string,
  reasons: string[]
): SimulationEvidenceVerificationResult {
  return {
    status: 'fail',
    verifier,
    checkedAt: new Date().toISOString(),
    checks: {},
    reasons,
    followUpAffordances: defaultFollowUpAffordances(),
  };
}

function defaultFollowUpAffordances(): SimulationEvidenceVerificationResult['followUpAffordances'] {
  return {
    studioMbseRequirementsLinkUi:
      'Pack requirements.requirementSource and requirements.acceptanceCriteria are stable inputs for a Studio MBSE requirements-link panel.',
    hilReplayHarness:
      'Pack replay, provenance, hardwareValidation, and generatedArtifacts are stable inputs for a future HIL replay harness.',
  };
}

function inferUnit(field: string): string {
  const suffix = field.match(/_([A-Za-z0-9]+(?:_per_[A-Za-z0-9]+)*)$/)?.[1];
  if (!suffix) return 'dimensionless';
  return suffix.replace(/_per_/g, '/');
}

function stableDigest(value: unknown, prefix: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify(sortJson(value)));
  return `${prefix}-sha-${sha256Bytes(bytes)}`;
}

function canonicalPackValue(value: unknown): EvidenceJsonValue {
  return clonePack(encodeCAELValue(value)) as EvidenceJsonValue;
}

function clonePack<T>(value: T): T {
  return JSON.parse(JSON.stringify(encodeCAELValue(value))) as T;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const nested = value[key];
    if (nested !== undefined) out[key] = sortJson(nested);
  }
  return out;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
